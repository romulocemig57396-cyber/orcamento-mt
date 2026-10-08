import { describe, test, expect } from 'vitest';
import { analisarTexto, extrairQuantidade, lerNumeroBR } from '../components/Importacao';

describe('A2 — lerNumeroBR', () => {
  test.each([
    ['1.200', 1200],
    ['1.200,5', 1200.5],
    ['112,5', 112.5],
    ['1500', 1500],
    ['0,1', 0.1],
    ['11.33', 11.33],
    ['2.500.000', 2500000],
  ])('%s → %s', (texto, esperado) => {
    expect(lerNumeroBR(texto)).toBe(esperado);
  });

  test('texto inválido → NaN', () => {
    expect(lerNumeroBR('abc')).toBeNaN();
  });
});

describe('A2 — demanda com milhar e decimal na importação', () => {
  test('"de 1.200 kW para 2.500 kW" → carga 1200, demanda 2500', () => {
    const { cab } = analisarTexto('Aumento de demanda de 1.200 kW para 2.500 kW.');
    expect(cab.cargaAtual).toBe(1200);
    expect(cab.demandaFutura).toBe(2500);
  });

  test('"de 0 kW para 300 kW" → carga 0, demanda 300', () => {
    const { cab } = analisarTexto('Ligação de 0 kW para 300 kW.');
    expect(cab.cargaAtual).toBe(0);
    expect(cab.demandaFutura).toBe(300);
  });

  test('texto real "200kW HFP para 1500kW HFP" continua → 200 e 1500', () => {
    const { cab } = analisarTexto('Aumento de demanda contratada fora de ponta de 200kW HFP para 1500kW HFP.');
    expect(cab.cargaAtual).toBe(200);
    expect(cab.demandaFutura).toBe(1500);
  });

  test('"Demanda de 112,5 kW" → 112,5', () => {
    const { cab } = analisarTexto('Demanda de 112,5 kW');
    expect(cab.demandaFutura).toBe(112.5);
  });

  test('"1500kW" colado → 1500', () => {
    expect(analisarTexto('Demanda de 1500kW').cab.demandaFutura).toBe(1500);
  });

  test('"1.200,5 kW HFP" → 1200,5', () => {
    expect(analisarTexto('Demanda de 1.200,5 kW HFP').cab.demandaFutura).toBe(1200.5);
  });
});

describe('A2 — quantidades com milhar', () => {
  test('"1.250 km" → 1250 km', () => {
    expect(extrairQuantidade('Construção de rede. 1.250 km')).toEqual({ quantidade: 1250, unidade: 'km' });
  });

  test('"2,24 km" continua → 2,24', () => {
    expect(extrairQuantidade('Construção. 2,24 km')).toEqual({ quantidade: 2.24, unidade: 'km' });
  });

  test('"1.200 peças" → 1200 ponto', () => {
    expect(extrairQuantidade('Instalar 1.200 peças')).toEqual({ quantidade: 1200, unidade: 'ponto' });
  });
});
