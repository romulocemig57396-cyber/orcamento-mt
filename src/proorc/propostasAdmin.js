/* ─────────────────────────────────────────────────────────────────────────────
   propostasAdmin.js — conferência e aprovação das propostas de item

   Funções puras. Recalcular a proposta na referência atual mostra ao
   responsável se algum preço mudou desde que o analista montou o item.
   Aprovar devolve uma biblioteca nova com o item como oficial, mantendo o
   mesmo id, para que os orçamentos que já usaram a proposta continuem válidos.
   ───────────────────────────────────────────────────────────────────────────── */

import { calcularProposta } from '../utils/propostas';

const v = (x) => parseFloat(x) || 0;
const mudou = (a, b) => Math.abs(v(a) - v(b)) > 0.005;
const reais = (n) => `R$ ${v(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* Entrada original da proposta: o que o analista digitou. Propostas antigas,
   sem `entrada`, são reconstruídas a partir da composição gravada.          */
export const entradaDaProposta = (proposta) => {
  if (proposta.entrada) return proposta.entrada;
  const composicao = proposta.composicoes?.[proposta.referenciaPrecos] || {};
  const construcao = (composicao.servicos || []).find(s => s.grupo === 'construcao');
  const projeto = (composicao.servicos || []).find(s => s.grupo === 'projeto');
  return {
    materiais: composicao.materiais || [],
    usConstrucao: v(construcao?.quantidadeUS),
    usProjeto: v(projeto?.quantidadeUS),
    tipoUS: construcao?.codigo || 'USRDA',
    precosUS: { construcao: v(construcao?.precoUS), projeto: v(projeto?.precoUS) },
  };
};

export const recalcularPropostaNaReferencia = (proposta, { catalogoMateriais = {}, precosUS = {}, referencia }) => {
  const entrada = entradaDaProposta(proposta);
  const unidades = v(proposta.formacao?.unidadesPorProjeto) || 1;
  const temCatalogo = Object.keys(catalogoMateriais).length > 0;
  const temPrecoUS = v(precosUS.construcao) > 0 || v(precosUS.projeto) > 0;

  const mudancas = [];

  const materiais = (entrada.materiais || []).map(m => {
    const doCatalogo = catalogoMateriais[m.codigo];
    const precoAtual = doCatalogo ? v(doCatalogo.precoUnitario) : null;
    const alterou = precoAtual !== null && mudou(precoAtual, m.precoUnitario);
    if (alterou) {
      mudancas.push(`${m.codigo} (${m.descricao}): ${reais(m.precoUnitario)} → ${reais(precoAtual)}`);
    }
    if (temCatalogo && !doCatalogo) {
      mudancas.push(`${m.codigo} (${m.descricao}) não está no catálogo desta referência.`);
    }
    return {
      ...m,
      precoOriginal: v(m.precoUnitario),
      precoUnitario: precoAtual !== null ? precoAtual : v(m.precoUnitario),
      ausenteNoCatalogo: temCatalogo && !doCatalogo,
      mudou: alterou,
    };
  });

  ['construcao', 'projeto'].forEach(grupo => {
    const antes = v(entrada.precosUS?.[grupo]);
    const agora = v(precosUS[grupo]);
    const usa = grupo === 'construcao' ? v(entrada.usConstrucao) : v(entrada.usProjeto);
    if (usa > 0 && agora > 0 && mudou(antes, agora)) {
      mudancas.push(`Preço da US de ${grupo === 'construcao' ? 'construção' : 'projeto'}: ${reais(antes)} → ${reais(agora)}`);
    }
  });

  const calculo = calcularProposta({
    materiais,
    usConstrucao: entrada.usConstrucao,
    usProjeto: entrada.usProjeto,
    precosUS: temPrecoUS ? precosUS : entrada.precosUS,
    unidadesPorProjeto: unidades,
  });

  const original = proposta.custos?.[proposta.referenciaPrecos] || {};

  return {
    referencia,
    possivel: temCatalogo || temPrecoUS,
    motivoIndisponivel: temCatalogo || temPrecoUS
      ? null
      : 'Esta referência não tem catálogo de materiais nem preço da US, então não há com o que recalcular. Os valores exibidos são os da criação.',
    materiais,
    servicos: {
      usConstrucao: v(entrada.usConstrucao),
      usProjeto: v(entrada.usProjeto),
      tipoUS: entrada.tipoUS,
      precosUS: temPrecoUS ? precosUS : entrada.precosUS,
    },
    totais: calculo,
    custos: calculo.custos,
    unidadesPorProjeto: unidades,
    original,
    mudouUnitario: mudou(original.unitario, calculo.custos.unitario),
    mudancas,
  };
};

/* ── Aprovação ───────────────────────────────────────────────────────────────
   O item entra na biblioteca como oficial, com o mesmo id, e a composição é
   gravada na referência escolhida.                                          */
export const aprovarProposta = ({ biblioteca, proposta, referencia, recalculo, aprovadoEm }) => {
  if (biblioteca.itens.some(i => i.id === proposta.id)) {
    throw new Error(`A biblioteca já tem um item com o id ${proposta.id}.`);
  }
  const r = recalculo;
  const unidades = r.unidadesPorProjeto;

  const item = {
    id: proposta.id,
    categoria: proposta.categoria,
    subcategoria: proposta.subcategoria || '',
    tipo: proposta.tipo,
    unidade: proposta.unidade,
    status: 'oficial',
    formacao: {
      origem: 'proorc',
      projeto: null,
      unidadesPorProjeto: unidades,
      observacao: proposta.formacao?.observacao
        || 'Item montado na aba Criar Item, a partir do catálogo de materiais e das US.',
    },
    propostaOrigem: {
      autor: proposta.autor || null,
      criadoEm: proposta.criadoEm || null,
      referenciaPrecos: proposta.referenciaPrecos || null,
      aprovadoEm: aprovadoEm || null,
    },
    custos: {
      [referencia]: {
        material: r.custos.material,
        maoObra: r.custos.maoObra,
        usConstr: r.custos.usConstr,
        unitario: r.custos.unitario,
      },
    },
    composicoes: {
      [referencia]: {
        projeto: null,
        descricaoProjeto: `Item aprovado a partir da proposta de ${proposta.autor || 'autor não informado'}`,
        dataReferencia: null,
        unidadesPorProjeto: unidades,
        materiais: r.materiais.map(m => ({
          codigo: m.codigo, descricao: m.descricao, unidade: m.unidade,
          classe: m.classe || 'consumo', ucUar: m.ucUar || '-',
          quantidade: v(m.quantidade), precoUnitario: v(m.precoUnitario),
          total: v(m.quantidade) * v(m.precoUnitario),
        })),
        servicos: [
          ...(r.servicos.usConstrucao > 0 ? [{
            codigo: r.servicos.tipoUS, descricao: 'Mão de obra de construção', grupo: 'construcao',
            quantidadeUS: r.servicos.usConstrucao, precoUS: v(r.servicos.precosUS.construcao),
            total: r.servicos.usConstrucao * v(r.servicos.precosUS.construcao),
          }] : []),
          ...(r.servicos.usProjeto > 0 ? [{
            codigo: 'USPROJ', descricao: 'Mão de obra de projeto', grupo: 'projeto',
            quantidadeUS: r.servicos.usProjeto, precoUS: v(r.servicos.precosUS.projeto),
            total: r.servicos.usProjeto * v(r.servicos.precosUS.projeto),
          }] : []),
        ],
        totalMateriais: r.totais.totalMateriais,
        totalServicos: r.totais.totalServicos,
        total: r.totais.totalProjetoGeral,
      },
    },
  };

  return { ...biblioteca, itens: [...biblioteca.itens, item] };
};
