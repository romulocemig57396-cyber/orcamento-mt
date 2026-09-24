import { describe, test, expect } from 'vitest';
import { kmParaPostes, postesParaKm, METROS_POR_POSTE } from '../utils/postes';

describe('kmParaPostes', () => {
  test('1 poste = 40 m', () => {
    expect(METROS_POR_POSTE).toBe(40);
  });

  test('2,24 km → 56 postes', () => {
    expect(kmParaPostes(2.24)).toBe(56);
  });

  test('12,02 km → 301 postes (arredonda 300,5 para cima)', () => {
    expect(kmParaPostes(12.02)).toBe(301);
  });

  test('0,05 km → 1 poste (arredonda 1,25 para 1)', () => {
    expect(kmParaPostes(0.05)).toBe(1);
  });

  test('aceita string numérica', () => {
    expect(kmParaPostes('2.24')).toBe(56);
  });

  test('entrada inválida → 0', () => {
    expect(kmParaPostes('')).toBe(0);
    expect(kmParaPostes(undefined)).toBe(0);
    expect(kmParaPostes(null)).toBe(0);
  });
});

describe('postesParaKm', () => {
  test('56 postes → 2,24 km', () => {
    expect(postesParaKm(56)).toBeCloseTo(2.24, 5);
  });

  test('301 postes → 12,04 km', () => {
    expect(postesParaKm(301)).toBeCloseTo(12.04, 5);
  });

  test('entrada inválida → 0', () => {
    expect(postesParaKm('')).toBe(0);
    expect(postesParaKm(undefined)).toBe(0);
  });
});

import { formatarQuantidade } from '../utils/postes';

describe('formatarQuantidade', () => {
  test('km com 2 casas', () => expect(formatarQuantidade(11.33, 'km')).toBe('11,33 km'));
  test('postes com equivalente em km', () => expect(formatarQuantidade(371, 'poste')).toBe('371 postes (≈ 14,84 km)'));
  test('1 poste no singular', () => expect(formatarQuantidade(1, 'poste')).toBe('1 poste (≈ 0,04 km)'));
  test('pontos', () => expect(formatarQuantidade(2, 'ponto')).toBe('2 pontos'));
  test('sem quantidade', () => expect(formatarQuantidade(null, 'km')).toBe('—'));
});
