import { describe, test, expect } from 'vitest';
import {
  calcularMUSD,
  calcularCT,
  calcularPP,
  calcularTotalObra,
  calcularPFC,
  calcularParcelaD,
  calcularPrazoEstimado,
  calcularValidade,
} from '../utils/calculos';

describe('calcularMUSD', () => {
  test('demandaFutura 300, cargaAtual 0 → MUSD = 300', () => {
    expect(calcularMUSD(300, 0)).toBe(300);
  });

  test('demandaFutura 1500, cargaAtual 200 → MUSD = 1300', () => {
    expect(calcularMUSD(1500, 200)).toBe(1300);
  });

  test('demandaFutura 0, cargaAtual 0 → MUSD = 0', () => {
    expect(calcularMUSD(0, 0)).toBe(0);
  });
});

describe('calcularPFC — cenário real da planilha', () => {
  const ctcItensValor = 308287.78;
  const diferencaCabo = 247793.75;

  const ppItens = [
    { valor: 3358800.27, percentualCemig: 29 },
    { valor: 655148.60, percentualCemig: 29 },
    { valor: 1757109.95, percentualCemig: 29 },
    { valor: 1261784.03, percentualCemig: 29 },
  ];

  const parcelaRegItens = [{ valor: 846.90 }, { valor: 20000 }];

  const erd = 1862071.80;

  const ctcTotal = calcularCT([{ valor: ctcItensValor }], diferencaCabo);

  const ppTotal = calcularPP(
    ppItens.map(i => ({ valor: i.valor * i.percentualCemig / 100 }))
  );

  const parcelaRegTotal =
    parcelaRegItens.reduce((acc, i) => acc + i.valor, 0) +
    ppItens.reduce((acc, i) => acc + i.valor * (100 - i.percentualCemig) / 100, 0);

  const totalObra = calcularTotalObra([
    { valor: ctcItensValor },
    ...ppItens,
    ...parcelaRegItens,
  ]);

  test('totalObra', () => {
    expect(totalObra).toBeCloseTo(7361977.53, 1);
  });

  test('ctcTotal', () => {
    expect(ctcTotal).toBeCloseTo(556081.53, 1);
  });

  test('ppTotal', () => {
    expect(ppTotal).toBeCloseTo(2039524.43, 1);
  });

  test('parcelaRegTotal > 0', () => {
    expect(parcelaRegTotal).toBeGreaterThan(0);
  });

  test('pfcCliente', () => {
    const parcelaRegCobertaERD = Math.min(erd, parcelaRegTotal);
    const pfcCliente = calcularPFC(totalObra, ctcTotal, ppTotal, parcelaRegCobertaERD);
    expect(pfcCliente).toBeCloseTo(2904299.77, 1);
  });

  test('parcelaD', () => {
    const parcelaD = calcularParcelaD(ctcTotal, ppTotal);
    expect(parcelaD).toBeCloseTo(2595605.96, 1);
  });
});

describe('calcularPrazoEstimado', () => {
  const base = { temObrasVinculadas: false, diasObrasVinculadas: null };

  test('itens só com pontos (0 km) → prazoRede = 120', () => {
    const r = calcularPrazoEstimado({ ...base, itensObra: [{ unidade: 'ponto', quantidade: 5 }] });
    expect(r.prazoRede).toBe(120);
  });

  test('itens com 0.5 km → prazoRede = 120', () => {
    const r = calcularPrazoEstimado({ ...base, itensObra: [{ unidade: 'km', quantidade: 0.5 }] });
    expect(r.prazoRede).toBe(120);
  });

  test('itens com 1 km exato → prazoRede = 120', () => {
    const r = calcularPrazoEstimado({ ...base, itensObra: [{ unidade: 'km', quantidade: 1 }] });
    expect(r.prazoRede).toBe(120);
  });

  test('itens com 1.01 km → prazoRede = 365', () => {
    const r = calcularPrazoEstimado({ ...base, itensObra: [{ unidade: 'km', quantidade: 1.01 }] });
    expect(r.prazoRede).toBe(365);
  });

  test('itens com postes: 25 postes = 1km → prazoRede = 120', () => {
    const r = calcularPrazoEstimado({ ...base, itensObra: [{ unidade: 'poste', quantidade: 25 }] });
    expect(r.prazoRede).toBe(120);
  });

  test('itens com postes: 26 postes = 1.04km → prazoRede = 365', () => {
    const r = calcularPrazoEstimado({ ...base, itensObra: [{ unidade: 'poste', quantidade: 26 }] });
    expect(r.prazoRede).toBe(365);
  });

  test('sem obras vinculadas → prazoFinal = prazoRede', () => {
    const r = calcularPrazoEstimado({ ...base, itensObra: [{ unidade: 'km', quantidade: 0.5 }] });
    expect(r.prazoFinal).toBe(r.prazoRede);
  });

  test('com obras vinculadas 400 dias e prazoRede 120 → prazoFinal = 400', () => {
    const r = calcularPrazoEstimado({
      itensObra: [{ unidade: 'km', quantidade: 0.5 }],
      temObrasVinculadas: true,
      diasObrasVinculadas: 400,
    });
    expect(r.prazoFinal).toBe(400);
  });

  test('com obras vinculadas 100 dias e prazoRede 365 → prazoFinal = 365', () => {
    const r = calcularPrazoEstimado({
      itensObra: [{ unidade: 'km', quantidade: 1.01 }],
      temObrasVinculadas: true,
      diasObrasVinculadas: 100,
    });
    expect(r.prazoFinal).toBe(365);
  });
});

describe('calcularValidade', () => {
  test("dataBase '2026-01-01' → dataValidade = '2026-05-01' (120 dias)", () => {
    const validade = calcularValidade(new Date('2026-01-01'));
    expect(validade.getUTCFullYear()).toBe(2026);
    expect(validade.getUTCMonth()).toBe(4); // maio (0-indexed)
    expect(validade.getUTCDate()).toBe(1);
  });
});
