/* ─────────────────────────────────────────────────────────────────────────────
   keyvault.js — recuperação de segredos do Cofre_Segredos (Azure Key Vault)
   via Managed Identity, em tempo de execução.

   Responsabilidade (R9.1, R9.2):
     - Recuperar credenciais, chaves e connection strings do Cofre_Segredos SOMENTE
       em tempo de execução, quando a operação dependente precisar do valor (R9.2).
     - NUNCA persistir cópias dos segredos em arquivos de configuração, variáveis
       de ambiente em texto claro ou logs (R9.1). Este módulo não escreve o valor
       em lugar nenhum: não grava em disco, não exporta para `process.env`, não
       loga o valor. O valor só existe em memória pelo tempo da operação (e, se
       habilitado, num cache em memória de curta duração — ver abaixo).

   Design: INJEÇÃO DE DEPENDÊNCIA do cliente do cofre.
     Em produção, o `secretClient` é o SDK oficial `@azure/keyvault-secrets`
     autenticado por `DefaultAzureCredential`/`ManagedIdentityCredential`
     (`@azure/identity`). Aqui NÃO adicionamos esse SDK como dependência: o módulo
     trabalha contra uma abstração mínima (`SecretClientLike`), o que mantém os
     testes leves (sem Azure real) e permite plugar o SDK verdadeiro em produção
     sem alterar este arquivo. Ver `criarSecretClientManagedIdentity` abaixo para
     o ponto de ligação com o SDK real.

   Ponto de tratamento de falha (R9.3 — tarefa 9.2, separada):
     Em caso de falha de recuperação, este módulo NÃO decide a política de
     aborto/log — ele expõe um resultado estruturado (`{ ok: false, ... }`) e,
     opcionalmente, invoca um callback injetável `aoFalhar`. A tarefa 9.2 liga
     esse ponto ao tratamento que aborta a operação dependente e registra o
     evento SEM expor o valor do segredo. O resultado de erro deste módulo nunca
     carrega o valor do segredo.

   Cache em memória de curta duração (OPCIONAL):
     É aceitável manter um cache EM MEMÓRIA, com TTL curto, para evitar idas
     repetidas ao cofre dentro de uma mesma janela de execução. Esse cache:
       - vive apenas no processo (memória), NUNCA é escrito em disco;
       - NÃO é persistido em config/env/log (R9.1);
       - pode ser limpo a qualquer momento (`limparCache`), e expira pelo TTL.
     O cache é desabilitado por padrão (ttlMs = 0).
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} SecretClientLike
 * Abstração mínima do cliente do Cofre_Segredos. Em produção, satisfeita pelo
 * `SecretClient` de `@azure/keyvault-secrets`.
 * @property {(nome: string, opcoes?: object) => Promise<{ value?: string, name?: string, properties?: object }>} getSecret
 *   Recupera o segredo pelo nome. Deve lançar/rejeitar se indisponível.
 */

/**
 * @typedef {Object} ResultadoSegredoOk
 * @property {true} ok
 * @property {string} nome            Nome lógico do segredo recuperado.
 * @property {string} valor           Valor do segredo (apenas em memória; nunca logar).
 * @property {boolean} doCache        Indica se o valor veio do cache em memória.
 * @property {string} recuperadoEm    Carimbo de tempo UTC (ISO 8601) da recuperação.
 */

/**
 * @typedef {Object} ResultadoSegredoErro
 * @property {false} ok
 * @property {string} nome            Nome lógico do segredo solicitado.
 * @property {'indisponivel'|'nao_encontrado'|'configuracao_invalida'} codigo
 * @property {string} mensagem        Mensagem SEM o valor do segredo.
 * @property {string} ocorridoEm      Carimbo de tempo UTC (ISO 8601) da falha.
 */

/** @typedef {ResultadoSegredoOk | ResultadoSegredoErro} ResultadoSegredo */

/** Carimbo de tempo UTC (ISO 8601). Isolado para ser injetável/testável. */
const agoraUtc = () => new Date().toISOString();

/**
 * Normaliza o nome do segredo (defensivo contra espaços/caixa acidental).
 * Não altera a semântica do nome; apenas remove espaços nas extremidades.
 * @param {unknown} nome
 * @returns {string}
 */
const normalizarNome = (nome) => (typeof nome === 'string' ? nome.trim() : '');

/**
 * Cria um recuperador de segredos ligado a um cliente de cofre injetado.
 *
 * O cliente é obrigatório e deve expor `getSecret(nome)`. Em produção, use
 * `criarSecretClientManagedIdentity` (ver abaixo) para construí-lo a partir do
 * SDK oficial autenticado por Managed Identity.
 *
 * @param {object} opcoes
 * @param {SecretClientLike} opcoes.secretClient  Cliente do Cofre_Segredos (injetado).
 * @param {number} [opcoes.ttlMs=0]  TTL do cache EM MEMÓRIA em milissegundos.
 *        `0` desabilita o cache (padrão): toda recuperação vai ao cofre.
 * @param {(info: { nome: string, codigo: string, mensagem: string, causa?: unknown }) => void} [opcoes.aoFalhar]
 *        Ponto de tratamento de falha (R9.3 / tarefa 9.2). Invocado em caso de
 *        erro, SEM o valor do segredo. Nunca deve lançar; se lançar, a exceção é
 *        engolida para não mascarar o resultado estruturado.
 * @param {() => string} [opcoes.relogio=agoraUtc]  Fonte do carimbo UTC (injetável).
 * @param {() => number} [opcoes.monotonico=() => Date.now()]  Fonte do tempo para
 *        expiração do cache (injetável para teste).
 * @returns {{
 *   obterSegredo: (nome: string) => Promise<ResultadoSegredo>,
 *   limparCache: () => void,
 *   invalidar: (nome: string) => void,
 *   tamanhoCache: () => number,
 * }}
 */
export function criarRecuperadorSegredos(opcoes = {}) {
  const {
    secretClient,
    ttlMs = 0,
    aoFalhar,
    relogio = agoraUtc,
    monotonico = () => Date.now(),
  } = opcoes;

  if (!secretClient || typeof secretClient.getSecret !== 'function') {
    throw new TypeError(
      'criarRecuperadorSegredos requer um secretClient com método getSecret(nome).',
    );
  }

  const cacheHabilitado = typeof ttlMs === 'number' && ttlMs > 0;

  /** Cache EM MEMÓRIA apenas: Map<nome, { valor, expiraEm }>. Nunca persistido. */
  const cache = new Map();

  const lerCache = (nome) => {
    if (!cacheHabilitado) return undefined;
    const entrada = cache.get(nome);
    if (!entrada) return undefined;
    if (monotonico() >= entrada.expiraEm) {
      cache.delete(nome);
      return undefined;
    }
    return entrada.valor;
  };

  const gravarCache = (nome, valor) => {
    if (!cacheHabilitado) return;
    cache.set(nome, { valor, expiraEm: monotonico() + ttlMs });
  };

  const notificarFalha = (info) => {
    if (typeof aoFalhar !== 'function') return;
    try {
      aoFalhar(info);
    } catch {
      // O ponto de tratamento de falha não deve interferir no resultado
      // estruturado retornado ao chamador. Ignora qualquer erro do callback.
    }
  };

  /**
   * Recupera um segredo do Cofre_Segredos em tempo de execução (R9.2).
   * Nunca lança: devolve sempre um resultado estruturado.
   *
   * @param {string} nome Nome lógico do segredo no cofre.
   * @returns {Promise<ResultadoSegredo>}
   */
  const obterSegredo = async (nome) => {
    const alvo = normalizarNome(nome);

    if (!alvo) {
      const resultado = /** @type {ResultadoSegredoErro} */ ({
        ok: false,
        nome: alvo,
        codigo: 'configuracao_invalida',
        mensagem: 'nome do segredo ausente ou inválido',
        ocorridoEm: relogio(),
      });
      notificarFalha({
        nome: alvo,
        codigo: resultado.codigo,
        mensagem: resultado.mensagem,
      });
      return resultado;
    }

    // Cache em memória de curta duração (opcional).
    const emCache = lerCache(alvo);
    if (emCache !== undefined) {
      return /** @type {ResultadoSegredoOk} */ ({
        ok: true,
        nome: alvo,
        valor: emCache,
        doCache: true,
        recuperadoEm: relogio(),
      });
    }

    try {
      const resposta = await secretClient.getSecret(alvo);
      const valor = resposta?.value;

      if (typeof valor !== 'string' || valor.length === 0) {
        // Segredo existe no contrato mas sem valor utilizável.
        const resultado = /** @type {ResultadoSegredoErro} */ ({
          ok: false,
          nome: alvo,
          codigo: 'nao_encontrado',
          mensagem: 'segredo sem valor utilizável no Cofre_Segredos',
          ocorridoEm: relogio(),
        });
        notificarFalha({
          nome: alvo,
          codigo: resultado.codigo,
          mensagem: resultado.mensagem,
        });
        return resultado;
      }

      gravarCache(alvo, valor);

      return /** @type {ResultadoSegredoOk} */ ({
        ok: true,
        nome: alvo,
        valor,
        doCache: false,
        recuperadoEm: relogio(),
      });
    } catch (causa) {
      // Falha de recuperação (indisponibilidade, rede, autorização da Managed
      // Identity, etc.). A mensagem NUNCA inclui o valor do segredo (R9.3). A
      // `causa` é repassada apenas ao ponto de tratamento de falha (tarefa 9.2),
      // que é responsável por logar de forma mascarada; não é devolvida no
      // resultado estruturado para evitar vazamento acidental em serializações.
      const resultado = /** @type {ResultadoSegredoErro} */ ({
        ok: false,
        nome: alvo,
        codigo: 'indisponivel',
        mensagem: 'falha ao recuperar o segredo do Cofre_Segredos',
        ocorridoEm: relogio(),
      });
      notificarFalha({
        nome: alvo,
        codigo: resultado.codigo,
        mensagem: resultado.mensagem,
        causa,
      });
      return resultado;
    }
  };

  /** Limpa todo o cache em memória. */
  const limparCache = () => cache.clear();

  /**
   * Invalida a entrada de cache de um segredo específico (ex.: após rotação).
   * @param {string} nome
   */
  const invalidar = (nome) => cache.delete(normalizarNome(nome));

  /** @returns {number} Quantidade de entradas atualmente no cache em memória. */
  const tamanhoCache = () => cache.size;

  return { obterSegredo, limparCache, invalidar, tamanhoCache };
}

/**
 * Ponto de ligação com o SDK real em PRODUÇÃO.
 *
 * Mantido como fábrica documentada para NÃO acoplar este módulo ao SDK
 * `@azure/keyvault-secrets` / `@azure/identity` em tempo de teste. Em produção,
 * instale essas dependências e implemente a construção do cliente, por exemplo:
 *
 * ```js
 * // import { SecretClient } from '@azure/keyvault-secrets';
 * // import { DefaultAzureCredential } from '@azure/identity';
 * //
 * // export function criarSecretClientManagedIdentity({ vaultUrl }) {
 * //   // DefaultAzureCredential usa a Managed Identity atribuída ao recurso
 * //   // (App Service / Function) quando executando na Azure — sem segredos
 * //   // em código, config ou env (R9.1).
 * //   const credential = new DefaultAzureCredential();
 * //   return new SecretClient(vaultUrl, credential);
 * // }
 * ```
 *
 * O objeto retornado satisfaz `SecretClientLike` e é passado como `secretClient`
 * para `criarRecuperadorSegredos`.
 *
 * @param {{ vaultUrl: string, credential?: unknown }} _config
 * @returns {SecretClientLike}
 */
export function criarSecretClientManagedIdentity(_config) {
  throw new Error(
    'criarSecretClientManagedIdentity: ligue o SDK @azure/keyvault-secrets + ' +
      '@azure/identity (DefaultAzureCredential/ManagedIdentity) em produção. ' +
      'Em testes, injete um secretClient que satisfaça SecretClientLike.',
  );
}

export default criarRecuperadorSegredos;

