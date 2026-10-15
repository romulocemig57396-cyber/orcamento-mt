/* ─────────────────────────────────────────────────────────────────────────────
   tratarFalhaSegredo.js — tratamento efetivo da falha de recuperação de segredo
   (R9.3, tarefa 9.2).

   A tarefa 9.1 (`keyvault.js`) expõe um PONTO de tratamento de falha: o callback
   injetável `aoFalhar({ nome, codigo, mensagem, causa })`, e NUNCA devolve o
   valor do segredo em erro. Esta tarefa (9.2) LIGA esse ponto ao tratamento real
   definido no design (Error Handling → "Falha ao recuperar segredo do Key Vault"):

     1. Registrar o evento de falha usando o logger estruturado
        (`observabilidade/logger.js`) com mascaramento (`observabilidade/mascarar.js`),
        garantindo que o valor do segredo e a causa NUNCA vazem no log (R9.3,
        Property 7).
     2. Abortar a operação dependente e retornar uma indicação de erro de
        INDISPONIBILIDADE — sem lançar e sem expor o valor.

   Composição, não alteração de contrato (9.1):
     Fornecemos uma fábrica (`criarRecuperadorSegredosComLog`) que compõe o
     recuperador de `keyvault.js` com um logger, configurando o `aoFalhar` para
     logar de forma mascarada. O contrato público de 9.1 (`obterSegredo`, cache,
     etc.) é preservado — apenas ligamos o ponto de extensão já existente.
   ───────────────────────────────────────────────────────────────────────────── */

import { criarRecuperadorSegredos } from './keyvault.js';
import { criarLogger } from '../../observabilidade/logger.js';
import { mascarar, mascararValor } from '../../observabilidade/mascarar.js';

/** Componente de origem usado nos logs deste módulo. */
export const COMPONENTE = 'api/segredos/keyvault';

/**
 * @typedef {Object} ErroIndisponibilidade
 * @property {false} ok
 * @property {string} nome      Nome lógico do segredo indisponível.
 * @property {'indisponivel'|'nao_encontrado'|'configuracao_invalida'} codigo
 * @property {string} mensagem  Mensagem SEM o valor do segredo.
 * @property {string} ocorridoEm Carimbo de tempo UTC (ISO 8601).
 * @property {true} indisponivel Indicação explícita de indisponibilidade do segredo.
 */

/**
 * Constrói o `aoFalhar` que registra o evento de falha de forma mascarada.
 *
 * Garante (R9.3 / Property 7) que NEM o valor do segredo NEM a `causa` (cuja
 * mensagem pode embutir o valor, ex.: connection string) sejam gravados em
 * texto claro. Tudo passa por `mascarar`/`mascararValor` antes de ir ao logger,
 * e a `causa` só vai como mensagem já mascarada — nunca o objeto de erro cru.
 *
 * Nunca lança: a emissão do log tem degradação graciosa própria no logger
 * (R10.5); envolvemos ainda em try/catch para não interferir no resultado
 * estruturado devolvido ao chamador.
 *
 * @param {ReturnType<typeof criarLogger>} logger
 * @returns {(info: { nome: string, codigo: string, mensagem: string, causa?: unknown }) => void}
 */
export const criarAoFalhar = (logger) => (info = {}) => {
  try {
    const { nome, codigo, mensagem, causa } = info;

    // A causa pode conter o valor do segredo embutido na mensagem (ex.:
    // "falhou ao usar AccountKey=...;"). Reduzimos a causa a uma descrição
    // textual e a passamos pelo mascaramento de padrões sensíveis.
    const textoCausa =
      causa instanceof Error
        ? causa.message
        : causa === undefined || causa === null
          ? undefined
          : String(causa);

    const contexto = {
      // `nome`/`codigo`/`mensagem` do keyvault.js já não carregam o valor, mas
      // ainda assim passam pelo mascaramento por chave/padrão por segurança.
      nome,
      codigo,
      mensagem,
    };
    if (textoCausa !== undefined) {
      // Guardamos apenas a descrição mascarada da causa — nunca o Error cru,
      // nunca o valor do segredo.
      contexto.causa = mascararValor(textoCausa);
    }

    logger.error(
      'falha ao recuperar segredo do Cofre_Segredos; operação dependente abortada',
      // Mascaramento defensivo do contexto inteiro (chaves e padrões sensíveis).
      mascarar(contexto),
      { componente: COMPONENTE },
    );
  } catch {
    // O tratamento de falha jamais deve interferir no fluxo do chamador.
  }
};

/**
 * Cria um recuperador de segredos COM tratamento de falha ligado (R9.3).
 *
 * Compõe `criarRecuperadorSegredos` (9.1) injetando um `aoFalhar` que registra
 * a falha de forma mascarada no logger estruturado. O resultado estruturado de
 * erro de 9.1 (que já não expõe o valor) é devolvido inalterado.
 *
 * @param {object} opcoes
 * @param {import('./keyvault.js').SecretClientLike} opcoes.secretClient Cliente do cofre (injetado).
 * @param {ReturnType<typeof criarLogger>} [opcoes.logger] Logger estruturado; se
 *        ausente, cria um logger padrão com mascaramento habilitado.
 * @param {number} [opcoes.ttlMs] TTL do cache em memória (repassado a 9.1).
 * @param {() => string} [opcoes.relogio] Fonte do carimbo UTC (repassado a 9.1).
 * @param {() => number} [opcoes.monotonico] Fonte do tempo do cache (repassado a 9.1).
 * @returns {ReturnType<typeof criarRecuperadorSegredos>}
 */
export function criarRecuperadorSegredosComLog(opcoes = {}) {
  const {
    secretClient,
    logger = criarLogger({ componente: COMPONENTE, mascarar }),
    ...resto
  } = opcoes;

  return criarRecuperadorSegredos({
    ...resto,
    secretClient,
    aoFalhar: criarAoFalhar(logger),
  });
}

/**
 * Executa uma operação dependente de um segredo, ABORTANDO-A e devolvendo um
 * erro de indisponibilidade quando o segredo não puder ser recuperado (R9.3).
 *
 * Comportamento:
 *   - Recupera o segredo via `recuperador.obterSegredo(nome)` (9.1).
 *   - Em FALHA: a operação dependente NÃO é executada (aborto); devolve um erro
 *     de indisponibilidade (`{ ok:false, indisponivel:true, ... }`) sem o valor.
 *     O log já foi emitido pelo `aoFalhar` do recuperador composto.
 *   - Em SUCESSO: invoca `operacao(valor)` e devolve `{ ok:true, resultado }`.
 *     O valor do segredo é passado apenas à `operacao` (em memória), nunca logado.
 *
 * Nunca lança por causa da falha de segredo. Se a própria `operacao` lançar,
 * a exceção propaga para o chamador (é responsabilidade da operação dependente).
 *
 * @template T
 * @param {object} args
 * @param {ReturnType<typeof criarRecuperadorSegredos>} args.recuperador Recuperador (idealmente o composto com log).
 * @param {string} args.nome Nome lógico do segredo necessário à operação.
 * @param {(valor: string) => (T | Promise<T>)} args.operacao Operação dependente do segredo.
 * @returns {Promise<{ ok: true, resultado: T } | ErroIndisponibilidade>}
 */
export async function comSegredo({ recuperador, nome, operacao }) {
  if (!recuperador || typeof recuperador.obterSegredo !== 'function') {
    throw new TypeError('comSegredo requer um recuperador com obterSegredo(nome).');
  }
  if (typeof operacao !== 'function') {
    throw new TypeError('comSegredo requer uma operacao(valor) a executar.');
  }

  const r = await recuperador.obterSegredo(nome);

  if (!r.ok) {
    // Aborta a operação dependente e devolve indicação de indisponibilidade.
    // Não repassamos nenhum valor; apenas os metadados de erro já sanitizados.
    return /** @type {ErroIndisponibilidade} */ ({
      ok: false,
      nome: r.nome,
      codigo: r.codigo,
      mensagem: r.mensagem,
      ocorridoEm: r.ocorridoEm,
      indisponivel: true,
    });
  }

  const resultado = await operacao(r.valor);
  return { ok: true, resultado };
}

export default criarRecuperadorSegredosComLog;
