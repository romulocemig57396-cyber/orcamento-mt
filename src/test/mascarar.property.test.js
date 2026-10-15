import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  MARCADOR,
  CHAVES_SENSIVEIS_PADRAO,
  mascararObjeto,
  mascararValor,
  mascararString,
} from '../observabilidade/mascarar.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Feature: adequacao-diretrizes-cemig, Property 7: Mascaramento de dados
   sensíveis em logs e segredos

   Validates: Requirements 9.3, 10.4

   Para qualquer entrada de log contendo dado pessoal e para qualquer valor de
   segredo recuperado do Cofre_Segredos, o conteúdo efetivamente gravado em log
   ou retornado em mensagem de erro nunca contém o valor original de forma
   recuperável.

   Estratégia: geramos objetos aleatórios cujos valores sensíveis aparecem (a)
   sob chaves sensíveis e (b) embutidos em strings livres no formato de padrões
   reconhecidos (e-mail, CPF, CNPJ, JWT, Bearer, connection string). Verificamos
   que o conteúdo serializado da saída nunca contém o valor original — o
   mascaramento é não reversível a partir do conteúdo gravado.
   ───────────────────────────────────────────────────────────────────────────── */

// No mínimo 100 iterações por teste de propriedade (Testing Strategy do design).
const NUM_RUNS = 200;

// Serializa a saída mascarada de forma estável, incluindo Map/Set/Error, para
// então inspecionar se algum valor original "vazou" para o conteúdo gravado.
const serializar = (valor) =>
  JSON.stringify(valor, (_chave, v) => {
    if (v instanceof Map) return { __map__: [...v.entries()] };
    if (v instanceof Set) return { __set__: [...v.values()] };
    if (v instanceof Error) return { __error__: v.message, name: v.name };
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'function') return '[fn]';
    return v;
  });

// Gerador de string alfanumérica a partir de um alfabeto fixo (fast-check 4 não
// expõe mais hexaString/alphanumericString diretamente neste formato).
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

// Token sensível distintivo: prefixo fixo + corpo aleatório de tamanho razoável.
// O prefixo garante que o token não colide por acaso com o restante do conteúdo
// nem com o MARCADOR, tornando a asserção de ausência confiável.
const segredoArb = alnumArb(8, 40).map((corpo) => `SEGREDO_${corpo}`);

// Gera um valor sensível e sua representação EMBUTIDA numa string livre num
// formato que mascararString reconhece. Retorna { bruto, texto } onde `bruto`
// é o valor original que não pode vazar e `texto` é a string livre que o contém.
const embutidoArb = fc.oneof(
  // E-mail
  fc.record({
    user: alnumArb(3, 10).map((s) => s || 'abc'),
    dom: fc.constantFrom('cemig.com.br', 'example.com', 'teste.org'),
  }).map(({ user, dom }) => {
    const bruto = `${user}@${dom}`;
    return { bruto, texto: `Falha ao notificar ${bruto} às 10h` };
  }),
  // CPF formatado
  fc.tuple(
    fc.integer({ min: 100, max: 999 }),
    fc.integer({ min: 100, max: 999 }),
    fc.integer({ min: 100, max: 999 }),
    fc.integer({ min: 10, max: 99 }),
  ).map(([a, b, c, d]) => {
    const bruto = `${a}.${b}.${c}-${d}`;
    return { bruto, texto: `CPF ${bruto} recusado` };
  }),
  // CNPJ formatado
  fc.tuple(
    fc.integer({ min: 10, max: 99 }),
    fc.integer({ min: 100, max: 999 }),
    fc.integer({ min: 100, max: 999 }),
    fc.integer({ min: 1000, max: 9999 }),
    fc.integer({ min: 10, max: 99 }),
  ).map(([a, b, c, d, e]) => {
    const bruto = `${a}.${b}.${c}/${d}-${e}`;
    return { bruto, texto: `empresa ${bruto} bloqueada` };
  }),
  // JWT
  alnumArb(6, 20).map((sig) => {
    const bruto = `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.${sig || 'abc123'}`;
    return { bruto, texto: `token recebido: ${bruto}` };
  }),
  // Bearer
  alnumArb(10, 30).map((t) => {
    const corpo = t || 'abcdef123456';
    const bruto = `Bearer ${corpo}`;
    return { bruto: corpo, texto: `Authorization: ${bruto}` };
  }),
  // Connection string
  alnumArb(8, 24).map((k) => {
    const key = k || 'chave12345';
    const bruto = `AccountKey=${key}==`;
    return { bruto: key, texto: `conexão: AccountEndpoint=https://x.azure.com;${bruto};` };
  }),
);

// Uma chave sensível aleatória da lista padrão.
const chaveSensivelArb = fc.constantFrom(...CHAVES_SENSIVEIS_PADRAO);

// Uma chave não sensível (comum).
const chaveComumArb = fc.constantFrom(
  'municipio', 'valor', 'id', 'descricao', 'status', 'data', 'quantidade',
);

describe('Feature: adequacao-diretrizes-cemig, Property 7: Mascaramento de dados sensíveis em logs e segredos', () => {
  test('valor de segredo (sensivel=true) nunca aparece no conteúdo gravado', () => {
    fc.assert(
      fc.property(segredoArb, (segredo) => {
        const mascarado = mascararValor(segredo, { sensivel: true });
        expect(serializar(mascarado)).not.toContain(segredo);
        expect(mascarado).toBe(MARCADOR);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('valores sob chaves sensíveis não vazam para o conteúdo serializado', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(chaveSensivelArb, segredoArb), { minLength: 1, maxLength: 8 }),
        (pares) => {
          const entrada = {};
          const segredos = [];
          for (const [chave, segredo] of pares) {
            entrada[chave] = segredo;
            segredos.push(segredo);
          }
          const serializado = serializar(mascararObjeto(entrada));
          for (const segredo of segredos) {
            expect(serializado).not.toContain(segredo);
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  test('valor sensível sob chave sensível apontando para objeto redige tudo', () => {
    fc.assert(
      fc.property(chaveSensivelArb, segredoArb, segredoArb, (chave, s1, s2) => {
        const entrada = { [chave]: { interno: s1, mais: { fundo: s2 } } };
        const serializado = serializar(mascararObjeto(entrada));
        expect(serializado).not.toContain(s1);
        expect(serializado).not.toContain(s2);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('valores sensíveis embutidos em strings livres não vazam', () => {
    fc.assert(
      fc.property(embutidoArb, ({ bruto, texto }) => {
        const mascarado = mascararString(texto);
        expect(mascarado).not.toContain(bruto);
        expect(mascarado).toContain(MARCADOR);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('objeto misto (chaves sensíveis + strings livres + ninho) não vaza nada', () => {
    fc.assert(
      fc.property(
        fc.record({
          chaveSensivel: chaveSensivelArb,
          segredo: segredoArb,
          chaveComum: chaveComumArb,
          embutido: embutidoArb,
          embutidoAninhado: embutidoArb,
        }),
        ({ chaveSensivel, segredo, chaveComum, embutido, embutidoAninhado }) => {
          const entrada = {
            [chaveSensivel]: segredo,
            [chaveComum]: embutido.texto,
            nivel1: {
              observacao: embutidoAninhado.texto,
              lista: [{ [chaveSensivel]: segredo }, { info: embutido.texto }],
            },
          };
          const serializado = serializar(mascararObjeto(entrada));
          expect(serializado).not.toContain(segredo);
          expect(serializado).not.toContain(embutido.bruto);
          expect(serializado).not.toContain(embutidoAninhado.bruto);
          // Valor comum (nome da chave comum) permanece — mascaramento não apaga tudo.
          expect(serializado).toContain(MARCADOR);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  test('mascaramento não é reversível: segredos distintos geram o mesmo marcador', () => {
    fc.assert(
      fc.property(segredoArb, segredoArb, (a, b) => {
        const ma = mascararValor(a, { sensivel: true });
        const mb = mascararValor(b, { sensivel: true });
        // Independentemente do valor original, o conteúdo gravado é idêntico:
        // não há informação (comprimento, fragmento, hash) para recompor o original.
        expect(ma).toBe(mb);
        expect(ma).toBe(MARCADOR);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('mensagem de Error com segredo embutido não vaza o valor original', () => {
    fc.assert(
      fc.property(embutidoArb, ({ bruto, texto }) => {
        const entrada = { erro: new Error(`falha: ${texto}`) };
        const serializado = serializar(mascararObjeto(entrada));
        expect(serializado).not.toContain(bruto);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
