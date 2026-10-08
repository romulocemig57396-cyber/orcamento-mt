/* ─────────────────────────────────────────────────────────────────────────────
   explicarFormacao.js — descreve, em números, como o custo de um item foi
   formado numa referência. Função pura; a tela só exibe o que vem daqui.
   ───────────────────────────────────────────────────────────────────────────── */

import { getItemById, custosDaReferencia, getComposicao, getPrecosUS, getReferencia } from '../data/biblioteca';

const v = (x) => parseFloat(x) || 0;
const mil = (n) => v(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
const reais = (n) => `R$ ${v(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const us = (n) => v(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

export const CLASSE_ROTULO = {
  patrimonial: 'UC/UAR',
  cabo: 'Cabo',
  consumo: 'Consumo',
};

// Subtotais de materiais por classe
export const subtotaisPorClasse = (materiais = []) => {
  const totais = { patrimonial: 0, cabo: 0, consumo: 0 };
  materiais.forEach(m => { totais[m.classe] = (totais[m.classe] || 0) + v(m.total); });
  return totais;
};

/* `precosUS` pode ser informado quando a referência não está na biblioteca
   instalada — uma referência recém-gerada ou uma proposta de item.          */
export const explicarFormacao = (item, ref, { precosUS } = {}) => {
  if (!item) return null;
  const custos = custosDaReferencia(item, ref);
  const composicao = getComposicao(item, ref);
  const precos = precosUS || getPrecosUS(ref);
  const referencia = getReferencia(ref);
  const base = {
    id: item.id,
    tipo: item.tipo,
    unidade: item.unidade,
    origem: item.formacao.origem,
    regra: item.formacao.regra || null,
    referencia: referencia?.rotulo || ref,
    custos,
    naoAtualizado: !!custos.naoAtualizadoPeloProorc,
    verificacao: item.verificacao || null,
  };

  /* ── Projeto-padrão do PROORC ─────────────────────────────────────────────── */
  if (item.formacao.origem === 'proorc') {
    if (!composicao) {
      return {
        ...base,
        disponivel: false,
        mensagem: item.formacao.projeto
          ? `Composição não disponível para esta referência. O projeto ${item.formacao.projeto} não foi importado aqui.`
          : 'Composição não disponível para esta referência. O projeto-padrão deste item ainda não foi exportado do PROORC.',
      };
    }

    const unidades = v(composicao.unidadesPorProjeto) || 1;
    const ehPT = item.formacao.regra === 'postoTransformacao';
    const materialProjeto = v(composicao.totalMateriais) + (ehPT ? v(composicao.religadorAdicional) : 0);
    const maoObraProjeto = ehPT ? materialProjeto * v(composicao.percentualMaoObra) : v(composicao.totalServicos);

    const passos = [
      { rotulo: 'Materiais requisitados', valor: reais(composicao.totalMateriais) },
      ...(ehPT ? [{ rotulo: 'Religador adicional', valor: reais(composicao.religadorAdicional) }] : []),
      {
        rotulo: ehPT
          ? `Mão de obra (${Math.round(v(composicao.percentualMaoObra) * 100)}% do material)`
          : 'Serviços contratados',
        valor: reais(maoObraProjeto),
      },
      { rotulo: 'Total do projeto', valor: reais(materialProjeto + maoObraProjeto), destaque: true },
      ...(unidades > 1 ? [{ rotulo: `Dividido por ${unidades} ${item.unidade}s`, valor: `÷ ${unidades}` }] : []),
      { rotulo: `Unitário por ${item.unidade} (R$ mil)`, valor: mil(custos.unitario), destaque: true },
    ];

    return {
      ...base,
      disponivel: true,
      projeto: composicao.projeto,
      descricaoProjeto: composicao.descricaoProjeto,
      dataReferencia: composicao.dataReferencia,
      unidadesPorProjeto: unidades,
      materiais: composicao.materiais,
      subtotais: subtotaisPorClasse(composicao.materiais),
      servicos: composicao.servicos,
      precosUS: precos,
      passos,
      totalProjeto: materialProjeto + maoObraProjeto,
      religadorAdicional: ehPT ? v(composicao.religadorAdicional) : null,
    };
  }

  /* ── Calculado a partir de outros itens ──────────────────────────────────── */
  if (item.formacao.origem === 'formula') {
    const f = item.formacao;

    if (f.regra === 'extensaoComAcrescimoMaoObra') {
      const baseItem = getItemById(f.baseExtensao);
      const baseCustos = custosDaReferencia(baseItem, ref);
      return {
        ...base,
        disponivel: true,
        conta: `Material de ${baseItem?.tipo} (${mil(baseCustos.material)}) + ${mil(f.fatorMaoObra)} × mão de obra (${mil(baseCustos.maoObra)}) = ${mil(custos.unitario)}`,
        termos: [{ id: f.baseExtensao, tipo: baseItem?.tipo, unitario: v(baseCustos.unitario) }],
        passos: [
          { rotulo: `Material de ${baseItem?.tipo}`, valor: mil(baseCustos.material) },
          { rotulo: `Mão de obra × ${mil(f.fatorMaoObra)}`, valor: mil(v(baseCustos.maoObra) * v(f.fatorMaoObra)) },
          { rotulo: `Unitário por ${item.unidade} (R$ mil)`, valor: mil(custos.unitario), destaque: true },
        ],
      };
    }

    const existente = getItemById(f.baseExistente);
    const nova = getItemById(f.baseNova);
    const unitExistente = v(custosDaReferencia(existente, ref).unitario);
    const unitNova = v(custosDaReferencia(nova, ref).unitario);
    return {
      ...base,
      disponivel: true,
      conta: `${mil(f.fatorExistente)} × ${existente?.tipo} (${mil(unitExistente)}) + ${nova?.tipo} (${mil(unitNova)}) = ${mil(custos.unitario)}`,
      termos: [
        { id: f.baseExistente, tipo: existente?.tipo, unitario: unitExistente, fator: v(f.fatorExistente) },
        { id: f.baseNova, tipo: nova?.tipo, unitario: unitNova, fator: 1 },
      ],
      passos: [
        { rotulo: `${mil(f.fatorExistente)} × ${existente?.tipo} (rede existente)`, valor: mil(v(f.fatorExistente) * unitExistente) },
        { rotulo: `${nova?.tipo} (rede nova)`, valor: mil(unitNova) },
        { rotulo: `Unitário por ${item.unidade} (R$ mil)`, valor: mil(custos.unitario), destaque: true },
      ],
    };
  }

  /* ── Somente mão de obra ─────────────────────────────────────────────────── */
  if (item.formacao.origem === 'maoDeObra') {
    const quantidade = v(item.formacao.usConstrucao);
    const preco = v(precos.construcao);
    return {
      ...base,
      disponivel: true,
      conta: preco > 0
        ? `${us(quantidade)} US × ${reais(preco)} = ${reais(quantidade * preco)}`
        : `${us(quantidade)} US de construção (preço da US não registrado nesta referência)`,
      passos: [
        { rotulo: 'US de construção', valor: us(quantidade) },
        { rotulo: 'Preço da US', valor: preco > 0 ? reais(preco) : '—' },
        { rotulo: `Unitário por ${item.unidade} (R$ mil)`, valor: mil(custos.unitario), destaque: true },
      ],
      precosUS: precos,
    };
  }

  /* ── TOD (Tabela de Orçamento da Distribuição) ────────────────────────────
     A mão de obra da TOD já inclui mão de obra própria, serviços de terceiros
     e taxa de administração: não é recalculada pelo preço da US.            */
  if (item.formacao.origem === 'tod') {
    const f = item.formacao;
    const secao = String(f.secao || '').split('.')[0].trim();
    return {
      ...base,
      disponivel: true,
      conta: `${f.fonte} — seção ${secao} — ${f.descricaoTod}: material ${reais(v(custos.material) * 1000)} + mão de obra ${reais(v(custos.maoObra) * 1000)} (inclui mão de obra própria, serviços de terceiros e taxa de administração)`,
      passos: [
        { rotulo: `Material (${f.unidadeTod || 'TOD'})`, valor: reais(v(custos.material) * 1000) },
        { rotulo: `Mão de obra (${f.unidadeTod || 'TOD'})`, valor: reais(v(custos.maoObra) * 1000) },
        { rotulo: `Unitário por ${item.unidade} (R$ mil)`, valor: mil(custos.unitario), destaque: true },
      ],
    };
  }

  /* ── Calculado manualmente ───────────────────────────────────────────────── */
  if (item.formacao.origem === 'manual') {
    const motivo = String(item.formacao.motivo || '').trim();
    return {
      ...base,
      disponivel: false,
      mensagem: /^Calculado manualmente/i.test(motivo) ? motivo : `Calculado manualmente. ${motivo}`.trim(),
    };
  }

  /* ── Valor digitado ──────────────────────────────────────────────────────── */
  return {
    ...base,
    disponivel: false,
    mensagem: `Composição não disponível para esta referência. ${item.formacao.motivo || 'Valor digitado, sem composição.'}`,
  };
};
