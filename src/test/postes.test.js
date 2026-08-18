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
