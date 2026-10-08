import { describe, test, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lerSintetico } from '../proorc/lerSintetico';
import { lerAnalitico } from '../proorc/lerAnalitico';
import { lerServicos } from '../proorc/lerServicos';
import { consolidarProorc } from '../proorc/consolidar';
import { calcularNovaReferencia } from '../proorc/calcularReferencia';
import { aplicarNovaReferencia, serializarBiblioteca } from '../proorc/gerarBibliotecaJson';
import { calcularEdicao, ITENS_EDITAVEIS } from '../proorc/editarReferencia';
import { explicarFormacao } from '../proorc/explicarFormacao';
import {
  sugerirItemNovo, gerarIdItem, validarItemNovo, criarItemNovo, ligacaoDoItemNovo, projetoSemServicos,
} from '../proorc/itensNovos';
import { BIBLIOTECA, disponivelNaReferencia, ehPendente } from '../data/biblioteca';
import { CONJUNTO } from './fixtures/planilhaFalsa';

const copia = (x) => JSON.parse(JSON.stringify(x));
const ORIGINAL = copia(BIBLIOTECA);

/* Fluxo da tela, em funções: desliga (opcional) o projeto, cria o item novo,
   liga o projeto a ele, calcula a referência e grava o arquivo.            */
const fluxo = (consolidado, definicao, { desligar = false } = {}) => {
  const projeto = consolidado.projetos.find(p => p.chave === definicao.projeto);
  const mapeamento = { ...BIBLIOTECA.mapeamentoProorc };
  if (desligar) delete mapeamento[definicao.projeto];
  const item = criarItemNovo(definicao, { biblioteca: BIBLIOTECA, itensNovos: [] });
  mapeamento[definicao.projeto] = ligacaoDoItemNovo(item, projeto);
  const resultado = calcularNovaReferencia({
    biblioteca: BIBLIOTECA, consolidado, chaveAnterior: '2024', mapeamento, itensNovos: [item],
  });
  const nova = aplicarNovaReferencia({
    biblioteca: BIBLIOTECA, resultado, chave: '2026-10', rotulo: '2026 — PROORC', fonte: 'PROORC', atual: true, itensNovos: [item],
  });
  return { projeto, item, resultado, nova, novoNaBiblioteca: nova.itens.find(i => i.id === item.id) };
};

/* ── Com os relatórios de teste (rodam sempre) ─────────────────────────────── */
const consolidadoFalso = () => consolidarProorc({
  sintetico: lerSintetico(CONJUNTO.sintetico()),
  analitico: lerAnalitico(CONJUNTO.analitico()),
  servicos: lerServicos(CONJUNTO.servicos()),
});

describe('R9 — sugestão, id e validação', () => {
  test('sugere nome, categoria e unidade a partir da descrição do projeto', () => {
    expect(sugerirItemNovo({ chave: 'X', descricao: 'BRT rural (3 reguladores de 76,2 kVA)' })).toMatchObject({
      tipo: 'BRT rural (3 reguladores de 76,2 kVA)', categoria: 'Equipamentos', subcategoria: 'Instalação',
      unidade: 'ponto', unidadesPorProjeto: 1, projeto: 'X',
    });
    expect(sugerirItemNovo({ chave: 'Y', descricao: 'Extensão de 01 km de RDP 70mm²' })).toMatchObject({
      categoria: 'Extensão', unidade: 'km',
    });
  });

  test('id no padrão da biblioteca, sem colidir', () => {
    expect(gerarIdItem('BRT teste 76 kVA', 'Equipamentos', [])).toBe('equip_brt_teste_76_kva');
    expect(gerarIdItem('RDP 70 Dupla', 'Extensão', [])).toBe('ext_rdp_70_dupla');
    expect(gerarIdItem('BRT trif 76,2 kVA', 'Equipamentos', BIBLIOTECA.itens.map(i => i.id))).toBe('equip_brt_trif_76_2_kva');
    expect(gerarIdItem('X', 'Equipamentos', ['equip_x', 'equip_x_2'])).toBe('equip_x_3');
    expect(gerarIdItem('Coisa', 'Categoria Nova', [])).toBe('categoria_nova_coisa');
  });

  test('validação', () => {
    const base = { projeto: 'P', tipo: 'Item', categoria: 'Equipamentos', subcategoria: 'Instalação', unidade: 'ponto', unidadesPorProjeto: 1 };
    const ctx = { biblioteca: BIBLIOTECA, itensNovos: [], projeto: { servicos: 100 } };
    expect(validarItemNovo(base, ctx)).toEqual([]);
    expect(validarItemNovo({ ...base, tipo: '' }, ctx)).toHaveLength(1);
    expect(validarItemNovo({ ...base, unidade: 'litro' }, ctx)).toHaveLength(1);
    expect(validarItemNovo({ ...base, unidadesPorProjeto: 0 }, ctx)).toHaveLength(1);
    expect(validarItemNovo({ ...base, tipo: 'BRT trif 76,2 kVA' }, ctx)[0]).toMatch(/já existe/i);
    // projeto sem serviços exige a escolha da mão de obra
    const semServ = { ...ctx, projeto: { servicos: 0 } };
    expect(validarItemNovo(base, semServ)[0]).toMatch(/mão de obra/);
    expect(validarItemNovo({ ...base, maoObra: { modo: 'percentual', percentual: 20 } }, semServ)).toEqual([]);
    expect(validarItemNovo({ ...base, maoObra: { modo: 'us', usConstrucao: 0 } }, semServ)).toHaveLength(1);
  });
});

describe('R9 — item novo com os relatórios de teste', () => {
  let consolidado;
  beforeAll(() => { consolidado = consolidadoFalso(); });

  test('projeto com serviços: materiais ÷ unidades e serviços ÷ unidades', () => {
    const { item, resultado, novoNaBiblioteca, nova } = fluxo(consolidado, {
      projeto: '1111111111', tipo: 'Extensão de teste', categoria: 'Extensão', subcategoria: 'Urbano', unidade: 'poste', unidadesPorProjeto: 25,
    });
    expect(item.formacao).toEqual({ origem: 'proorc', projeto: '1111111111', unidadesPorProjeto: 25 });
    expect(resultado.custos[item.id].unitario).toBeCloseTo(1600 / 25 / 1000, 10);
    expect(resultado.previaNovos).toHaveLength(1);
    expect(resultado.previa).toHaveLength(70); // a tabela principal não muda
    expect(resultado.resumo.itensNovos).toBe(1);
    expect(novoNaBiblioteca.status).toBe('oficial');
    expect(Object.keys(novoNaBiblioteca.custos)).toEqual(['2026-10']);
    expect(novoNaBiblioteca.composicoes['2026-10'].materiais).toHaveLength(2);
    expect(nova.mapeamentoProorc['1111111111']).toMatchObject({ item: item.id, unidadesPorProjeto: 25 });
  });

  test('projeto sem serviços: percentual sobre o material', () => {
    const consolidadoP = consolidado;
    expect(projetoSemServicos(consolidadoP.projetos.find(p => p.chave === '1111111111-APP 2'))).toBe(true);
    const { item, resultado } = fluxo(consolidadoP, {
      projeto: '1111111111-APP 2', tipo: 'Equipamento de teste', categoria: 'Equipamentos', subcategoria: 'Instalação',
      unidade: 'ponto', unidadesPorProjeto: 1, maoObra: { modo: 'percentual', percentual: 20 },
    });
    expect(item.formacao).toMatchObject({ regra: 'maoObraPercentual', percentualMaoObra: 0.2 });
    expect(resultado.custos[item.id]).toMatchObject({ material: 2.5005, usConstr: 0 });
    expect(resultado.custos[item.id].maoObra).toBeCloseTo(0.5001, 10);
    expect(resultado.custos[item.id].unitario).toBeCloseTo(3.0006, 10);
  });

  test('projeto sem serviços: US informadas × preço da US do relatório', () => {
    const { item, resultado } = fluxo(consolidado, {
      projeto: '1111111111-APP 2', tipo: 'Equipamento de teste', categoria: 'Equipamentos', subcategoria: 'Instalação',
      unidade: 'ponto', unidadesPorProjeto: 1, maoObra: { modo: 'us', usConstrucao: 3 },
    });
    expect(item.formacao).toMatchObject({ regra: 'maoObraPorUS', usConstrucao: 3 });
    const preco = consolidado.precosUS.construcao;
    expect(resultado.custos[item.id].maoObra).toBeCloseTo(3 * preco / 1000, 10);
    expect(resultado.custos[item.id].usConstr).toBe(3);
  });

  test('a composição explica a mão de obra pelo percentual e pelas US', () => {
    const pct = fluxo(consolidado, {
      projeto: '1111111111-APP 2', tipo: 'Equipamento de teste', categoria: 'Equipamentos', subcategoria: 'Instalação',
      unidade: 'ponto', unidadesPorProjeto: 1, maoObra: { modo: 'percentual', percentual: 20 },
    });
    const d = explicarFormacao(pct.novoNaBiblioteca, '2026-10');
    expect(d.disponivel).toBe(true);
    expect(d.passos.map(p => p.rotulo)).toContain('Mão de obra (20% do material)');
    expect(d.passos.find(p => p.rotulo.startsWith('Mão de obra')).valor).toBe('R$ 500,10');

    const us = fluxo(consolidado, {
      projeto: '1111111111-APP 2', tipo: 'Equipamento de teste', categoria: 'Equipamentos', subcategoria: 'Instalação',
      unidade: 'ponto', unidadesPorProjeto: 1, maoObra: { modo: 'us', usConstrucao: 3 },
    });
    const du = explicarFormacao(us.novoNaBiblioteca, '2026-10');
    expect(du.passos.find(p => p.rotulo.startsWith('Mão de obra')).rotulo).toBe('Mão de obra (3 US × R$ 2.000,00)');
    expect(du.passos.find(p => p.rotulo.startsWith('Mão de obra')).valor).toBe('R$ 6.000,00');
  });

  test('a biblioteca instalada não muda', () => {
    expect(BIBLIOTECA).toEqual(ORIGINAL);
  });
});

describe('R9 — disponível × pendente', () => {
  const item = { id: 'equip_novo', custos: { '2026-10': { unitario: 10 } } };
  test('sem bloco de custos na referência → não disponível (e não é pendente)', () => {
    expect(disponivelNaReferencia(item, '2024')).toBe(false);
    expect(ehPendente(item, '2024')).toBe(false);
    expect(disponivelNaReferencia(item, '2026-10')).toBe(true);
  });
  test('itens da biblioteca instalada estão disponíveis nas 3 referências', () => {
    BIBLIOTECA.itens.forEach(i => ['2024', '2022', '2021'].forEach(r => expect(disponivelNaReferencia(i, r), `${i.id} ${r}`).toBe(true)));
  });
  test('pendente continua sendo custo 0 numa referência em que o item existe', () => {
    expect(ehPendente({ custos: { 2024: { unitario: 0 } } }, '2024')).toBe(true);
  });
});

/* ── Com os relatórios reais (docs/proorc/) ────────────────────────────────── */
const PASTA = resolve(__dirname, '../../docs/proorc');
const ARQUIVOS = {
  sintetico: 'rptOrcamentoGeralSinteticoPorProjetoCemig.xlsx',
  analitico: 'rptOrcamentoGeralAnalitico.xlsx',
  servicos: 'rptOrcamentoServicosContratados.xlsx',
};
const temTodos = Object.values(ARQUIVOS).every(nome => existsSync(resolve(PASTA, nome)));

describe.skipIf(!temTodos)('R9 — aceite com os relatórios de 07/10/2026', () => {
  let consolidado;
  beforeAll(() => {
    consolidado = consolidarProorc({
      sintetico: lerSintetico(readFileSync(resolve(PASTA, ARQUIVOS.sintetico))),
      analitico: lerAnalitico(readFileSync(resolve(PASTA, ARQUIVOS.analitico))),
      servicos: lerServicos(readFileSync(resolve(PASTA, ARQUIVOS.servicos))),
    });
  });

  test('BRT teste 76 kVA a partir do projeto 2003202424-APP 21', () => {
    const { item, resultado, nova, novoNaBiblioteca } = fluxo(consolidado, {
      projeto: '2003202424-APP 21', tipo: 'BRT teste 76 kVA', categoria: 'Equipamentos', subcategoria: 'Instalação',
      unidade: 'ponto', unidadesPorProjeto: 1,
    }, { desligar: true });

    expect(item.id).toBe('equip_brt_teste_76_kva');
    const c = resultado.custos[item.id];
    expect(c.unitario).toBeCloseTo(186.97615, 5);
    expect(c.maoObra).toBeCloseTo(44.66828, 5);
    expect(resultado.composicoes[item.id].materiais).toHaveLength(37);
    expect(resultado.previaNovos[0]).toMatchObject({ id: item.id, tipo: 'BRT teste 76 kVA', unidade: 'ponto' });

    // na nova referência e no mapeamento
    expect(novoNaBiblioteca.custos['2026-10'].unitario).toBeCloseTo(186.97615, 5);
    expect(novoNaBiblioteca.composicoes['2026-10'].materiais).toHaveLength(37);
    expect(nova.mapeamentoProorc['2003202424-APP 21']).toMatchObject({ item: item.id, unidadesPorProjeto: 1 });
    expect(JSON.parse(serializarBiblioteca(nova)).itens.some(i => i.id === item.id)).toBe(true);

    // nas referências antigas, não disponível
    ['2024', '2022', '2021'].forEach(r => expect(disponivelNaReferencia(novoNaBiblioteca, r), r).toBe(false));
    expect(disponivelNaReferencia(novoNaBiblioteca, '2026-10')).toBe(true);

    // a composição explica o item como os demais do PROORC
    const d = explicarFormacao(novoNaBiblioteca, '2026-10');
    expect(d.disponivel).toBe(true);
    expect(d.projeto).toBe('2003202424-APP 21');

    // o item antigo, desligado, fica copiado; os valores existentes não mudam
    expect(resultado.custos.equip_brt_76).toEqual(BIBLIOTECA.itens.find(i => i.id === 'equip_brt_76').custos['2024']);
    expect(BIBLIOTECA).toEqual(ORIGINAL);
  });

  test('projeto sem serviços (9988776654): aviso e mão de obra pelo percentual', () => {
    const projeto = consolidado.projetos.find(p => p.chave === '9988776654');
    expect(projetoSemServicos(projeto)).toBe(true);
    const sem = { projeto: '9988776654', tipo: 'PT teste', categoria: 'Equipamentos', subcategoria: 'Instalação', unidade: 'ponto', unidadesPorProjeto: 1 };
    expect(validarItemNovo(sem, { biblioteca: BIBLIOTECA, itensNovos: [], projeto })[0]).toMatch(/mão de obra/);

    const { item, resultado } = fluxo(consolidado, { ...sem, maoObra: { modo: 'percentual', percentual: 20 } }, { desligar: true });
    const material = projeto.materiais / 1000;
    expect(resultado.custos[item.id].material).toBeCloseTo(material, 8);
    expect(resultado.custos[item.id].maoObra).toBeCloseTo(material * 0.2, 8);
    expect(resultado.composicoes[item.id].servicos).toEqual([]);

    const us = fluxo(consolidado, { ...sem, maoObra: { modo: 'us', usConstrucao: 10 } }, { desligar: true });
    expect(us.resultado.custos[us.item.id].maoObra).toBeCloseTo(10 * 2823.98 / 1000, 6);
  });

  test('a tela "Editar valores" não edita o item novo (origem proorc)', () => {
    const { item, nova } = fluxo(consolidado, {
      projeto: '2003202424-APP 21', tipo: 'BRT teste 76 kVA', categoria: 'Equipamentos', subcategoria: 'Instalação', unidade: 'ponto', unidadesPorProjeto: 1,
    }, { desligar: true });
    expect(ITENS_EDITAVEIS(nova).some(i => i.id === item.id)).toBe(false);
    const r = calcularEdicao({ biblioteca: nova, chaveBase: '2026-10', edicoes: {} });
    expect(r.custos[item.id].unitario).toBeCloseTo(186.97615, 5);
  });
});
