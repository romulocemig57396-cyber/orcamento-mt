import { describe, test, expect, vi } from 'vitest';
import fc from 'fast-check';
import { validarTokenNucleo } from '../api/auth/validarToken.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Feature: adequacao-diretrizes-cemig, Property 1: Validação de token aceita
   apenas tokens íntegros

   Validates: Requirements 1.2, 1.3

   Para qualquer token de identidade, a API estabelece sessão se, e somente se,
   emissor, audiência, assinatura e expiração forem todos válidos; qualquer
   alteração em um desses campos resulta em recusa (ok === false e sessão nula).

   A resolução de JWKS e a verificação de assinatura são injetadas como mocks —
   o ponto de extensão exigido pelo design — para exercitar a lógica sem rede
   nem criptografia real.
   ───────────────────────────────────────────────────────────────────────────── */

// No mínimo 100 iterações por teste de propriedade (Testing Strategy do design).
const NUM_RUNS = 200;

const EMISSOR = 'https://login.microsoftonline.com/tenant-123/v2.0';
const AUDIENCIA = 'api://orcamento-mt';
const AGORA_MS = 1_700_000_000_000; // relógio fixo
const AGORA_S = Math.floor(AGORA_MS / 1000);

/** Codifica um objeto em base64url (sem padding), como um segmento de JWT. */
function b64url(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Marca de assinatura "válida"; qualquer outro valor é tratado como inválido. */
const ASSINATURA_VALIDA = 'assinatura-valida';

/**
 * Monta um JWT estrutural a partir de um "molde" de campos. Cada aspecto pode
 * ser íntegro ou adulterado de forma independente.
 * @param {{ issValido:boolean, audValida:boolean, expValido:boolean, assinaturaValida:boolean,
 *           kid:string, oid:string }} m
 */
function montarToken(m) {
  const header = { alg: 'RS256', kid: m.kid };
  const payload = {
    iss: m.issValido ? EMISSOR : `https://atacante.example/${m.kid}/v2.0`,
    aud: m.audValida ? AUDIENCIA : `api://outra-coisa-${m.kid}`,
    // exp expirado → antes de agora; válido → bem no futuro.
    exp: m.expValido ? AGORA_S + 3600 : AGORA_S - 3600,
    oid: m.oid,
    sub: `sub-${m.oid}`,
    groups: ['grupo-editores'],
  };
  const assinatura = m.assinaturaValida ? ASSINATURA_VALIDA : `adulterada-${m.kid}`;
  return `${b64url(header)}.${b64url(payload)}.${assinatura}`;
}

/** Config com dependências injetadas (mocks), sem rede nem cripto real. */
function configMock() {
  return {
    emissorEsperado: EMISSOR,
    audienciaEsperada: AUDIENCIA,
    agora: () => AGORA_MS,
    toleranciaRelogioS: 0,
    // JWKS sempre resolve: isolamos a validação da assinatura em verificarAssinatura.
    resolverJwks: vi.fn(async (kid) => ({ kty: 'RSA', kid })),
    // Assinatura é "válida" apenas quando o terceiro segmento é a marca conhecida.
    verificarAssinatura: vi.fn((token) => token.endsWith(`.${ASSINATURA_VALIDA}`)),
  };
}

// Gerador do molde de campos: cada aspecto é válido/adulterado de forma independente.
const moldeArb = fc.record({
  issValido: fc.boolean(),
  audValida: fc.boolean(),
  expValido: fc.boolean(),
  assinaturaValida: fc.boolean(),
  kid: fc.string({ minLength: 1, maxLength: 8 }).map((s) => s.replace(/\./g, '_') || 'k'),
  oid: fc.string({ minLength: 1, maxLength: 12 }).map((s) => s.replace(/\./g, '_') || 'u'),
});

describe('Feature: adequacao-diretrizes-cemig, Property 1: Validação de token aceita apenas tokens íntegros', () => {
  test('ok === true se, e somente se, emissor, audiência, exp e assinatura são todos válidos', async () => {
    await fc.assert(
      fc.asyncProperty(moldeArb, async (m) => {
        const todosValidos =
          m.issValido && m.audValida && m.expValido && m.assinaturaValida;

        const r = await validarTokenNucleo(montarToken(m), configMock());

        // Bicondicional: estabelece sessão sse o token é íntegro em todos os aspectos.
        expect(r.ok).toBe(todosValidos);

        if (todosValidos) {
          expect(r.sessao).not.toBeNull();
          expect(r.sessao).toMatchObject({ iss: EMISSOR, aud: AUDIENCIA });
          expect(r.motivo).toBeNull();
        } else {
          // Qualquer adulteração ⇒ recusa e sessão nula.
          expect(r.sessao).toBeNull();
          expect(r.motivo).not.toBeNull();
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('qualquer adulteração isolada (partindo de um token íntegro) resulta em recusa com sessão nula', async () => {
    const aspectos = ['issValido', 'audValida', 'expValido', 'assinaturaValida'];
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kid: fc.string({ minLength: 1, maxLength: 8 }).map((s) => s.replace(/\./g, '_') || 'k'),
          oid: fc.string({ minLength: 1, maxLength: 12 }).map((s) => s.replace(/\./g, '_') || 'u'),
          // qual aspecto adulterar
          alvo: fc.constantFrom(...aspectos),
        }),
        async ({ kid, oid, alvo }) => {
          const molde = {
            issValido: true,
            audValida: true,
            expValido: true,
            assinaturaValida: true,
            kid,
            oid,
          };
          // Sanidade: o token íntegro é aceito.
          const base = await validarTokenNucleo(montarToken(molde), configMock());
          expect(base.ok).toBe(true);

          // Adultera exatamente um aspecto → deve recusar.
          const adulterado = { ...molde, [alvo]: false };
          const r = await validarTokenNucleo(montarToken(adulterado), configMock());
          expect(r.ok).toBe(false);
          expect(r.sessao).toBeNull();
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
