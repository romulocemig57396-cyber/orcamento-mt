// RN-001 — Total da Condição Técnica
export const calcularCT = (itensCT, diferencaCabo = 0) => {
  const somaItensCT = itensCT.reduce((acc, item) => acc + (parseFloat(item.valor) || 0), 0);
  return somaItensCT + (parseFloat(diferencaCabo) || 0);
};

// RN-002 — Total da Proporcionalidade
export const calcularPP = (itensPP) => {
  return itensPP.reduce((acc, item) => acc + (parseFloat(item.valor) || 0), 0);
};

// RN-003 — Cálculo de MUSD
export const calcularMUSD = (cargaFutura, cargaAtual = 0) => {
  return (parseFloat(cargaFutura) || 0) - (parseFloat(cargaAtual) || 0);
};

// RN-004 — Total geral da obra
export const calcularTotalObra = (itensObra) => {
  return itensObra.reduce((acc, item) => acc + (parseFloat(item.valor) || 0), 0);
};

// RN-008 — PFC do cliente
export const calcularPFC = (totalObras, ct, pp, erd) => {
  return totalObras - ct - pp - (parseFloat(erd) || 0);
};

// RN-009 — Parcela Demanda Regulada Técnica D
export const calcularParcelaD = (ct, pp) => {
  return ct + pp;
};

// RN-010 — Material e serviços
export const calcularMaterialServicos = (totalObra) => {
  return {
    material: totalObra * 0.60,
    servicos: totalObra * 0.40
  };
};

// RN-011 — Valor total do bloco final
export const calcularValorTotalFinal = (administracao, material, servicos) => {
  return (parseFloat(administracao) || 0) + material + servicos;
};

// RN-012 — Quantidade de postes
export const calcularPostes = (metros) => {
  return (parseFloat(metros) || 0) / 40;
};

// RN-013 e RN-014 — Peso dos cabos com acréscimo
export const calcularPesoCabo = (kgPorMetro, metragem, percentualAdicional = 1.05) => {
  const pesoTotal = (parseFloat(kgPorMetro) || 0) * (parseFloat(metragem) || 0);
  return {
    pesoTotal,
    pesoComAcrescimo: pesoTotal * percentualAdicional
  };
};

// RN-015 — Validade
export const calcularValidade = (dataBase = new Date()) => {
  const validade = new Date(dataBase);
  validade.setDate(validade.getDate() + 120);
  return validade;
};

// Função auxiliar para formatação de moeda
export const formatarMoeda = (valor) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor || 0);
};

// Função auxiliar para formatação de data
export const formatarData = (data) => {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(data));
};