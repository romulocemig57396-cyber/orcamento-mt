import { describe, test, expect } from 'vitest';
import { getItemById, getValorPorAno, formatarValor } from '../data/tabelaCustos';
import { calcularTotaisItens } from '../utils/calculos';

describe('D0 — Religador trifásico RDU 15 kV (PROORC 07/10/2026)', () => {
  const item = getItemById('equip_relig_tri_24kv_urbano');

  test('valores de 2024 atualizados; US de construção mantida', () => {
    expect(item.material2024).toBe(57.08059);
    expect(item.maoObra2024).toBe(6.74931);
    expect(item.unitario2024).toBe(63.8299);
    expect(item.usConstr2024).toBe(2.3899992209576557);
  });

  test('material + mão de obra = unitário', () => {
    expect(item.material2024 + item.maoObra2024).toBeCloseTo(item.unitario2024, 10);
  });

  test('2022 e 2021 não mudam', () => {
    expect(item.unitario2022).toBe(69.07349);
    expect(item.unitario2021).toBe(100.00);
  });

  test('biblioteca mostra R$ 63,83 mil', () => {
    expect(formatarValor(getValorPorAno(item, 2024, 'unitario'))).toContain('63,83');
  });

  test('1 unidade → R$ 63.829,90 no orçamento', () => {
    const valor = getValorPorAno(item, 2024, 'unitario') * 1 * 1000;
    expect(valor).toBeCloseTo(63829.90, 2);
    expect(calcularTotaisItens([{ valor, categoria: 'ctc' }]).totalObra).toBeCloseTo(63829.90, 2);
  });
});
