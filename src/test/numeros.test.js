import { describe, test, expect } from 'vitest';
import { lerNumeroBR, NUM } from '../utils/numeros';
import { lerNumeroBR as lerNumeroBRdaImportacao } from '../components/Importacao';

describe('Etapa 2 — lerNumeroBR saiu da importação para utils/numeros', () => {
  test('a importação continua expondo a mesma função', () => {
    expect(lerNumeroBRdaImportacao).toBe(lerNumeroBR);
  });

  test.each([
    ['1.200', 1200],
    ['1.200,5', 1200.5],
    ['112,5', 112.5],
    ['1500', 1500],
    ['11.33', 11.33],
    ['2.823,98', 2823.98],
    ['2.335.588,97', 2335588.97],
    ['0,00', 0],
  ])('%s → %s', (texto, esperado) => expect(lerNumeroBR(texto)).toBe(esperado));

  test('aceita valor negativo, que pode aparecer em coluna de dinheiro', () => {
    expect(lerNumeroBR('-1.200,50')).toBe(-1200.5);
    expect(lerNumeroBR('-5')).toBe(-5);
  });

  test('texto que não é número devolve NaN', () => {
    ['abc', '', 'MATERIAIS', ' -', '-', 'R$ 10,00'].forEach(t => expect(lerNumeroBR(t), t).toBeNaN());
  });

  test('NUM continua servindo para montar expressões de busca', () => {
    const m = `Construção de 1.250 km`.match(new RegExp(`(${NUM})\\s*km`, 'i'));
    expect(lerNumeroBR(m[1])).toBe(1250);
  });
});
