import { describe, test, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import arquivoTod from '../data/catalogoTod.json';
import { MATERIAIS_TOD, MATERIAIS_TOD_POR_CODIGO, TOD, ITENS_TOD } from '../data/catalogoTod';
import {
  montarCatalogoCombinado, buscarMateriais, normalizarBusca, rotuloFonte, linhaDaComposicao,
  dataDaReferenciaProorc, fonteDoMaterial, unidadesDoCatalogo, LIMITE_RESULTADOS,
} from '../utils/catalogoMateriais';
import { montarProposta } from '../utils/propostas';
import { recalcularPropostaNaReferencia, aprovarProposta } from '../proorc/propostasAdmin';
import { lerSintetico } from '../proorc/lerSintetico';
import { lerAnalitico } from '../proorc/lerAnalitico';
import { lerServicos } from '../proorc/lerServicos';
import { consolidarProorc } from '../proorc/consolidar';

/* O arquivo da TOD é fixo (conferido pelo responsável), então estes testes
   podem conferir as contagens dele. Nada aqui depende da biblioteca instalada. */

// Catálogo do PROORC montado no teste, com os casos dos relatórios de 07/10/2026
const PROORC = {
  '00375259': { codigo: '00375259', descricao: 'RELIGADOR TRIFÁSICO 36,2KV 560A 12KA P/AUTOMAÇÃO', unidade: 'PC', classe: 'patrimonial', ucUar: '320', precoUnitario: 55480.53 },
  '00386692': { codigo: '00386692', descricao: 'RELIGADOR 3F 27KV 800A', unidade: 'PC', classe: 'patrimonial', ucUar: '320', precoUnitario: 70000 },
  '00002931': { codigo: '00002931', descricao: "CABO AÇO SM 1/4'' (6,4MM) 7 FIOS", unidade: 'KG', classe: 'consumo', ucUar: '-', precoUnitario: 14.24 },
};
const DATA_PROORC = '2026-10-07';
const combinado = () => montarCatalogoCombinado({
  catalogoProorc: PROORC, dataProorc: DATA_PROORC, materiaisTod: MATERIAIS_TOD, dataTod: TOD.dataBase,
});
const linha = (cat, codigo) => cat.find(m => m.codigo === codigo);

describe('TOD — o arquivo', () => {
  test('2.089 itens, seq de 1 a 2.089, códigos únicos de 8 dígitos', () => {
    const itens = arquivoTod.itens;
    expect(itens).toHaveLength(2089);
    expect(itens.map(i => i.seq)).toEqual(Array.from({ length: 2089 }, (_, i) => i + 1));
    const codigos = itens.map(i => i.codigo);
    expect(new Set(codigos).size).toBe(2089);
    codigos.forEach(c => expect(c).toMatch(/^\d{8}$/));
  });

  test('2.023 materiais, 37 sucatas e 29 serviços, como nos totais do arquivo', () => {
    const conta = (tipo) => arquivoTod.itens.filter(i => i.tipo === tipo).length;
    expect(conta('material')).toBe(2023);
    expect(conta('sucata')).toBe(37);
    expect(conta('servico')).toBe(29);
    expect(arquivoTod.totais).toEqual({ itens: 2089, material: 2023, sucata: 37, servico: 29 });
  });

  test('preço positivo e descrição e unidade preenchidas', () => {
    arquivoTod.itens.forEach(i => {
      expect(i.preco, i.codigo).toBeGreaterThan(0);
      expect(i.descricao.trim(), i.codigo).not.toBe('');
      expect(i.unidade.trim(), i.codigo).not.toBe('');
    });
  });

  test('o módulo expõe só os materiais, sem alterar os dados', () => {
    expect(ITENS_TOD).toBe(arquivoTod.itens);
    expect(MATERIAIS_TOD).toHaveLength(2023);
    expect(MATERIAIS_TOD.every(i => i.tipo === 'material')).toBe(true);
    expect(MATERIAIS_TOD_POR_CODIGO['00207415']).toMatchObject({
      descricao: 'POSTE CONCRETO CIRCULAR 11M 300DAN', unidade: 'PC', preco: 1563.16,
    });
    expect(TOD.dataBase).toBe('2024-12-06');
  });
});

describe('Catálogo combinado PROORC + TOD', () => {
  test('não inclui sucatas nem serviços da TOD', () => {
    const cat = montarCatalogoCombinado({ materiaisTod: ITENS_TOD, dataTod: TOD.dataBase });
    expect(cat).toHaveLength(2023);
    const foraDoCatalogo = ITENS_TOD.filter(i => i.tipo !== 'material').map(i => i.codigo);
    expect(foraDoCatalogo).toHaveLength(66);
    const codigos = new Set(cat.map(m => m.codigo));
    foraDoCatalogo.forEach(c => expect(codigos.has(c), c).toBe(false));
  });

  test('um código nas duas fontes vira uma linha, com preço padrão do PROORC', () => {
    const cat = combinado();
    expect(cat.filter(m => m.codigo === '00375259')).toHaveLength(1);
    expect(linha(cat, '00375259')).toMatchObject({
      fontePadrao: 'proorc',
      precoUnitario: 55480.53,
      diverge: true,
      classe: 'patrimonial',
      fontes: { proorc: { precoUnitario: 55480.53, data: DATA_PROORC }, tod: { precoUnitario: 88142.96, data: '2024-12-06' } },
    });
  });

  test('preço igual nas duas fontes não é divergência', () => {
    const m = linha(combinado(), '00002931');
    expect(m.fontes.proorc && m.fontes.tod).toBeTruthy();
    expect(m.diverge).toBe(false);
  });

  test('código só no PROORC e código só na TOD', () => {
    const cat = combinado();
    expect(linha(cat, '00386692')).toMatchObject({ fontePadrao: 'proorc', diverge: false });
    expect(linha(cat, '00386692').fontes.tod).toBeUndefined();
    expect(linha(cat, '00207415')).toMatchObject({ fontePadrao: 'tod', precoUnitario: 1563.16, classe: 'naoInformada', diverge: false });
    expect(linha(cat, '00207415').fontes.proorc).toBeUndefined();
  });

  test('selos: "PROORC dd/mm/aaaa" e "TOD dez/2024"', () => {
    expect(rotuloFonte('proorc', '2026-10-07')).toBe('PROORC 07/10/2026');
    expect(rotuloFonte('tod', TOD.dataBase)).toBe('TOD dez/2024');
    expect(rotuloFonte('proorc', null)).toBe('PROORC');
    expect(dataDaReferenciaProorc({ rotulo: '2026 — PROORC 08/10/2026', fonte: 'PROORC, relatórios de 08/10/2026' })).toBe('2026-10-08');
    expect(dataDaReferenciaProorc({ rotulo: '2024', fonte: 'Planilha de custos' })).toBeNull();
  });

  test('a linha da composição guarda o preço usado, a fonte e a data', () => {
    const m = linha(combinado(), '00375259');
    expect(linhaDaComposicao(m)).toMatchObject({ codigo: '00375259', quantidade: 1, precoUnitario: 55480.53, fonte: 'proorc', dataFonte: DATA_PROORC });
    expect(linhaDaComposicao(m, 'tod', 2)).toMatchObject({ quantidade: 2, precoUnitario: 88142.96, fonte: 'tod', dataFonte: '2024-12-06' });
    // fonte que a linha não tem cai na padrão
    expect(linhaDaComposicao(linha(combinado(), '00207415'), 'proorc')).toMatchObject({ fonte: 'tod', precoUnitario: 1563.16 });
  });
});

describe('Busca no catálogo', () => {
  test('"religador 36" e "375259" encontram o item das duas fontes, com divergência', () => {
    const cat = combinado();
    ['religador 36', '375259', '00375259'].forEach(texto => {
      const { resultados } = buscarMateriais(cat, { texto });
      const m = resultados.find(r => r.codigo === '00375259');
      expect(m, texto).toBeDefined();
      expect(m.fontes.proorc && m.fontes.tod, texto).toBeTruthy();
      expect(m.diverge, texto).toBe(true);
    });
    expect(buscarMateriais(cat, { texto: '375259' }).resultados[0].codigo).toBe('00375259');
  });

  test('sem diferenciar maiúsculas e acentos', () => {
    expect(normalizarBusca('  Religador  TRIFÁSICO ')).toBe('religador trifasico');
    const cat = combinado();
    const a = buscarMateriais(cat, { texto: 'religador trifasico' }).resultados.map(m => m.codigo);
    const b = buscarMateriais(cat, { texto: 'RELIGADOR TRIFÁSICO' }).resultados.map(m => m.codigo);
    expect(a).toContain('00375259');
    expect(a).toEqual(b);
  });

  test('código com ou sem zeros à esquerda', () => {
    const cat = combinado();
    expect(buscarMateriais(cat, { texto: '207415' }).resultados.map(m => m.codigo)).toContain('00207415');
    expect(buscarMateriais(cat, { texto: '00207415' }).resultados[0].codigo).toBe('00207415');
  });

  test('filtros por unidade e por fonte', () => {
    const cat = combinado();
    const porUnidade = buscarMateriais(cat, { texto: 'cabo', unidade: 'M' }).resultados;
    expect(porUnidade.length).toBeGreaterThan(0);
    expect(porUnidade.every(m => m.unidade === 'M')).toBe(true);

    const soProorc = buscarMateriais(cat, { texto: 'religador', fonte: 'proorc' }).resultados.map(m => m.codigo);
    expect(soProorc.sort()).toEqual(['00375259', '00386692']);
    const soTod = buscarMateriais(cat, { texto: 'religador', fonte: 'tod' }).resultados;
    expect(soTod.every(m => m.fontes.tod)).toBe(true);
    expect(soTod.map(m => m.codigo)).not.toContain('00386692');

    expect(unidadesDoCatalogo(cat)).toEqual(expect.arrayContaining(['PC', 'M', 'KG']));
  });

  test(`no máximo ${LIMITE_RESULTADOS} resultados, avisando que há mais`, () => {
    const r = buscarMateriais(combinado(), { texto: 'cabo' });
    expect(r.total).toBeGreaterThan(LIMITE_RESULTADOS);
    expect(r.resultados).toHaveLength(LIMITE_RESULTADOS);
    expect(r.truncado).toBe(true);
    expect(buscarMateriais(combinado(), { texto: '00207415' }).truncado).toBe(false);
  });

  test('busca vazia não lista nada', () => {
    expect(buscarMateriais(combinado(), { texto: '   ' })).toEqual({ resultados: [], total: 0, truncado: false });
  });
});

describe('Fonte na proposta e na aprovação', () => {
  const PRECOS = { construcao: 2823.98, projeto: 82.73 };
  const poste = () => linhaDaComposicao(linha(combinado(), '00207415'), 'tod', 2);
  const proposta = (materiais) => montarProposta({
    tipo: 'Poste de teste', categoria: 'Equipamentos', unidade: 'ponto', unidadesPorProjeto: 1,
    materiais, precosUS: PRECOS, referencia: '2026-10', autor: 'Rômulo', criadoEm: '2026-10-09',
  });

  test('material só da TOD: composição com fonte "tod" e custo pelo preço da TOD', () => {
    const p = proposta([poste()]);
    const m = p.composicoes['2026-10'].materiais[0];
    expect(m).toMatchObject({ codigo: '00207415', fonte: 'tod', dataFonte: '2024-12-06', precoUnitario: 1563.16, quantidade: 2, classe: 'naoInformada' });
    expect(m.total).toBeCloseTo(3126.32, 2);
    expect(p.custos['2026-10'].material).toBeCloseTo(3.12632, 8);
    expect(p.entrada.materiais[0].fonte).toBe('tod');
  });

  test('linha antiga, sem fonte, é gravada como PROORC', () => {
    const p = proposta([{ codigo: '00002931', descricao: 'CABO', unidade: 'KG', quantidade: 1, precoUnitario: 14.24 }]);
    expect(p.composicoes['2026-10'].materiais[0]).toMatchObject({ fonte: 'proorc', dataFonte: null, classe: 'consumo' });
    expect(fonteDoMaterial({})).toBe('proorc');
  });

  test('o recálculo confere o material da TOD na TOD, não no catálogo da referência', () => {
    const r = recalcularPropostaNaReferencia(proposta([poste()]), {
      catalogoMateriais: PROORC, precosUS: PRECOS, referencia: '2026-10',
      catalogoTod: MATERIAIS_TOD_POR_CODIGO, dataTod: TOD.dataBase,
    });
    expect(r.materiais[0]).toMatchObject({ fonte: 'tod', ausenteNoCatalogo: false, mudou: false, precoUnitario: 1563.16 });
    expect(r.mudancas).toEqual([]);
    expect(r.mudouUnitario).toBe(false);
  });

  test('referência sem catálogo nem preço da US: a proposta com material da TOD ainda é recalculada', () => {
    const r = recalcularPropostaNaReferencia(proposta([poste()]), {
      catalogoMateriais: {}, precosUS: {}, referencia: '2024',
      catalogoTod: MATERIAIS_TOD_POR_CODIGO, dataTod: TOD.dataBase,
    });
    expect(r.possivel).toBe(true);
  });

  test('proposta antiga, sem fonte, continua conferida no catálogo do PROORC', () => {
    const antiga = proposta([{ codigo: '00375259', descricao: 'RELIGADOR', unidade: 'PC', classe: 'patrimonial', quantidade: 1, precoUnitario: 50000 }]);
    delete antiga.entrada.materiais[0].fonte;
    delete antiga.composicoes['2026-10'].materiais[0].fonte;
    const r = recalcularPropostaNaReferencia(antiga, {
      catalogoMateriais: PROORC, precosUS: PRECOS, referencia: '2026-10', dataProorc: DATA_PROORC,
      catalogoTod: MATERIAIS_TOD_POR_CODIGO, dataTod: TOD.dataBase,
    });
    expect(r.materiais[0]).toMatchObject({ fonte: 'proorc', precoUnitario: 55480.53, mudou: true, dataFonte: DATA_PROORC });
  });

  test('a aprovação leva a fonte para a composição do item', () => {
    const p = proposta([poste()]);
    const recalculo = recalcularPropostaNaReferencia(p, {
      catalogoMateriais: PROORC, precosUS: PRECOS, referencia: '2026-10',
      catalogoTod: MATERIAIS_TOD_POR_CODIGO, dataTod: TOD.dataBase,
    });
    const nova = aprovarProposta({ biblioteca: { itens: [] }, proposta: p, referencia: '2026-10', recalculo, aprovadoEm: '2026-10-09' });
    expect(nova.itens[0].composicoes['2026-10'].materiais[0]).toMatchObject({ fonte: 'tod', dataFonte: '2024-12-06', precoUnitario: 1563.16 });
  });
});

/* ── Relatórios reais do PROORC de 07/10/2026 (ignorado sem docs/proorc/) ──── */
const PASTA = resolve(__dirname, '../../docs/proorc');
const ARQUIVOS = {
  sintetico: 'rptOrcamentoGeralSinteticoPorProjetoCemig.xlsx',
  analitico: 'rptOrcamentoGeralAnalitico.xlsx',
  servicos: 'rptOrcamentoServicosContratados.xlsx',
};
const caminho = (nome) => resolve(PASTA, nome);
const temTodos = Object.values(ARQUIVOS).every(nome => existsSync(caminho(nome)));

describe.skipIf(!temTodos)('PROORC de 07/10/2026 × TOD', () => {
  let catalogoProorc;
  let cat;

  beforeAll(() => {
    const c = consolidarProorc({
      sintetico: lerSintetico(readFileSync(caminho(ARQUIVOS.sintetico))),
      analitico: lerAnalitico(readFileSync(caminho(ARQUIVOS.analitico))),
      servicos: lerServicos(readFileSync(caminho(ARQUIVOS.servicos))),
    });
    catalogoProorc = c.catalogoMateriais;
    cat = montarCatalogoCombinado({ catalogoProorc, dataProorc: '2026-10-07', materiaisTod: MATERIAIS_TOD, dataTod: TOD.dataBase });
  });

  test('168 dos 169 materiais do PROORC estão na TOD; 00386692 (RELIGADOR 3F 27KV 800A) só no PROORC', () => {
    const codigos = Object.keys(catalogoProorc);
    expect(codigos).toHaveLength(169);
    const soProorc = codigos.filter(c => !MATERIAIS_TOD_POR_CODIGO[c]);
    expect(soProorc).toEqual(['00386692']);
    expect(catalogoProorc['00386692'].descricao).toMatch(/RELIGADOR 3F 27KV 800A/);
  });

  test('entre os que estão nas duas fontes, o único preço diferente é o do 00375259', () => {
    const divergentes = cat.filter(m => m.diverge).map(m => m.codigo);
    expect(divergentes).toEqual(['00375259']);
    expect(linha(cat, '00375259').fontes).toMatchObject({
      proorc: { precoUnitario: 55480.53 }, tod: { precoUnitario: 88142.96 },
    });
    Object.keys(catalogoProorc).filter(c => MATERIAIS_TOD_POR_CODIGO[c] && c !== '00375259').forEach(c => {
      expect(catalogoProorc[c].precoUnitario, c).toBeCloseTo(MATERIAIS_TOD_POR_CODIGO[c].preco, 2);
    });
  });
});
