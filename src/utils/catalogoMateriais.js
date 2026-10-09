/* ─────────────────────────────────────────────────────────────────────────────
   catalogoMateriais.js — catálogo combinado da aba "Criar Item"

   União de duas fontes de preço de material:
   • PROORC: o catálogo da referência selecionada (relatórios importados);
   • TOD: a lista de materiais da TOD (src/data/catalogoTod.json).

   Um código presente nas duas fontes vira uma linha só. O preço padrão é o do
   PROORC; o da TOD fica visível ao lado e, quando os dois diferem, a linha é
   marcada como divergente e quem monta o item escolhe a fonte.

   Funções puras; a tela só exibe.
   ───────────────────────────────────────────────────────────────────────────── */

const v = (x) => parseFloat(x) || 0;

// Diferença de preço considerada divergência (meio centavo)
export const TOLERANCIA_DIVERGENCIA = 0.005;

export const FONTES_MATERIAL = ['proorc', 'tod'];

// Classe dos materiais que não têm classe patrimonial informada (a TOD não informa)
export const CLASSE_NAO_INFORMADA = 'naoInformada';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* Fonte de uma linha de composição. Composições e propostas antigas não
   gravaram a fonte: todas vinham do catálogo do PROORC.                      */
export const fonteDoMaterial = (m) => (m?.fonte === 'tod' ? 'tod' : 'proorc');

/* Rótulo do selo: "PROORC dd/mm/aaaa" ou "TOD mmm/aaaa".
   `data` em 'AAAA-MM-DD'; sem data, só o nome da fonte.                     */
export const rotuloFonte = (fonte, data) => {
  const [ano, mes, dia] = String(data || '').split('-');
  if (fonte === 'tod') {
    const m = MESES[Number(mes) - 1];
    return ano && m ? `TOD ${m}/${ano}` : 'TOD';
  }
  return ano && mes && dia ? `PROORC ${dia}/${mes}/${ano}` : 'PROORC';
};

// 'dd/mm/aaaa' → 'AAAA-MM-DD' (as composições do PROORC gravam a data assim)
export const dataBRParaISO = (texto) => {
  const achado = String(texto || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return achado ? `${achado[3]}-${achado[2]}-${achado[1]}` : null;
};

// Quantos materiais de cada fonte há numa lista de composição
export const contarPorFonte = (materiais = []) => materiais.reduce(
  (acc, m) => ({ ...acc, [fonteDoMaterial(m)]: acc[fonteDoMaterial(m)] + 1 }),
  { proorc: 0, tod: 0 },
);

/* Data dos relatórios do PROORC de uma referência, lida do texto da fonte ou
   do rótulo ("PROORC, relatórios de 08/10/2026") → '2026-10-08'.            */
export const dataDaReferenciaProorc = (referencia) =>
  dataBRParaISO(`${referencia?.fonte || ''} ${referencia?.rotulo || ''}`);

/* ── Catálogo combinado ──────────────────────────────────────────────────────
   catalogoProorc: { codigo: { codigo, descricao, unidade, classe, ucUar, precoUnitario } }
   materiaisTod:   [{ codigo, descricao, unidade, preco, tipo }] — só os de
                   tipo "material" são usados.
   Devolve a lista ordenada por código; cada linha:
     { codigo, descricao, unidade, classe, ucUar,
       fontes: { proorc?: { precoUnitario, data }, tod?: { precoUnitario, data } },
       fontePadrao, precoUnitario, diverge }                                   */
export const montarCatalogoCombinado = ({ catalogoProorc = {}, dataProorc = null, materiaisTod = [], dataTod = null } = {}) => {
  const linhas = new Map();

  Object.values(catalogoProorc).forEach(m => {
    linhas.set(m.codigo, {
      codigo: m.codigo,
      descricao: m.descricao,
      unidade: m.unidade,
      classe: m.classe || 'consumo',
      ucUar: m.ucUar || '-',
      fontes: { proorc: { precoUnitario: v(m.precoUnitario), data: dataProorc } },
    });
  });

  materiaisTod.filter(m => m.tipo === 'material').forEach(m => {
    const tod = { precoUnitario: v(m.preco), data: dataTod };
    const existente = linhas.get(m.codigo);
    if (existente) {
      existente.fontes.tod = tod;
    } else {
      linhas.set(m.codigo, {
        codigo: m.codigo,
        descricao: m.descricao,
        unidade: m.unidade,
        classe: CLASSE_NAO_INFORMADA,
        ucUar: '-',
        fontes: { tod },
      });
    }
  });

  return [...linhas.values()]
    .map(l => {
      const fontePadrao = l.fontes.proorc ? 'proorc' : 'tod';
      const diverge = !!(l.fontes.proorc && l.fontes.tod)
        && Math.abs(l.fontes.proorc.precoUnitario - l.fontes.tod.precoUnitario) > TOLERANCIA_DIVERGENCIA;
      return { ...l, fontePadrao, precoUnitario: l.fontes[fontePadrao].precoUnitario, diverge };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
};

/* Linha da composição a partir de uma linha do catálogo, com a fonte escolhida
   (padrão: a do catálogo). Guarda o preço usado, a fonte e a data dela.     */
export const linhaDaComposicao = (linhaCatalogo, fonte = linhaCatalogo.fontePadrao, quantidade = 1) => {
  const f = linhaCatalogo.fontes[fonte] ? fonte : linhaCatalogo.fontePadrao;
  return {
    codigo: linhaCatalogo.codigo,
    descricao: linhaCatalogo.descricao,
    unidade: linhaCatalogo.unidade,
    classe: linhaCatalogo.classe,
    ucUar: linhaCatalogo.ucUar,
    quantidade,
    precoUnitario: linhaCatalogo.fontes[f].precoUnitario,
    fonte: f,
    dataFonte: linhaCatalogo.fontes[f].data || null,
  };
};

/* ── Busca ───────────────────────────────────────────────────────────────────
   Cada palavra digitada tem que aparecer na descrição (sem diferenciar
   maiúsculas e acentos) ou no código, com ou sem os zeros à esquerda
   ("375259" encontra "00375259"; a partir de 4 dígitos). Filtros por unidade e por fonte.
   Devolve no máximo `limite` resultados, os de código exato primeiro.        */
export const LIMITE_RESULTADOS = 50;

export const normalizarBusca = (texto) => String(texto ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const semZeros = (codigo) => String(codigo).replace(/^0+(?=\d)/, '');

/* Número com 4 dígitos ou mais procura também no código; os curtos ("36")
   ficam só na descrição, para não trazer códigos que apenas os contêm.     */
const MIN_DIGITOS_CODIGO = 4;
const palavraNoCodigo = (palavra, codigo) =>
  /^\d+$/.test(palavra) && palavra.length >= MIN_DIGITOS_CODIGO
  && (codigo.includes(palavra) || semZeros(codigo).includes(semZeros(palavra)));

export const buscarMateriais = (catalogo = [], { texto = '', unidade = '', fonte = '' } = {}, limite = LIMITE_RESULTADOS) => {
  const palavras = normalizarBusca(texto).split(' ').filter(Boolean);
  if (palavras.length === 0) return { resultados: [], total: 0, truncado: false };

  const codigoDigitado = palavras.length === 1 && /^\d+$/.test(palavras[0]) ? semZeros(palavras[0]) : null;

  const achados = catalogo.filter(m => {
    if (unidade && m.unidade !== unidade) return false;
    if (fonte && !m.fontes?.[fonte]) return false;
    const descricao = normalizarBusca(m.descricao);
    return palavras.every(p => descricao.includes(p) || palavraNoCodigo(p, m.codigo));
  });

  if (codigoDigitado) {
    achados.sort((a, b) => (semZeros(b.codigo) === codigoDigitado) - (semZeros(a.codigo) === codigoDigitado));
  }

  return { resultados: achados.slice(0, limite), total: achados.length, truncado: achados.length > limite };
};

// Unidades presentes no catálogo, para o filtro
export const unidadesDoCatalogo = (catalogo = []) =>
  [...new Set(catalogo.map(m => m.unidade).filter(Boolean))].sort((a, b) => a.localeCompare(b));
