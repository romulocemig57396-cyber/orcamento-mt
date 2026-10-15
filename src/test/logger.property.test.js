import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  montarEntrada,
  nivelValido,
  NIVEIS,
  criarLogger,
} from '../observabilidade/logger.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Feature: adequacao-diretrizes-cemig, Property 8: Estrutura obrigatória do log

   Validates: Requirements 10.1

   Para qualquer evento operacional registrado, o log estruturado emitido contém
   carimbo de tempo em UTC (ISO 8601 com sufixo "Z"), nível de severidade válido
   (DEBUG, INFO, WARN, ERROR), identificador de correlação e identificador do
   componente de origem.
   ───────────────────────────────────────────────────────────────────────────── */

// No mínimo 100 iterações por teste de propriedade (Testing Strategy do design).
const NUM_RUNS = 200;

// Regex ISO 8601 em UTC: termina obrigatoriamente com "Z" (sem offset numérico).
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

// Gerador de nível arbitrário: às vezes um nível válido, às vezes qualquer
// string/valor inválido (para exercitar a normalização).
const nivelArb = fc.oneof(
  fc.constantFrom(...NIVEIS),
  fc.string(),
  fc.constantFrom('info', 'debug', 'TRACE', 'FATAL', '', 'warn'),
  fc.constant(undefined),
  fc.constant(null),
);

// Gerador de evento operacional aleatório.
const eventoArb = fc.record({
  nivel: nivelArb,
  mensagem: fc.string(),
  correlacaoId: fc.string({ minLength: 1 }),
  componente: fc.string({ minLength: 1 }),
});

// Verifica a estrutura obrigatória de uma entrada de log.
const assertEstruturaObrigatoria = (entrada, evento) => {
  // Carimbo de tempo em UTC (ISO 8601 com Z).
  expect(typeof entrada.timestamp).toBe('string');
  expect(entrada.timestamp).toMatch(ISO_UTC);
  // Confirma que o timestamp representa um instante UTC válido e preservado.
  const dt = new Date(entrada.timestamp);
  expect(Number.isNaN(dt.getTime())).toBe(false);
  expect(dt.toISOString()).toBe(entrada.timestamp);

  // Nível de severidade válido (normalizado quando a entrada era inválida).
  expect(nivelValido(entrada.nivel)).toBe(true);
  expect(NIVEIS).toContain(entrada.nivel);
  if (nivelValido(evento.nivel)) {
    expect(entrada.nivel).toBe(evento.nivel);
  }

  // Identificador de correlação presente.
  expect(entrada.correlacaoId).toBeDefined();
  expect(typeof entrada.correlacaoId).toBe('string');

  // Identificador do componente de origem presente.
  expect(entrada.componente).toBeDefined();
  expect(typeof entrada.componente).toBe('string');
};

describe('Feature: adequacao-diretrizes-cemig, Property 8: Estrutura obrigatória do log', () => {
  test('montarEntrada sempre produz timestamp UTC, nível válido, correlacaoId e componente', () => {
    fc.assert(
      fc.property(eventoArb, (evento) => {
        const entrada = montarEntrada(evento);
        assertEstruturaObrigatoria(entrada, evento);
        // Os identificadores fornecidos são preservados na entrada.
        expect(entrada.correlacaoId).toBe(evento.correlacaoId);
        expect(entrada.componente).toBe(evento.componente);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('montarEntrada normaliza nível inválido para um nível válido (INFO)', () => {
    const nivelInvalidoArb = fc
      .oneof(fc.string(), fc.constant(undefined), fc.constant(null))
      .filter((n) => !nivelValido(n));

    fc.assert(
      fc.property(nivelInvalidoArb, fc.string(), (nivel, mensagem) => {
        const entrada = montarEntrada({ nivel, mensagem, correlacaoId: 'c', componente: 'k' });
        expect(nivelValido(entrada.nivel)).toBe(true);
        expect(entrada.nivel).toBe('INFO');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('criarLogger emite entrada com estrutura obrigatória para qualquer nível', () => {
    fc.assert(
      fc.property(eventoArb, (evento) => {
        // Sink de captura: coleta a entrada efetivamente emitida.
        let capturada = null;
        const logger = criarLogger({
          componente: evento.componente,
          correlacaoId: evento.correlacaoId,
          sink: (entrada) => {
            capturada = entrada;
          },
        });

        const retornada = logger.log(evento.nivel, evento.mensagem);

        // A entrada retornada e a entrada emitida ao sink são a mesma.
        expect(retornada).toBe(capturada);
        assertEstruturaObrigatoria(capturada, evento);
        expect(capturada.correlacaoId).toBe(evento.correlacaoId);
        expect(capturada.componente).toBe(evento.componente);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('criarLogger: atalhos de nível (debug/info/warn/error) sempre têm estrutura válida', () => {
    const atalhoArb = fc.constantFrom('debug', 'info', 'warn', 'error');

    fc.assert(
      fc.property(
        atalhoArb,
        fc.string(),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (atalho, mensagem, correlacaoId, componente) => {
          let capturada = null;
          const logger = criarLogger({
            componente,
            correlacaoId,
            sink: (entrada) => {
              capturada = entrada;
            },
          });

          logger[atalho](mensagem);

          expect(capturada.nivel).toBe(atalho.toUpperCase());
          assertEstruturaObrigatoria(capturada, { nivel: atalho.toUpperCase() });
          expect(capturada.correlacaoId).toBe(correlacaoId);
          expect(capturada.componente).toBe(componente);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
