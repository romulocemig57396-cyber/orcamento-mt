/* ─────────────────────────────────────────────────────────────────────────────
   formacao.js — cálculo do custo de um item a partir da sua origem de formação

   Funções puras. Os custos da biblioteca estão em R$ mil por unidade do item;
   os relatórios do PROORC e o preço da US estão em R$. A conversão (÷ 1000 e
   ÷ unidades do projeto) acontece aqui, num só lugar.
   ───────────────────────────────────────────────────────────────────────────── */

const MIL = 1000;
const v = (x) => parseFloat(x) || 0;

// US de construção equivalentes a um valor de mão de obra em R$ mil
export const usDaMaoObra = (maoObraMil, precoUSConstrucao) => {
  const preco = v(precoUSConstrucao);
  return preco > 0 ? (v(maoObraMil) * MIL) / preco : 0;
};

/* ── Origem `proorc` — projeto-padrão do PROORC ───────────────────────────────
   projeto: { materiais, servicos, usConstrucao } em R$ e em US.             */
export const calcularPorProorc = (formacao, projeto) => {
  const unidades = v(formacao.unidadesPorProjeto) || 1;

  // Regra especial dos Postos de Transformação: o projeto vem sem religador e
  // sem serviços. Soma-se o religador adicional ao material e a mão de obra é
  // um percentual do material.
  if (formacao.regra === 'postoTransformacao') {
    const material = (v(projeto.materiais) + v(formacao.religadorAdicional)) / unidades / MIL;
    const maoObra = material * v(formacao.percentualMaoObra);
    return { material, maoObra, usConstr: 0, unitario: material + maoObra };
  }

  const material = v(projeto.materiais) / unidades / MIL;
  const maoObra = v(projeto.servicos) / unidades / MIL;
  return {
    material,
    maoObra,
    // US de construção do próprio relatório; a mão de obra inclui a US de projeto
    usConstr: v(projeto.usConstrucao) / unidades,
    unitario: material + maoObra,
  };
};

/* ── Origem `formula` — calculado a partir de outros itens ────────────────────
   custoDe(id) devolve { material, maoObra, usConstr, unitario } em R$ mil.
   custoAtual é o custo do próprio item na referência anterior, usado quando a
   rede nova ainda não tem material cadastrado.                              */
export const calcularPorFormula = (formacao, { custoDe, precoUSConstrucao, custoAtual = {} }) => {
  if (formacao.regra === 'extensaoComAcrescimoMaoObra') {
    const base = custoDe(formacao.baseExtensao) || {};
    const material = v(base.material);
    const maoObra = v(base.maoObra) * v(formacao.fatorMaoObra);
    return { material, maoObra, usConstr: usDaMaoObra(maoObra, precoUSConstrucao), unitario: material + maoObra };
  }

  // redeExistenteMaisNova: fator × rede existente + rede nova
  const existente = custoDe(formacao.baseExistente) || {};
  const nova = custoDe(formacao.baseNova) || {};
  const unitario = v(formacao.fatorExistente) * v(existente.unitario) + v(nova.unitario);
  const material = v(nova.material) > 0 ? v(nova.material) : v(custoAtual.material);
  const maoObra = unitario - material;
  return { material, maoObra, usConstr: usDaMaoObra(maoObra, precoUSConstrucao), unitario };
};

/* ── Origem `maoDeObra` — só mão de obra ─────────────────────────────────── */
export const calcularPorMaoDeObra = (formacao, { precoUSConstrucao }) => {
  const us = v(formacao.usConstrucao);
  const maoObra = (us * v(precoUSConstrucao)) / MIL;
  return { material: 0, maoObra, usConstr: us, unitario: maoObra };
};

/* ── Texto da conta, para a tela de composição ───────────────────────────── */
export const ORIGENS = {
  proorc: 'Projeto-padrão do PROORC',
  formula: 'Calculado a partir de outros itens',
  maoDeObra: 'Somente mão de obra',
  fixo: 'Valor digitado, sem composição',
};
