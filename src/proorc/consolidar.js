/* ─────────────────────────────────────────────────────────────────────────────
   consolidar.js — une os três relatórios por projeto e confere o que não fecha

   Nada aqui interrompe a importação: toda inconsistência vira um aviso para o
   administrador decidir.
   ───────────────────────────────────────────────────────────────────────────── */

const TOLERANCIA = 0.05; // R$

const soma = (lista, campo) => lista.reduce((a, x) => a + (parseFloat(x[campo]) || 0), 0);
const perto = (a, b) => Math.abs(a - b) <= TOLERANCIA;
const dinheiro = (v) => (parseFloat(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const porChave = (projetos = []) => new Map(projetos.map(p => [p.chave, p]));

export const consolidarProorc = ({ sintetico, analitico, servicos }) => {
  const avisos = [];
  const aviso = (tipo, mensagem, chave = null) => avisos.push({ tipo, mensagem, projeto: chave });

  const aSint = porChave(sintetico?.projetos);
  const aAnal = porChave(analitico?.projetos);
  const aServ = porChave(servicos?.projetos);

  // ── Datas de referência ────────────────────────────────────────────────────
  const datas = [
    ['sintético', sintetico?.dataReferencia],
    ['analítico', analitico?.dataReferencia],
    ['serviços', servicos?.dataReferencia],
  ].filter(([, d]) => d);
  const distintas = [...new Set(datas.map(([, d]) => d))];
  if (distintas.length > 1) {
    aviso('datas', `Os relatórios têm datas de referência diferentes: ${datas.map(([n, d]) => `${n} ${d}`).join(', ')}.`);
  }
  const dataReferencia = distintas[0] || null;

  // ── Preços da US ───────────────────────────────────────────────────────────
  const precosUS = servicos?.precosUS || { construcao: null, projeto: null };
  const div = servicos?.precosDivergentes || { construcao: [], projeto: [] };
  ['construcao', 'projeto'].forEach(grupo => {
    if ((div[grupo] || []).length > 1) {
      aviso('precoUS', `Há mais de um preço de US de ${grupo === 'construcao' ? 'construção' : 'projeto'} nos projetos: ${div[grupo].map(dinheiro).join(', ')}.`);
    }
  });

  // ── Projetos ───────────────────────────────────────────────────────────────
  const chaves = [...new Set([...aSint.keys(), ...aAnal.keys(), ...aServ.keys()])];
  const projetos = chaves.map(chave => {
    const s = aSint.get(chave);
    const a = aAnal.get(chave);
    const v = aServ.get(chave);

    const presenca = [s && 'sintético', a && 'analítico', v && 'serviços'].filter(Boolean);
    if (presenca.length < 3) {
      const faltam = ['sintético', 'analítico', 'serviços'].filter(r => !presenca.includes(r));
      if (faltam.length === 1 && faltam[0] === 'serviços') {
        aviso('semServicos', `O projeto ${chave} não tem serviços contratados; só materiais.`, chave);
      } else {
        aviso('ausente', `O projeto ${chave} aparece em ${presenca.join(' e ')}, e falta em ${faltam.join(' e ')}.`, chave);
      }
    }

    const materiais = s ? s.materiais : (a ? a.totalMateriais : 0);
    const servicosTotal = s ? s.servicos : (v ? v.total : 0);
    const listaMateriais = a ? a.materiais : [];
    const listaServicos = v ? v.servicos : [];

    if (s && a && !perto(soma(listaMateriais, 'total'), s.materiais)) {
      aviso('materiais', `No projeto ${chave}, a soma dos materiais do analítico (R$ ${dinheiro(soma(listaMateriais, 'total'))}) não fecha com os Materiais Requisitados do sintético (R$ ${dinheiro(s.materiais)}).`, chave);
    }
    if (s && v && !perto(soma(listaServicos, 'total'), s.servicos)) {
      aviso('servicos', `No projeto ${chave}, a soma dos serviços (R$ ${dinheiro(soma(listaServicos, 'total'))}) não fecha com os Serviços Contratados do sintético (R$ ${dinheiro(s.servicos)}).`, chave);
    }
    if (s && (s.colunas?.total?.naoViabCemig || s.colunas?.total?.medicao)) {
      aviso('viabilidade', `O projeto ${chave} tem valor em NÃO VIAB. CEMIG (R$ ${dinheiro(s.colunas.total.naoViabCemig)}) ou MEDIÇÃO (R$ ${dinheiro(s.colunas.total.medicao)}).`, chave);
    }

    const us = (grupo) => listaServicos.filter(x => x.grupo === grupo).reduce((acc, x) => acc + x.quantidadeUS, 0);

    return {
      chave,
      descricao: (s || a || v).descricao,
      materiais,
      servicos: servicosTotal,
      total: s ? s.total : materiais + servicosTotal,
      administracao: s ? s.administracao : 0,
      maoObraPropria: s ? s.maoObraPropria : 0,
      salvados: s ? s.salvados : 0,
      usConstrucao: us('construcao'),
      usProjeto: us('projeto'),
      listaMateriais,
      listaServicos,
      colunas: s ? s.colunas : {},
    };
  });

  // ── Catálogo de materiais ──────────────────────────────────────────────────
  const catalogoMateriais = {};
  const conflitos = [];
  projetos.forEach(p => p.listaMateriais.forEach(m => {
    const existente = catalogoMateriais[m.codigo];
    if (!existente) {
      catalogoMateriais[m.codigo] = {
        codigo: m.codigo, descricao: m.descricao, unidade: m.unidade,
        ucUar: m.ucUar, classe: m.classe, precoUnitario: m.precoUnitario,
      };
      return;
    }
    if (Math.abs(existente.precoUnitario - m.precoUnitario) > 0.005 && !conflitos.includes(m.codigo)) {
      conflitos.push(m.codigo);
      aviso('precoMaterial', `O material ${m.codigo} (${m.descricao}) aparece com preços diferentes: R$ ${dinheiro(existente.precoUnitario)} e R$ ${dinheiro(m.precoUnitario)}.`);
    }
  }));

  // ── Resumo por classe do analítico ─────────────────────────────────────────
  const todos = projetos.flatMap(p => p.listaMateriais);
  const porClasse = {
    patrimonial: soma(todos.filter(m => m.classe === 'patrimonial'), 'total'),
    cabo: soma(todos.filter(m => m.classe === 'cabo'), 'total'),
    consumo: soma(todos.filter(m => m.classe === 'consumo'), 'total'),
  };
  porClasse.ucUar = porClasse.patrimonial + porClasse.cabo;

  if (analitico?.resumo) {
    if (!perto(porClasse.ucUar, analitico.resumo.ucUar)) {
      aviso('resumoClasse', `A soma dos materiais UC/UAR (R$ ${dinheiro(porClasse.ucUar)}) não fecha com o resumo do analítico (R$ ${dinheiro(analitico.resumo.ucUar)}).`);
    }
    if (!perto(porClasse.consumo, analitico.resumo.com)) {
      aviso('resumoClasse', `A soma dos materiais de consumo (R$ ${dinheiro(porClasse.consumo)}) não fecha com o resumo do analítico (R$ ${dinheiro(analitico.resumo.com)}).`);
    }
  }

  // ── Validação cruzada geral ────────────────────────────────────────────────
  const totalMateriais = soma(projetos, 'materiais');
  const totalServicos = soma(projetos, 'servicos');
  const totalGeralSintetico = sintetico?.somatorio?.total ?? null;
  if (totalGeralSintetico !== null && !perto(totalMateriais + totalServicos, totalGeralSintetico)) {
    aviso('totalGeral', `Materiais (R$ ${dinheiro(totalMateriais)}) + serviços (R$ ${dinheiro(totalServicos)}) não fecham com o TOTAL GERAL do sintético (R$ ${dinheiro(totalGeralSintetico)}).`);
  }

  return {
    dataReferencia,
    precosUS,
    projetos,
    catalogoMateriais,
    totais: { materiais: totalMateriais, servicos: totalServicos, geral: totalMateriais + totalServicos, porClasse },
    avisos,
  };
};
