import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  avaliarSessao,
  sessaoValida,
  LIMIAR_INATIVIDADE_MS,
} from '../api/auth/sessao.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Feature: adequacao-diretrizes-cemig, Property 2: Expiração de sessão por
   inatividade

   Validates: Requirements 1.4

   Para qualquer duração de inatividade `t`, a sessão permanece válida se
   `t < 30 min` e é encerrada (exigindo nova autenticação) se `t ≥ 30 min`.
   O limiar é fechado no lado da expiração (≥).

   Estratégia de geração:
   - `agora` é injetável; geramos um instante-base aleatório e derivamos a
     última atividade subtraindo a inatividade `t`, de modo que a inatividade
     observada seja exatamente `t`.
   - Geramos `t` em faixas que incluem valores em torno do limiar de 30 min
     (fronteira), além de faixas amplas abaixo e acima do limiar.
   ───────────────────────────────────────────────────────────────────────────── */

// No mínimo 100 iterações por teste de propriedade (Testing Strategy do design).
const NUM_RUNS = 300;

const LIMIAR = LIMIAR_INATIVIDADE_MS; // 30 min em ms

// Instante-base "agora" plausível (evita datas negativas em epoch ao subtrair t).
const agoraArb = fc.integer({ min: LIMIAR * 10, max: 4_102_444_800_000 }); // até ~2100

// Inatividade estritamente abaixo do limiar: [0, LIMIAR - 1].
const inatividadeValidaArb = fc.integer({ min: 0, max: LIMIAR - 1 });

// Inatividade igual ou acima do limiar: [LIMIAR, LIMIAR * 100].
const inatividadeExpiradaArb = fc.integer({ min: LIMIAR, max: LIMIAR * 100 });

// Faixa concentrada na fronteira (± poucos ms do limiar) para estressar o `≥`.
const inatividadeFronteiraArb = fc.integer({
  min: LIMIAR - 5,
  max: LIMIAR + 5,
});

// Qualquer inatividade não negativa (faixa ampla), para a propriedade geral.
const inatividadeQualquerArb = fc.integer({ min: 0, max: LIMIAR * 100 });

describe('Feature: adequacao-diretrizes-cemig, Property 2: Expiração de sessão por inatividade', () => {
  test('t < 30 min ⇒ sessão permanece válida (não exige nova autenticação)', () => {
    fc.assert(
      fc.property(agoraArb, inatividadeValidaArb, (agora, t) => {
        const sessao = { ultimaAtividade: agora - t };
        const r = avaliarSessao(sessao, { agora });
        expect(r.valida).toBe(true);
        expect(r.requerNovaAutenticacao).toBe(false);
        expect(r.inatividadeMs).toBe(t);
        expect(sessaoValida(sessao, { agora })).toBe(true);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('t ≥ 30 min ⇒ sessão encerrada (exige nova autenticação)', () => {
    fc.assert(
      fc.property(agoraArb, inatividadeExpiradaArb, (agora, t) => {
        const sessao = { ultimaAtividade: agora - t };
        const r = avaliarSessao(sessao, { agora });
        expect(r.valida).toBe(false);
        expect(r.requerNovaAutenticacao).toBe(true);
        expect(r.inatividadeMs).toBe(t);
        expect(sessaoValida(sessao, { agora })).toBe(false);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('equivalência exata: válida ⇔ t < 30 min (incluindo a fronteira)', () => {
    fc.assert(
      fc.property(agoraArb, inatividadeQualquerArb, (agora, t) => {
        const sessao = { ultimaAtividade: agora - t };
        const valida = sessaoValida(sessao, { agora });
        // sse: válida se e somente se a inatividade for estritamente < limiar.
        expect(valida).toBe(t < LIMIAR);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('limiar fechado em ≥: na fronteira, válida ⇔ t < 30 min', () => {
    fc.assert(
      fc.property(agoraArb, inatividadeFronteiraArb, (agora, t) => {
        const sessao = { ultimaAtividade: agora - t };
        const r = avaliarSessao(sessao, { agora });
        expect(r.valida).toBe(t < LIMIAR);
        expect(r.requerNovaAutenticacao).toBe(t >= LIMIAR);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('casos exatos da fronteira: t = limiar-1 válida; t = limiar e t = limiar+1 expiradas', () => {
    fc.assert(
      fc.property(agoraArb, (agora) => {
        expect(sessaoValida({ ultimaAtividade: agora - (LIMIAR - 1) }, { agora })).toBe(true);
        expect(sessaoValida({ ultimaAtividade: agora - LIMIAR }, { agora })).toBe(false);
        expect(sessaoValida({ ultimaAtividade: agora - (LIMIAR + 1) }, { agora })).toBe(false);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
