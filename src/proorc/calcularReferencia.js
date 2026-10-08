/* ─────────────────────────────────────────────────────────────────────────────
   calcularReferencia.js — monta uma nova referência de custos a partir dos
   relatórios do PROORC, sem tocar nas referências que já existem.

   Ordem de cálculo (a de cima alimenta a de baixo):
     1. itens `proorc` com projeto no relatório → calculados do projeto;
     2. itens `proorc` sem projeto no relatório e itens `tod`, `manual` e
        `fixo` → copiados (nunca são procurados no PROORC);
     3. itens `maoDeObra` → recalculados com o novo preço da US;
     4. itens `formula` → recalculados a partir dos valores NOVOS das bases.

   O administrador pode escolher, item a item, entre o valor recalculado
   (padrão) e o da referência anterior. A escolha entra antes da etapa 4, então
   um item de fórmula acompanha a base que foi mantida.
   ───────────────────────────────────────────────────────────────────────────── */

import { calcularPorProorc, calcularPorFormula, calcularPorMaoDeObra } from './formacao';

const CAMPOS = ['material', 'maoObra', 'usConstr', 'unitario'];
const v = (x) => parseFloat(x) || 0;
const num = (n) => (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

const copiar = (custos) => {
  const saida = {};
  CAMPOS.forEach(c => { saida[c] = v(custos?.[c]); });
  return saida;
};

// Variação percentual do unitário; null quando não havia valor antes
export const variacaoPercentual = (antes, depois) => {
  const a = v(antes);
  if (a === 0) return v(depois) === 0 ? 0 : null;
  return ((v(depois) - a) / a) * 100;
};

/* Ligação projeto → item, a partir do mapeamento (que a tela pode editar).
   Devolve { porItem, porProjeto }.                                           */
export const indexarMapeamento = (mapeamento = {}) => {
  const porItem = {};
  const porProjeto = {};
  Object.entries(mapeamento).forEach(([projeto, m]) => {
    if (!m || !m.item) return;
    porProjeto[projeto] = m;
    porItem[m.item] = { projeto, unidadesPorProjeto: v(m.unidadesPorProjeto) || 1, situacao: m.situacao };
  });
  return { porItem, porProjeto };
};

export const calcularNovaReferencia = ({
  biblioteca,
  consolidado,
  chaveAnterior,
  mapeamento = biblioteca.mapeamentoProorc,
  escolhas = {},
}) => {
  const precoUSConstrucao = v(consolidado?.precosUS?.construcao);
  const { porItem } = indexarMapeamento(mapeamento);
  const projetos = new Map((consolidado?.projetos || []).map(p => [p.chave, p]));

  const anterior = (item) => item.custos?.[chaveAnterior] || {};
  const novos = {};   // id → custos novos
  const previa = {};  // id → linha da prévia

  const registrar = (item, calculado, { motivo, naoAtualizado = false, detalhes = null }) => {
    const antes = anterior(item);
    const escolha = escolhas[item.id] === 'anterior' ? 'anterior' : 'novo';
    const efetivo = escolha === 'anterior' ? copiar(antes) : calculado;

    novos[item.id] = efetivo;
    previa[item.id] = {
      id: item.id,
      tipo: item.tipo,
      categoria: item.categoria,
      subcategoria: item.subcategoria,
      unidade: item.unidade,
      origem: item.formacao.origem,
      regra: item.formacao.regra || null,
      anterior: copiar(antes),
      recalculado: calculado,
      efetivo,
      escolha,
      motivo,
      detalhes,
      naoAtualizado,
      emVerificacao: !!item.verificacao,
      verificacao: item.verificacao || null,
      variacao: variacaoPercentual(antes.unitario, efetivo.unitario),
      semCusto: !v(efetivo.unitario),
    };
  };

  const itens = biblioteca.itens;
  const porId = new Map(itens.map(i => [i.id, i]));

  // ── 1. itens `proorc` com projeto no relatório ──────────────────────────────
  const comProjeto = [];
  const semProjeto = [];
  itens.filter(i => i.formacao.origem === 'proorc').forEach(item => {
    const ligacao = porItem[item.id];
    const projeto = ligacao ? projetos.get(ligacao.projeto) : null;
    (projeto ? comProjeto : semProjeto).push({ item, ligacao, projeto });
  });

  comProjeto.forEach(({ item, ligacao, projeto }) => {
    const formacao = { ...item.formacao, projeto: ligacao.projeto, unidadesPorProjeto: ligacao.unidadesPorProjeto };
    const calculado = calcularPorProorc(formacao, projeto);
    const ehPT = formacao.regra === 'postoTransformacao';
    registrar(item, calculado, {
      motivo: ehPT
        ? `Projeto ${ligacao.projeto} do PROORC, mais o religador adicional de R$ ${num(formacao.religadorAdicional)} e ${Math.round(v(formacao.percentualMaoObra) * 100)}% de mão de obra`
        : `Projeto ${ligacao.projeto} do PROORC${ligacao.unidadesPorProjeto > 1 ? `, dividido por ${ligacao.unidadesPorProjeto} unidades` : ''}`,
      detalhes: {
        projeto: ligacao.projeto,
        unidadesPorProjeto: ligacao.unidadesPorProjeto,
        materiaisProjeto: projeto.materiais,
        servicosProjeto: projeto.servicos,
        totalProjeto: projeto.total,
        usConstrucaoProjeto: projeto.usConstrucao,
        usProjetoProjeto: projeto.usProjeto,
        religadorAdicional: ehPT ? v(formacao.religadorAdicional) : null,
        percentualMaoObra: ehPT ? v(formacao.percentualMaoObra) : null,
      },
    });
  });

  // ── 2. `proorc` sem projeto no relatório e `fixo` → copiados ────────────────
  semProjeto.forEach(({ item, ligacao }) => {
    registrar(item, copiar(anterior(item)), {
      motivo: ligacao
        ? `O projeto ${ligacao.projeto} não veio neste relatório`
        : item.formacao.observacao || 'Projeto-padrão ainda não exportado do PROORC',
      naoAtualizado: true,
    });
  });

  const MOTIVO_COPIA = {
    tod: (f) => `${f.fonte || 'TOD'} — não vem do PROORC; mantém o valor da referência anterior`,
    manual: () => 'Calculado manualmente — mantém o valor da referência anterior',
    fixo: (f) => f.motivo || 'Valor digitado, sem composição',
  };
  itens.filter(i => MOTIVO_COPIA[i.formacao.origem]).forEach(item => {
    registrar(item, copiar(anterior(item)), {
      motivo: MOTIVO_COPIA[item.formacao.origem](item.formacao),
      naoAtualizado: true,
    });
  });

  // ── 3. `maoDeObra` → novo preço da US ──────────────────────────────────────
  itens.filter(i => i.formacao.origem === 'maoDeObra').forEach(item => {
    const calculado = calcularPorMaoDeObra(item.formacao, { precoUSConstrucao });
    registrar(item, calculado, {
      motivo: `${num(item.formacao.usConstrucao)} US × R$ ${num(precoUSConstrucao)} (preço da US do relatório)`,
      detalhes: { usConstrucao: v(item.formacao.usConstrucao), precoUSConstrucao },
    });
  });

  // ── 4. `formula` → a partir dos valores novos das bases ────────────────────
  const deFormula = itens.filter(i => i.formacao.origem === 'formula');
  const basesDe = (f) => [f.baseExistente, f.baseNova, f.baseExtensao].filter(Boolean);
  const pendentes = [...deFormula];

  for (let volta = 0; volta < 5 && pendentes.length; volta += 1) {
    const aindaPendentes = [];
    pendentes.forEach(item => {
      const bases = basesDe(item.formacao);
      if (!bases.every(b => novos[b])) { aindaPendentes.push(item); return; }

      const calculado = calcularPorFormula(item.formacao, {
        custoDe: (id) => novos[id],
        precoUSConstrucao,
        custoAtual: anterior(item),
      });

      const mudaram = bases.filter(b => {
        const base = porId.get(b);
        return Math.abs(v(novos[b].unitario) - v(base?.custos?.[chaveAnterior]?.unitario)) > 0.00001;
      });
      const nomeDaBase = (b) => porId.get(b)?.tipo || b;

      registrar(item, calculado, {
        motivo: mudaram.length
          ? `Base${mudaram.length > 1 ? 's' : ''} ${mudaram.map(nomeDaBase).join(' e ')} atualizada${mudaram.length > 1 ? 's' : ''}`
          : 'Bases sem mudança nesta importação',
        detalhes: item.formacao.regra === 'extensaoComAcrescimoMaoObra'
          ? {
            baseExtensao: item.formacao.baseExtensao,
            nomeBaseExtensao: nomeDaBase(item.formacao.baseExtensao),
            fatorMaoObra: v(item.formacao.fatorMaoObra),
            materialBase: v(novos[item.formacao.baseExtensao].material),
            maoObraBase: v(novos[item.formacao.baseExtensao].maoObra),
          }
          : {
            baseExistente: item.formacao.baseExistente,
            baseNova: item.formacao.baseNova,
            nomeBaseExistente: nomeDaBase(item.formacao.baseExistente),
            nomeBaseNova: nomeDaBase(item.formacao.baseNova),
            fatorExistente: v(item.formacao.fatorExistente),
            unitarioExistente: v(novos[item.formacao.baseExistente].unitario),
            unitarioNova: v(novos[item.formacao.baseNova].unitario),
          },
      });
    });
    if (aindaPendentes.length === pendentes.length) break; // nada resolveu: para
    pendentes.length = 0;
    pendentes.push(...aindaPendentes);
  }

  // Bases que não resolveram (não deve acontecer com a biblioteca atual)
  pendentes.forEach(item => {
    registrar(item, copiar(anterior(item)), {
      motivo: 'Não foi possível recalcular: falta o valor novo de alguma base',
      naoAtualizado: true,
    });
  });

  // ── Composições dos itens ligados a um projeto ─────────────────────────────
  const composicoes = {};
  comProjeto.forEach(({ item, ligacao, projeto }) => {
    composicoes[item.id] = {
      projeto: ligacao.projeto,
      descricaoProjeto: projeto.descricao,
      dataReferencia: consolidado.dataReferencia,
      unidadesPorProjeto: ligacao.unidadesPorProjeto,
      materiais: projeto.listaMateriais.map(m => ({
        codigo: m.codigo, descricao: m.descricao, unidade: m.unidade,
        classe: m.classe, ucUar: m.ucUar,
        quantidade: m.quantidade, precoUnitario: m.precoUnitario, total: m.total,
      })),
      servicos: projeto.listaServicos.map(s => ({
        codigo: s.codigo, descricao: s.descricao, grupo: s.grupo,
        quantidadeUS: s.quantidadeUS, precoUS: s.precoUS, total: s.total,
      })),
      totalMateriais: projeto.materiais,
      totalServicos: projeto.servicos,
      total: projeto.total,
      ...(item.formacao.regra === 'postoTransformacao'
        ? { religadorAdicional: v(item.formacao.religadorAdicional), percentualMaoObra: v(item.formacao.percentualMaoObra) }
        : {}),
    };
  });

  // Projetos do relatório que não alimentaram nenhum item
  const usados = new Set(comProjeto.map(({ ligacao }) => ligacao.projeto));
  const projetosNaoUsados = (consolidado?.projetos || [])
    .filter(p => !usados.has(p.chave))
    .map(p => ({ chave: p.chave, descricao: p.descricao, total: p.total }));

  const linhas = itens.map(i => previa[i.id]).filter(Boolean);

  return {
    custos: novos,
    composicoes,
    previa: linhas,
    precosUS: { construcao: precoUSConstrucao, projeto: v(consolidado?.precosUS?.projeto) },
    catalogoMateriais: consolidado?.catalogoMateriais || {},
    projetosNaoUsados,
    resumo: {
      total: linhas.length,
      atualizados: linhas.filter(l => !l.naoAtualizado).length,
      naoAtualizados: linhas.filter(l => l.naoAtualizado).length,
      emVerificacao: linhas.filter(l => l.emVerificacao).length,
      mantidos: linhas.filter(l => l.escolha === 'anterior').length,
      comMudanca: linhas.filter(l => Math.abs(v(l.efetivo.unitario) - v(l.anterior.unitario)) > 0.00001).length,
    },
  };
};
