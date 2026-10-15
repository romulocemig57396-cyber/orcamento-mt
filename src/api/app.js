/* ─────────────────────────────────────────────────────────────────────────────
   app.js — bootstrap/composição da API serverless (wiring, tarefa 16.1)

   Monta o roteador (`criarRoteador`) INJETANDO as dependências reais, de modo
   que não reste nenhum gancho órfão:

     - validarToken   → validação de token JWKS (R1.2/1.3/1.7)   — auth/validarToken.js
     - resolverSessao → RBAC (grupos→papéis→permissões) + expiração por
                        inatividade (R2.1, R1.4)                 — auth/rbac.js + auth/sessao.js
     - autorizar      → negação por padrão (R1.6/R2)             — auth/autorizacao.js
     - persistencia   → cliente Cosmos DB (R5)                   — persistencia/cosmos.js
     - segredos       → Key Vault + Managed Identity (R9)        — segredos/keyvault.js (+log)
     - logger         → logging estruturado + mascaramento (R10) — observabilidade/logger.js
     - metricas       → métricas de operação (R10.2)             — observabilidade/metricas.js

   Dois modos de uso:

   1. INJEÇÃO DIRETA (testável, sem Azure):
        criarApi({ config, validadorToken, container, secretClient, ... })
      Cada dependência de borda (JWKS/Cosmos/Key Vault) pode ser injetada; o
      bootstrap compõe os ganchos e devolve o `despachar(req)`.

   2. A PARTIR DO AMBIENTE (runtime):
        criarApiDoAmbiente(env)
      Lê a configuração de `env` (emissor/audiência/ambiente/vault). Em produção,
      liga os SDKs reais (Cosmos/Key Vault/JWKS) nos pontos marcados; sem a
      configuração necessária, a dependência correspondente fica ausente e o
      roteador degrada de forma graciosa (handlers respondem 501 para o que
      ainda não tiver persistência).

   O bootstrap NÃO implementa regra de negócio: apenas orquestra o wiring,
   mantendo cada módulo como fonte única da sua responsabilidade.
   ───────────────────────────────────────────────────────────────────────────── */

import { criarRoteador } from './roteador.js';
import { criarValidadorToken } from './auth/validarToken.js';
import { resolverSessao as resolverInatividade } from './auth/sessao.js';
import { autorizarSessao } from './auth/rbac.js';
import { RBAC_CONFIG } from './auth/rbac.config.js';
import { criarAutorizador } from './auth/autorizacao.js';
import { criarClientePersistencia } from './persistencia/cosmos.js';
import { criarRecuperadorSegredosComLog } from './segredos/tratarFalhaSegredo.js';
import { criarLogger } from '../observabilidade/logger.js';
import { criarMetricas } from '../observabilidade/metricas.js';
import { mascarar } from '../observabilidade/mascarar.js';

/**
 * Compõe o gancho `resolverSessao` do roteador, ligando RBAC + expiração.
 *
 * Fluxo (design "Fluxo de autenticação"):
 *   1. A validação de token (validarToken) entrega a sessão parcial com `groups`.
 *   2. Aqui, `autorizarSessao(groups)` resolve papéis e a UNIÃO de permissões
 *      (R2.1) a partir da configuração RBAC — isso liga o módulo `rbac.js`.
 *   3. `resolverInatividade` aplica a janela de 30 min (R1.4), renovando a
 *      atividade ou encerrando a sessão (401).
 *
 * @param {object} [opcoes]
 * @param {import('./auth/rbac.config.js').ConfiguracaoRbac} [opcoes.rbacConfig]
 * @param {Date|number|string|(() => number|Date)} [opcoes.agora]  Relógio injetável.
 * @returns {(req: object, sessaoParcial: object) => object}
 */
export function criarResolvedorSessao(opcoes = {}) {
  const rbacConfig = opcoes.rbacConfig ?? RBAC_CONFIG;
  return function resolverSessao(req, sessaoParcial) {
    // 1) RBAC: papéis + permissões (R2.1) a partir dos grupos do token.
    const grupos = Array.isArray(sessaoParcial?.groups) ? sessaoParcial.groups : [];
    const { papeis, permissoes } = autorizarSessao(grupos, rbacConfig);

    // 2) Expiração por inatividade (R1.4) — lança 401 se expirada.
    const sessao = resolverInatividade(
      req,
      { ...sessaoParcial, papeis, permissoes },
      { agora: opcoes.agora },
    );
    return sessao;
  };
}

/**
 * Adapta o cliente Cosmos (`criarClientePersistencia`: gravar/obter/remover)
 * para o contrato que os handlers esperam, acrescentando um `listar` opcional
 * quando o container suporta consultas. Mantém a atomicidade/erros do cliente.
 *
 * @param {object} args
 * @param {object} args.container  Container Cosmos (DI).
 * @param {string} args.ambiente   Ambiente/partição ('dev'|'hml'|'prd').
 * @returns {{ gravar: Function, obter: Function, remover: Function, listar?: Function }}
 */
export function criarPersistenciaApi({ container, ambiente }) {
  const base = criarClientePersistencia({ container, ambiente });

  // `listar` é opcional: só exposto quando o container permite consultas. Sem
  // ele, o handler de listagem responde 501 (comportamento de esqueleto).
  const temConsulta =
    container && container.items && typeof container.items.query === 'function';

  if (!temConsulta) return base;

  return {
    ...base,
    async listar({ proprietarioOid } = {}) {
      try {
        const consulta = proprietarioOid
          ? {
              query:
                'SELECT * FROM c WHERE c.ambiente = @amb AND c.proprietarioOid = @oid',
              parameters: [
                { name: '@amb', value: ambiente },
                { name: '@oid', value: proprietarioOid },
              ],
            }
          : {
              query: 'SELECT * FROM c WHERE c.ambiente = @amb',
              parameters: [{ name: '@amb', value: ambiente }],
            };
        const iterador = container.items.query(consulta);
        const { resources } = await iterador.fetchAll();
        return { ok: true, valor: resources ?? [] };
      } catch (e) {
        return { ok: false, codigo: 'FALHA_LEITURA', mensagem: 'Falha ao listar orçamentos.', detalhes: { causa: e?.message } };
      }
    },
  };
}

/**
 * Cria a API (despachante) injetando as dependências já construídas.
 *
 * @param {object} [deps]
 * @param {object} [deps.config]  Configuração de validação de token (emissor,
 *        audiência, resolverJwks, verificarAssinatura — ver validarTokenNucleo).
 * @param {(req: object) => Promise<object>} [deps.validadorToken]
 *        Gancho de validação já pronto (tem prioridade sobre `config`). Útil
 *        para testes. Sem ele nem `config`, o roteador não valida token (modo
 *        esqueleto/local).
 * @param {object} [deps.container]      Container Cosmos (DI) para a persistência.
 * @param {string} [deps.ambiente]       Ambiente/partição ('dev'|'hml'|'prd').
 * @param {object} [deps.persistencia]   Cliente de persistência já pronto
 *        (tem prioridade sobre `container`/`ambiente`).
 * @param {object} [deps.secretClient]   Cliente do Key Vault (SecretClientLike).
 * @param {object} [deps.segredos]       Recuperador de segredos já pronto
 *        (tem prioridade sobre `secretClient`).
 * @param {ReturnType<typeof criarLogger>} [deps.logger]
 * @param {ReturnType<typeof criarMetricas>} [deps.metricas]
 * @param {import('./auth/rbac.config.js').ConfiguracaoRbac} [deps.rbacConfig]
 * @param {Date|number|string|(() => number|Date)} [deps.agora]
 * @returns {{
 *   despachar: (req: object) => Promise<object>,
 *   deps: object,
 * }}
 */
export function criarApi(deps = {}) {
  // ── Observabilidade (sempre presente; degrada graciosamente por si) ────────
  const logger =
    deps.logger ?? criarLogger({ componente: 'api', mascarar });
  const metricas = deps.metricas ?? criarMetricas();

  // ── Autenticação (R1): validação de token ─────────────────────────────────
  const validarToken =
    deps.validadorToken ??
    (deps.config ? criarValidadorToken(deps.config) : undefined);

  // ── Sessão + RBAC (R1.4, R2.1) ─────────────────────────────────────────────
  const resolverSessao = criarResolvedorSessao({
    rbacConfig: deps.rbacConfig,
    agora: deps.agora,
  });

  // ── Autorização: negação por padrão (R1.6/R2) ──────────────────────────────
  const autorizar = criarAutorizador({ logger });

  // ── Persistência (R5): cliente Cosmos quando houver container ──────────────
  const persistencia =
    deps.persistencia ??
    (deps.container
      ? criarPersistenciaApi({ container: deps.container, ambiente: deps.ambiente ?? 'dev' })
      : undefined);

  // ── Segredos (R9): recuperador com log mascarado quando houver secretClient ─
  const segredos =
    deps.segredos ??
    (deps.secretClient
      ? criarRecuperadorSegredosComLog({ secretClient: deps.secretClient, logger })
      : undefined);

  // ── Monta o roteador com todos os ganchos (sem órfãos) ─────────────────────
  const ganchos = {
    validarToken,
    resolverSessao,
    autorizar,
    persistencia,
    segredos,
    logger,
  };
  const despacharBase = criarRoteador(ganchos);

  // Envolve o despacho com métricas de operação (requisições/erros/latência —
  // R10.2), sem interferir no resultado nem na degradação graciosa do logger.
  const despachar = (req) =>
    metricas.medirOperacao(
      `${req?.metodo ?? ''} ${req?.caminho ?? ''}`.trim() || 'requisicao',
      () => despacharBase(req),
    );

  return { despachar, deps: { ...ganchos, metricas } };
}

/**
 * Cria a API lendo a configuração do ambiente (runtime). Em produção, os SDKs
 * reais (JWKS/Cosmos/Key Vault) são ligados nos pontos indicados; sem a
 * configuração necessária, a dependência fica ausente e o roteador degrada.
 *
 * Variáveis consideradas:
 *   - API_ISSUER / API_AUDIENCE        → validação de token (JWKS)
 *   - API_AMBIENTE                     → partição de persistência ('dev'|'hml'|'prd')
 *   - KEYVAULT_URL                     → recuperação de segredos (Managed Identity)
 *
 * @param {Record<string,string|undefined>} [env=process.env]
 * @param {object} [overrides]  Dependências já construídas (para ligar SDKs reais
 *        ou para testes): `{ config, container, secretClient, persistencia, segredos }`.
 * @returns {{ despachar: (req: object) => Promise<object>, deps: object }}
 */
export function criarApiDoAmbiente(env = (typeof process !== 'undefined' ? process.env : {}) || {}, overrides = {}) {
  const ambiente = overrides.ambiente ?? env.API_AMBIENTE ?? 'dev';

  // Config de validação de token: só é útil se emissor+audiência existirem E se
  // houver como resolver JWKS/verificar assinatura (injetados por `overrides`
  // em produção, pois ligam o SDK/JWKS reais). Sem isso, não validamos token.
  let config = overrides.config;
  if (!config && env.API_ISSUER && env.API_AUDIENCE && overrides.resolverJwks && overrides.verificarAssinatura) {
    config = {
      emissorEsperado: env.API_ISSUER,
      audienciaEsperada: env.API_AUDIENCE,
      resolverJwks: overrides.resolverJwks,
      verificarAssinatura: overrides.verificarAssinatura,
    };
  }

  return criarApi({
    config,
    validadorToken: overrides.validadorToken,
    container: overrides.container,
    ambiente,
    persistencia: overrides.persistencia,
    secretClient: overrides.secretClient,
    segredos: overrides.segredos,
    logger: overrides.logger,
    metricas: overrides.metricas,
    rbacConfig: overrides.rbacConfig,
    agora: overrides.agora,
  });
}

export default criarApi;
