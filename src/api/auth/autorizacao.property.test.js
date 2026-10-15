/* ─────────────────────────────────────────────────────────────────────────────
   autorizacao.property.test.js — teste de propriedade da negação por padrão

   Feature: adequacao-diretrizes-cemig, Property 4: Negação por padrão
   preservando o estado

   Validates: Requirements 1.6, 2.2, 2.3, 2.4

   Para qualquer par (papel, operação) em que a operação não esteja
   explicitamente nas permissões do papel — incluindo o caso de sessão sem
   nenhum papel mapeável —, a operação é negada e o estado dos dados permanece
   inalterado.

   Estratégia:
     1) Decisão pura (`decidirAutorizacao`): geramos sessões arbitrárias
        (conjuntos de permissões/papéis arbitrários, incluindo vazio, e sessão
        ausente/sem papel) e rotas com `permissao` exigida arbitrária. A
        propriedade de referência é: concede SSE há papel mapeado E a permissão
        exigida está nas permissões da sessão; em qualquer outro caso, nega.

     2) Preservação de estado (integração com `criarRoteador`): instalamos um
        handler-espião (via vi.mock no barrel de handlers) que MUTA um
        armazenamento compartilhado. O roteador só despacha o handler após
        `autorizar` retornar sem lançar; logo, quando a decisão é de negação, o
        espião NÃO é invocado e o estado permanece inalterado. Confirmamos ambos
        os sentidos (nega → não muta; concede → muta).
   ───────────────────────────────────────────────────────────────────────────── */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Armazenamento compartilhado observável pelo handler-espião. A referência é
// estável porque o módulo factory abaixo a captura por closure.
const estado = { gravacoes: 0, ultimo: null };
const espiao = vi.fn((req) => {
  // Efeito colateral que representa "mutação do estado dos dados".
  estado.gravacoes += 1;
  estado.ultimo = req?.caminho ?? null;
  return { status: 200, headers: {}, corpo: { ok: true } };
});

// Substitui TODOS os handlers do barrel pelo mesmo espião. Assim, qualquer rota
// protegida que chegue ao despacho invoca o espião (e muta `estado`).
vi.mock('../handlers/index.js', () => {
  const h = (req) => espiao(req);
  return {
    health: h,
    listarOrcamentos: h,
    obterOrcamento: h,
    gravarOrcamento: h,
    removerOrcamento: h,
    registrarSolicitacaoTitular: h,
  };
});

const { decidirAutorizacao, AUTORIZACAO } = await import('./autorizacao.js');
const { criarAutorizador } = await import('./autorizacao.js');
const { criarRoteador } = await import('../roteador.js');
const { CONTRATO } = await import('../contrato.js');

// No mínimo 100 iterações por teste de propriedade (Testing Strategy do design).
const NUM_RUNS = 300;

// ─── Geradores ──────────────────────────────────────────────────────────────

// Universo pequeno de permissões para forçar interseções e ausências.
const permissaoArb = fc.constantFrom(
  'orcamentos:ler',
  'orcamentos:gravar',
  'orcamentos:remover',
  'titular:registrar',
  'relatorios:exportar',
);

const papelArb = fc.constantFrom('leitor', 'editor', 'admin', 'auditor', 'guest');

// Permissão exigida pela rota: um valor arbitrário do universo (string não
// vazia) — a rota do contrato sempre declara uma permissão explícita.
const permissaoExigidaArb = permissaoArb;

// Sessão arbitrária: papéis e permissões podem ser vazios; oid opcional.
const sessaoArb = fc.record({
  papeis: fc.uniqueArray(papelArb),
  permissoes: fc.uniqueArray(permissaoArb),
  oid: fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: undefined }),
});

// Sessão possivelmente ausente/inválida (R1.6): null, undefined ou objeto.
const sessaoOuAusenteArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  sessaoArb,
);

// Rota mínima do contrato com permissão exigida arbitrária.
const rotaArb = fc.record({
  metodo: fc.constantFrom('GET', 'PUT', 'DELETE', 'POST'),
  caminho: fc.constantFrom(
    '/api/orcamentos',
    '/api/orcamentos/{id}',
    '/api/titular/solicitacoes',
  ),
  permissao: permissaoExigidaArb,
});

// ─── Especificação de referência (independente da implementação) ─────────────

/**
 * Deve conceder SSE: a rota declara permissão explícita, há sessão objeto, há
 * pelo menos um papel mapeado, e a permissão exigida está nas permissões.
 */
function deveConceder(rota, sessao) {
  const permissao =
    rota && typeof rota.permissao === 'string' && rota.permissao.length > 0
      ? rota.permissao
      : null;
  if (permissao === null) return false;
  if (!sessao || typeof sessao !== 'object') return false;
  const papeis = Array.isArray(sessao.papeis) ? sessao.papeis : [];
  if (papeis.length === 0) return false;
  const permissoes = Array.isArray(sessao.permissoes) ? sessao.permissoes : [];
  return permissoes.includes(permissao);
}

// ─── Propriedade (parte 1): decisão pura ──────────────────────────────────────

describe('Feature: adequacao-diretrizes-cemig, Property 4: Negação por padrão preservando o estado', () => {
  test('concede SSE há papel e a permissão exigida está nas permissões; caso contrário nega', () => {
    fc.assert(
      fc.property(rotaArb, sessaoOuAusenteArb, (rota, sessao) => {
        const decisao = decidirAutorizacao(rota, sessao);
        const esperadoConcede = deveConceder(rota, sessao);

        expect(decisao.concedido).toBe(esperadoConcede);

        if (esperadoConcede) {
          expect(decisao.codigo).toBe(AUTORIZACAO.CONCEDIDO);
        } else {
          // Negação por padrão: nunca concede. O código deve ser uma das
          // negações padronizadas e nunca CONCEDIDO.
          expect(decisao.codigo).not.toBe(AUTORIZACAO.CONCEDIDO);
          expect([
            AUTORIZACAO.SEM_AUTORIZACAO_APP, // R1.6 sessão ausente
            AUTORIZACAO.SEM_PERMISSOES, // R2.4 sem papel mapeável
            AUTORIZACAO.ACESSO_NEGADO, // R2.2 papel sem permissão
            AUTORIZACAO.CONTRATO_INVALIDO, // R2.3 rota sem permissão explícita
          ]).toContain(decisao.codigo);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('sessão sem nenhum papel mapeável é sempre negada (R2.4), inclusive com permissões "soltas"', () => {
    const sessaoSemPapelArb = fc.record({
      papeis: fc.constant([]),
      permissoes: fc.uniqueArray(permissaoArb),
      oid: fc.option(fc.string({ maxLength: 8 }), { nil: undefined }),
    });
    fc.assert(
      fc.property(rotaArb, sessaoSemPapelArb, (rota, sessao) => {
        const decisao = decidirAutorizacao(rota, sessao);
        expect(decisao.concedido).toBe(false);
        expect(decisao.codigo).toBe(AUTORIZACAO.SEM_PERMISSOES);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // ─── Propriedade (parte 2): preservação de estado via roteador ──────────────

  beforeEach(() => {
    espiao.mockClear();
    estado.gravacoes = 0;
    estado.ultimo = null;
  });

  test('na negação, o handler não é invocado e o estado permanece inalterado; na concessão, o handler roda', () => {
    const despachar = criarRoteador({
      // Anexa a sessão arbitrária gerada à requisição, simulando a autenticação.
      validarToken: (req) => req.sessao,
      resolverSessao: (_req, sessaoParcial) => sessaoParcial,
      autorizar: criarAutorizador(),
    });

    // Mapa caminho do contrato → permissão exigida real (para gerar sessões que
    // às vezes concedem e às vezes negam).
    const rotasProtegidas = CONTRATO.filter((r) => !r.publica);

    return fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...rotasProtegidas),
        sessaoOuAusenteArb,
        async (rotaContrato, sessao) => {
          espiao.mockClear();
          estado.gravacoes = 0;
          estado.ultimo = null;

          const req = {
            metodo: rotaContrato.metodo,
            caminho:
              rotaContrato.caminho.replace('{id}', 'abc-123'),
            query: {},
            headers: {},
            corpo: null,
            sessao: sessao ?? null,
          };

          const resposta = await despachar(req);

          // A rota do contrato é a autoridade sobre a permissão exigida.
          const esperadoConcede = deveConceder(
            { permissao: rotaContrato.permissao },
            sessao,
          );

          if (esperadoConcede) {
            // Concedido: o handler-espião roda exatamente uma vez e muta o estado.
            expect(espiao).toHaveBeenCalledTimes(1);
            expect(estado.gravacoes).toBe(1);
            expect(resposta.status).toBe(200);
          } else {
            // Negado: o handler NUNCA é invocado; o estado permanece intacto.
            expect(espiao).not.toHaveBeenCalled();
            expect(estado.gravacoes).toBe(0);
            expect(estado.ultimo).toBe(null);
            expect(resposta.status).toBe(403);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
