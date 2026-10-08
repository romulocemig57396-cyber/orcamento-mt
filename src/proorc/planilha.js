/* ─────────────────────────────────────────────────────────────────────────────
   planilha.js — base da leitura dos relatórios do PROORC

   Particularidades dos arquivos exportados pelo PROORC:
   - todas as células são texto, inclusive os números, em formato brasileiro;
   - há muitas células mescladas e colunas vazias que mudam de relatório para
     relatório, então nada aqui depende de posição fixa de coluna: cada linha é
     lida como a lista dos seus valores não vazios;
   - o cabeçalho de projeto vem como "NS: 1000456789-APP 3   Extensão ..." no
     analítico e no de serviços, e "PS: ..." no sintético;
   - a data de referência aparece como "DATA REF.: 07/10/2026", às vezes
     partida em duas células e com o dia sem o zero à esquerda.
   ───────────────────────────────────────────────────────────────────────────── */

import * as XLSX from 'xlsx';

// Primeira aba do arquivo → lista de linhas, cada uma com seus valores não vazios
export const lerLinhas = (buffer) => {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const aba = wb.Sheets[wb.SheetNames[0]];
  if (!aba) return [];
  return XLSX.utils.sheet_to_json(aba, { header: 1, raw: false, defval: '' })
    .map(linha => linha.map(c => String(c).trim()).filter(c => c !== ''));
};

const CABECALHO_PROJETO = /^(?:NS|PS)\s*:\s*(\d{6,})(?:\s*-\s*APP\s*(\d+))?\s*(.*)$/i;

/* "NS: 1000456789-APP 3      Extensão de 01 km ..." →
   { chave: '1000456789-APP 3', descricao: 'Extensão de 01 km ...' }
   A chave normaliza o sufixo APP e a descrição colapsa espaços repetidos.    */
export const lerCabecalhoProjeto = (valor) => {
  const m = String(valor ?? '').match(CABECALHO_PROJETO);
  if (!m) return null;
  return {
    chave: m[2] ? `${m[1]}-APP ${m[2]}` : m[1],
    descricao: (m[3] || '').replace(/\s+/g, ' ').trim(),
  };
};

// Linha que abre o bloco "SOMATÓRIO DOS PROJETOS", que não é um projeto
export const ehSomatorio = (valor) => /^SOMAT[ÓO]RIO\s+DOS\s+PROJETOS/i.test(String(valor ?? '').trim());

const DATA_REF = /DATA\s*REF\.?\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i;
const pad = (n) => String(n).padStart(2, '0');

// Procura "DATA REF.: ..." juntando os valores de cada linha, porque o rótulo e
// a data podem estar em células diferentes. Devolve sempre DD/MM/AAAA.
export const lerDataReferencia = (linhas) => {
  for (const linha of linhas) {
    const m = linha.join(' ').match(DATA_REF);
    if (m) return `${pad(m[1])}/${pad(m[2])}/${m[3]}`;
  }
  return null;
};
