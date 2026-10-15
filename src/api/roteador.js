/* ─────────────────────────────────────────────────────────────────────────────
   roteador.js — roteador HTTP puro, framework-agnóstico

   Casa (método, caminho) contra o CONTRATO, resolve parâmetros de rota e invoca
   o handler correspondente. Mantém, como PONTOS DE EXTENSÃO explícitos, o lugar
   exato onde cada camada de segurança/infra será plugada nas próximas tarefas.
   Nada aqui implementa regra de negócio — apenas orquestra.

   PONTOS DE EXTENSÃO (ganchos opcionais via `deps`, injetados pelo adaptador):
     - deps.validarToken   → validação de token JWKS            (tarefa 5.2 — R1.2/1.3/1.7)
     - deps.resolverSessao → sessão + expiração por inatividade (tarefa 5.4 — R1.4)
     - deps.autorizar      → RBAC + negação por padrão          (tarefas 5.6/5.8 — R1.6/R2)
     - deps.persistencia   → cliente Cosmos DB                  (tarefa 8.2 — R5)
     - deps.segredos       → Key Vault + Managed Identity       (tarefa 9.1 — R9)
     - deps.logger         → logging estruturado + métricas     (tarefa 4.x — R10)

   Enquanto esses ganchos não forem fornecidos, o roteador apenas despacha para
   os handlers-stub (501). Isso mantém o esqueleto funcional e os contratos de
   borda estáveis para as tarefas seguintes.
   ───────────────────────────────────────────────────────────────────────────── */

import { CONTRATO } from './contrato.js';
import * as handlers from './handlers/index.js';
import { erro } from './http.js';

/**
 * Compila o padrão de caminho do contrato (`/api/orcamentos/{id}`) em um regex
 * com grupos nomeados para extração de parâmetros.
 * @param {string} padrao
 * @returns {{ regex: RegExp, nomes: string[] }}
 */
function compilarCaminho(padrao) {
  const nomes = [];
  const fonte = padrao
    .split('/')
    .map((seg) => {
      const m = /^\{(.+)\}$/.exec(seg);
      if (m) {
        nomes.push(m[1]);
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${fonte}$`), nomes };
}

// Tabela de rotas compilada uma única vez a partir do contrato.
const TABELA = CONTRATO.map((rota) => ({
  ...rota,
  ...compilarCaminho(rota.caminho),
}));

/**
 * Encontra a rota do contrato que casa com método + caminho.
 * @param {string} metodo
 * @param {string} caminho
 * @returns {{ rota: object, params: Object<string,string> }|null}
 */
export function casarRota(metodo, caminho) {
  const metodoNorm = String(metodo || '').toUpperCase();
  for (const rota of TABELA) {
    if (rota.metodo !== metodoNorm) continue;
    const m = rota.regex.exec(caminho);
    if (!m) continue;
    const params = {};
    rota.nomes.forEach((nome, i) => {
      params[nome] = decodeURIComponent(m[i + 1]);
    });
    return { rota, params };
  }
  return null;
}

/**
 * Cria um despachante de requisições a partir das dependências injetadas.
 * Em cada camada ausente, o passo é ignorado (comportamento de esqueleto).
 *
 * @param {Object} [deps]
 * @param {Function} [deps.validarToken]   (req) => sessaoParcial | lança 401
 * @param {Function} [deps.resolverSessao] (req, sessaoParcial) => sessao
 * @param {Function} [deps.autorizar]      (rota, sessao) => void | lança 403
 * @param {Object}   [deps.persistencia]
 * @param {Object}   [deps.segredos]
 * @param {Object}   [deps.logger]
 * @returns {(req: import('./http.js').RequisicaoApi) => Promise<import('./http.js').RespostaApi>}
 */
export function criarRoteador(deps = {}) {
  return async function despachar(req) {
    const correspondencia = casarRota(req.metodo, req.caminho);
    if (!correspondencia) {
      return erro(404, 'rota_nao_encontrada', `Nenhuma rota para ${req.metodo} ${req.caminho}.`);
    }

    const { rota, params } = correspondencia;
    const requisicao = { ...req, params, sessao: req.sessao ?? null };

    try {
      // ── Ponto de extensão: autenticação (5.2) e sessão (5.4) ──────────────
      // Rotas não públicas exigirão token válido e sessão ativa. Enquanto os
      // ganchos não forem injetados, o fluxo segue sem bloquear (esqueleto).
      if (!rota.publica) {
        if (deps.validarToken) {
          const sessaoParcial = await deps.validarToken(requisicao);
          requisicao.sessao = deps.resolverSessao
            ? await deps.resolverSessao(requisicao, sessaoParcial)
            : sessaoParcial;
        }

        // ── Ponto de extensão: RBAC + negação por padrão (5.6/5.8) ──────────
        if (deps.autorizar) {
          await deps.autorizar(rota, requisicao.sessao, requisicao);
        }
      }

      // ── Despacho para o handler (stubs por enquanto) ─────────────────────
      const handler = handlers[rota.handler];
      if (typeof handler !== 'function') {
        return erro(500, 'handler_ausente', `Handler "${rota.handler}" não registrado.`);
      }

      // deps (persistência, segredos, logger) são repassadas ao handler para as
      // tarefas 8.2 / 9.1 / 4.x. Hoje os handlers as ignoram (stub 501).
      return await handler(requisicao, deps);
    } catch (e) {
      // Erros de camada (401/403/501) chegam já formatados como RespostaApi.
      if (e && typeof e.status === 'number' && 'corpo' in e) return e;
      return erro(500, 'erro_interno', 'Falha inesperada ao processar a requisição.');
    }
  };
}
