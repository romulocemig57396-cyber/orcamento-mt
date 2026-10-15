/* ─────────────────────────────────────────────────────────────────────────────
   handlers/index.js — registro de handlers por chave

   As chaves correspondem ao campo `handler` do CONTRATO. O roteador resolve o
   handler da rota por nome a partir deste barrel.
   ───────────────────────────────────────────────────────────────────────────── */

export { health } from './health.js';
export {
  listarOrcamentos,
  obterOrcamento,
  gravarOrcamento,
  removerOrcamento,
} from './orcamentos.js';
export { registrarSolicitacaoTitular } from './titular.js';
