import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  parse,
  format,
  incrementMajor,
  incrementMinor,
  incrementPatch,
  componenteValido,
  MIN_COMPONENTE,
  MAX_COMPONENTE,
} from '../versao/semver.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Feature: adequacao-diretrizes-cemig, Property 10: Round-trip e incremento de
   versão semântica

   Validates: Requirements 12.1

   Para qualquer versão semântica válida MAJOR.MINOR.PATCH (cada componente
   inteiro de 0 a 999999), analisar e reformatar reproduz a mesma versão, e cada
   tipo de incremento (MAJOR/MINOR/PATCH) aplica exatamente a regra correspondente
   respeitando os limites.
   ───────────────────────────────────────────────────────────────────────────── */

// No mínimo 100 iterações por teste de propriedade (Testing Strategy do design).
const NUM_RUNS = 200;

// Gerador de componente válido: inteiro em [MIN_COMPONENTE, MAX_COMPONENTE].
const componenteArb = fc.integer({ min: MIN_COMPONENTE, max: MAX_COMPONENTE });

// Gerador de objeto de versão válido.
const versaoObjArb = fc.record({
  major: componenteArb,
  minor: componenteArb,
  patch: componenteArb,
});

describe('Feature: adequacao-diretrizes-cemig, Property 10: Round-trip e incremento de versão semântica', () => {
  test('round-trip format∘parse: format(parse(s)) === s', () => {
    fc.assert(
      fc.property(versaoObjArb, (v) => {
        const s = `${v.major}.${v.minor}.${v.patch}`;
        expect(format(parse(s))).toBe(s);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('round-trip parse∘format: parse(format(v)) é igual a v', () => {
    fc.assert(
      fc.property(versaoObjArb, (v) => {
        expect(parse(format(v))).toEqual(v);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('incrementMajor: +1 em MAJOR e zera MINOR/PATCH, dentro dos limites', () => {
    fc.assert(
      fc.property(
        // major restrito para que major+1 permaneça ≤ MAX_COMPONENTE
        fc.record({
          major: fc.integer({ min: MIN_COMPONENTE, max: MAX_COMPONENTE - 1 }),
          minor: componenteArb,
          patch: componenteArb,
        }),
        (v) => {
          const r = incrementMajor(v);
          expect(r.major).toBe(v.major + 1);
          expect(r.minor).toBe(0);
          expect(r.patch).toBe(0);
          expect(componenteValido(r.major)).toBe(true);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  test('incrementMinor: +1 em MINOR, zera PATCH e preserva MAJOR, dentro dos limites', () => {
    fc.assert(
      fc.property(
        fc.record({
          major: componenteArb,
          minor: fc.integer({ min: MIN_COMPONENTE, max: MAX_COMPONENTE - 1 }),
          patch: componenteArb,
        }),
        (v) => {
          const r = incrementMinor(v);
          expect(r.major).toBe(v.major);
          expect(r.minor).toBe(v.minor + 1);
          expect(r.patch).toBe(0);
          expect(componenteValido(r.minor)).toBe(true);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  test('incrementPatch: +1 em PATCH e preserva MAJOR/MINOR, dentro dos limites', () => {
    fc.assert(
      fc.property(
        fc.record({
          major: componenteArb,
          minor: componenteArb,
          patch: fc.integer({ min: MIN_COMPONENTE, max: MAX_COMPONENTE - 1 }),
        }),
        (v) => {
          const r = incrementPatch(v);
          expect(r.major).toBe(v.major);
          expect(r.minor).toBe(v.minor);
          expect(r.patch).toBe(v.patch + 1);
          expect(componenteValido(r.patch)).toBe(true);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  test('respeito aos limites: incremento no valor máximo (999999) é rejeitado', () => {
    fc.assert(
      fc.property(componenteArb, componenteArb, (minor, patch) => {
        // MAJOR no limite: major+1 ultrapassa MAX_COMPONENTE
        expect(() => incrementMajor({ major: MAX_COMPONENTE, minor, patch })).toThrow();
      }),
      { numRuns: NUM_RUNS }
    );
    fc.assert(
      fc.property(componenteArb, componenteArb, (major, patch) => {
        expect(() => incrementMinor({ major, minor: MAX_COMPONENTE, patch })).toThrow();
      }),
      { numRuns: NUM_RUNS }
    );
    fc.assert(
      fc.property(componenteArb, componenteArb, (major, minor) => {
        expect(() => incrementPatch({ major, minor, patch: MAX_COMPONENTE })).toThrow();
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('respeito aos limites: parse rejeita componentes fora de [0, 999999]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_COMPONENTE + 1, max: MAX_COMPONENTE + 1_000_000 }),
        componenteArb,
        componenteArb,
        (foraMajor, minor, patch) => {
          expect(() => parse(`${foraMajor}.${minor}.${patch}`)).toThrow();
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
