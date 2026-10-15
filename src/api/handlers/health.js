/* ─────────────────────────────────────────────────────────────────────────────
   health.js — GET /api/health

   Health check sem dados (R10). Única rota pública: não exige token nem papel.
   Diferente das demais, já retorna 200 — é a sonda de disponibilidade usada pela
   observabilidade e pelo ingress, não um recurso de negócio.
   ───────────────────────────────────────────────────────────────────────────── */

import { json } from '../http.js';

/**
 * @param {import('../http.js').RequisicaoApi} _req
 * @param {Object} [_deps]
 * @returns {import('../http.js').RespostaApi}
 */
export function health(_req, _deps) {
  return json(200, { status: 'ok' });
}
