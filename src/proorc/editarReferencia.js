/* ─────────────────────────────────────────────────────────────────────────────
   editarReferencia.js — edição administrativa dos valores da biblioteca

   A TOD, os itens calculados manualmente, os fixos e os parâmetros das
   fórmulas são atualizados por tela, sem arquivo. A edição acontece sobre uma
   referência EM PREPARAÇÃO, criada a partir de uma base: nunca se altera uma
   referência que já existe. A base pode ser uma referência instalada ou a
   referência que acabou de ser montada pelo PROORC e ainda não foi gravada.

   Recálculo em cascata: só são recalculados os itens que dependem, direta ou
   indiretamente, de um valor alterado. Todos os outros são copiados da base
   exatamente como estão — inclusive os que hoje não fecham com a fórmula.

   Funções puras; a tela (EditarValores.jsx) só exibe o que vem daqui.
   ───────────────────────────────────────────────────────────────────────────── */

import { calcularPorFormula, usDaMaoObra, ORIGENS_DIGITADAS } from './formacao';
import { variacaoPercentual } from './calcularReferencia';
import { aplicarNovaReferencia } from './gerarBibliotecaJson';

const CAMPOS = ['material', 'maoObra', 'usConstr', 'unitario'];
const v = (x) => parseFloat(x) || 0;
const EPS = 1e-9;
const LIMITE_VARIACAO = 30; // %

const num = (n, casas = 2) => v(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 5 });

const copiar = (custos) => {
  const saida = {};
  CAMPOS.forEach(c => { saida[c] = v(custos?.[c]); });
  return saida;
};

const diferente = (a, b) => ['material', 'maoObra', 'unitario'].some(c => Math.abs(v(a?.[c]) - v(b?.[c])) > EPS);

// Número informado pelo usuário; vazio/indefinido = não editado
const informado = (x) => x !== undefined && x !== null && x !== '' && !Number.isNaN(parseFloat(x));

/* US de construção acompanha a mão de obra na mesma proporção da base (mantém o
   preço da US implícito); sem base, usa o preço da US da referência.         */
const usProporcional = (custoBase, maoObraNova, precoUSConstrucao) => {
  if (v(custoBase?.maoObra) > 0 && v(custoBase?.usConstr) > 0) {
    return v(custoBase.usConstr) * (v(maoObraNova) / v(custoBase.maoObra));
  }
  return usDaMaoObra(maoObraNova, precoUSConstrucao);
};

/* ── O que pode ser editado ─────────────────────────────────────────────────── */
export const ITENS_EDITAVEIS = (biblioteca) =>
  biblioteca.itens.filter(i => ORIGENS_DIGITADAS.includes(i.formacao.origem));

const primeiro = (biblioteca, condicao, campo, padrao) => {
  const item = biblioteca.itens.find(i => condicao(i.formacao));
  return item ? v(item.formacao[campo]) : padrao;
};

// Valores atuais dos parâmetros das fórmulas, lidos da formação dos itens
export const parametrosAtuais = (biblioteca) => ({
  fatorExistente: primeiro(biblioteca, f => f.regra === 'redeExistenteMaisNova', 'fatorExistente', 0),
  fatorMaoObra: primeiro(biblioteca, f => f.regra === 'extensaoComAcrescimoMaoObra', 'fatorMaoObra', 0),
  religadorAdicional: primeiro(biblioteca, f => f.regra === 'postoTransformacao', 'religadorAdicional', 0),
  percentualMaoObra: primeiro(biblioteca, f => f.regra === 'postoTransformacao', 'percentualMaoObra', 0),
});

export const ROTULOS_PARAMETROS = {
  fatorExistente: 'fator da rede existente',
  fatorMaoObra: 'fator de mão de obra do recondutoramento urbano',
  religadorAdicional: 'religador adicional dos PT',
  percentualMaoObra: 'percentual de mão de obra dos PT',
};

export const fonteTodAtual = (biblioteca) =>
  biblioteca.itens.find(i => i.formacao.origem === 'tod')?.formacao.fonte || '';

/* ── Validação ────────────────────────────────────────────────────────────────
   Erros impedem gerar a referência; avisos vêm da prévia (variação, pendente). */
export const validarEdicao = ({ edicoes = {}, parametros = {} }) => {
  const erros = [];
  Object.entries(edicoes).forEach(([id, campos]) => {
    Object.entries(campos || {}).forEach(([campo, valor]) => {
      if (informado(valor) && parseFloat(valor) < 0) erros.push(`${id}: ${campo} não pode ser negativo.`);
    });
  });
  Object.entries(parametros).forEach(([nome, valor]) => {
    if (informado(valor) && parseFloat(valor) < 0) erros.push(`O ${ROTULOS_PARAMETROS[nome] || nome} não pode ser negativo.`);
  });
  return { erros };
};

/* ── Valores novos dos itens digitados ─────────────────────────────────────── */
const custoEditado = (item, custoBase, ed, precoUS) => {
  const material = informado(ed.material) ? v(ed.material) : v(custoBase.material);
  const maoObra = informado(ed.maoObra) ? v(ed.maoObra) : v(custoBase.maoObra);

  if (item.formacao.origem === 'tod') {
    // TOD: unitário é sempre material + mão de obra
    return { material, maoObra, usConstr: usProporcional(custoBase, maoObra, precoUS), unitario: material + maoObra };
  }

  // manual e fixo: soma só quando material e mão de obra são maiores que zero;
  // senão vale o unitário digitado (ou o da base)
  const unitario = material > 0 && maoObra > 0
    ? material + maoObra
    : informado(ed.unitario) ? v(ed.unitario) : v(custoBase.unitario);
  const usConstr = informado(ed.maoObra) ? usProporcional(custoBase, maoObra, precoUS) : v(custoBase.usConstr);
  return { material, maoObra, usConstr, unitario };
};

/* ── Cálculo da referência em preparação ──────────────────────────────────── */
export const calcularEdicao = ({
  biblioteca,
  chaveBase,
  edicoes = {},
  parametros = {},
  fonteTod,
}) => {
  const atuais = parametrosAtuais(biblioteca);
  const p = { ...atuais };
  Object.entries(parametros).forEach(([nome, valor]) => { if (informado(valor)) p[nome] = v(valor); });
  const mudou = (nome) => Math.abs(p[nome] - atuais[nome]) > EPS;

  const precoUS = v(biblioteca.precosUS?.[chaveBase]?.construcao);
  const itens = biblioteca.itens;
  const porId = new Map(itens.map(i => [i.id, i]));
  const custoBase = (item) => item.custos?.[chaveBase] || {};

  const novos = {};
  const motivos = {};
  const alterados = new Set();
  const editados = new Set();

  const definir = (item, custo, motivo) => {
    novos[item.id] = custo;
    if (diferente(custo, custoBase(item))) {
      alterados.add(item.id);
      motivos[item.id] = motivo;
    }
  };

  // 1. Itens digitados (tod, manual, fixo): editados ou copiados
  itens.filter(i => ORIGENS_DIGITADAS.includes(i.formacao.origem)).forEach(item => {
    const ed = edicoes[item.id];
    const temEdicao = ed && Object.values(ed).some(informado);
    if (!temEdicao) { novos[item.id] = copiar(custoBase(item)); return; }
    editados.add(item.id);
    definir(item, custoEditado(item, custoBase(item), ed, precoUS),
      item.formacao.origem === 'tod' ? 'Valor da TOD editado' : 'Valor editado');
  });

  // 2. PROORC: copiados; os PT acompanham o religador adicional e o % de mão de obra
  itens.filter(i => i.formacao.origem === 'proorc').forEach(item => {
    const f = item.formacao;
    const b = custoBase(item);
    if (f.regra === 'postoTransformacao' && (mudou('religadorAdicional') || mudou('percentualMaoObra'))) {
      const unidades = v(f.unidadesPorProjeto) || 1;
      const semReligador = v(b.material) - v(f.religadorAdicional) / unidades / 1000;
      const material = semReligador + p.religadorAdicional / unidades / 1000;
      const maoObra = material * p.percentualMaoObra;
      const partes = [];
      if (mudou('religadorAdicional')) partes.push(`religador adicional alterado (R$ ${num(f.religadorAdicional)} → R$ ${num(p.religadorAdicional)})`);
      if (mudou('percentualMaoObra')) partes.push(`mão de obra alterada (${num(v(f.percentualMaoObra) * 100, 0)}% → ${num(p.percentualMaoObra * 100, 0)}%)`);
      definir(item, { material, maoObra, usConstr: v(b.usConstr), unitario: material + maoObra }, partes.join('; '));
      return;
    }
    novos[item.id] = copiar(b);
  });

  // 3. Só mão de obra: copiados (o preço da US não é editado aqui)
  itens.filter(i => i.formacao.origem === 'maoDeObra').forEach(item => {
    novos[item.id] = copiar(custoBase(item));
  });

  // 4. Fórmulas, em ordem de dependência: recalcula só quem tem base alterada
  //    ou parâmetro alterado; o resto é copiado da base.
  const basesDe = (f) => [f.baseExistente, f.baseNova, f.baseExtensao].filter(Boolean);
  let pendentes = itens.filter(i => i.formacao.origem === 'formula');
  for (let volta = 0; volta < 10 && pendentes.length; volta += 1) {
    const resto = [];
    pendentes.forEach(item => {
      const f = item.formacao;
      const bases = basesDe(f);
      if (!bases.every(b => novos[b])) { resto.push(item); return; }

      const basesAlteradas = bases.filter(b => alterados.has(b));
      const parametro = f.regra === 'extensaoComAcrescimoMaoObra' ? 'fatorMaoObra' : 'fatorExistente';
      const parametroMudou = mudou(parametro);
      if (!basesAlteradas.length && !parametroMudou) { novos[item.id] = copiar(custoBase(item)); return; }

      const formacao = { ...f, [parametro]: p[parametro] };
      const calculado = calcularPorFormula(formacao, {
        custoDe: (id) => novos[id],
        precoUSConstrucao: precoUS,
        custoAtual: custoBase(item),
      });
      calculado.usConstr = usProporcional(custoBase(item), calculado.maoObra, precoUS);

      const partes = [];
      if (basesAlteradas.length) {
        const nomes = basesAlteradas.map(b => porId.get(b)?.tipo || b).join(' e ');
        partes.push(basesAlteradas.length > 1 ? `bases ${nomes} alteradas` : `base ${nomes} alterada`);
      }
      if (parametroMudou) partes.push(`${ROTULOS_PARAMETROS[parametro]} alterado (${num(f[parametro])} → ${num(p[parametro])})`);
      definir(item, calculado, partes.join('; '));
    });
    if (resto.length === pendentes.length) break;
    pendentes = resto;
  }
  pendentes.forEach(item => { novos[item.id] = copiar(custoBase(item)); });

  // ── Prévia ──────────────────────────────────────────────────────────────────
  const previa = itens.map(item => {
    const anterior = copiar(custoBase(item));
    const efetivo = novos[item.id];
    const alterado = alterados.has(item.id);
    const variacao = variacaoPercentual(anterior.unitario, efetivo.unitario);
    return {
      id: item.id,
      tipo: item.tipo,
      categoria: item.categoria,
      subcategoria: item.subcategoria,
      unidade: item.unidade,
      origem: item.formacao.origem,
      regra: item.formacao.regra || null,
      anterior,
      recalculado: efetivo,
      efetivo,
      escolha: 'novo',
      motivo: alterado ? motivos[item.id] : 'Sem alteração',
      detalhes: null,
      alterado,
      editado: editados.has(item.id),
      // Copiado sem mudança de uma referência do PROORC: continua "não atualizado"
      naoAtualizado: !alterado && !!custoBase(item).naoAtualizadoPeloProorc,
      emVerificacao: !!item.verificacao,
      verificacao: item.verificacao || null,
      variacao,
      avisoVariacao: alterado && (variacao === null || Math.abs(variacao) > LIMITE_VARIACAO),
      ficaPendente: alterado && !(v(efetivo.unitario) > 0),
      semCusto: !(v(efetivo.unitario) > 0),
    };
  });

  // Composições, preços da US e catálogo seguem os da base
  const composicoes = {};
  itens.forEach(item => {
    const c = item.composicoes?.[chaveBase];
    if (c) composicoes[item.id] = c;
  });

  const alteradas = previa.filter(l => l.alterado);
  return {
    custos: novos,
    composicoes,
    previa,
    precosUS: biblioteca.precosUS?.[chaveBase] || { construcao: null, projeto: null },
    catalogoMateriais: biblioteca.catalogoMateriais?.[chaveBase] || {},
    projetosNaoUsados: [],
    parametros: p,
    fonteTod: fonteTod || fonteTodAtual(biblioteca),
    resumo: {
      total: previa.length,
      atualizados: alteradas.length,
      naoAtualizados: previa.filter(l => l.naoAtualizado).length,
      emVerificacao: previa.filter(l => l.emVerificacao).length,
      mantidos: 0,
      comMudanca: alteradas.length,
      editados: editados.size,
      avisosVariacao: alteradas.filter(l => l.avisoVariacao).length,
      novosPendentes: alteradas.filter(l => l.ficaPendente).map(l => l.id),
    },
  };
};

/* ── Gravação ─────────────────────────────────────────────────────────────────
   Cria a referência nova com os valores da edição. `biblioteca` é a instalada
   (sem a referência em preparação). A formação dos itens passa a registrar os
   parâmetros e a fonte da TOD usados.                                        */
export const aplicarEdicao = ({ biblioteca, resultado, chave, rotulo, fonte, atual = true, parametros, fonteTod, itensNovos = [] }) => {
  const nova = aplicarNovaReferencia({ biblioteca, resultado, chave, rotulo, fonte, atual, itensNovos });
  const p = { ...parametrosAtuais(biblioteca), ...(resultado.parametros || {}) };
  Object.entries(parametros || {}).forEach(([nome, valor]) => { if (informado(valor)) p[nome] = v(valor); });
  const tod = fonteTod || resultado.fonteTod;

  return {
    ...nova,
    itens: nova.itens.map(item => {
      const f = item.formacao;
      if (f.regra === 'redeExistenteMaisNova') return { ...item, formacao: { ...f, fatorExistente: p.fatorExistente } };
      if (f.regra === 'extensaoComAcrescimoMaoObra') return { ...item, formacao: { ...f, fatorMaoObra: p.fatorMaoObra } };
      if (f.regra === 'postoTransformacao') {
        return { ...item, formacao: { ...f, religadorAdicional: p.religadorAdicional, percentualMaoObra: p.percentualMaoObra } };
      }
      if (f.origem === 'tod' && tod) return { ...item, formacao: { ...f, fonte: tod } };
      return item;
    }),
  };
};
