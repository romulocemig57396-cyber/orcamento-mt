import { describe, test, expect } from 'vitest';
import { BIBLIOTECA } from '../data/biblioteca';
import {
  calcularEdicao, aplicarEdicao, parametrosAtuais, validarEdicao, ITENS_EDITAVEIS,
} from '../proorc/editarReferencia';
import { aplicarNovaReferencia, serializarBiblioteca } from '../proorc/gerarBibliotecaJson';
import { calcularNovaReferencia } from '../proorc/calcularReferencia';

const copia = (x) => JSON.parse(JSON.stringify(x));
const ORIGINAL = copia(BIBLIOTECA);
const base = (id) => BIBLIOTECA.itens.find(i => i.id === id).custos['2024'];
const editar = (opcoes) => calcularEdicao({ biblioteca: BIBLIOTECA, chaveBase: '2024', ...opcoes });
const mudaram = (r) => r.previa.filter(l => l.alterado).map(l => l.id).sort();

const RURAIS = BIBLIOTECA.itens.filter(i => i.formacao.regra === 'redeExistenteMaisNova').map(i => i.id).sort();

describe('R7 — o que é editável', () => {
  test('tod, manual e fixo são editáveis; proorc, formula e maoDeObra não', () => {
    const origens = [...new Set(ITENS_EDITAVEIS(BIBLIOTECA).map(i => i.formacao.origem))].sort();
    expect(origens).toEqual(['fixo', 'manual', 'tod']);
    expect(ITENS_EDITAVEIS(BIBLIOTECA)).toHaveLength(22);
  });

  test('parâmetros atuais das fórmulas', () => {
    expect(parametrosAtuais(BIBLIOTECA)).toEqual({
      fatorExistente: 0.33, fatorMaoObra: 1.05, religadorAdicional: 88142.9, percentualMaoObra: 0.2,
    });
  });
});

describe('R7 — aceite: material da TOD de Tri CAA 1/0 de 41,66709 para 45', () => {
  const r = editar({ edicoes: { ext_rural_tri_caa1_0: { material: 45 } } });
  const novo = (id) => r.custos[id].unitario;

  test('a base e os 6 dependentes', () => {
    expect(novo('ext_rural_tri_caa1_0')).toBeCloseTo(83.31981, 5);
    expect(base('ext_rural_tri_caa1_0').unitario).toBeCloseTo(79.98690, 5);
    expect(novo('conv_caa4_1_0')).toBeCloseTo(99.11361, 5);
    expect(novo('conv_caa2_1_0')).toBeCloseTo(99.93756, 5);
    expect(novo('recon_caa4_1_0')).toBeCloseTo(106.06011, 5);
    expect(novo('recon_caa2_1_0')).toBeCloseTo(106.85590, 5);
    expect(novo('recon_caa1_0_4_0')).toBeCloseTo(154.73869, 5);
    expect(novo('recon_caa1_0_336')).toBeCloseTo(175.91915, 5);
  });

  test('nenhum outro item muda — nem um decimal', () => {
    const afetados = ['ext_rural_tri_caa1_0', 'conv_caa4_1_0', 'conv_caa2_1_0', 'recon_caa4_1_0',
      'recon_caa2_1_0', 'recon_caa1_0_4_0', 'recon_caa1_0_336'];
    expect(mudaram(r)).toEqual([...afetados].sort());
    BIBLIOTECA.itens.filter(i => !afetados.includes(i.id)).forEach(i => {
      expect(r.custos[i.id], i.id).toEqual(base(i.id));
    });
  });

  test('a prévia mostra valor atual, novo, variação e motivo', () => {
    const l = r.previa.find(x => x.id === 'recon_caa1_0_4_0');
    expect(l.anterior.unitario).toBeCloseTo(153.638827, 6);
    expect(l.efetivo.unitario).toBeCloseTo(154.73869, 5);
    expect(l.variacao).toBeCloseTo((154.7386873 - 153.638827) / 153.638827 * 100, 4);
    expect(l.motivo).toBe('base Tri CAA 1/0 alterada');
    expect(r.previa.find(x => x.id === 'ext_rural_tri_caa1_0').motivo).toBe('Valor da TOD editado');
  });

  test('a referência 2024 continua intacta', () => {
    expect(BIBLIOTECA).toEqual(ORIGINAL);
  });
});

describe('R7 — alcance do recálculo em cascata', () => {
  test('Tri CAA 4 (manual) recalcula conv_caa4_4 e os 3 recon_caa4_*, e nada mais', () => {
    const r = editar({ edicoes: { ext_rural_tri_caa4: { unitario: 70 } } });
    expect(mudaram(r)).toEqual(['conv_caa4_4', 'ext_rural_tri_caa4', 'recon_caa4_1_0', 'recon_caa4_336', 'recon_caa4_4_0']);
    expect(r.custos.conv_caa4_4.unitario).toBeCloseTo(0.33 * 47.86 + 70, 6);
    expect(r.custos.recon_caa4_1_0.unitario).toBeCloseTo(0.33 * 70 + 79.9869, 6);
  });

  test('o fator 0,33 recalcula as 15 conversões e recondutoramentos rurais, e nada mais', () => {
    const r = editar({ parametros: { fatorExistente: 0.35 } });
    expect(mudaram(r)).toEqual(RURAIS);
    expect(RURAIS).toHaveLength(15);
    expect(r.custos.recon_caa4_1_0.unitario).toBeCloseTo(0.35 * 68.91 + 79.9869, 6);
    expect(r.previa.find(l => l.id === 'recon_caa4_1_0').motivo).toBe('fator da rede existente alterado (0,33 → 0,35)');
  });

  test('o fator 1,05 recalcula só os 5 recondutoramentos urbanos', () => {
    const r = editar({ parametros: { fatorMaoObra: 1.10 } });
    expect(mudaram(r)).toEqual(['recon_urb_rdp150', 'recon_urb_rdp150_dupla', 'recon_urb_rdp240', 'recon_urb_rdp50', 'recon_urb_rdp50_dupla']);
    expect(r.custos.recon_urb_rdp50.unitario).toBeCloseTo(3.94404 + 1.10 * 3.12698, 6);
  });

  test('religador adicional e % de mão de obra recalculam só os 2 PT', () => {
    // material sem o religador antigo + religador novo; mão de obra = % do material
    const r = editar({ parametros: { religadorAdicional: 100000, percentualMaoObra: 0.25 } });
    expect(mudaram(r)).toEqual(['equip_pt_2_5mva', 'equip_pt_5mva']);
    const material = 358.44467 - 88.1429 + 100;
    expect(r.custos.equip_pt_2_5mva.material).toBeCloseTo(material, 6);
    expect(r.custos.equip_pt_2_5mva.maoObra).toBeCloseTo(material * 0.25, 6);
    expect(r.custos.equip_pt_2_5mva.unitario).toBeCloseTo(material * 1.25, 6);
  });

  test('sem nenhuma edição, nada muda', () => {
    const r = editar({});
    expect(mudaram(r)).toEqual([]);
    BIBLIOTECA.itens.forEach(i => expect(r.custos[i.id], i.id).toEqual(base(i.id)));
  });
});

describe('R7 — regras de edição por origem', () => {
  test('tod: unitário = material + mão de obra', () => {
    const r = editar({ edicoes: { ext_rural_tri_caa2: { material: 40, maoObra: 40 } } });
    expect(r.custos.ext_rural_tri_caa2).toMatchObject({ material: 40, maoObra: 40, unitario: 80 });
  });

  test('manual/fixo: soma quando material e mão de obra são maiores que zero', () => {
    const r = editar({ edicoes: { sub_22kv: { material: 900, maoObra: 100 } } });
    expect(r.custos.sub_22kv).toMatchObject({ material: 900, maoObra: 100, unitario: 1000 });
  });

  test('manual/fixo: com mão de obra 0, o unitário é o digitado (derivação: material 1,7, unitário 10)', () => {
    const r = editar({ edicoes: { deriv_rdu_ramal_sub: { material: 2, unitario: 12 } } });
    expect(r.custos.deriv_rdu_ramal_sub).toMatchObject({ material: 2, maoObra: 0, unitario: 12 });
    const soMaterial = editar({ edicoes: { deriv_rdu_ramal_sub: { material: 2 } } });
    expect(soMaterial.custos.deriv_rdu_ramal_sub.unitario).toBe(10);
  });
});

describe('R7 — validações', () => {
  test('valor negativo é erro', () => {
    expect(validarEdicao({ edicoes: { sub_22kv: { material: -1 } }, parametros: {} }).erros).toHaveLength(1);
    expect(validarEdicao({ edicoes: {}, parametros: { fatorExistente: -0.1 } }).erros).toHaveLength(1);
    expect(validarEdicao({ edicoes: { sub_22kv: { material: 0 } }, parametros: {} }).erros).toHaveLength(0);
  });

  test('aviso de variação acima de ±30% e de item que vira pendente', () => {
    const r = editar({ edicoes: { ext_rural_tri_caa4: { unitario: 0 } } });
    const l = r.previa.find(x => x.id === 'ext_rural_tri_caa4');
    expect(l.avisoVariacao).toBe(true);
    expect(l.ficaPendente).toBe(true);
    expect(r.resumo.avisosVariacao).toBeGreaterThan(0);
    expect(r.resumo.novosPendentes).toEqual(['ext_rural_tri_caa4']);

    const pequeno = editar({ edicoes: { ext_rural_tri_caa1_0: { material: 45 } } });
    expect(pequeno.previa.find(x => x.id === 'conv_caa4_1_0').avisoVariacao).toBe(false);
  });
});

describe('R7 — gerar a referência', () => {
  test('cria a referência nova, sem tocar na 2024, e grava os parâmetros e a fonte da TOD', () => {
    const r = editar({ edicoes: { ext_rural_tri_caa1_0: { material: 45 } }, parametros: { fatorExistente: 0.35 }, fonteTod: 'TOD jun/2026' });
    const nova = aplicarEdicao({
      biblioteca: BIBLIOTECA, resultado: r, chave: '2026-10', rotulo: '2026 — TOD jun/2026 + edições',
      fonte: 'Edição administrativa', atual: true, parametros: { fatorExistente: 0.35 }, fonteTod: 'TOD jun/2026',
    });
    expect(nova.referencias.map(x => x.chave)).toEqual(['2026-10', '2024', '2022', '2021']);
    expect(nova.referencias[0]).toMatchObject({ atual: true, rotulo: '2026 — TOD jun/2026 + edições' });
    const tri10 = nova.itens.find(i => i.id === 'ext_rural_tri_caa1_0');
    expect(tri10.custos['2026-10'].unitario).toBeCloseTo(83.31981, 5);
    expect(tri10.custos['2024']).toEqual(base('ext_rural_tri_caa1_0'));
    expect(tri10.formacao.fonte).toBe('TOD jun/2026');
    expect(nova.itens.find(i => i.id === 'recon_caa4_1_0').formacao.fatorExistente).toBe(0.35);
    // itens copiados não ficam marcados como "não atualizado pelo PROORC"
    expect(nova.itens.find(i => i.id === 'sub_22kv').custos['2026-10'].naoAtualizadoPeloProorc).toBeUndefined();
    expect(serializarBiblioteca(nova)).toContain('"2026-10"');
    expect(BIBLIOTECA).toEqual(ORIGINAL);
  });

  test('chave repetida é recusada', () => {
    expect(() => aplicarEdicao({ biblioteca: BIBLIOTECA, resultado: editar({}), chave: '2024' })).toThrow(/já existe/);
  });
});

describe('R7 — edição sobre a referência em preparação do PROORC', () => {
  test('a referência do PROORC ainda não gravada recebe as edições e sai como uma única referência nova', () => {
    const consolidado = { projetos: [], precosUS: { construcao: 2823.98, projeto: 82.73 }, catalogoMateriais: {}, dataReferencia: '07/10/2026' };
    const resultadoProorc = calcularNovaReferencia({ biblioteca: BIBLIOTECA, consolidado, chaveAnterior: '2024' });
    const emPreparacao = aplicarNovaReferencia({
      biblioteca: BIBLIOTECA, resultado: resultadoProorc, chave: '2026-10', rotulo: 'prep', fonte: 'PROORC', atual: true,
    });

    const r = calcularEdicao({ biblioteca: emPreparacao, chaveBase: '2026-10', edicoes: { ext_rural_tri_caa1_0: { material: 45 } } });
    const final = aplicarEdicao({
      biblioteca: BIBLIOTECA, resultado: r, chave: '2026-10', rotulo: '2026 — PROORC + edições', fonte: 'PROORC + edições', atual: true,
    });
    expect(final.referencias.map(x => x.chave)).toEqual(['2026-10', '2024', '2022', '2021']);
    expect(final.precosUS['2026-10']).toEqual({ construcao: 2823.98, projeto: 82.73 });
    const recon = final.itens.find(i => i.id === 'recon_caa4_1_0').custos['2026-10'];
    expect(recon.unitario).toBeCloseTo(106.06011, 5);
    // O que o PROORC deixou como "não atualizado" e não foi editado continua marcado
    expect(final.itens.find(i => i.id === 'equip_brt_76').custos['2026-10'].naoAtualizadoPeloProorc).toBe(true);
    expect(final.itens.find(i => i.id === 'ext_rural_tri_caa1_0').custos['2026-10'].naoAtualizadoPeloProorc).toBeUndefined();
  });
});
