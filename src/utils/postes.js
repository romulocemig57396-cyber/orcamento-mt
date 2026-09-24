// Conversão de distância de rede (km) para quantidade de postes.
export const METROS_POR_POSTE = 40;

export const kmParaPostes = (km) => {
  const valor = parseFloat(km);
  return Number.isFinite(valor) ? Math.round((valor * 1000) / METROS_POR_POSTE) : 0;
};

export const postesParaKm = (postes) => {
  const valor = parseFloat(postes);
  return Number.isFinite(valor) ? (valor * METROS_POR_POSTE) / 1000 : 0;
};

// Texto da quantidade de um item para exibição.
// Ex.: 11,33 km | 371 postes (≈ 14,84 km) | 2 pontos | 1 un
export const formatarQuantidade = (quantidade, unidade) => {
  const q = parseFloat(quantidade);
  if (!Number.isFinite(q) || q <= 0) return '—';
  const num = (n, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
  const u = (unidade || '').toLowerCase();
  if (u === 'km') return `${q.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} km`;
  if (u === 'poste') {
    const km = postesParaKm(q).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${num(q, 0)} ${q === 1 ? 'poste' : 'postes'} (≈ ${km} km)`;
  }
  if (u === 'ponto') return `${num(q)} ${q === 1 ? 'ponto' : 'pontos'}`;
  return `${num(q)}${u ? ` ${u}` : ''}`;
};
