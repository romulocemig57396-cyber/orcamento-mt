import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  anonimizar,
  pseudonimizar,
  ehPseudonimo,
  CHAVES_IDENTIFICADORAS_PADRAO,
  CHAVES_QUASE_IDENTIFICADORAS_PADRAO,
  MARCADOR_GENERALIZADO,
} from '../lgpd/anonimizar.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Feature: adequacao-diretrizes-cemig, Property 9: Anonimização impede
   reidentificação

   Validates: Requirements 11.3

   Para qualquer Dado_Pessoal originado de produção, a função de anonimização
   aplicada antes do uso em dev/hml produz uma saída da qual o titular não é
   reidentificável: a saída não contém o identificador original nem o sal, e não
   permite recompor o original. O pseudônimo é determinístico (idempotente sob o
   mesmo sal) e preserva integridade referencial — valores iguais geram
   pseudônimos iguais — sem revelar o valor de origem.

   Estratégia: geramos documentos aleatórios contendo identificadores diretos
   (cliente, ns, cpf, email, proprietarioOid etc.) com valores distintivos
   (prefixo fixo) para que a asserção de "não contém o original" seja confiável.
   Verificamos sobre a saída serializada: (a) nenhum identificador original
   aparece; (b) o sal não aparece; (c) reanonimizar com o mesmo sal não altera
   (idempotência); (d) valores iguais → pseudônimos iguais; (e) valores
   diferentes → pseudônimos diferentes (sem revelar o original).
   ───────────────────────────────────────────────────────────────────────────── */

// No mínimo 100 iterações por teste de propriedade (Testing Strategy do design).
const NUM_RUNS = 200;

// Serialização estável para inspecionar vazamento de valores na saída.
const serializar = (valor) =>
  JSON.stringify(valor, (_chave, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'function') return '[fn]';
    if (v === undefined) return '[undefined]';
    return v;
  });

// Alfabeto fixo para strings reproduzíveis (fast-check 4 não expõe
// alphanumericString no formato antigo).
const alnumArb = (min, max) =>
  fc
    .array(
      fc.constantFrom(
        'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p',
        'q','r','s','t','u','v','w','x','y','z','0','1','2','3','4','5',
        '6','7','8','9',
      ),
      { minLength: min, maxLength: max }
    )
    .map((chars) => chars.join(''));

// Sal distintivo: prefixo fixo + corpo aleatório — garante que a verificação de
// "o sal não aparece na saída" não falhe por coincidência trivial.
const salArb = alnumArb(8, 24).map((corpo) => `SAL_${corpo}`);

// Valor identificador distintivo: prefixo fixo garante que, se vazar, seja
// detectável de forma inequívoca na saída serializada.
const identificadorArb = alnumArb(3, 20).map((corpo) => `IDVAL_${corpo || 'x'}`);

// Chaves identificadoras diretas da lista padrão (foco do requisito).
const chaveIdentificadoraArb = fc.constantFrom(...CHAVES_IDENTIFICADORAS_PADRAO);

// Chaves quase-identificadoras (generalizadas).
const chaveQuaseArb = fc.constantFrom(...CHAVES_QUASE_IDENTIFICADORAS_PADRAO);

// Documento de produção com identificadores diretos conhecidos. Retorna o
// documento e a lista de valores de identificadores que não podem vazar.
const documentoProducaoArb = fc
  .array(fc.tuple(chaveIdentificadoraArb, identificadorArb), {
    minLength: 1,
    maxLength: 8,
  })
  .chain((paresId) =>
    fc.record({
      paresId: fc.constant(paresId),
      municipio: fc.constantFrom('Cuiabá', 'Várzea Grande', 'Rondonópolis'),
      valor: fc.integer({ min: 0, max: 1_000_000 }),
      aninhado: fc.array(
        fc.tuple(chaveIdentificadoraArb, identificadorArb),
        { minLength: 0, maxLength: 4 }
      ),
    })
  )
  .map(({ paresId, municipio, valor, aninhado }) => {
    const doc = { ambiente: 'prd', origemProducao: true, municipio, valor };
    const originais = [];
    for (const [chave, v] of paresId) {
      doc[chave] = v;
      originais.push(v);
    }
    const sub = {};
    for (const [chave, v] of aninhado) {
      sub[chave] = v;
      originais.push(v);
    }
    doc.detalhe = { ...sub, obs: 'livre' };
    doc.lista = aninhado.map(([chave, v]) => ({ [chave]: v }));
    return { doc, originais };
  });

describe('Feature: adequacao-diretrizes-cemig, Property 9: Anonimização impede reidentificação', () => {
  test('a saída anonimizada nunca contém o identificador original', () => {
    fc.assert(
      fc.property(documentoProducaoArb, salArb, ({ doc, originais }, sal) => {
        const saida = anonimizar(doc, { sal });
        const serializado = serializar(saida);
        for (const original of originais) {
          expect(serializado).not.toContain(original);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('o sal (segredo) nunca aparece na saída anonimizada', () => {
    fc.assert(
      fc.property(documentoProducaoArb, salArb, ({ doc }, sal) => {
        const saida = anonimizar(doc, { sal });
        expect(serializar(saida)).not.toContain(sal);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('identificadores diretos viram pseudônimos irreversíveis', () => {
    fc.assert(
      fc.property(chaveIdentificadoraArb, identificadorArb, salArb, (chave, v, sal) => {
        const saida = anonimizar({ [chave]: v, ambiente: 'prd' }, { sal });
        expect(ehPseudonimo(saida[chave])).toBe(true);
        // O pseudônimo não contém o valor original.
        expect(saida[chave]).not.toContain(v);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('idempotência: reanonimizar com o mesmo sal não altera a saída', () => {
    fc.assert(
      fc.property(documentoProducaoArb, salArb, ({ doc }, sal) => {
        const uma = anonimizar(doc, { sal });
        const duas = anonimizar(uma, { sal });
        expect(serializar(duas)).toBe(serializar(uma));
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('integridade referencial: valores iguais geram pseudônimos iguais', () => {
    fc.assert(
      fc.property(chaveIdentificadoraArb, chaveIdentificadoraArb, identificadorArb, salArb,
        (chaveA, chaveB, v, sal) => {
          // O mesmo valor sob chaves identificadoras distintas no mesmo documento.
          const saida = anonimizar({ [chaveA]: v, bloco: { [chaveB]: v }, ambiente: 'prd' }, { sal });
          expect(saida[chaveA]).toBe(saida.bloco[chaveB]);
          // E a pseudonimização direta concorda com o resultado embutido.
          expect(saida[chaveA]).toBe(pseudonimizar(v, sal));
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  test('pseudônimos iguais não revelam o original (irreversibilidade)', () => {
    fc.assert(
      fc.property(identificadorArb, salArb, (v, sal) => {
        const pseudo = pseudonimizar(v, sal);
        // Pseudônimo determinístico, mas sem conter o valor de origem nem o sal.
        expect(pseudo).not.toContain(v);
        expect(pseudo).not.toContain(sal);
        expect(ehPseudonimo(pseudo)).toBe(true);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('valores distintos geram pseudônimos distintos sob o mesmo sal', () => {
    fc.assert(
      fc.property(identificadorArb, identificadorArb, salArb, (a, b, sal) => {
        fc.pre(a !== b);
        expect(pseudonimizar(a, sal)).not.toBe(pseudonimizar(b, sal));
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('o mesmo valor sob sais diferentes gera pseudônimos diferentes', () => {
    fc.assert(
      fc.property(identificadorArb, salArb, salArb, (v, salA, salB) => {
        fc.pre(salA !== salB);
        expect(pseudonimizar(v, salA)).not.toBe(pseudonimizar(v, salB));
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('quase-identificadores são generalizados, sem conter o valor original', () => {
    fc.assert(
      fc.property(chaveQuaseArb, identificadorArb, salArb, (chave, v, sal) => {
        const saida = anonimizar({ [chave]: v, ambiente: 'prd' }, { sal });
        expect(saida[chave]).toBe(MARCADOR_GENERALIZADO);
        expect(serializar(saida)).not.toContain(v);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
