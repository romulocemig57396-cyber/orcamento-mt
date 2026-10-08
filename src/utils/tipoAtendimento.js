/* ─────────────────────────────────────────────────────────────────────────────
   tipoAtendimento.js — códigos LN/AC/RF e textos antigos gravados por extenso
   ───────────────────────────────────────────────────────────────────────────── */

export const TIPOS_ATENDIMENTO = {
  LN: 'Ligação Nova',
  AC: 'Aumento de Carga',
  RF: 'Reforma',
};

export const OBS_GERACAO_DISTRIBUIDA = 'Atendimento com geração distribuída.';

const TEXTOS_ANTIGOS = {
  'ligação nova': 'LN',
  'ligacao nova': 'LN',
  'ampliação de carga': 'AC',
  'ampliacao de carga': 'AC',
  'aumento de carga': 'AC',
  'reforma': 'RF',
};

// Converte o valor gravado (código ou texto antigo) para LN/AC/RF.
// Valores não reconhecidos (ex.: "Geração Distribuída") viram vazio.
export const normalizarTipoAtendimento = (valor) => {
  const v = String(valor ?? '').trim();
  if (TIPOS_ATENDIMENTO[v.toUpperCase()]) return v.toUpperCase();
  return TEXTOS_ANTIGOS[v.toLowerCase()] || '';
};

export const rotuloTipoAtendimento = (valor) => {
  const codigo = normalizarTipoAtendimento(valor);
  return codigo ? `${codigo} — ${TIPOS_ATENDIMENTO[codigo]}` : '';
};
