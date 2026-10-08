/* ─────────────────────────────────────────────────────────────────────────────
   itensNovos.js — criar item novo na biblioteca a partir de um projeto do PROORC

   Na tela "Atualizar pelo PROORC", um projeto do relatório sem ligação pode
   virar um item novo. O item nasce oficial, com origem `proorc` e ligado ao
   projeto (a ligação vai para `mapeamentoProorc`), e passa a se atualizar nas
   próximas importações como os demais. Só existe a partir da referência em que
   foi criado: nas anteriores fica "não disponível".

   Funções puras; a tela só exibe e coleta o que vem daqui.
   ───────────────────────────────────────────────────────────────────────────── */

import { slugDoTipo } from '../utils/propostas';

const v = (x) => parseFloat(x) || 0;

export const UNIDADES_ITEM_NOVO = ['km', 'poste', 'ponto'];

// Prefixo do id por categoria, no padrão da biblioteca
const PREFIXOS = {
  'Extensão': 'ext',
  'Equipamentos': 'equip',
  'Recondutoramento': 'recon',
  'Conversão Mono→Tri': 'conv',
  'Rede': 'rede',
  'Subestação': 'sub',
  'Derivação p/ cliente MT': 'deriv',
};

const prefixoDaCategoria = (categoria) =>
  PREFIXOS[String(categoria || '').trim()] || slugDoTipo(categoria).slice(0, 20) || 'item';

export const gerarIdItem = (tipo, categoria, idsExistentes = []) => {
  const base = `${prefixoDaCategoria(categoria)}_${slugDoTipo(tipo)}`;
  const usados = new Set(idsExistentes);
  if (!usados.has(base)) return base;
  for (let n = 2; ; n += 1) {
    if (!usados.has(`${base}_${n}`)) return `${base}_${n}`;
  }
};

// O projeto não tem serviços contratados: a mão de obra precisa ser definida
export const projetoSemServicos = (projeto) => !(v(projeto?.servicos) > 0);

/* ── Sugestão a partir da descrição do projeto ─────────────────────────────── */
export const sugerirItemNovo = (projeto) => {
  const descricao = String(projeto?.descricao || '').replace(/\s+/g, ' ').trim();
  const d = descricao.toLowerCase();
  const ehRede = /extens|\brede\b|\bkm\b|rdp|rdr|rdu/.test(d) && !/religador|regulador|\bbrt\b|banco|capacitor/.test(d);
  return {
    projeto: projeto?.chave || '',
    tipo: descricao.slice(0, 80),
    categoria: ehRede ? 'Extensão' : 'Equipamentos',
    subcategoria: ehRede ? (/rdr|rural/.test(d) ? 'Rural' : 'Urbano') : 'Instalação',
    unidade: ehRede ? 'km' : 'ponto',
    unidadesPorProjeto: 1,
    maoObra: projetoSemServicos(projeto) ? { modo: 'percentual', percentual: 20 } : null,
  };
};

/* ── Validação ───────────────────────────────────────────────────────────────
   Devolve a lista de erros (vazia = pode criar).                             */
export const validarItemNovo = (definicao, { biblioteca, itensNovos = [], projeto } = {}) => {
  const d = definicao || {};
  const erros = [];
  const tipo = String(d.tipo || '').trim();
  const categoria = String(d.categoria || '').trim();
  const subcategoria = String(d.subcategoria || '').trim();

  if (!tipo) erros.push('Informe o nome (tipo) do item.');
  if (!categoria) erros.push('Informe a categoria.');
  if (!UNIDADES_ITEM_NOVO.includes(d.unidade)) erros.push('A unidade deve ser km, poste ou ponto.');
  if (!(v(d.unidadesPorProjeto) > 0)) erros.push('As unidades por projeto devem ser maiores que zero.');

  const todos = [...(biblioteca?.itens || []), ...itensNovos];
  const repetido = todos.some(i => i.tipo.trim().toLowerCase() === tipo.toLowerCase()
    && i.categoria === categoria && (i.subcategoria || '') === subcategoria);
  if (tipo && repetido) erros.push(`Já existe um item "${tipo}" em ${categoria}${subcategoria ? ` › ${subcategoria}` : ''}.`);

  if (projetoSemServicos(projeto)) {
    const m = d.maoObra;
    if (!m || !['us', 'percentual'].includes(m.modo)) {
      erros.push('O projeto não tem serviços contratados: escolha como calcular a mão de obra (US ou percentual sobre o material).');
    } else if (m.modo === 'us' && !(v(m.usConstrucao) > 0)) {
      erros.push('Informe as US de construção (maior que zero).');
    } else if (m.modo === 'percentual' && !(v(m.percentual) >= 0 && String(m.percentual ?? '') !== '')) {
      erros.push('Informe o percentual de mão de obra sobre o material.');
    }
  }
  return erros;
};

/* ── Criação ─────────────────────────────────────────────────────────────────
   O item ainda não tem custos: eles são calculados do projeto na referência
   nova (calcularNovaReferencia) e gravados por aplicarNovaReferencia.        */
export const criarItemNovo = (definicao, { biblioteca, itensNovos = [] } = {}) => {
  const d = definicao;
  const ids = [...(biblioteca?.itens || []), ...itensNovos].map(i => i.id);
  const tipo = String(d.tipo).trim();
  const categoria = String(d.categoria).trim();

  const formacao = { origem: 'proorc', projeto: d.projeto, unidadesPorProjeto: v(d.unidadesPorProjeto) };
  if (d.maoObra?.modo === 'percentual') {
    Object.assign(formacao, { regra: 'maoObraPercentual', percentualMaoObra: v(d.maoObra.percentual) / 100 });
  } else if (d.maoObra?.modo === 'us') {
    Object.assign(formacao, { regra: 'maoObraPorUS', usConstrucao: v(d.maoObra.usConstrucao) });
  }

  return {
    id: gerarIdItem(tipo, categoria, ids),
    categoria,
    subcategoria: String(d.subcategoria || '').trim(),
    tipo,
    unidade: d.unidade,
    status: 'oficial',
    formacao,
    custos: {},
    composicoes: {},
  };
};

// Entrada do mapeamentoProorc que liga o projeto ao item novo
export const ligacaoDoItemNovo = (item, projeto) => ({
  item: item.id,
  unidadesPorProjeto: v(item.formacao.unidadesPorProjeto) || 1,
  situacao: 'item novo',
  descricao: projeto?.descricao || '',
});
