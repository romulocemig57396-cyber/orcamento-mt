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
