/* ─────────────────────────────────────────────────────────────────────────────
   http.js — primitivas HTTP framework-agnósticas da API serverless

   A API é escrita contra um contrato de requisição/resposta puro, independente
   do runtime de hospedagem (Azure App Service / Functions). Um adaptador fino
   no runtime converte o objeto nativo para `RequisicaoApi` e `RespostaApi` de
   volta para o formato nativo — mantendo os handlers testáveis sem servidor.
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} RequisicaoApi
 * @property {string} metodo              Método HTTP em maiúsculas.
 * @property {string} caminho             Caminho da URL (sem query string).
 * @property {Object<string,string>} params   Parâmetros de rota resolvidos.
 * @property {Object<string,string>} query    Parâmetros de query string.
 * @property {Object<string,string>} headers  Cabeçalhos (nomes em minúsculas).
 * @property {*} corpo                    Corpo já desserializado (ou null).
 * @property {Object|null} sessao         Sessão autenticada anexada (5.4), ou null.
 */

/**
 * @typedef {Object} RespostaApi
 * @property {number} status              Código HTTP.
 * @property {Object<string,string>} headers
 * @property {*} corpo
 */

/**
 * Monta uma resposta JSON padronizada.
 * @param {number} status
 * @param {*} corpo
 * @param {Object<string,string>} [headers]
 * @returns {RespostaApi}
 */
export function json(status, corpo, headers = {}) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    corpo,
  };
}

/**
 * Resposta de recurso ainda não implementado (stub).
 * Usada pelos handlers-esqueleto enquanto a lógica de negócio não existe.
 * @param {string} recurso  Nome legível do recurso/handler.
 * @returns {RespostaApi}
 */
export function naoImplementado(recurso) {
  return json(501, {
    erro: 'nao_implementado',
    mensagem: `A rota "${recurso}" ainda não possui lógica de negócio.`,
  });
}

/**
 * Resposta de erro padronizada.
 * @param {number} status
 * @param {string} codigo
 * @param {string} mensagem
 * @returns {RespostaApi}
 */
export function erro(status, codigo, mensagem) {
  return json(status, { erro: codigo, mensagem });
}

