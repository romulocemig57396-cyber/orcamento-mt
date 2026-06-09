/* ─────────────────────────────────────────────────────────────────────────────
   gerarTexto.js — geração do memorial descritivo técnico
   ───────────────────────────────────────────────────────────────────────────── */

const TIPO_ATENDIMENTO = {
  LN: 'ligação nova',
  AC: 'aumento de carga',
  RF: 'reforma',
};

/* ── Descrições singulares (km/poste ou quantidade = 1) ── */
const DESCRICAO_SINGULAR = {
  // Extensão Rural
  'Mono CAA 4':    'rede rural monofásica CAA 4',
  'Mono CAA 2':    'rede rural monofásica CAA 2',
  'Tri CAA 4':     'rede rural trifásica CAA 4',
  'Tri CAA 2':     'rede rural trifásica CAA 2',
  'Tri CAA 1/0':   'rede rural trifásica CAA 1/0',
  'Tri CAA 4/0':   'rede rural trifásica CAA 4/0',
  'Tri CAA 336,4': 'rede rural trifásica CAA 336,4',

  // Extensão Urbana
  'RDP 50':               'rede de distribuição protegida 3#50mm²',
  'RDP 150':              'rede de distribuição protegida 3#150mm²',
  'RDP 240':              'rede de distribuição protegida 3#240mm²',
  'RDP 50 Dupla Camada':  'rede de distribuição protegida 3#50mm² dupla camada',
  'RDP 150 Dupla Camada': 'rede de distribuição protegida 3#150mm² dupla camada',
  'RDI 50':               'rede de distribuição isolada 50mm²',
  'RDI 185':              'rede de distribuição isolada 185mm²',

  // Recondutoramento Urbano
  'p/ RDP 50':              'rede de distribuição urbana para rede de distribuição protegida 3#50mm²',
  'p/ RDP 150':             'rede de distribuição urbana para rede de distribuição protegida 3#150mm²',
  'p/ RDP 240':             'rede de distribuição urbana para rede de distribuição protegida 3#240mm²',
  'p/ RDP 50 Dupla Camada': 'rede de distribuição urbana para rede de distribuição protegida 3#50mm² dupla camada',
  'p/ RDP 150 Dupla Camada':'rede de distribuição urbana para rede de distribuição protegida 3#150mm² dupla camada',
  'p/ 4/0 CA':              'rede de distribuição urbana para 4/0 CA',
  'p/ RDI 50':              'rede de distribuição isolada 50mm²',
  'p/ RDI 185':             'rede de distribuição isolada 185mm²',

  // Recondutoramento Rural
  'CAA 4 p/ 1/0':    'rede rural trifásica CAA 4 para CAA 1/0',
  'CAA 4 p/ 4/0':    'rede rural trifásica CAA 4 para CAA 4/0',
  'CAA 4 p/ 336':    'rede rural trifásica CAA 4 para CAA 336,4',
  'CAA 2 p/ 1/0':    'rede rural trifásica CAA 2 para CAA 1/0',
  'CAA 2 p/ 4/0':    'rede rural trifásica CAA 2 para CAA 4/0',
  'CAA 2 p/ 336':    'rede rural trifásica CAA 2 para CAA 336,4',
  'CAA 1/0 p/ 4/0':  'rede rural trifásica CAA 1/0 para CAA 4/0',
  'CAA 1/0 p/ 336,4':'rede rural trifásica CAA 1/0 para CAA 336,4',

  // Conversão Mono→Tri
  'CAA 4 p/ 4':   'rede monofásica para trifásica CAA 4',
  'CAA 4 p/ 2':   'rede monofásica para trifásica CAA 2',
  'CAA 4 p/ 1/0': 'rede monofásica para trifásica CAA 1/0',
  'CAA 2 p/ 2':   'rede monofásica para trifásica CAA 2',

  // Banco de Reguladores de Tensão
  'BRT trif 76,2 kVA':        'banco de reguladores de tensão trifásico de 76,2 kVA',
  'BRT trif 167 kVA - Rural':  'banco de reguladores de tensão trifásico de 167 kVA',
  'BRT trif 167 kVA - Urbano': 'banco de reguladores de tensão trifásico de 167 kVA',
  'BRT trif 250 KVA - Rural':  'banco de reguladores de tensão trifásico de 250 kVA',
  'BRT trif 250 KVA - Urbano': 'banco de reguladores de tensão trifásico de 250 kVA',

  // Religadores
  'Religador monofásico 15KV':       'religador monofásico 15 kV',
  'Religador trifásico 24KV Rural':  'religador trifásico 24 kV',
  'Religador trifásico 24KV Urbano': 'religador trifásico 24 kV',
  'Religador trifásico 36KV':        'religador trifásico 36 kV',

  // Banco de Capacitores
  'Banco de Cap. 300 kVAr fixo':       'banco de capacitores de 300 kVAr fixo',
  'Banco de Cap. 600 kVAr fixo':       'banco de capacitores de 600 kVAr fixo',
  'Banco de Cap. 300 kVAr automático': 'banco de capacitores de 300 kVAr automático',
  'Banco de Cap. 600 kVAr automático': 'banco de capacitores de 600 kVAr automático',

  // PT e chave
  'PT 2,50MVA':            'posto de transformação de 2,50 MVA',
  'PT 5,00MVA':            'posto de transformação de 5,00 MVA',
  'Abert/Fecha. De Chave': 'abertura/fechamento de chave',

  // Remoção
  'Remoção de 01 trafo 1ᴓ': 'transformador monofásico',
  'Remoção de 01 trafo 3ᴓ': 'transformador trifásico',

  // Relocação
  'Banco RT trifásico até 1/0':   'banco de reguladores de tensão trifásico',
  'Banco RT trifásico 4/0-336,4': 'banco de reguladores de tensão trifásico',
  'Banco RT trif 4/0 sem anc':    'banco de reguladores de tensão trifásico',
  'Religador trifásico':          'religador trifásico',
  'Religador monofásico':         'religador monofásico',

  // Retirada de rede
  '1 Km de RDR 1ᴓ cabo 4 a 1/0':     'rede de distribuição rural monofásica',
  '1 Km de RDR 3ᴓ cabo 4 a 1/0':     'rede de distribuição rural trifásica',
  '1 Km de RDR 3ᴓ cabo 4/0 a 336,4': 'rede de distribuição rural trifásica',
  '1 Km de RDP 1ᴓ cabo 50 mm2':      'rede de distribuição protegida monofásica',
  '1 Km de RDP 3ᴓ 50 a 150mm²':      'rede de distribuição protegida trifásica',

  // Derivação
  'Troca poste + ramal sub':   'derivação subterrânea em média tensão',
  'Troca poste + ramal aéreo': 'derivação aérea em média tensão',

  // Subestação
  'Seção 13,8 kV': 'seção em 13,8 kV',
  'Seção 22,0 kV': 'seção em 22,0 kV',
};

/* ── Formas plurais (equipamentos com unidade ponto/un, quantidade > 1) ── */
const DESCRICAO_PLURAL = {
  'BRT trif 76,2 kVA':        'bancos de reguladores de tensão trifásicos de 76,2 kVA',
  'BRT trif 167 kVA - Rural':  'bancos de reguladores de tensão trifásicos de 167 kVA',
  'BRT trif 167 kVA - Urbano': 'bancos de reguladores de tensão trifásicos de 167 kVA',
  'BRT trif 250 KVA - Rural':  'bancos de reguladores de tensão trifásicos de 250 kVA',
  'BRT trif 250 KVA - Urbano': 'bancos de reguladores de tensão trifásicos de 250 kVA',
  'Religador monofásico 15KV':       'religadores monofásicos 15 kV',
  'Religador trifásico 24KV Rural':  'religadores trifásicos 24 kV',
  'Religador trifásico 24KV Urbano': 'religadores trifásicos 24 kV',
  'Religador trifásico 36KV':        'religadores trifásicos 36 kV',
  'Banco de Cap. 300 kVAr fixo':       'bancos de capacitores de 300 kVAr fixo',
  'Banco de Cap. 600 kVAr fixo':       'bancos de capacitores de 600 kVAr fixo',
  'Banco de Cap. 300 kVAr automático': 'bancos de capacitores de 300 kVAr automático',
  'Banco de Cap. 600 kVAr automático': 'bancos de capacitores de 600 kVAr automático',
  'PT 2,50MVA': 'postos de transformação de 2,50 MVA',
  'PT 5,00MVA': 'postos de transformação de 5,00 MVA',
  'Remoção de 01 trafo 1ᴓ': 'transformadores monofásicos',
  'Remoção de 01 trafo 3ᴓ': 'transformadores trifásicos',
  'Banco RT trifásico até 1/0':   'bancos de reguladores de tensão trifásicos',
  'Banco RT trifásico 4/0-336,4': 'bancos de reguladores de tensão trifásicos',
  'Banco RT trif 4/0 sem anc':    'bancos de reguladores de tensão trifásicos',
  'Religador trifásico':          'religadores trifásicos',
  'Religador monofásico':         'religadores monofásicos',
};

/* ── Verbos por tipo da tabela ── */
const VERBO_POR_TIPO = {
  // Extensão → construção
  'Mono CAA 4': 'construção de', 'Mono CAA 2': 'construção de',
  'Tri CAA 4':  'construção de', 'Tri CAA 2':  'construção de',
  'Tri CAA 1/0':'construção de', 'Tri CAA 4/0':'construção de',
  'Tri CAA 336,4':'construção de',
  'RDP 50':'construção de', 'RDP 150':'construção de', 'RDP 240':'construção de',
  'RDP 50 Dupla Camada':'construção de', 'RDP 150 Dupla Camada':'construção de',
  'RDI 50':'construção de', 'RDI 185':'construção de',

  // Recondutoramento → modificação
  'p/ RDP 50':'modificação de', 'p/ RDP 150':'modificação de', 'p/ RDP 240':'modificação de',
  'p/ RDP 50 Dupla Camada':'modificação de', 'p/ RDP 150 Dupla Camada':'modificação de',
  'p/ 4/0 CA':'modificação de', 'p/ RDI 50':'modificação de', 'p/ RDI 185':'modificação de',
  'CAA 4 p/ 1/0':'modificação de', 'CAA 4 p/ 4/0':'modificação de', 'CAA 4 p/ 336':'modificação de',
  'CAA 2 p/ 1/0':'modificação de', 'CAA 2 p/ 4/0':'modificação de', 'CAA 2 p/ 336':'modificação de',
  'CAA 1/0 p/ 4/0':'modificação de', 'CAA 1/0 p/ 336,4':'modificação de',

  // Conversão → conversão
  'CAA 4 p/ 4':'conversão de', 'CAA 4 p/ 2':'conversão de',
  'CAA 4 p/ 1/0':'conversão de', 'CAA 2 p/ 2':'conversão de',

  // Instalação
  'BRT trif 76,2 kVA':'instalação de', 'BRT trif 167 kVA - Rural':'instalação de',
  'BRT trif 167 kVA - Urbano':'instalação de', 'BRT trif 250 KVA - Rural':'instalação de',
  'BRT trif 250 KVA - Urbano':'instalação de',
  'Religador monofásico 15KV':'instalação de', 'Religador trifásico 24KV Rural':'instalação de',
  'Religador trifásico 24KV Urbano':'instalação de', 'Religador trifásico 36KV':'instalação de',
  'Banco de Cap. 300 kVAr fixo':'instalação de', 'Banco de Cap. 600 kVAr fixo':'instalação de',
  'Banco de Cap. 300 kVAr automático':'instalação de', 'Banco de Cap. 600 kVAr automático':'instalação de',
  'Abert/Fecha. De Chave':'instalação de',

  // Implantação
  'PT 2,50MVA':'implantação de', 'PT 5,00MVA':'implantação de',
  'Seção 13,8 kV':'implantação de', 'Seção 22,0 kV':'implantação de',

  // Desativação (Remoção)
  'Remoção de 01 trafo 1ᴓ':'desativação de',
  'Remoção de 01 trafo 3ᴓ':'desativação de',

  // Relocação
  'Banco RT trifásico até 1/0':'relocação de', 'Banco RT trifásico 4/0-336,4':'relocação de',
  'Banco RT trif 4/0 sem anc':'relocação de',
  'Religador trifásico':'relocação de', 'Religador monofásico':'relocação de',

  // Retirada
  '1 Km de RDR 1ᴓ cabo 4 a 1/0':'retirada de', '1 Km de RDR 3ᴓ cabo 4 a 1/0':'retirada de',
  '1 Km de RDR 3ᴓ cabo 4/0 a 336,4':'retirada de',
  '1 Km de RDP 1ᴓ cabo 50 mm2':'retirada de', '1 Km de RDP 3ᴓ 50 a 150mm²':'retirada de',

  // Derivação
  'Troca poste + ramal sub':'construção de', 'Troca poste + ramal aéreo':'construção de',
};

/* ── Verbo por palavras-chave (fallback para itens manuais) ── */
const inferirVerboPorPalavras = (texto) => {
  const d = texto.toLowerCase();
  if (d.includes('construção') || d.includes('extensão'))                           return 'construção de';
  if (d.includes('recondutoramento') || d.includes('modificação'))                  return 'modificação de';
  if (d.includes('conversão'))                                                      return 'conversão de';
  if (d.includes('instalação') || d.includes('banco') || d.includes('religador'))   return 'instalação de';
  if (d.includes('implantação') || d.includes('subestação'))                        return 'implantação de';
  if (d.includes('remoção') || d.includes('desativação'))                           return 'desativação de';
  if (d.includes('retirada'))                                                       return 'retirada de';
  if (d.includes('relocação'))                                                      return 'relocação de';
  if (d.includes('derivação'))                                                      return 'construção de';
  return 'execução de';
};

/* ── Formata km com 2 casas decimais (pt-BR) ── */
const fmtKm = (n) =>
  parseFloat(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── Formata quantidade numérica (pt-BR) ── */
const fmtNum = (n) =>
  n != null && n !== ''
    ? parseFloat(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : null;

const fmtQtd = (n) => {
  const v = parseFloat(n);
  return Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
};

/* ── Extrai a chave de busca da descrição do item ──
   Remove "(X unidade)" que o formato antigo do localStorage possa ter deixado.
   Ex: "RDP 150 (371 poste)" → "RDP 150"                                         */
const getChaveBusca = (item) =>
  (item.descricao || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

/* ── Monta o trecho de texto para um único item de obra ── */
const montarParteItem = (item) => {
  const chave = getChaveBusca(item);

  // Verbo: mapa de tipos da biblioteca, senão inferência por palavras-chave
  const verbo = VERBO_POR_TIPO[chave] || inferirVerboPorPalavras(chave);

  const qtd     = parseFloat(item.quantidade);
  const temQtd  = item.quantidade != null && item.quantidade !== '' && !isNaN(qtd);
  const unidade = (item.unidade || '').toLowerCase();

  /* A) Unidade km — quantidade direta */
  if (unidade === 'km') {
    const desc = DESCRICAO_SINGULAR[chave] || chave.toLowerCase();
    if (!temQtd) return `${verbo} ${desc}`;
    return `${verbo} ${fmtKm(qtd)} km de ${desc}`;
  }

  /* B) Unidade poste — converter para km */
  if (unidade === 'poste') {
    const desc = DESCRICAO_SINGULAR[chave] || chave.toLowerCase();
    if (!temQtd) return `${verbo} ${desc}`;
    const km = (qtd * 40) / 1000;
    return `${verbo} ${fmtKm(km)} km de ${desc}`;
  }

  /* C) Ponto, un, ou outro — quantidade numérica */
  const plural = temQtd && qtd > 1;
  const desc = plural
    ? (DESCRICAO_PLURAL[chave] || DESCRICAO_SINGULAR[chave] || chave.toLowerCase())
    : (DESCRICAO_SINGULAR[chave] || chave.toLowerCase());

  // Omite o número quando quantidade = 1
  if (!temQtd || qtd === 1) return `${verbo} ${desc}`;
  return `${verbo} ${fmtQtd(qtd)} ${desc}`;
};

/* ── Agrupa itens com mesmo verbo + descrição legível, somando quantidades ──
   Preserva a ordem do primeiro item de cada grupo na lista original.          */
const agruparItens = (itens) => {
  const grupos = new Map(); // chave → { qtdTotal, itemBase }

  itens.forEach(item => {
    const chave   = getChaveBusca(item);
    const verbo   = VERBO_POR_TIPO[chave] || inferirVerboPorPalavras(chave);
    const desc    = DESCRICAO_SINGULAR[chave] || chave.toLowerCase();
    const unidade = (item.unidade || '').toLowerCase();

    // Chave de agrupamento: verbo + descrição singular + unidade
    const textoBase = `${verbo}|${desc}|${unidade}`;
    const qtd = parseFloat(item.quantidade) || 0;

    if (grupos.has(textoBase)) {
      grupos.get(textoBase).qtdTotal += qtd;
    } else {
      grupos.set(textoBase, { qtdTotal: qtd, itemBase: item });
    }
  });

  // Devolve os itens agrupados com a quantidade somada
  return Array.from(grupos.values()).map(({ qtdTotal, itemBase }) => ({
    ...itemBase,
    quantidade: qtdTotal,
  }));
};

/* ────────────────────────────────────────────────────────────────────────────
   Função pública: gerarMemorialDescritivo
   ─────────────────────────────────────────────────────────────────────────── */
export const gerarMemorialDescritivo = (dados) => {
  const cliente    = dados.cliente      || '[cliente]';
  const tipo       = TIPO_ATENDIMENTO[dados.tipoAtendimento] || dados.tipoAtendimento || '[tipo de atendimento]';
  const demanda    = fmtNum(dados.demandaFutura) || '[demanda]';
  const cargaAtual = fmtNum(dados.cargaAtual) || '[carga atual]';
  const tensao     = dados.tensaoKv     || '[tensão]';
  const local      = dados.localUnidade || '[local]';
  const municipio  = dados.municipio    || '[município]';

  const demandaTexto = dados.tipoAtendimento === 'LN'
    ? `com demanda de ${demanda} kW`
    : `com demanda atual de ${cargaAtual} kW e demanda futura de ${demanda} kW`;

  let listaItens = '[inserir obras necessárias]';
  if (dados.itensObra && dados.itensObra.length > 0) {
    const agrupados = agruparItens(dados.itensObra);
    listaItens = agrupados.map(montarParteItem).join(', ');
  }

  let texto =
    `Para atendimento à solicitação de ${cliente}, de uma ${tipo}, ` +
    `${demandaTexto}, conectada em ${tensao} kV, ` +
    `na ${local}, no município de ${municipio}, ` +
    `será necessária a ${listaItens} e demais modificações necessárias na rede.`;

  if (dados.observacoes && dados.observacoes.trim()) {
    texto += '\n\n' + dados.observacoes.trim();
  }

  return texto;
};

/* ────────────────────────────────────────────────────────────────────────────
   Função pública: gerarTextoResumoFinanceiro
   ─────────────────────────────────────────────────────────────────────────── */
export const gerarTextoResumoFinanceiro = (dados) => {
  const fmt = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const fmtData = (d) =>
    new Intl.DateTimeFormat('pt-BR').format(new Date(d));

  return `RESUMO FINANCEIRO

Total da Obra: ${fmt(dados.totalObra)}
Material Requisitado (60%): ${fmt(dados.material)}
Serviços Contratados (40%): ${fmt(dados.servicos)}
${dados.administracao > 0 ? `Administração/MOP: ${fmt(dados.administracao)}` : ''}

VALOR TOTAL: ${fmt(dados.valorTotal)}

RATEIO TÉCNICO:
- Condição Técnica (CTC): ${fmt(dados.ctcTotal)}
- Proporcionalidade (PP): ${fmt(dados.ppTotal)}
- ERD: ${fmt(dados.erd || 0)}
- Parcela Demanda Regulada Técnica D: ${fmt(dados.parcelaD)}
- PFC do Cliente: ${fmt(dados.pfcCliente)}

Validade do Orçamento: ${fmtData(dados.dataValidade)}
Emissão: ${dados.municipio}, ${fmtData(dados.dataBase)}`.trim();
};
