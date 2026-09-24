import { diferencaDoItem, baseRateioDoItem } from './diferencaCabo';

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

// RN-001/002/004/005/006 — Totais do rateio a partir dos itens
// A diferença de cabo de cada item vai para o CTC; o restante do item (cabo
// necessário) segue a categoria do item. O Total da Obra usa o cabo superior.
// `diferencaCaboAvulsa` mantém compatibilidade com orçamentos antigos, em que a
// diferença era digitada num campo único do Rateio.
export const calcularTotaisItens = (itensObra = [], diferencaCaboAvulsa = 0) => {
  const v = (x) => parseFloat(x) || 0;
  const pct = (i) => v(i.percentualCemig) / 100;
  const por = (cat) => itensObra.filter(i => i.categoria === cat);

  const totalObra = itensObra.reduce((a, i) => a + v(i.valor), 0);
  const diferencaCaboItens = itensObra.reduce((a, i) => a + diferencaDoItem(i), 0);
  const diferencaCaboTotal = diferencaCaboItens + v(diferencaCaboAvulsa);

  const ctcTotal = por('ctc').reduce((a, i) => a + v(i.valor), 0) + diferencaCaboTotal;
  const ppTotal = por('pp').reduce((a, i) => a + baseRateioDoItem(i) * pct(i), 0);
  const parcelaRegTotal =
    por('parcela_reg').reduce((a, i) => a + baseRateioDoItem(i), 0) +
    por('pp').reduce((a, i) => a + baseRateioDoItem(i) * (1 - pct(i)), 0);
  const ctiTotal = por('cti').reduce((a, i) => a + baseRateioDoItem(i), 0);

  return { totalObra, diferencaCaboItens, diferencaCaboTotal, ctcTotal, ppTotal, parcelaRegTotal, ctiTotal };
};

// RN-008 — PFC do cliente (nunca negativa)
export const calcularPFC = (totalObras, ct, pp, erd) => {
  return Math.max(0, totalObras - ct - pp - (parseFloat(erd) || 0));
};

// RN-007 — Aplicação do ERD com limite
// O ERD abate a Parcela Regulatória, limitado ao menor entre:
//   - o ERD disponível;
//   - a Parcela Regulatória total;
//   - o valor que o cliente ainda pagaria antes do ERD (Total − CTC − PP),
//     para que a PFC nunca fique negativa.
export const calcularRateioERD = ({ totalObra, ctcTotal, ppTotal, parcelaRegTotal, erd }) => {
  const erdDisponivel = parseFloat(erd) || 0;
  const pfcAntesERD = totalObra - ctcTotal - ppTotal;
  const parcelaRegCobertaERD = Math.max(0, Math.min(erdDisponivel, parcelaRegTotal, pfcAntesERD));
  return {
    pfcAntesERD,
    parcelaRegCobertaERD,
    sobraParcelaReg: Math.max(0, parcelaRegTotal - parcelaRegCobertaERD),
    erdNaoUtilizado: Math.max(0, erdDisponivel - parcelaRegCobertaERD),
    pfcCliente: Math.max(0, pfcAntesERD - parcelaRegCobertaERD),
  };
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

// RN-016 — Prazo estimado de conclusão da obra
export const calcularPrazoEstimado = (orcamento) => {
  const itensObra = orcamento.itensObra || [];

  const kmTotal = itensObra.reduce((acc, item) => {
    if (item.unidade === 'km') return acc + (parseFloat(item.quantidade) || 0);
    if (item.unidade === 'poste') return acc + ((parseFloat(item.quantidade) || 0) * 40 / 1000);
    return acc;
  }, 0);

  const prazoRede = kmTotal <= 1 ? 120 : 365;

  const prazoVinculadas = orcamento.temObrasVinculadas
    && orcamento.diasObrasVinculadas > 0
    ? orcamento.diasObrasVinculadas
    : null;

  const prazoFinal = prazoVinculadas
    ? Math.max(prazoRede, prazoVinculadas)
    : prazoRede;

  const dataFinal = new Date();
  dataFinal.setDate(dataFinal.getDate() + prazoFinal);

  return {
    prazoRede,
    prazoVinculadas,
    prazoFinal,
    dataFinal,
    kmTotal,
    temObrasVinculadas: !!orcamento.temObrasVinculadas,
  };
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