import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  criarDocumentoOrcamento,
  normalizarDocumentoOrcamento,
  extrairDados,
} from '../persistencia/modelo';
import { migrarOrcamento } from '../utils/migracao';
import { calcularTotaisItens, calcularRateioERD, calcularMaterialServicos } from '../utils/calculos';

/* ─────────────────────────────────────────────────────────────────────────────
   Feature: adequacao-diretrizes-cemig, Property 6: Preservação dos dados e
   cálculos na migração

   Validates: Requirements 5.4

   Para qualquer orçamento válido:
   (a) serializar e desserializar pelo caminho de persistência gerenciada
       reproduz um orçamento equivalente (round-trip);
   (b) aplicar a migração de schema é idempotente;
   (c) os invariantes dos cálculos financeiros preservados pela lógica atual
       continuam válidos: PFC do cliente nunca negativa; o ERD coberto nunca
       excede o mínimo entre ERD disponível, parcela regulatória e PFC antes do
       ERD; e os totais derivados (material 60% / serviços 40% do total da obra)
       permanecem consistentes com o total da obra.

   Estratégia: geramos orçamentos realistas com itensObra variados (categoria em
   ctc/pp/parcela_reg/cti, valor, percentualCemig, diferencaCabo, anoReferencia
   em formatos antigos e novos), ERD/MUSD, datas em formato antigo (ISO completo)
   e novo (AAAA-MM-DD), tipoAtendimento por extenso e por código, além dos campos
   descontinuados (obrasVinculadas, materiaisAuxiliares) para exercitar a
   migração. As asserções não dependem da versão exata do schema, apenas da
   equivalência e dos invariantes universais.
   ───────────────────────────────────────────────────────────────────────────── */

// No mínimo 100 iterações por teste de propriedade (Testing Strategy do design).
const NUM_RUNS = 200;

// Tolerância para comparações de ponto flutuante nos invariantes financeiros.
const EPS = 1e-6;

const CATEGORIAS = ['ctc', 'pp', 'parcela_reg', 'cti'];

// Chaves de referência conhecidas (biblioteca) e formatos antigos (número/ano
// como texto) que a migração normaliza.
const anoReferenciaArb = fc.oneof(
  fc.constantFrom('2026-10', '2024', '2022', '2021'),
  fc.constantFrom(2024, 2022, 2021),           // número (orçamento antigo)
  fc.constantFrom('', null, undefined),         // ausente — item mantido como está
);

// Valor monetário não negativo com no máximo 2 casas, em escala realista.
const valorArb = fc
  .integer({ min: 0, max: 5_000_00 })
  .map((centavos) => centavos / 100);

// Item de obra realista. `diferencaCabo` nunca precisa ser coerente: a lógica
// de calculos (diferencaDoItem) já a limita a [0, valor].
const itemObraArb = fc.record({
  categoria: fc.constantFrom(...CATEGORIAS),
  valor: valorArb,
  percentualCemig: fc.integer({ min: 0, max: 100 }),
  diferencaCabo: fc.oneof(valorArb, fc.constant(0)),
  anoReferencia: anoReferenciaArb,
  descricao: fc.string({ maxLength: 20 }),
  quantidade: fc.integer({ min: 0, max: 50 }),
  unidade: fc.constantFrom('km', 'poste', 'un', undefined),
});

// Data em formato antigo (ISO completo) ou novo (AAAA-MM-DD).
const dataArb = fc.oneof(
  fc.constantFrom('2025-01-01', '2026-05-10', '2024-12-31'),
  fc.constantFrom('2025-01-01T00:00:00.000Z', '2026-05-10T03:00:00.000Z'),
  fc.constantFrom('', null, undefined),
);

const tipoAtendimentoArb = fc.constantFrom(
  'LN', 'AC', 'RF',
  'Ligação Nova', 'Aumento de Carga', 'Reforma',
  '', undefined,
);

// Orçamento válido, com campos descontinuados opcionais para exercitar a
// migração (obrasVinculadas → raiz; materiaisAuxiliares removido).
const orcamentoArb = fc.record(
  {
    cliente: fc.string({ maxLength: 24 }),
    ns: fc.string({ maxLength: 10 }),
    tipoAtendimento: tipoAtendimentoArb,
    itensObra: fc.array(itemObraArb, { minLength: 0, maxLength: 12 }),
    erd: fc.oneof(valorArb, fc.constant(0)),
    musd: fc.integer({ min: -100, max: 500 }),
    dataBase: dataArb,
    dataValidade: dataArb,
    temObrasVinculadas: fc.boolean(),
    obrasVinculadas: fc.option(
      fc.record({ temObrasVinculadas: fc.boolean() }),
      { nil: undefined }
    ),
    materiaisAuxiliares: fc.option(
      fc.array(fc.record({ nome: fc.string({ maxLength: 10 }), valor: valorArb })),
      { nil: undefined }
    ),
  },
  { requiredKeys: ['itensObra', 'erd'] }
);

describe('Feature: adequacao-diretrizes-cemig, Property 6: Preservação dos dados e cálculos na migração', () => {
  // (a) Round-trip: serializar/desserializar pelo caminho de persistência
  // gerenciada reproduz um orçamento equivalente ao orçamento migrado.
  test('(a) round-trip de serialização preserva os dados do orçamento', () => {
    fc.assert(
      fc.property(orcamentoArb, (orc) => {
        const doc = criarDocumentoOrcamento(orc);
        const extraido = extrairDados(doc);
        // O caminho gerenciado nunca "inventa" nem perde dados além do que a
        // própria migração de schema faz; equivalente a migrar o orçamento.
        expect(extraido).toEqual(migrarOrcamento(orc));
      }),
      { numRuns: NUM_RUNS }
    );
  });

  // (a) O round-trip sobrevive a uma serialização JSON real (persistência).
  // JSON descarta chaves com valor `undefined`; a baseline usa o mesmo orçamento
  // após passar pelo JSON, isolando o round-trip da serialização gerenciada.
  test('(a) round-trip através de JSON reproduz orçamento equivalente', () => {
    fc.assert(
      fc.property(orcamentoArb, (orc) => {
        const orcViaJson = JSON.parse(JSON.stringify(orc));
        const doc = criarDocumentoOrcamento(orcViaJson);
        const relido = JSON.parse(JSON.stringify(doc));
        const extraido = extrairDados(relido);
        expect(extraido).toEqual(migrarOrcamento(orcViaJson));
      }),
      { numRuns: NUM_RUNS }
    );
  });

  // (b) Idempotência: aplicar a migração de schema duas vezes é igual a aplicá-la
  // uma vez — tanto diretamente quanto via normalização do documento.
  test('(b) migrarOrcamento é idempotente', () => {
    fc.assert(
      fc.property(orcamentoArb, (orc) => {
        const umaVez = migrarOrcamento(orc);
        const duasVezes = migrarOrcamento(migrarOrcamento(orc));
        expect(duasVezes).toEqual(umaVez);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('(b) normalizar o documento repetidamente converge (dados estáveis)', () => {
    fc.assert(
      fc.property(orcamentoArb, (orc) => {
        const doc1 = normalizarDocumentoOrcamento(criarDocumentoOrcamento(orc));
        const doc2 = normalizarDocumentoOrcamento(doc1);
        expect(doc2.dados).toEqual(doc1.dados);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  // (c) Invariantes financeiros preservados pela lógica atual continuam válidos
  // após a migração: calculamos sobre o orçamento migrado.
  test('(c) invariantes financeiros preservados após a migração', () => {
    fc.assert(
      fc.property(orcamentoArb, (orc) => {
        const migrado = migrarOrcamento(orc);
        const itensObra = migrado.itensObra || [];
        const totais = calcularTotaisItens(itensObra);
        const { totalObra, ctcTotal, ppTotal, parcelaRegTotal } = totais;

        const rateio = calcularRateioERD({
          totalObra,
          ctcTotal,
          ppTotal,
          parcelaRegTotal,
          erd: migrado.erd,
        });

        const erdDisponivel = parseFloat(migrado.erd) || 0;
        const pfcAntesERD = totalObra - ctcTotal - ppTotal;

        // Invariante 1: PFC do cliente nunca é negativa.
        expect(rateio.pfcCliente).toBeGreaterThanOrEqual(0);

        // Invariante 2: o ERD coberto nunca excede o mínimo entre ERD
        // disponível, parcela regulatória e PFC antes do ERD.
        const limite = Math.min(erdDisponivel, parcelaRegTotal, pfcAntesERD);
        expect(rateio.parcelaRegCobertaERD).toBeLessThanOrEqual(Math.max(0, limite) + EPS);
        expect(rateio.parcelaRegCobertaERD).toBeGreaterThanOrEqual(0);

        // Invariante 3: os totais derivados (material 60% / serviços 40% do
        // total da obra) permanecem consistentes com o total da obra.
        const { material, servicos } = calcularMaterialServicos(totalObra);
        expect(material + servicos).toBeCloseTo(totalObra, 6);
        expect(material).toBeCloseTo(totalObra * 0.6, 6);
        expect(servicos).toBeCloseTo(totalObra * 0.4, 6);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  // (c) Invariantes financeiros valem igualmente antes e depois da migração: a
  // migração não altera os campos que alimentam os cálculos financeiros.
  test('(c) a migração não altera os totais financeiros do orçamento', () => {
    fc.assert(
      fc.property(orcamentoArb, (orc) => {
        const antes = calcularTotaisItens(orc.itensObra || []);
        const depois = calcularTotaisItens(migrarOrcamento(orc).itensObra || []);
        expect(depois.totalObra).toBeCloseTo(antes.totalObra, 6);
        expect(depois.ctcTotal).toBeCloseTo(antes.ctcTotal, 6);
        expect(depois.ppTotal).toBeCloseTo(antes.ppTotal, 6);
        expect(depois.parcelaRegTotal).toBeCloseTo(antes.parcelaRegTotal, 6);
        expect(depois.ctiTotal).toBeCloseTo(antes.ctiTotal, 6);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
