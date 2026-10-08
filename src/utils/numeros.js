/* ─────────────────────────────────────────────────────────────────────────────
   numeros.js — leitura de números no formato brasileiro

   Usado na importação do parecer técnico e na leitura dos relatórios do PROORC,
   em que todas as células vêm como texto ("3.150,00", "2.823,98", "1.200").
   ───────────────────────────────────────────────────────────────────────────── */

// Trecho de número para montar expressões de busca: "1.200", "1.200,5", "112,5",
// "1500". Ponto seguido de exatamente 3 dígitos é milhar; ponto com outra
// quantidade de dígitos ("11.33") é decimal, para manter textos já existentes.
export const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?(?!\d)|\d+(?:[.,]\d+)?`;

export function lerNumeroBR(texto) {
  const t = String(texto ?? '').trim();
  if (!/^-?\d[\d.,]*$/.test(t)) return NaN;
  const sinal = t.startsWith('-') ? -1 : 1;
  const n = t.replace(/^-/, '');
  if (n.includes(',')) return sinal * parseFloat(n.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(n)) return sinal * parseFloat(n.replace(/\./g, ''));
  return sinal * parseFloat(n);
}
