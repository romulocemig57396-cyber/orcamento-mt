import * as XLSX from 'xlsx';

/* Monta um .xlsx em memória imitando os relatórios do PROORC: todas as células
   são texto, com números em formato brasileiro, e as colunas usadas mudam de
   linha para linha (os arquivos reais têm muitas células mescladas e colunas
   vazias). Use '' para deixar uma coluna vazia.                              */
export const planilhaFalsa = (linhas, nomeAba = 'relatorio') => {
  const wb = XLSX.utils.book_new();
  const aba = XLSX.utils.aoa_to_sheet(linhas.map(l => l.map(c => String(c))));
  XLSX.utils.book_append_sheet(wb, aba, nomeAba);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

const CAB_SINTETICO = ['DESCRIÇÃO', 'TOTAL OBRA\n(R$)', 'VIAB. CEMIG\n(R$)', 'NÃO VIAB. CEMIG \n(R$)', 'MEDIÇÃO\n(R$)'];

// Bloco de um projeto no sintético, com as colunas deslocadas como no arquivo real
const blocoSintetico = ({ chave, descricao, administracao = '0,00', maoObraPropria = '0,00', materiais, salvados = '0,00', servicos, total, naoViab = '0,00', medicao = '0,00' }) => [
  [`PS: ${chave}  ${descricao}`],
  CAB_SINTETICO,
  ['ADMINISTRAÇÃO', administracao, '0,00', '0,00', '0,00'],
  ['MÃO-DE-OBRA PRÓPRIA', maoObraPropria, '0,00', '0,00', '0,00'],
  [],
  ['MATERIAIS REQUISITADOS', materiais, materiais, '0,00', '0,00'],
  ['MATERIAIS SALVADOS', salvados, '0,00', '0,00', '0,00'],
  ['SERVIÇOS CONTRATADOS', servicos, servicos, '0,00', '0,00'],
  ['TOTAL', total, total, naoViab, medicao],
  [],
];

/* ── Relatório sintético ──────────────────────────────────────────────────── */
export const sinteticoFalso = ({ data = '07/10/2026', totalGeral = '4.100,50', projetos } = {}) =>
  planilhaFalsa([
    [''],
    ['07/10/2026'],
    [],
    ['PROORC – ORÇAMENTO SINTÉTICO CEMIG GLOBAL\n'],
    ['( Preço de Mercado )'],
    [],
    ['SOMATÓRIO DOS PROJETOS ', `DATA REF.: ${data}`],
    [],
    CAB_SINTETICO,
    ['ADMINISTRAÇÃO', '0,00', '0,00', '0,00', '0,00'],
    ['MATERIAIS REQUISITADOS', '0,00', '0,00', '0,00', '0,00'],
    ['SERVIÇOS CONTRATADOS', '0,00', '0,00', '0,00', '0,00'],
    ['TOTAL GERAL', totalGeral, '0,00', '0,00', '0,00'],
    [],
    ...projetos.flatMap(blocoSintetico),
  ], 'rptOrcamentoGeralSinteticoPorPr');

/* ── Relatório analítico ──────────────────────────────────────────────────── */
const linhaMaterial = (m) => ['', m.codigo, m.descricao, m.unidade, m.ucUar, m.quantidade, m.precoUnitario, m.total];

export const analiticoFalso = ({ data = '7/10/2026', projetos, resumo } = {}) =>
  planilhaFalsa([
    [],
    ['7/10/2026'],
    ['PROORC – MATERIAIS REQUISITADOS'],
    ['(Preço de Mercado)'],
    [`DATA REF.: ${data}`],
    [],
    ['CÓDIGO', 'DESCRIÇÃO', 'UNID.', 'UC/UAR', 'QUANT.', 'CUSTO UNITÁRIO (R$)', 'CUSTO TOTAL (R$)'],
    ['SOMATÓRIO DOS PROJETOS'],
    ...projetos.flatMap(p => [
      [`NS: ${p.chave}     ${p.descricao}`, p.totalMateriais],
      ...p.materiais.map(linhaMaterial),
      [],
    ]),
    ...(resumo ? [[`UC/UAR (R$): ${resumo.ucUar}`, `COM (R$) : ${resumo.com}`, `TOTAL (R$) : ${resumo.total}`]] : []),
  ], 'rptOrcamentoGeralAnalitico');

/* ── Relatório de serviços contratados ────────────────────────────────────── */
const linhaServico = (s) => [s.codigo, s.descricao, s.quantidadeServico, '1,0000', s.totalUS, s.precoUS, s.total];

export const servicosFalso = ({ data = '7/10/2026', projetos, totalGeral = '600,00' } = {}) =>
  planilhaFalsa([
    [],
    ['07/10/2026'],
    ['PROORC – SERVIÇOS CONTRATADOS '],
    ['(Preço de Mercado)'],
    // No arquivo real o rótulo e a data vêm em células separadas
    ['SOMATÓRIO DOS PROJETOS', 'DATA REF.:', data],
    [],
    ['CÓDIGO', 'DESCRIÇÃO', 'QUANT. SERV.', 'QUANT. US.', 'TOTAL US.', 'CUSTO UNITÁRIO(R$)', 'CUSTO TOTAL(R$)'],
    [],
    ...projetos.flatMap(p => [
      [`NS: ${p.chave}  ${p.descricao}`, p.total],
      ...p.servicos.flatMap(s => [
        linhaServico(s),
        // Subtotais que não devem ser somados de novo
        s.grupo === 'projeto'
          ? ['CUSTO DE PROJETO CONTRATADO – PRC', 'TOTAL', s.totalUS, s.total]
          : ['CUSTO DE MONTAGEM CONTRATADO – MOC', 'TOTAL', s.totalUS, s.total],
      ]),
      [],
    ]),
    [totalGeral],
  ], 'rptOrcamentoServicosContratados');

/* ── Conjunto coerente usado na maioria dos testes ────────────────────────────
   Projeto A: materiais 1.000,00 (cabo 600 + consumo 400)
              serviços 600,00 (0,25 US de construção a 2.000 + 2 US de projeto a 50)
   Projeto B: materiais 2.500,50 (patrimonial), sem serviços
   TOTAL GERAL: 4.100,50                                                      */
export const CONJUNTO = {
  sintetico: () => sinteticoFalso({
    projetos: [
      { chave: '1111111111', descricao: 'Extensão de 01 km de teste', materiais: '1.000,00', servicos: '600,00', total: '1.600,00' },
      { chave: '1111111111-APP 2', descricao: 'Equipamento de teste', materiais: '2.500,50', servicos: '0,00', total: '2.500,50' },
    ],
  }),
  analitico: () => analiticoFalso({
    projetos: [
      {
        chave: '1111111111', descricao: 'Extensão de 01 km de teste', totalMateriais: '1.000,00',
        materiais: [
          { codigo: '00380856', descricao: 'CABO AL 1X150MM² PROTEGIDO', unidade: 'M', ucUar: 'MUT', quantidade: '3.150,00', precoUnitario: '0,19', total: '600,00' },
          { codigo: '00066886', descricao: 'PARAFUSO CABEÇA ABAULADA M16X70MM', unidade: 'PC', ucUar: ' -', quantidade: '100,00', precoUnitario: '4,00', total: '400,00' },
        ],
      },
      {
        chave: '1111111111-APP 2', descricao: 'Equipamento de teste', totalMateriais: '2.500,50',
        materiais: [
          { codigo: '00380857', descricao: 'RELIGADOR TRIFÁSICO', unidade: 'PC', ucUar: 'SIM', quantidade: '1,00', precoUnitario: '2.500,50', total: '2.500,50' },
        ],
      },
    ],
    resumo: { ucUar: '3.100,50', com: '400,00', total: '3.500,50' },
  }),
  servicos: () => servicosFalso({
    projetos: [
      {
        chave: '1111111111', descricao: 'Extensão de 01 km de teste', total: '600,00',
        servicos: [
          { codigo: 'USRDA', descricao: 'MÃO-DE-OBRA BÁSICO CONSTRUÇÃO RDA', quantidadeServico: '0,2500', totalUS: '0,2500', precoUS: '2.000,00', total: '500,00', grupo: 'construcao' },
          { codigo: 'USPROJ', descricao: 'MÃO-DE-OBRA BÁSICO PROJETO RDA', quantidadeServico: '2,0000', totalUS: '2,0000', precoUS: '50,00', total: '100,00', grupo: 'projeto' },
        ],
      },
    ],
  }),
};
