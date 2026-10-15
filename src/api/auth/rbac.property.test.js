/* ─────────────────────────────────────────────────────────────────────────────
   rbac.property.test.js — teste de propriedade da união de permissões (R2.1)

   Feature: adequacao-diretrizes-cemig, Property 3: Permissões da sessão são a
   união dos papéis mapeados

   Validates: Requirements 2.1

   Para qualquer conjunto de grupos do Entra ID e tabela de mapeamento, as
   permissões concedidas à sessão são exatamente a união das permissões de todos
   os Papel_Aplicacao mapeados a partir desses grupos. Grupos sem mapeamento não
   contribuem (negação por padrão — R2.3), e a união não contém duplicatas.

   Estratégia: geramos configurações de RBAC aleatórias (mapeamentos grupo→papel
   e permissões por papel) e conjuntos de grupos aleatórios — incluindo grupos
   não mapeados — e comparamos o resultado de `autorizarSessao` contra uma
   especificação de referência independente, calculada diretamente a partir dos
   geradores.
   ───────────────────────────────────────────────────────────────────────────── */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  papeisDosGrupos,
  permissoesDosPapeis,
  autorizarSessao,
} from './rbac.js';

// No mínimo 100 iterações por teste de propriedade (Testing Strategy do design).
const NUM_RUNS = 300;

// ─── Geradores ──────────────────────────────────────────────────────────────

// GUIDs/identificadores de grupo. Universo pequeno e fixo para forçar colisões,
// grupos mapeados e grupos NÃO mapeados dentro de uma mesma execução.
const grupoArb = fc.constantFrom(
  'g-0', 'g-1', 'g-2', 'g-3', 'g-4', 'g-5', 'g-6', 'g-7',
);

// Papéis possíveis. Universo pequeno para forçar múltiplos grupos → mesmo papel.
const papelArb = fc.constantFrom('leitor', 'editor', 'admin', 'auditor', 'guest');

// Permissões possíveis (universo pequeno → forçar permissões compartilhadas
// entre papéis, exercitando a eliminação de duplicatas na união).
const permissaoArb = fc.constantFrom(
  'orcamentos:ler',
  'orcamentos:gravar',
  'orcamentos:remover',
  'titular:registrar',
  'relatorios:exportar',
);

// Um mapeamento grupo → papel.
const mapeamentoArb = fc.record({
  grupoEntraId: grupoArb,
  papel: papelArb,
});

// Tabela permissoesPorPapel: cada papel do universo recebe um subconjunto
// (possivelmente vazio) das permissões, sem duplicatas.
const permissoesPorPapelArb = fc.record({
  leitor: fc.uniqueArray(permissaoArb),
  editor: fc.uniqueArray(permissaoArb),
  admin: fc.uniqueArray(permissaoArb),
  auditor: fc.uniqueArray(permissaoArb),
  guest: fc.uniqueArray(permissaoArb),
});

// Configuração RBAC completa gerada aleatoriamente.
const configArb = fc.record({
  mapeamentos: fc.array(mapeamentoArb, { maxLength: 12 }),
  permissoesPorPapel: permissoesPorPapelArb,
});

// Conjunto de grupos apresentados pela sessão (claim `groups`): pode conter
// repetições e grupos sem mapeamento.
const gruposDaSessaoArb = fc.array(grupoArb, { maxLength: 10 });

// ─── Especificação de referência (independente da implementação) ─────────────

/**
 * Resolve, de forma independente, o conjunto de papéis mapeados a partir dos
 * grupos — "primeiro mapeamento vence" por grupo, grupos sem mapeamento
 * ignorados. Devolve um Set (sem ordem/duplicatas) pois a propriedade só exige
 * igualdade de conjunto.
 */
function papeisEsperados(grupos, config) {
  const grupoParaPapel = new Map();
  for (const m of config.mapeamentos) {
    if (!grupoParaPapel.has(m.grupoEntraId)) {
      grupoParaPapel.set(m.grupoEntraId, m.papel);
    }
  }
  const papeis = new Set();
  for (const g of grupos) {
    if (grupoParaPapel.has(g)) papeis.add(grupoParaPapel.get(g));
  }
  return papeis;
}

/** União de referência das permissões dos papéis mapeados. */
function permissoesEsperadas(grupos, config) {
  const papeis = papeisEsperados(grupos, config);
  const perms = new Set();
  for (const papel of papeis) {
    for (const p of config.permissoesPorPapel[papel] ?? []) perms.add(p);
  }
  return perms;
}

// ─── Propriedade ─────────────────────────────────────────────────────────────

describe('Feature: adequacao-diretrizes-cemig, Property 3: Permissões da sessão são a união dos papéis mapeados', () => {
  test('permissões da sessão são exatamente a união dos papéis mapeados (sem duplicatas)', () => {
    fc.assert(
      fc.property(gruposDaSessaoArb, configArb, (grupos, config) => {
        const { papeis, permissoes } = autorizarSessao(grupos, config);

        // 1) O conjunto de permissões é EXATAMENTE a união esperada.
        const esperado = permissoesEsperadas(grupos, config);
        expect(new Set(permissoes)).toEqual(esperado);

        // 2) A união não contém duplicatas.
        expect(permissoes.length).toBe(new Set(permissoes).size);

        // 3) Os papéis mapeados coincidem com a referência (como conjunto).
        expect(new Set(papeis)).toEqual(papeisEsperados(grupos, config));
        expect(papeis.length).toBe(new Set(papeis).size);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('grupos sem mapeamento não contribuem com permissão alguma', () => {
    fc.assert(
      fc.property(gruposDaSessaoArb, configArb, (grupos, config) => {
        const gruposMapeaveis = new Set(config.mapeamentos.map((m) => m.grupoEntraId));

        // Adicionar grupos garantidamente NÃO mapeados não altera o resultado.
        const naoMapeados = ['x-ruido-1', 'x-ruido-2', 'x-ruido-3'].filter(
          (g) => !gruposMapeaveis.has(g),
        );

        const base = autorizarSessao(grupos, config);
        const comRuido = autorizarSessao([...grupos, ...naoMapeados], config);

        expect(new Set(comRuido.permissoes)).toEqual(new Set(base.permissoes));
        expect(new Set(comRuido.papeis)).toEqual(new Set(base.papeis));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('composição: autorizarSessao equivale a permissoesDosPapeis∘papeisDosGrupos', () => {
    fc.assert(
      fc.property(gruposDaSessaoArb, configArb, (grupos, config) => {
        const papeis = papeisDosGrupos(grupos, config);
        const permissoes = permissoesDosPapeis(papeis, config);
        const direto = autorizarSessao(grupos, config);

        expect(direto.papeis).toEqual(papeis);
        expect(direto.permissoes).toEqual(permissoes);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('monotonicidade: adicionar um grupo nunca remove permissões já concedidas', () => {
    fc.assert(
      fc.property(gruposDaSessaoArb, grupoArb, configArb, (grupos, extra, config) => {
        const antes = new Set(autorizarSessao(grupos, config).permissoes);
        const depois = new Set(autorizarSessao([...grupos, extra], config).permissoes);
        for (const p of antes) expect(depois.has(p)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
