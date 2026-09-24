import { describe, test, expect } from 'vitest';
import {
  getCabosCompativeis, calcularDiferencaCabo, itemPermiteDiferencaCabo,
  diferencaDoItem, baseRateioDoItem,
} from '../utils/diferencaCabo';
import { calcularTotaisItens, calcularRateioERD } from '../utils/calculos';

const ids = (lista) => lista.map(c => c.item.id);

describe('getCabosCompativeis', () => {
  test('Tri CAA 336,4 rural → só trifásicos mais baratos, nunca monofásicos', () => {
    const r = ids(getCabosCompativeis('ext_rural_tri_caa336', 2024));
    expect(r).toEqual(['ext_rural_tri_caa4_0', 'ext_rural_tri_caa1_0', 'ext_rural_tri_caa2', 'ext_rural_tri_caa4']);
    expect(r.some(id => id.includes('mono'))).toBe(false);
  });

  test('Mono CAA 2 → só Mono CAA 4', () => {
    expect(ids(getCabosCompativeis('ext_rural_mono_caa2', 2024))).toEqual(['ext_rural_mono_caa4']);
  });

  test('Recondutoramento CAA 4 p/ 336 → recondutoramentos com mesmo cabo de origem, sem conversões', () => {
    expect(ids(getCabosCompativeis('recon_caa4_336', 2024))).toEqual(['recon_caa4_4_0', 'recon_caa4_1_0']);
  });

  test('RDP 240 urbano → RDPs mais baratos; RDI (sem custo) excluído', () => {
    const r = ids(getCabosCompativeis('ext_urbano_rdp240', 2024));
    expect(r).toContain('ext_urbano_rdp150');
    expect(r).toContain('ext_urbano_rdp50');
    expect(r.some(id => id.includes('rdi'))).toBe(false);
  });

  test('cabo mais barato da categoria não tem compatível', () => {
    expect(getCabosCompativeis('ext_rural_tri_caa4', 2024)).toEqual([]);
  });

  test('equipamento não tem diferença de cabo', () => {
    expect(getCabosCompativeis('equip_brt_167_rural', 2024)).toEqual([]);
  });
});

describe('calcularDiferencaCabo — custo total (material + mão de obra + US)', () => {
  test('Tri CAA 336,4 → Tri CAA 1/0, 11,33 km', () => {
    const esperado = (148.42361 - 79.98689999999999) * 11.33 * 1000;
    expect(calcularDiferencaCabo('ext_rural_tri_caa336', 'ext_rural_tri_caa1_0', 11.33, 2024)).toBeCloseTo(esperado, 2);
  });

  test('usa o ano de referência do item', () => {
    const esperado = (115.63557 - 56.62114) * 2 * 1000;
    expect(calcularDiferencaCabo('ext_rural_tri_caa336', 'ext_rural_tri_caa1_0', 2, 2021)).toBeCloseTo(esperado, 2);
  });
});

describe('itemPermiteDiferencaCabo', () => {
  test('item de cabo em PP → permite', () => {
    expect(itemPermiteDiferencaCabo({ categoria: 'pp', itemOrigem: 'ext_rural_tri_caa336', quantidade: 2 })).toBe(true);
  });
  test('item em CTC → não permite (Cemig já paga tudo)', () => {
    expect(itemPermiteDiferencaCabo({ categoria: 'ctc', itemOrigem: 'ext_rural_tri_caa336', quantidade: 2 })).toBe(false);
  });
  test('item manual (sem biblioteca) → não permite', () => {
    expect(itemPermiteDiferencaCabo({ categoria: 'pp', quantidade: 2 })).toBe(false);
  });
});

describe('rateio com diferença de cabo por item', () => {
  test('PP 29% Cemig: cabo superior 100 mil, necessário 80 mil', () => {
    const itens = [{ categoria: 'pp', valor: 100000, percentualCemig: 29, diferencaCabo: 20000 }];
    const t = calcularTotaisItens(itens);
    expect(t.totalObra).toBe(100000);
    expect(t.ctcTotal).toBe(20000);
    expect(t.ppTotal).toBeCloseTo(23200, 2);
    expect(t.parcelaRegTotal).toBeCloseTo(56800, 2);
    const r = calcularRateioERD({ ...t, erd: 0 });
    expect(r.pfcCliente).toBeCloseTo(56800, 2); // cliente paga 71% do cabo necessário
  });

  test('Parcela Regulatória: ERD grande não passa do cabo necessário e PFC fica zero', () => {
    const itens = [
      { categoria: 'ctc', valor: 10000 },
      { categoria: 'parcela_reg', valor: 50000, diferencaCabo: 20000 },
    ];
    const t = calcularTotaisItens(itens);
    expect(t.parcelaRegTotal).toBe(30000);
    const r = calcularRateioERD({ ...t, erd: 100000 });
    expect(r.parcelaRegCobertaERD).toBe(30000);
    expect(r.erdNaoUtilizado).toBe(70000);
    expect(r.pfcCliente).toBe(0);
  });

  test('CTI: cliente paga só o cabo necessário', () => {
    const t = calcularTotaisItens([{ categoria: 'cti', valor: 50000, diferencaCabo: 15000 }]);
    expect(t.ctiTotal).toBe(35000);
    expect(calcularRateioERD({ ...t, erd: 0 }).pfcCliente).toBe(35000);
  });

  test('diferença gravada em item CTC é ignorada (sem contar duas vezes)', () => {
    const t = calcularTotaisItens([{ categoria: 'ctc', valor: 50000, diferencaCabo: 15000 }]);
    expect(t.ctcTotal).toBe(50000);
  });

  test('diferença nunca passa do valor do item', () => {
    expect(diferencaDoItem({ categoria: 'pp', valor: 10000, diferencaCabo: 25000 })).toBe(10000);
    expect(baseRateioDoItem({ categoria: 'pp', valor: 10000, diferencaCabo: 25000 })).toBe(0);
  });

  test('valor antigo digitado no Rateio continua somando no CTC (compatibilidade)', () => {
    const t = calcularTotaisItens([{ categoria: 'parcela_reg', valor: 50000 }], 5000);
    expect(t.ctcTotal).toBe(5000);
    expect(t.diferencaCaboTotal).toBe(5000);
  });

  test('cenário da planilha sem diferença por item → mesmos resultados de antes', () => {
    const itens = [
      { categoria: 'ctc', valor: 308287.78 },
      ...[3358800.27, 655148.60, 1757109.95, 1261784.03].map(valor => ({ categoria: 'pp', valor, percentualCemig: 29 })),
      { categoria: 'parcela_reg', valor: 846.90 }, { categoria: 'parcela_reg', valor: 20000 },
    ];
    const t = calcularTotaisItens(itens, 247793.75);
    const r = calcularRateioERD({ ...t, erd: 1862071.80 });
    expect(t.ctcTotal).toBeCloseTo(556081.53, 1);
    expect(r.pfcCliente).toBeCloseTo(2904299.77, 1);
  });
});
