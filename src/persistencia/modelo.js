import { VERSAO_SCHEMA, migrarOrcamento } from '../utils/migracao';

/* ─────────────────────────────────────────────────────────────────────────────
   modelo.js — Documento de orçamento persistido (envelope corporativo)

   O orçamento hoje é um objeto único (ver useOrcamento.js) serializado no
   localStorage. O modelo gerenciado preserva esse objeto integralmente em
   `dados` e o envelopa com metadados de controle corporativo (ambiente,
   proprietário, classificação, versão de schema, timestamps), conforme o Data
   Model do design.

   Este módulo NÃO altera a lógica de cálculo: `dados` guarda o mesmo estado de
   orçamento usado hoje. A compatibilidade com dados antigos é garantida
   reaproveitando `migrarOrcamento`/`VERSAO_SCHEMA` de utils/migracao.js.
   ───────────────────────────────────────────────────────────────────────────── */

/** Ambientes isolados da solução (R11.2). */
export const AMBIENTES = ['dev', 'hml', 'prd'];

/** Níveis de classificação da informação (R11.1). */
export const CLASSIFICACOES = ['publico', 'interno', 'confidencial', 'restrito'];

const AMBIENTE_PADRAO = 'dev';
const CLASSIFICACAO_PADRAO = 'interno';

/**
 * @typedef {Object} DocumentoOrcamento
 * @property {string} id                 Identificador único do orçamento (uuid).
 * @property {string} ambiente           Ambiente de origem ('dev' | 'hml' | 'prd').
 * @property {number} versaoSchema       Versão do schema de `dados` (de migracao.js).
 * @property {string|null} proprietarioOid  Object ID do Entra ID do proprietário.
 * @property {string} classificacao      Classificação da informação (R11.1).
 * @property {string} criadoEm           Carimbo de criação, ISO 8601 em UTC.
 * @property {string} atualizadoEm       Carimbo da última atualização, ISO 8601 em UTC.
 * @property {Object} dados              Estado do orçamento (mesmo formato do app).
 */

// Gera um identificador único; usa crypto.randomUUID quando disponível.
const gerarId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // Fallback simples (ambientes sem Web Crypto): não precisa ser criptográfico.
  return 'orc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
};

// Normaliza para um instante ISO 8601 em UTC; valores inválidos caem para agora.
const paraInstanteUTC = (valor) => {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString();
  if (typeof valor === 'string' || typeof valor === 'number') {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
};

const normalizarAmbiente = (valor) =>
  AMBIENTES.includes(valor) ? valor : AMBIENTE_PADRAO;

const normalizarClassificacao = (valor) =>
  CLASSIFICACOES.includes(valor) ? valor : CLASSIFICACAO_PADRAO;

/**
 * Cria um documento de orçamento a partir do estado de orçamento atual,
 * envelopando-o em `dados`.
 *
 * @param {Object} orcamento Estado de orçamento (formato do useOrcamento).
 * @param {Object} [meta] Metadados do envelope corporativo.
 * @param {string} [meta.id] Identificador existente (mantido em atualizações).
 * @param {string} [meta.ambiente] Ambiente ('dev' | 'hml' | 'prd').
 * @param {string|null} [meta.proprietarioOid] Object ID do Entra ID.
 * @param {string} [meta.classificacao] Classificação da informação.
 * @param {string|Date} [meta.criadoEm] Carimbo de criação (preservado em updates).
 * @param {string|Date} [meta.atualizadoEm] Carimbo de atualização (default: agora).
 * @returns {DocumentoOrcamento}
 */
export const criarDocumentoOrcamento = (orcamento = {}, meta = {}) => {
  const agora = paraInstanteUTC(meta.atualizadoEm);
  return {
    id: meta.id || gerarId(),
    ambiente: normalizarAmbiente(meta.ambiente),
    versaoSchema: VERSAO_SCHEMA,
    proprietarioOid: meta.proprietarioOid ?? null,
    classificacao: normalizarClassificacao(meta.classificacao),
    criadoEm: meta.criadoEm ? paraInstanteUTC(meta.criadoEm) : agora,
    atualizadoEm: agora,
    // `dados` guarda o orçamento tal como usado hoje; cópia rasa evita alias.
    dados: { ...orcamento },
  };
};

/**
 * Normaliza um documento (ou objeto cru vindo da persistência) para a forma
 * canônica do DocumentoOrcamento, aplicando a migração de schema aos `dados`
 * para preservar compatibilidade com orçamentos antigos.
 *
 * Aceita tanto um documento já envelopado quanto um orçamento "cru" (sem
 * envelope); neste caso o próprio objeto é tratado como `dados`.
 *
 * @param {Object} entrada Documento envelopado ou orçamento cru.
 * @returns {DocumentoOrcamento}
 */
export const normalizarDocumentoOrcamento = (entrada = {}) => {
  const envelopado = entrada && typeof entrada === 'object' && 'dados' in entrada;
  const dadosBrutos = envelopado ? (entrada.dados || {}) : entrada;
  const dados = migrarOrcamento(dadosBrutos);

  return criarDocumentoOrcamento(dados, {
    id: entrada.id,
    ambiente: entrada.ambiente,
    proprietarioOid: entrada.proprietarioOid,
    classificacao: entrada.classificacao,
    criadoEm: entrada.criadoEm,
    atualizadoEm: entrada.atualizadoEm,
  });
};

/**
 * Extrai o estado de orçamento (`dados`) de um documento envelopado,
 * aplicando a migração de schema. Ponto de entrada para a camada de UI
 * reutilizar o estado sem conhecer o envelope corporativo.
 *
 * @param {DocumentoOrcamento|Object} documento
 * @returns {Object} Estado de orçamento migrado.
 */
export const extrairDados = (documento = {}) => {
  const brutos = documento && typeof documento === 'object' && 'dados' in documento
    ? (documento.dados || {})
    : documento;
  return migrarOrcamento(brutos);
};
