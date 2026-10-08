import { describe, test, expect } from 'vitest';
import { BIBLIOTECA, getItemById, custosDaReferencia } from '../data/biblioteca';
import { calcularPorFormula, calcularPorMaoDeObra, usDaMaoObra } from '../proorc/formacao';

/* Recalcula a referência 2024 a partir da `formacao` de cada item e confere
   com o valor cadastrado. Prova que a formação registrada no JSON é a mesma
   que formou a planilha de origem.

   O preço da US de construção de 2024 não está no JSON (a planilha usou dois
   valores). Aqui assumimos 2.823,98, que é o que fecha a maioria dos itens; as
   exceções estão nomeadas em EXCECOES.                                       */
const PRECO_US_2024 = 2823.98;

const custoDe = (id) => custosDaReferencia(getItemById(id), '2024');
const contexto = (item) => ({
  custoDe,
  precoUSConstrucao: PRECO_US_2024,
  custoAtual: custosDaReferencia(item, '2024'),
});

// Diferenças conhecidas e aceitas na referência 2024
const EXCECOES = {
  // A planilha usou 2,823 em vez de 2,82398 nestes três
  equip_abert_fecha_chave: ['unitario', 'maoObra'],
  equip_rem_trafo_1f: ['unitario', 'maoObra'],
  equip_rem_trafo_3f: ['unitario', 'maoObra'],
  // Unitário 12 digitado por cima da fórmula; em verificação pelo responsável
  rede_ret_rdp_3f_50_150: ['unitario'],
  // Só o unitário foi cadastrado; material e mão de obra ficaram em branco
  recon_urb_rdp150_dupla: ['material', 'maoObra', 'usConstr'],
  // A planilha usou o material do mono CAA 2 (23,3894) em vez do da rede nova,
  // Tri CAA 2 (33,00166). O unitário fecha; só a divisão material/mão de obra
  // diverge, e o recálculo pela fórmula a corrige.
  conv_caa4_2: ['material', 'maoObra', 'usConstr'],
};
const ehExcecao = (id, campo) => (EXCECOES[id] || []).includes(campo);

const itensDe = (origem) => BIBLIOTECA.itens.filter(i => i.formacao.origem === origem);

describe('Etapa 1 — recálculo de 2024: itens de fórmula', () => {
  const rurais = itensDe('formula').filter(i => i.formacao.regra === 'redeExistenteMaisNova');
  const urbanos = itensDe('formula').filter(i => i.formacao.regra === 'extensaoComAcrescimoMaoObra');

  test('são 15 rurais e 5 urbanos', () => {
    expect(rurais).toHaveLength(15);
    expect(urbanos).toHaveLength(5);
  });

  test.each(rurais.map(i => [i.id, i]))('%s — fator × existente + nova', (id, item) => {
    const calc = calcularPorFormula(item.formacao, contexto(item));
    const atual = custosDaReferencia(item, '2024');
    ['unitario', 'material', 'maoObra', 'usConstr'].forEach(campo => {
      if (ehExcecao(id, campo)) return;
      expect(calc[campo], `${id}.${campo}`).toBeCloseTo(atual[campo], 3);
    });
  });

  test.each(urbanos.map(i => [i.id, i]))('%s — material igual e mão de obra × 1,05', (id, item) => {
    const calc = calcularPorFormula(item.formacao, contexto(item));
    const atual = custosDaReferencia(item, '2024');
    ['unitario', 'material', 'maoObra', 'usConstr'].forEach(campo => {
      if (ehExcecao(id, campo)) return;
      expect(calc[campo], `${id}.${campo}`).toBeCloseTo(atual[campo], 3);
    });
  });

  test('conv_caa4_2 e conv_caa4_4: o unitário fecha mesmo com o material divergente', () => {
    expect(custoDe('conv_caa4_2').unitario).toBeCloseTo(0.33 * 47.86 + 71.32147, 4);
    expect(custoDe('conv_caa4_4').unitario).toBeCloseTo(0.33 * 47.86 + 68.91, 4);
  });

  test('as contas de referência do prompt', () => {
    // recon_caa4_1_0 = 0,33 × 68,91 + 79,9869 = 102,7272
    expect(custoDe('recon_caa4_1_0').unitario).toBeCloseTo(0.33 * 68.91 + 79.9869, 3);
    // conv_caa2_2 = 0,33 × 50,35681 + 71,32147 = 87,93922
    expect(custoDe('conv_caa2_2').unitario).toBeCloseTo(0.33 * 50.35681 + 71.32147, 4);
    // recon_urb_rdp50: mão de obra 1,05 × 3,12698 = 3,283329
    expect(custoDe('recon_urb_rdp50').maoObra).toBeCloseTo(1.05 * 3.12698, 6);
  });
});

describe('Etapa 1 — recálculo de 2024: itens só de mão de obra', () => {
  const itens = itensDe('maoDeObra');

  test('são 8 itens, todos com US cadastrada', () => {
    expect(itens).toHaveLength(8);
    itens.forEach(i => expect(i.formacao.usConstrucao, i.id).toBeGreaterThan(0));
  });

  test.each(itens.map(i => [i.id, i]))('%s — US × preço da US', (id, item) => {
    const calc = calcularPorMaoDeObra(item.formacao, { precoUSConstrucao: PRECO_US_2024 });
    const atual = custosDaReferencia(item, '2024');
    expect(calc.material, id).toBe(0);
    expect(calc.usConstr, id).toBeCloseTo(atual.usConstr, 6);
    ['unitario', 'maoObra'].forEach(campo => {
      if (ehExcecao(id, campo)) return;
      expect(calc[campo], `${id}.${campo}`).toBeCloseTo(atual[campo], 3);
    });
  });

  test('os três itens de equipamento foram calculados com 2,823 na planilha', () => {
    ['equip_abert_fecha_chave', 'equip_rem_trafo_1f', 'equip_rem_trafo_3f'].forEach(id => {
      const us = getItemById(id).formacao.usConstrucao;
      expect(custoDe(id).unitario, id).toBeCloseTo(us * 2.823, 6);
      expect(custoDe(id).unitario, id).not.toBeCloseTo(us * 2.82398, 6);
    });
  });

  test('rede_ret_rdp_3f_50_150 está com 12 e o recálculo dá 28,906', () => {
    expect(custoDe('rede_ret_rdp_3f_50_150').unitario).toBe(12);
    const calc = calcularPorMaoDeObra(getItemById('rede_ret_rdp_3f_50_150').formacao, { precoUSConstrucao: PRECO_US_2024 });
    expect(calc.unitario).toBeCloseTo(28.906, 3);
    expect(getItemById('rede_ret_rdp_3f_50_150').verificacao).toMatch(/28,906/);
  });
});

describe('Etapa 1 — itens copiados e sem custo', () => {
  test('os 17 itens fixos trazem o motivo', () => {
    const fixos = itensDe('fixo');
    expect(fixos).toHaveLength(17);
    fixos.forEach(i => expect(i.formacao.motivo, i.id).toBeTruthy());
  });

  test('os 6 itens sem custo em 2024 estão marcados como tal', () => {
    const semCusto = BIBLIOTECA.itens.filter(i => !custosDaReferencia(i, '2024').unitario);
    expect(semCusto.map(i => i.id).sort()).toEqual([
      'ext_urbano_rdi185', 'ext_urbano_rdi50', 'recon_urb_4_0_ca',
      'recon_urb_rdi185', 'recon_urb_rdi50', 'sub_13_8kv',
    ]);
    semCusto.forEach(i => expect(i.formacao.motivo, i.id).toMatch(/Sem custo cadastrado/));
  });

  test('os 6 itens do PROORC ainda sem projeto exportado estão identificados', () => {
    const semProjeto = itensDe('proorc').filter(i => !i.formacao.projeto);
    expect(semProjeto.map(i => i.id).sort()).toEqual([
      'equip_bcap_300_fixo', 'ext_rural_mono_caa2', 'ext_rural_tri_caa1_0',
      'ext_rural_tri_caa2', 'ext_rural_tri_caa336', 'ext_rural_tri_caa4_0',
    ]);
    semProjeto.forEach(i => expect(i.formacao.observacao, i.id).toMatch(/ainda não exportado/));
  });
});

describe('Etapa 1 — conversão entre mão de obra e US', () => {
  test('usDaMaoObra é o inverso de US × preço', () => {
    expect(usDaMaoObra(28.906259, 2823.98)).toBeCloseTo(10.236, 5);
    expect(usDaMaoObra(0, 2823.98)).toBe(0);
    expect(usDaMaoObra(10, 0)).toBe(0);
  });
});
