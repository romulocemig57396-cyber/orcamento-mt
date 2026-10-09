/* ─────────────────────────────────────────────────────────────────────────────
   propostas.js — itens montados pelos analistas, antes da aprovação

   Uma proposta tem a mesma forma de um item da biblioteca (formacao, custos por
   referência e composicoes), mais `status: 'proposta'`, autor e data. Assim a
   tela de composição e a Biblioteca sabem exibi-la sem tratamento especial, e a
   aprovação pode gravá-la no JSON mantendo o mesmo id.

   Ficam numa chave própria do localStorage, separada do orçamento, para não se
   perderem quando o analista começa um orçamento novo.
   ───────────────────────────────────────────────────────────────────────────── */

import { hojeISO } from './datas';
import { fonteDoMaterial } from './catalogoMateriais';

export const CHAVE_PROPOSTAS = 'orcamento_mt_propostas';
const MIL = 1000;
const v = (x) => parseFloat(x) || 0;

/* ── Armazenamento ───────────────────────────────────────────────────────────
   Toda leitura e escrita é protegida: em janela privada o localStorage pode
   falhar, e nesse caso a tela continua funcionando sem propostas salvas.    */
export const lerPropostas = () => {
  try {
    const bruto = localStorage.getItem(CHAVE_PROPOSTAS);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    console.error('Não foi possível ler as propostas salvas:', e);
    return [];
  }
};

export const salvarPropostas = (lista) => {
  try {
    localStorage.setItem(CHAVE_PROPOSTAS, JSON.stringify(lista));
    return true;
  } catch (e) {
    console.error('Não foi possível salvar as propostas:', e);
    return false;
  }
};

/* ── Identificador ───────────────────────────────────────────────────────── */
export const slugDoTipo = (tipo) =>
  String(tipo || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'item';

const SUFIXO = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const sufixoAleatorio = (tamanho = 4) =>
  Array.from({ length: tamanho }, () => SUFIXO[Math.floor(Math.random() * SUFIXO.length)]).join('');

export const gerarIdProposta = (tipo, existentes = []) => {
  const slug = slugDoTipo(tipo);
  const usados = new Set(existentes.map(p => p.id));
  let id = `prop_${slug}_${sufixoAleatorio()}`;
  while (usados.has(id)) id = `prop_${slug}_${sufixoAleatorio()}`;
  return id;
};

/* ── Cálculo ─────────────────────────────────────────────────────────────────
   Materiais e US em R$; o custo do item sai em R$ mil por unidade, como no
   resto da biblioteca.                                                      */
export const calcularProposta = ({ materiais = [], usConstrucao = 0, usProjeto = 0, precosUS = {}, unidadesPorProjeto = 1 }) => {
  const unidades = v(unidadesPorProjeto) || 1;
  const totalMateriais = materiais.reduce((a, m) => a + v(m.quantidade) * v(m.precoUnitario), 0);
  const totalConstrucao = v(usConstrucao) * v(precosUS.construcao);
  const totalProjeto = v(usProjeto) * v(precosUS.projeto);
  const totalServicos = totalConstrucao + totalProjeto;

  const material = totalMateriais / unidades / MIL;
  const maoObra = totalServicos / unidades / MIL;

  return {
    totalMateriais,
    totalConstrucao,
    totalProjeto,
    totalServicos,
    totalProjetoGeral: totalMateriais + totalServicos,
    custos: {
      material,
      maoObra,
      usConstr: v(usConstrucao) / unidades,
      unitario: material + maoObra,
    },
  };
};

/* ── Validação ───────────────────────────────────────────────────────────── */
export const validarProposta = ({ tipo, categoria, unidade, materiais = [], usConstrucao = 0, usProjeto = 0, unidadesPorProjeto = 1, autor }, { itensExistentes = [], subcategoria = '' } = {}) => {
  const erros = [];
  const avisos = [];

  if (!String(tipo || '').trim()) erros.push('Informe o nome do item.');
  if (!String(categoria || '').trim()) erros.push('Informe a categoria.');
  if (!String(unidade || '').trim()) erros.push('Informe a unidade.');
  if (!String(autor || '').trim()) erros.push('Informe o seu nome.');

  if (materiais.length === 0 && v(usConstrucao) === 0 && v(usProjeto) === 0) {
    erros.push('Inclua ao menos um material ou uma quantidade de US.');
  }
  materiais.forEach((m, i) => {
    if (v(m.quantidade) <= 0) erros.push(`A quantidade do material ${m.codigo || i + 1} precisa ser maior que zero.`);
  });
  if (v(usConstrucao) < 0 || v(usProjeto) < 0) erros.push('As quantidades de US não podem ser negativas.');
  if (v(unidadesPorProjeto) <= 0) erros.push('As unidades por projeto precisam ser maiores que zero.');

  const mesmoNome = itensExistentes.find(i =>
    String(i.tipo || '').trim().toLowerCase() === String(tipo || '').trim().toLowerCase()
    && String(i.categoria || '') === String(categoria || '')
    && String(i.subcategoria || '') === String(subcategoria || ''));
  if (mesmoNome) {
    avisos.push(`Já existe "${mesmoNome.tipo}" em ${categoria}${subcategoria ? ` › ${subcategoria}` : ''}${mesmoNome.status === 'proposta' ? ' (proposta)' : ''}.`);
  }

  return { erros, avisos, valido: erros.length === 0 };
};

/* ── Montagem da proposta ────────────────────────────────────────────────── */
export const montarProposta = ({
  id, tipo, categoria, subcategoria = '', unidade, unidadesPorProjeto = 1,
  materiais = [], usConstrucao = 0, usProjeto = 0, tipoUS = 'USRDA',
  precosUS = {}, referencia, autor, criadoEm,
}, existentes = []) => {
  const calculo = calcularProposta({ materiais, usConstrucao, usProjeto, precosUS, unidadesPorProjeto });
  const unidades = v(unidadesPorProjeto) || 1;
  const data = criadoEm || hojeISO();

  const servicos = [
    ...(v(usConstrucao) > 0 ? [{
      codigo: tipoUS, descricao: tipoUS === 'USRDR' ? 'Mão de obra de construção rural' : 'Mão de obra de construção urbana',
      grupo: 'construcao', quantidadeUS: v(usConstrucao), precoUS: v(precosUS.construcao), total: calculo.totalConstrucao,
    }] : []),
    ...(v(usProjeto) > 0 ? [{
      codigo: 'USPROJ', descricao: 'Mão de obra de projeto',
      grupo: 'projeto', quantidadeUS: v(usProjeto), precoUS: v(precosUS.projeto), total: calculo.totalProjeto,
    }] : []),
  ];

  return {
    id: id || gerarIdProposta(tipo, existentes),
    status: 'proposta',
    tipo: String(tipo).trim(),
    categoria: String(categoria).trim(),
    subcategoria: String(subcategoria || '').trim(),
    unidade,
    autor: String(autor).trim(),
    criadoEm: data,
    referenciaPrecos: referencia,
    formacao: {
      origem: 'proorc',
      projeto: null,
      unidadesPorProjeto: unidades,
      observacao: 'Item montado na aba Criar Item, a partir do catálogo de materiais e das US.',
    },
    custos: { [referencia]: { ...calculo.custos } },
    composicoes: {
      [referencia]: {
        projeto: null,
        descricaoProjeto: `Montado por ${String(autor).trim()} em ${data.split('-').reverse().join('/')}`,
        dataReferencia: null,
        unidadesPorProjeto: unidades,
        materiais: materiais.map(m => ({
          codigo: m.codigo, descricao: m.descricao, unidade: m.unidade,
          classe: m.classe || 'consumo', ucUar: m.ucUar || '-',
          quantidade: v(m.quantidade), precoUnitario: v(m.precoUnitario),
          total: v(m.quantidade) * v(m.precoUnitario),
          fonte: fonteDoMaterial(m), dataFonte: m.dataFonte || null,
        })),
        servicos,
        totalMateriais: calculo.totalMateriais,
        totalServicos: calculo.totalServicos,
        total: calculo.totalProjetoGeral,
      },
    },
    entrada: { materiais: materiais.map(m => ({ ...m, fonte: fonteDoMaterial(m), dataFonte: m.dataFonte || null })), usConstrucao: v(usConstrucao), usProjeto: v(usProjeto), tipoUS, precosUS },
  };
};

/* ── Exportar e importar ─────────────────────────────────────────────────── */
export const ARQUIVO_PROPOSTAS_VERSAO = 1;

export const empacotarPropostas = (propostas) => ({
  tipo: 'propostas-orcamento-mt',
  versao: ARQUIVO_PROPOSTAS_VERSAO,
  geradoEm: hojeISO(),
  propostas,
});

export const baixarPropostas = (propostas, nomeArquivo) => {
  const texto = `${JSON.stringify(empacotarPropostas(propostas), null, 2)}\n`;
  const blob = new Blob([texto], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo || `propostas_${hojeISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Lê um arquivo de propostas; devolve a lista ou lança um erro explicado
export const lerArquivoPropostas = (texto) => {
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  const lista = Array.isArray(dados) ? dados : dados?.propostas;
  if (!Array.isArray(lista)) throw new Error('O arquivo não tem uma lista de propostas.');

  lista.forEach((p, i) => {
    if (!p || typeof p !== 'object') throw new Error(`A proposta ${i + 1} não é um objeto.`);
    if (!p.id || !p.tipo) throw new Error(`A proposta ${i + 1} está sem id ou sem nome.`);
    if (!p.custos || typeof p.custos !== 'object') throw new Error(`A proposta "${p.tipo}" está sem custos.`);
  });

  return lista.map(p => ({ ...p, status: 'proposta' }));
};

// Junta listas de propostas sem repetir id, mantendo a primeira ocorrência
export const juntarPropostas = (...listas) => {
  const porId = new Map();
  listas.flat().forEach(p => { if (!porId.has(p.id)) porId.set(p.id, p); });
  return [...porId.values()];
};
