/* ─────────────────────────────────────────────────────────────────────────────
   biblioteca.js — acesso à biblioteca de custos (src/data/biblioteca.json)

   A biblioteca é um arquivo de dados versionado no repositório. Cada item traz:
   - `formacao`: como o custo é formado (ver as 4 origens abaixo);
   - `custos`: um bloco por referência, em R$ mil por unidade do item;
   - `composicoes`: materiais e US do projeto do PROORC, por referência.

   Origens de formação:
   - `proorc`     — projeto-padrão do PROORC: materiais e serviços ÷ unidades.
                    `regra: 'postoTransformacao'` soma o religador adicional e
                    calcula a mão de obra como percentual do material.
   - `formula`    — calculado a partir de outros itens:
                    `redeExistenteMaisNova` (fator × existente + nova) e
                    `extensaoComAcrescimoMaoObra` (material igual, mão de obra ×).
   - `maoDeObra`  — só mão de obra: US de construção × preço da US.
   - `fixo`       — valor digitado, sem composição.

   A referência 2021 é anterior a essas fórmulas: tem valores digitados que não
   as seguem. `formacao` descreve como a referência atual é formada.
   ───────────────────────────────────────────────────────────────────────────── */

import biblioteca from './biblioteca.json';

export const BIBLIOTECA = biblioteca;
export const REFERENCIAS = biblioteca.referencias;
export const CAMPOS_CUSTO = ['material', 'maoObra', 'usConstr', 'unitario'];

// Chave da referência marcada como atual — padrão dos novos orçamentos
export const chaveReferenciaAtual = () =>
  (REFERENCIAS.find(r => r.atual) || REFERENCIAS[0]).chave;

export const getReferencia = (chave) =>
  REFERENCIAS.find(r => r.chave === String(chave).trim());

/* Aceita a chave como texto ('2024', '2026-10') ou número (2024), que é o
   formato gravado nos orçamentos antigos. Chave desconhecida cai na atual.   */
export const normalizarChaveReferencia = (ref) => {
  const chave = String(ref ?? '').trim();
  if (getReferencia(chave)) return chave;
  return chaveReferenciaAtual();
};

/* ── Itens ────────────────────────────────────────────────────────────────────
   Os itens expostos mantêm os campos planos das três referências antigas
   (`material2024`, `unitario2021`, …) por compatibilidade com o código e os
   orçamentos que já existiam. A fonte da verdade é `custos`; referências novas
   só existem lá, e devem ser lidas por `getValorPorAno`/`custosDaReferencia`. */
const REFS_PLANAS = REFERENCIAS.map(r => r.chave).filter(c => /^\d{4}$/.test(c));

const comCamposPlanos = (item) => {
  const plano = { ...item };
  for (const ref of REFS_PLANAS) {
    const custos = item.custos[ref] || {};
    for (const campo of CAMPOS_CUSTO) plano[campo + ref] = custos[campo];
  }
  return plano;
};

export const TABELA_CUSTOS = biblioteca.itens.map(comCamposPlanos);

export const ANOS_DISPONIVEIS = REFERENCIAS.map(r => ({
  ano: /^\d{4}$/.test(r.chave) ? Number(r.chave) : r.chave,
  chave: r.chave,
  label: r.rotulo,
  rotulo: r.rotulo,
  fonte: r.fonte,
  atual: !!r.atual,
}));

/* ── Acesso aos custos ────────────────────────────────────────────────────── */
export const custosDaReferencia = (item, ref) =>
  (item && item.custos && item.custos[normalizarChaveReferencia(ref)]) || {};

// Mesma assinatura de sempre: (item, referência, campo) → valor em R$ mil
export const getValorPorAno = (item, ano, campo = 'unitario') => {
  if (!item) return undefined;
  if (item.custos) return custosDaReferencia(item, ano)[campo];
  return item[campo + normalizarChaveReferencia(ano)]; // item solto, sem `custos`
};

export const getItemById = (id) => TABELA_CUSTOS.find(item => item.id === id);

export const getItensPorCategoria = (categoria) =>
  TABELA_CUSTOS.filter(item => item.categoria === categoria);

export const getItensPorSubcategoria = (categoria, subcategoria) =>
  TABELA_CUSTOS.filter(item => item.categoria === categoria && item.subcategoria === subcategoria);

export const buscarItens = (texto) => {
  const t = String(texto || '').toLowerCase();
  return TABELA_CUSTOS.filter(item =>
    item.tipo.toLowerCase().includes(t) ||
    item.categoria.toLowerCase().includes(t) ||
    item.subcategoria.toLowerCase().includes(t)
  );
};

// Exibição com 2 casas decimais (pt-BR)
export const formatarValor = (valor) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0,00';
  return valor.toFixed(2).replace('.', ',');
};

export const getCategorias = () =>
  [...new Set(TABELA_CUSTOS.map(item => item.categoria))].filter(c => c);

export const getSubcategorias = (categoria) =>
  [...new Set(TABELA_CUSTOS.filter(item => item.categoria === categoria).map(item => item.subcategoria))]
    .filter(s => s);

/* ── Preços da US e composições ───────────────────────────────────────────── */
export const getPrecosUS = (ref) => biblioteca.precosUS[normalizarChaveReferencia(ref)] || { construcao: null, projeto: null };

export const getComposicao = (item, ref) =>
  (item && item.composicoes && item.composicoes[normalizarChaveReferencia(ref)]) || null;

export const getCatalogoMateriais = (ref) => biblioteca.catalogoMateriais[normalizarChaveReferencia(ref)] || {};

export const MAPEAMENTO_PROORC = biblioteca.mapeamentoProorc;
