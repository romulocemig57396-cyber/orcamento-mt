import { describe, test, expect } from 'vitest';
import { lerSintetico } from '../proorc/lerSintetico';
import { lerAnalitico, classeDoMaterial } from '../proorc/lerAnalitico';
import { lerServicos } from '../proorc/lerServicos';
import { consolidarProorc } from '../proorc/consolidar';
import { lerCabecalhoProjeto, lerDataReferencia, ehSomatorio } from '../proorc/planilha';
import { CONJUNTO, sinteticoFalso, analiticoFalso, servicosFalso } from './fixtures/planilhaFalsa';

const consolidado = () => consolidarProorc({
  sintetico: lerSintetico(CONJUNTO.sintetico()),
  analitico: lerAnalitico(CONJUNTO.analitico()),
  servicos: lerServicos(CONJUNTO.servicos()),
});

describe('Etapa 2 — cabeçalho de projeto', () => {
  test('normaliza o sufixo APP e os espaços repetidos', () => {
    expect(lerCabecalhoProjeto('NS: 1000456789-APP 3      Extensão de 01 km cabo 240mm²'))
      .toEqual({ chave: '1000456789-APP 3', descricao: 'Extensão de 01 km cabo 240mm²' });
    expect(lerCabecalhoProjeto('PS: 1000456789  Extensão de 01 km de RDP 150mm² Dupla camada'))
      .toEqual({ chave: '1000456789', descricao: 'Extensão de 01 km de RDP 150mm² Dupla camada' });
    expect(lerCabecalhoProjeto('NS: 1207191220 RELIGADOR TRIFÁSICO').chave).toBe('1207191220');
    expect(lerCabecalhoProjeto('NS: 9912927400-APP 15     Banco').chave).toBe('9912927400-APP 15');
  });

  test('aceita variações de espaço no APP e no rótulo', () => {
    expect(lerCabecalhoProjeto('NS:1000456789-APP3 Teste').chave).toBe('1000456789-APP 3');
    expect(lerCabecalhoProjeto('NS : 1000456789 - APP 12 Teste').chave).toBe('1000456789-APP 12');
  });

  test('ignora o que não é cabeçalho', () => {
    expect(lerCabecalhoProjeto('MATERIAIS REQUISITADOS')).toBeNull();
    expect(lerCabecalhoProjeto('00380856')).toBeNull();
    expect(lerCabecalhoProjeto('')).toBeNull();
    expect(lerCabecalhoProjeto(undefined)).toBeNull();
  });

  test('reconhece o bloco de somatório', () => {
    expect(ehSomatorio('SOMATÓRIO DOS PROJETOS ')).toBe(true);
    expect(ehSomatorio('SOMATORIO DOS PROJETOS')).toBe(true);
    expect(ehSomatorio('TOTAL')).toBe(false);
  });
});

describe('Etapa 2 — data de referência', () => {
  test('junta o rótulo e a data quando estão em células separadas, e completa o dia', () => {
    expect(lerDataReferencia([['SOMATÓRIO DOS PROJETOS', 'DATA REF.:', '7/10/2026']])).toBe('07/10/2026');
    expect(lerDataReferencia([['DATA REF.: 07/10/2026']])).toBe('07/10/2026');
    expect(lerDataReferencia([['DATA REF: 7/1/2026']])).toBe('07/01/2026');
  });

  test('não confunde com outras datas soltas do cabeçalho', () => {
    expect(lerDataReferencia([['07/10/2026'], ['qualquer coisa']])).toBeNull();
  });
});

describe('Etapa 2 — relatório sintético', () => {
  const r = lerSintetico(CONJUNTO.sintetico());

  test('data, projetos e somatório', () => {
    expect(r.dataReferencia).toBe('07/10/2026');
    expect(r.projetos.map(p => p.chave)).toEqual(['1111111111', '1111111111-APP 2']);
    expect(r.somatorio.total).toBe(4100.5);
  });

  test('o somatório não entra na lista de projetos', () => {
    expect(r.projetos.some(p => p.chave === 'SOMATÓRIO')).toBe(false);
  });

  test('totais por projeto, lidos do TOTAL OBRA', () => {
    const [a, b] = r.projetos;
    expect(a).toMatchObject({ materiais: 1000, servicos: 600, total: 1600, administracao: 0, salvados: 0 });
    expect(b).toMatchObject({ materiais: 2500.5, servicos: 0, total: 2500.5 });
    expect(a.descricao).toBe('Extensão de 01 km de teste');
  });

  test('guarda as quatro colunas', () => {
    expect(r.projetos[0].colunas.materiais).toEqual({ totalObra: 1000, viabCemig: 1000, naoViabCemig: 0, medicao: 0 });
  });
});

describe('Etapa 2 — relatório analítico', () => {
  const r = lerAnalitico(CONJUNTO.analitico());

  test('data, projetos e total de materiais', () => {
    expect(r.dataReferencia).toBe('07/10/2026');
    expect(r.projetos.map(p => p.chave)).toEqual(['1111111111', '1111111111-APP 2']);
    expect(r.projetos[0].totalMateriais).toBe(1000);
  });

  test('linhas de material com quantidade, preço e total', () => {
    const [cabo, parafuso] = r.projetos[0].materiais;
    expect(cabo).toMatchObject({
      codigo: '00380856', unidade: 'M', ucUar: 'MUT', classe: 'cabo',
      quantidade: 3150, precoUnitario: 0.19, total: 600,
    });
    expect(parafuso).toMatchObject({ codigo: '00066886', ucUar: '-', classe: 'consumo', quantidade: 100, total: 400 });
  });

  test('classifica pela coluna UC/UAR', () => {
    expect(r.projetos[1].materiais[0].classe).toBe('patrimonial');
    expect(classeDoMaterial('SIM')).toBe('patrimonial');
    expect(classeDoMaterial('MUT')).toBe('cabo');
    expect(classeDoMaterial(' - ')).toBe('consumo');
    expect(classeDoMaterial('')).toBe('consumo');
  });

  test('lê o resumo por classe do fim do relatório', () => {
    expect(r.resumo).toEqual({ ucUar: 3100.5, com: 400, total: 3500.5 });
  });

  test('não confunde o cabeçalho das colunas com material', () => {
    expect(r.projetos.flatMap(p => p.materiais).every(m => /^\d{8}$/.test(m.codigo))).toBe(true);
  });
});

describe('Etapa 2 — relatório de serviços', () => {
  const r = lerServicos(CONJUNTO.servicos());

  test('preços da US por grupo', () => {
    expect(r.precosUS).toEqual({ construcao: 2000, projeto: 50 });
  });

  test('usa o TOTAL US como quantidade e separa construção de projeto', () => {
    expect(r.projetos[0].servicos).toEqual([
      { codigo: 'USRDA', descricao: 'MÃO-DE-OBRA BÁSICO CONSTRUÇÃO RDA', quantidadeUS: 0.25, precoUS: 2000, total: 500, grupo: 'construcao' },
      { codigo: 'USPROJ', descricao: 'MÃO-DE-OBRA BÁSICO PROJETO RDA', quantidadeUS: 2, precoUS: 50, total: 100, grupo: 'projeto' },
    ]);
  });

  test('ignora os subtotais MOC e PRC', () => {
    expect(r.projetos[0].servicos).toHaveLength(2);
    expect(r.projetos[0].total).toBe(600);
  });

  test('lê o total geral do rodapé e a data partida em duas células', () => {
    expect(r.totalGeral).toBe(600);
    expect(r.dataReferencia).toBe('07/10/2026');
  });

  test('USRDR também é construção', () => {
    const buffer = servicosFalso({
      projetos: [{
        chave: '2222222222', descricao: 'Rural', total: '200,00',
        servicos: [{ codigo: 'USRDR', descricao: 'CONSTRUÇÃO RURAL', quantidadeServico: '0,1', totalUS: '0,1000', precoUS: '2.000,00', total: '200,00', grupo: 'construcao' }],
      }],
    });
    expect(lerServicos(buffer).projetos[0].servicos[0].grupo).toBe('construcao');
  });
});

describe('Etapa 2 — consolidação', () => {
  const c = consolidado();

  test('une os três relatórios por projeto', () => {
    expect(c.dataReferencia).toBe('07/10/2026');
    expect(c.projetos.map(p => p.chave)).toEqual(['1111111111', '1111111111-APP 2']);
    expect(c.projetos[0]).toMatchObject({
      materiais: 1000, servicos: 600, total: 1600, usConstrucao: 0.25, usProjeto: 2,
    });
    expect(c.projetos[0].listaMateriais).toHaveLength(2);
  });

  test('monta o catálogo de materiais com classe e preço', () => {
    expect(Object.keys(c.catalogoMateriais).sort()).toEqual(['00066886', '00380856', '00380857']);
    expect(c.catalogoMateriais['00380856']).toMatchObject({ classe: 'cabo', precoUnitario: 0.19, unidade: 'M' });
  });

  test('totais e soma por classe', () => {
    expect(c.totais.materiais).toBe(3500.5);
    expect(c.totais.servicos).toBe(600);
    expect(c.totais.geral).toBe(4100.5);
    expect(c.totais.porClasse).toMatchObject({ patrimonial: 2500.5, cabo: 600, consumo: 400, ucUar: 3100.5 });
  });

  test('avisa só o projeto sem serviços contratados', () => {
    expect(c.avisos.map(a => a.tipo)).toEqual(['semServicos']);
    expect(c.avisos[0].projeto).toBe('1111111111-APP 2');
    expect(c.avisos[0].mensagem).toMatch(/não tem serviços contratados/);
  });
});

describe('Etapa 2 — avisos de inconsistência', () => {
  const comAvisos = (partes) => consolidarProorc({
    sintetico: lerSintetico(partes.sintetico || CONJUNTO.sintetico()),
    analitico: lerAnalitico(partes.analitico || CONJUNTO.analitico()),
    servicos: lerServicos(partes.servicos || CONJUNTO.servicos()),
  }).avisos;
  const tipos = (avisos) => avisos.map(a => a.tipo);

  test('materiais do analítico que não fecham com o sintético', () => {
    const analitico = analiticoFalso({
      projetos: [{
        chave: '1111111111', descricao: 'Extensão de 01 km de teste', totalMateriais: '900,00',
        materiais: [{ codigo: '00380856', descricao: 'CABO', unidade: 'M', ucUar: 'MUT', quantidade: '1,00', precoUnitario: '900,00', total: '900,00' }],
      }],
    });
    const avisos = comAvisos({ analitico });
    expect(tipos(avisos)).toContain('materiais');
    expect(avisos.find(a => a.tipo === 'materiais').projeto).toBe('1111111111');
  });

  test('projeto que aparece em um relatório e falta em outro', () => {
    const analitico = analiticoFalso({
      projetos: [{
        chave: '3333333333', descricao: 'Só no analítico', totalMateriais: '10,00',
        materiais: [{ codigo: '00380856', descricao: 'CABO', unidade: 'M', ucUar: 'MUT', quantidade: '1,00', precoUnitario: '10,00', total: '10,00' }],
      }],
    });
    const ausentes = comAvisos({ analitico }).filter(a => a.tipo === 'ausente');
    // 3333333333 só existe no analítico; 1111111111 deixou de existir lá; e o
    // APP 2, sem analítico e sem serviços, deixa de ser só "sem serviços"
    expect(ausentes.map(a => a.projeto).sort()).toEqual(['1111111111', '1111111111-APP 2', '3333333333']);
    expect(ausentes.find(a => a.projeto === '3333333333').mensagem)
      .toMatch(/aparece em analítico, e falta em sintético e serviços/);
  });

  test('datas de referência diferentes entre os arquivos', () => {
    expect(tipos(comAvisos({ servicos: servicosFalso({ data: '01/09/2026', projetos: [] }) }))).toContain('datas');
  });

  test('preços de US diferentes entre projetos', () => {
    const servicos = servicosFalso({
      projetos: [
        { chave: '1111111111', descricao: 'A', total: '500,00', servicos: [{ codigo: 'USRDA', descricao: 'C', quantidadeServico: '0,25', totalUS: '0,2500', precoUS: '2.000,00', total: '500,00', grupo: 'construcao' }] },
        { chave: '1111111111-APP 2', descricao: 'B', total: '300,00', servicos: [{ codigo: 'USRDA', descricao: 'C', quantidadeServico: '0,1', totalUS: '0,1000', precoUS: '3.000,00', total: '300,00', grupo: 'construcao' }] },
      ],
    });
    expect(tipos(comAvisos({ servicos }))).toContain('precoUS');
  });

  test('mesmo material com preços diferentes', () => {
    const analitico = analiticoFalso({
      projetos: [
        {
          chave: '1111111111', descricao: 'A', totalMateriais: '1.000,00',
          materiais: [
            { codigo: '00380856', descricao: 'CABO', unidade: 'M', ucUar: 'MUT', quantidade: '1,00', precoUnitario: '600,00', total: '600,00' },
            { codigo: '00066886', descricao: 'PARAFUSO', unidade: 'PC', ucUar: ' -', quantidade: '1,00', precoUnitario: '400,00', total: '400,00' },
          ],
        },
        {
          chave: '1111111111-APP 2', descricao: 'B', totalMateriais: '2.500,50',
          materiais: [{ codigo: '00380856', descricao: 'CABO', unidade: 'M', ucUar: 'MUT', quantidade: '1,00', precoUnitario: '2.500,50', total: '2.500,50' }],
        },
      ],
    });
    const avisos = comAvisos({ analitico });
    expect(tipos(avisos)).toContain('precoMaterial');
    expect(avisos.find(a => a.tipo === 'precoMaterial').mensagem).toMatch(/00380856/);
  });

  test('valor em NÃO VIAB. CEMIG ou MEDIÇÃO', () => {
    const sintetico = sinteticoFalso({
      projetos: [
        { chave: '1111111111', descricao: 'A', materiais: '1.000,00', servicos: '600,00', total: '1.600,00', medicao: '50,00' },
        { chave: '1111111111-APP 2', descricao: 'B', materiais: '2.500,50', servicos: '0,00', total: '2.500,50', naoViab: '30,00' },
      ],
    });
    expect(lerSintetico(sintetico).projetos[0].colunas.total.medicao).toBe(50);
    const avisos = comAvisos({ sintetico });
    expect(avisos.filter(a => a.tipo === 'viabilidade').map(a => a.projeto))
      .toEqual(['1111111111', '1111111111-APP 2']);
  });

  test('o conjunto coerente não gera aviso de total geral', () => {
    expect(tipos(consolidado().avisos)).not.toContain('totalGeral');
  });
});
