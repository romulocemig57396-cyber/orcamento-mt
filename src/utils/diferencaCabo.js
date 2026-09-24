// Diferença de cabo
// Quando a Cemig propõe um cabo superior ao necessário para atender o cliente,
// a obra é lançada com o cabo superior (o memorial fica correto) e a diferença
// de custo total entre o cabo superior e o cabo necessário é paga pela Cemig
// como Condição Técnica (CTC). O rateio com o cliente (PP, Parcela Regulatória,
// CTI) é feito apenas sobre o cabo necessário.
import { TABELA_CUSTOS, getValorPorAno, getItemById } from '../data/tabelaCustos';

export const ANO_PADRAO = 2024;

// Categorias da biblioteca que envolvem cabo e admitem diferença de cabo
const CATEGORIAS_COM_CABO = ['Extensão', 'Conversão Mono→Tri', 'Recondutoramento'];

// Grupo de compatibilidade dentro da mesma categoria/subcategoria/unidade:
// - Extensão Rural: mesma quantidade de fases (mono só com mono, tri só com tri)
// - Conversão e Recondutoramento Rural: mesmo cabo de origem ("CAA 4 p/ ...")
// - Urbano: todos os cabos da subcategoria
export const grupoCompatibilidade = (item) => {
  if (!item) return null;
  if (item.categoria === 'Extensão' && item.subcategoria === 'Rural') {
    return /^mono/i.test(item.tipo) ? 'mono' : 'tri';
  }
  if (item.subcategoria === 'Rural' && item.tipo.includes(' p/ ')) {
    return item.tipo.split(' p/ ')[0].trim();
  }
  return 'todos';
};

export const itemPermiteDiferencaCabo = (itemObra) => {
  if (!itemObra || itemObra.categoria === 'ctc') return false;
  const superior = getItemById(itemObra.itemOrigem);
  return !!superior && CATEGORIAS_COM_CABO.includes(superior.categoria)
    && (parseFloat(itemObra.quantidade) || 0) > 0;
};

// Cabos que podem ser o "cabo necessário" para um item superior:
// mesma categoria, subcategoria, unidade e grupo; unitário maior que zero
// e menor que o do cabo superior, no mesmo ano de referência.
export const getCabosCompativeis = (superiorId, ano = ANO_PADRAO) => {
  const superior = getItemById(superiorId);
  if (!superior || !CATEGORIAS_COM_CABO.includes(superior.categoria)) return [];
  const unitSuperior = getValorPorAno(superior, ano, 'unitario') || 0;
  const grupo = grupoCompatibilidade(superior);
  return TABELA_CUSTOS
    .filter(c =>
      c.id !== superior.id &&
      c.categoria === superior.categoria &&
      c.subcategoria === superior.subcategoria &&
      c.unidade === superior.unidade &&
      grupoCompatibilidade(c) === grupo)
    .map(c => ({ item: c, unitario: getValorPorAno(c, ano, 'unitario') || 0 }))
    .filter(({ unitario }) => unitario > 0 && unitario < unitSuperior)
    .sort((a, b) => b.unitario - a.unitario);
};

// Diferença (R$) = (unitário superior − unitário necessário) × quantidade × 1000
// Considera o custo total do cabo (material + mão de obra + US construção).
export const calcularDiferencaCabo = (superiorId, necessarioId, quantidade, ano = ANO_PADRAO) => {
  const superior = getItemById(superiorId);
  const necessario = getItemById(necessarioId);
  const qtd = parseFloat(quantidade) || 0;
  if (!superior || !necessario || qtd <= 0) return 0;
  const us = getValorPorAno(superior, ano, 'unitario') || 0;
  const un = getValorPorAno(necessario, ano, 'unitario') || 0;
  return Math.max(0, (us - un) * qtd * 1000);
};

// Diferença efetiva de um item (nunca maior que o valor do item; zero em CTC)
export const diferencaDoItem = (item) => {
  if (!item || item.categoria === 'ctc') return 0;
  const dif = parseFloat(item.diferencaCabo) || 0;
  const valor = parseFloat(item.valor) || 0;
  return Math.max(0, Math.min(dif, valor));
};

// Base de rateio do item = valor do cabo necessário
export const baseRateioDoItem = (item) => (parseFloat(item.valor) || 0) - diferencaDoItem(item);
