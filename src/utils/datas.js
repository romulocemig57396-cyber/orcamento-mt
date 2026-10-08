/* ─────────────────────────────────────────────────────────────────────────────
   datas.js — datas de calendário como texto AAAA-MM-DD, em horário local

   new Date('AAAA-MM-DD') e toISOString() trabalham em UTC: no Brasil (UTC−3)
   a data aparece ou é gravada um dia antes. Aqui as contas usam só ano, mês e
   dia, sem hora nem fuso.
   ───────────────────────────────────────────────────────────────────────────── */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n) => String(n).padStart(2, '0');

// Date → AAAA-MM-DD no horário local
export const dataParaISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const hojeISO = () => dataParaISO(new Date());

// Aceita AAAA-MM-DD, ISO completo antigo ("2026-01-01T00:00:00.000Z") ou Date.
// No ISO completo vale a parte da data: era o que o campo da tela mostrava.
export const normalizarDataISO = (valor) => {
  if (valor instanceof Date) return isNaN(valor) ? '' : dataParaISO(valor);
  const s = String(valor ?? '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(T.*)?$/);
  return m ? m[1] : '';
};

export const somarDias = (iso, dias) => {
  const m = String(iso ?? '').match(ISO_RE);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// Dias de calendário de `de` até `ate` (AAAA-MM-DD); null se alguma data for inválida
export const diasEntre = (de, ate) => {
  const a = String(de ?? '').match(ISO_RE);
  const b = String(ate ?? '').match(ISO_RE);
  if (!a || !b) return null;
  const utc = (m) => Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((utc(b) - utc(a)) / 86400000);
};

// AAAA-MM-DD → DD/MM/AAAA; Date (ex.: previsão de conclusão) → formato local
export const formatarDataBR = (valor) => {
  const m = String(valor ?? '').match(ISO_RE);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = valor instanceof Date ? valor : new Date(valor);
  return isNaN(d) ? '' : new Intl.DateTimeFormat('pt-BR').format(d);
};
