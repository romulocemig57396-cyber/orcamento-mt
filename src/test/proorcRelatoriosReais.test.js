import { describe, test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lerSintetico } from '../proorc/lerSintetico';
import { lerAnalitico } from '../proorc/lerAnalitico';
import { lerServicos } from '../proorc/lerServicos';
import { consolidarProorc } from '../proorc/consolidar';

/* Aceite da Etapa 2 com os relatórios reais do PROORC.

   Os três .xlsx não ficam no repositório (são dados internos da Cemig e o
   repositório é público), então estes testes são ignorados quando os arquivos
   não estão em docs/proorc/. A estrutura dos arquivos é coberta por
   proorcLeitura.test.js, com planilhas montadas pelo próprio teste.          */

const PASTA = resolve(__dirname, '../../docs/proorc');
const ARQUIVOS = {
  sintetico: 'rptOrcamentoGeralSinteticoPorProjetoCemig.xlsx',
  analitico: 'rptOrcamentoGeralAnalitico.xlsx',
  servicos: 'rptOrcamentoServicosContratados.xlsx',
};
const caminho = (nome) => resolve(PASTA, nome);
const temTodos = Object.values(ARQUIVOS).every(nome => existsSync(caminho(nome)));

describe.skipIf(!temTodos)('Etapa 2 — relatórios reais de 07/10/2026', () => {
  const sintetico = lerSintetico(readFileSync(caminho(ARQUIVOS.sintetico)));
  const analitico = lerAnalitico(readFileSync(caminho(ARQUIVOS.analitico)));
  const servicos = lerServicos(readFileSync(caminho(ARQUIVOS.servicos)));
  const c = consolidarProorc({ sintetico, analitico, servicos });
  const projeto = (chave) => c.projetos.find(p => p.chave === chave);

  test('16 projetos no sintético e no analítico, 14 no de serviços', () => {
    expect(sintetico.projetos).toHaveLength(16);
    expect(analitico.projetos).toHaveLength(16);
    expect(servicos.projetos).toHaveLength(14);
    expect(c.projetos).toHaveLength(16);
  });

  test('data de referência 07/10/2026 nos três', () => {
    expect(sintetico.dataReferencia).toBe('07/10/2026');
    expect(analitico.dataReferencia).toBe('07/10/2026');
    expect(servicos.dataReferencia).toBe('07/10/2026');
    expect(c.dataReferencia).toBe('07/10/2026');
  });

  test('preços da US: construção 2.823,98 e projeto 82,73', () => {
    expect(c.precosUS).toEqual({ construcao: 2823.98, projeto: 82.73 });
  });

  test('169 materiais no catálogo, sem conflito de preço', () => {
    expect(Object.keys(c.catalogoMateriais)).toHaveLength(169);
    expect(c.avisos.filter(a => a.tipo === 'precoMaterial')).toHaveLength(0);
  });

  test('RDP 150 Dupla Camada (1000456789): 43 materiais, 172.540,68 + 78.174,51 = 250.715,19', () => {
    const p = projeto('1000456789');
    expect(p.listaMateriais).toHaveLength(43);
    expect(p.materiais).toBeCloseTo(172540.68, 2);
    expect(p.servicos).toBeCloseTo(78174.51, 2);
    expect(p.total).toBeCloseTo(250715.19, 2);
    expect(p.usConstrucao).toBeCloseTo(26.95, 4);
    expect(p.usProjeto).toBeCloseTo(25, 4);
  });

  test('Religador RDU 15 kV (1207191220-APP 3): 57.080,59 + 6.749,31 = 63.829,90', () => {
    const p = projeto('1207191220-APP 3');
    expect(p.materiais).toBeCloseTo(57080.59, 2);
    expect(p.servicos).toBeCloseTo(6749.31, 2);
    expect(p.total).toBeCloseTo(63829.9, 2);
    expect(p.usConstrucao).toBeCloseTo(2.39, 4);
    expect(p.usProjeto).toBe(0);
  });

  test('os dois Postos de Transformação vêm sem serviços contratados', () => {
    const semServicos = c.avisos.filter(a => a.tipo === 'semServicos').map(a => a.projeto).sort();
    expect(semServicos).toEqual(['9988776654', '9988776654-APP 8']);
    expect(projeto('9988776654').materiais).toBeCloseTo(270301.77, 2);
    expect(projeto('9988776654-APP 8').materiais).toBeCloseTo(744308.58, 2);
  });

  test('resumo do analítico por classe: UC/UAR 2.335.588,97 e consumo 386.175,28', () => {
    expect(analitico.resumo).toEqual({ ucUar: 2335588.97, com: 386175.28, total: 2721764.25 });
    expect(c.totais.porClasse.patrimonial).toBeCloseTo(2064372.78, 2);
    expect(c.totais.porClasse.cabo).toBeCloseTo(271216.2, 2);
    expect(c.totais.porClasse.ucUar).toBeCloseTo(2335588.97, 1);
    expect(c.totais.porClasse.consumo).toBeCloseTo(386175.28, 2);
  });

  test('validação cruzada: 2.721.764,25 + 551.110,18 = 3.272.874,43', () => {
    expect(c.totais.materiais).toBeCloseTo(2721764.25, 1);
    expect(c.totais.servicos).toBeCloseTo(551110.18, 1);
    expect(c.totais.geral).toBeCloseTo(3272874.43, 1);
    expect(sintetico.somatorio.total).toBeCloseTo(3272874.43, 2);
    expect(servicos.totalGeral).toBeCloseTo(551110.18, 2);
    expect(c.avisos.filter(a => a.tipo === 'totalGeral')).toHaveLength(0);
  });

  test('nenhum projeto ausente, nenhuma divergência de data ou de preço de US', () => {
    expect(c.avisos.filter(a => ['ausente', 'datas', 'precoUS', 'viabilidade'].includes(a.tipo))).toEqual([]);
  });

  test('os únicos avisos são os dois PT sem serviços', () => {
    expect(c.avisos.map(a => a.tipo)).toEqual(['semServicos', 'semServicos']);
  });

  test('a diferença de 1 centavo dos PT entre analítico e sintético fica dentro da tolerância', () => {
    const pt = analitico.projetos.find(p => p.chave === '9988776654');
    expect(pt.totalMateriais).toBeCloseTo(270301.76, 2);
    expect(projeto('9988776654').materiais).toBeCloseTo(270301.77, 2);
    expect(c.avisos.filter(a => a.tipo === 'materiais')).toHaveLength(0);
  });
});

describe.skipIf(temTodos)('Etapa 2 — relatórios reais ausentes', () => {
  test('os testes dos arquivos reais foram ignorados', () => {
    expect(temTodos).toBe(false);
  });
});
