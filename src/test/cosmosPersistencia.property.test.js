/* ─────────────────────────────────────────────────────────────────────────────
   cosmosPersistencia.property.test.js — teste de propriedade da atomicidade da
   gravação de orçamento (R5.4)

   Feature: adequacao-diretrizes-cemig, Property 5: Atomicidade da gravação de
   orçamento

   Validates: Requirements 5.4

   Para qualquer estado de orçamento e qualquer ponto de falha injetado durante a
   gravação no armazenamento gerenciado, após a falha o estado persistido é igual
   ao estado anterior, sem gravação parcial.

   Estratégia:
   - Geramos orçamentos aleatórios (criação e atualização) e um container Cosmos
     FAKE em memória, injetado por DI, cujo contrato reproduz o subconjunto do SDK
     usado por `gravarOrcamento`:
         container.item(id, partitionKey).read()/delete()
         container.items.upsert(documento)
   - O fake pode falhar em pontos ARBITRÁRIOS da gravação (na leitura do estado
     anterior ou no upsert), controlado por geradores.
   - Snapshot profundo do store ANTES da gravação e comparação APÓS a gravação:
       • em FALHA, o store permanece byte-a-byte idêntico (sem gravação parcial) e
         o resultado é um erro estruturado;
       • em SUCESSO, o store reflete a gravação completa (documento presente na
         partição do ambiente, com os dados fornecidos).
   ───────────────────────────────────────────────────────────────────────────── */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { gravarOrcamento, ERRO } from '../api/persistencia/cosmos.js';
import { AMBIENTES } from '../persistencia/modelo.js';

// No mínimo 100 iterações por teste de propriedade (Testing Strategy do design).
const NUM_RUNS = 300;

/** Erro que imita o 404 do SDK Cosmos (item inexistente). */
const erroNaoEncontrado = () => Object.assign(new Error('not found'), { code: 404 });

/** Snapshot profundo e estável do store (independente de ordem de inserção). */
const snapshot = (store) => {
  const entradas = [...store.entries()]
    .map(([k, v]) => [k, JSON.stringify(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(entradas);
};

/**
 * Container fake em memória com injeção de falha em pontos arbitrários.
 * A chave de armazenamento é `${ambiente}::${id}` para enxergar a partição (R5.3).
 *
 * @param {Object} cfg
 * @param {Map} cfg.store              Store compartilhado (pré-populável).
 * @param {boolean} [cfg.falharRead]   read() lança erro real (não 404).
 * @param {boolean} [cfg.falharUpsert] upsert() lança (falha de gravação).
 */
const criarContainerFake = ({ store, falharRead = false, falharUpsert = false }) => {
  const chave = (id, pk) => `${pk}::${id}`;
  return {
    item(id, partitionKey) {
      return {
        async read() {
          if (falharRead) throw new Error('falha simulada de leitura');
          const doc = store.get(chave(id, partitionKey));
          if (!doc) throw erroNaoEncontrado();
          return { resource: doc };
        },
        async delete() {
          const k = chave(id, partitionKey);
          if (!store.has(k)) throw erroNaoEncontrado();
          store.delete(k);
          return { resource: undefined };
        },
      };
    },
    items: {
      async upsert(documento) {
        if (falharUpsert) throw new Error('falha simulada de gravação');
        store.set(chave(documento.id, documento.ambiente), documento);
        return { resource: documento };
      },
    },
  };
};

// ─── Geradores ──────────────────────────────────────────────────────────────

const ambienteArb = fc.constantFrom(...AMBIENTES);

// Estado de orçamento arbitrário (formato do app). Mantido simples porém variado.
const orcamentoArb = fc.record({
  cliente: fc.string({ maxLength: 20 }),
  ns: fc.string({ maxLength: 12 }),
  totalObra: fc.double({ min: 0, max: 1e6, noNaN: true }),
  itensObra: fc.array(
    fc.record({
      categoria: fc.constantFrom('ctc', 'pp', 'erd'),
      valor: fc.double({ min: 0, max: 1e5, noNaN: true }),
      percentualCemig: fc.integer({ min: 0, max: 100 }),
    }),
    { maxLength: 5 },
  ),
});

// Ponto de falha injetado durante a gravação.
const pontoFalhaArb = fc.constantFrom('nenhum', 'read', 'upsert');

// ─── Propriedade ─────────────────────────────────────────────────────────────

describe('Feature: adequacao-diretrizes-cemig, Property 5: Atomicidade da gravação de orçamento', () => {
  test('em falha, o store permanece idêntico ao estado anterior (sem gravação parcial); em sucesso, reflete a gravação completa', () => {
    fc.assert(
      fc.asyncProperty(
        ambienteArb,
        orcamentoArb,
        pontoFalhaArb,
        // atualizacao=true grava um documento prévio e usa seu id (caminho de update).
        fc.boolean(),
        async (ambiente, orcamento, pontoFalha, atualizacao) => {
          const store = new Map();
          const chave = (id, pk) => `${pk}::${id}`;

          // Pré-popular com um estado anterior quando for atualização.
          let id;
          if (atualizacao) {
            const containerBom = criarContainerFake({ store });
            const criacao = await gravarOrcamento({
              container: containerBom,
              ambiente,
              orcamento: { ...orcamento, cliente: 'ESTADO-ANTERIOR' },
            });
            expect(criacao.ok).toBe(true);
            id = criacao.valor.documento.id;
          }

          // Snapshot do estado ANTERIOR à gravação sob teste.
          const antes = snapshot(store);

          // Container com o ponto de falha injetado.
          const container = criarContainerFake({
            store,
            falharRead: pontoFalha === 'read',
            falharUpsert: pontoFalha === 'upsert',
          });

          const res = await gravarOrcamento({
            container,
            ambiente,
            orcamento: { ...orcamento, cliente: 'NOVO-ESTADO' },
            meta: id ? { id } : {},
          });

          // A leitura do estado anterior só ocorre em ATUALIZAÇÃO (meta.id presente).
          // Numa CRIAÇÃO, injetar falha de read nunca é exercido — o caminho segue
          // para o upsert e conclui com sucesso. Classificamos esse caso como sucesso.
          const falhaEfetiva =
            pontoFalha === 'upsert' || (pontoFalha === 'read' && atualizacao);

          if (!falhaEfetiva) {
            // SUCESSO: resultado ok e o store reflete a gravação completa.
            expect(res.ok).toBe(true);
            const persistido = store.get(chave(res.valor.documento.id, ambiente));
            expect(persistido).toBeTruthy();
            expect(persistido.dados.cliente).toBe('NOVO-ESTADO');
            expect(persistido.ambiente).toBe(ambiente);
            if (atualizacao) {
              // Atualização reaproveita o mesmo id (sem documento órfão).
              expect(res.valor.documento.id).toBe(id);
            }
          } else {
            // FALHA: erro estruturado e NENHUMA alteração parcial no store.
            expect(res.ok).toBe(false);
            const codigoEsperado =
              pontoFalha === 'read' ? ERRO.FALHA_LEITURA : ERRO.FALHA_GRAVACAO;
            expect(res.codigo).toBe(codigoEsperado);
            // Estado persistido idêntico ao anterior, byte-a-byte.
            expect(snapshot(store)).toBe(antes);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  test('falha de read só é exercida em atualização; criação com upsert falho não grava nada', () => {
    fc.assert(
      fc.asyncProperty(ambienteArb, orcamentoArb, async (ambiente, orcamento) => {
        const store = new Map();
        const container = criarContainerFake({ store, falharUpsert: true });

        const res = await gravarOrcamento({ container, ambiente, orcamento });

        expect(res.ok).toBe(false);
        expect(res.codigo).toBe(ERRO.FALHA_GRAVACAO);
        // Criação abortada: store continua vazio (sem gravação parcial).
        expect(store.size).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
