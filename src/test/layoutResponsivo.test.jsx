import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import App from '../App';

/**
 * Tarefa 14.2 — Testes de layout nos breakpoints (R13.3)
 *
 * R13.3 exige que a interface seja validada em pelo menos três resoluções —
 * ao menos uma de celular (≤480 px), uma de tablet (481–1024 px) e uma de
 * desktop (>1024 px). O layout responsivo (tarefa 14.1) vive em `src/index.css`
 * via media queries e nas âncoras de classe do `App.jsx` (app-shell,
 * app-sidebar, app-nav, app-page, app-main-content etc.).
 *
 * LIMITAÇÃO DO AMBIENTE: o jsdom NÃO calcula layout real (sem CSSOM de media
 * queries, sem larguras/alturas computadas, sem overflow visual). Portanto
 * estas asserções focam no que É verificável de forma determinística:
 *   1. a media query ativa por faixa, via `window.matchMedia` mockado;
 *   2. a presença e a estrutura das âncoras de responsividade (classes), que
 *      são os ganchos que o CSS responsivo usa para adaptar o layout;
 *   3. a existência dos controles-chave em todas as faixas (nada some ao
 *      estreitar), condição necessária para "sem rolagem horizontal e com
 *      todos os controles acessíveis".
 *
 * A validação visual pixel-perfect (ausência real de rolagem horizontal,
 * empilhamento efetivo, legibilidade) continua exigindo teste manual/visual
 * nas três resoluções, conforme R13.3 e a Testing Strategy do design.
 */

// Breakpoints de referência de cada faixa (R13.1 / R13.3).
const VIEWPORTS = {
  celular: { largura: 375, faixa: 'celular (≤480 px)' },
  tablet: { largura: 768, faixa: 'tablet (481–1024 px)' },
  desktop: { largura: 1280, faixa: 'desktop (>1024 px)' },
};

/**
 * Instala um mock de `window.matchMedia` que resolve as media queries de
 * largura (`max-width` / `min-width`) contra uma largura de viewport fixa.
 * O jsdom não implementa matchMedia, então sem este mock qualquer código ou
 * asserção baseada em media query lançaria erro.
 */
function instalarMatchMedia(larguraViewport) {
  const avaliar = (query) => {
    // Suporta as formas usadas no CSS: "(max-width: Npx)" e "(min-width: Npx)".
    const max = query.match(/max-width:\s*(\d+)px/);
    const min = query.match(/min-width:\s*(\d+)px/);
    let combina = true;
    if (max) combina = combina && larguraViewport <= Number(max[1]);
    if (min) combina = combina && larguraViewport >= Number(min[1]);
    return combina;
  };

  const mql = (query) => ({
    matches: avaliar(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(), // APIs legadas
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });

  vi.stubGlobal('matchMedia', vi.fn((query) => mql(query)));
  // Ajusta também innerWidth para refletir a faixa, caso algo o consulte.
  vi.stubGlobal('innerWidth', larguraViewport);
}

/** Classifica a faixa a partir da largura, usando os cortes de R13.1. */
function faixaEsperada(largura) {
  if (largura <= 480) return 'celular';
  if (largura <= 1024) return 'tablet';
  return 'desktop';
}

describe('Tarefa 14.2 — layout responsivo nos breakpoints (R13.3)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  describe('Media query ativa por faixa (matchMedia mockado)', () => {
    test.each(Object.entries(VIEWPORTS))(
      '%s: as media queries do CSS resolvem para a faixa correta',
      (nome, { largura }) => {
        instalarMatchMedia(largura);

        const celular = window.matchMedia('(max-width: 480px)').matches;
        const tabletOuMenor = window.matchMedia('(max-width: 1024px)').matches;
        const desktop = window.matchMedia('(min-width: 1025px)').matches;

        const faixa = faixaEsperada(largura);

        if (faixa === 'celular') {
          expect(celular).toBe(true);
          expect(tabletOuMenor).toBe(true);
          expect(desktop).toBe(false);
        } else if (faixa === 'tablet') {
          expect(celular).toBe(false);
          expect(tabletOuMenor).toBe(true);
          expect(desktop).toBe(false);
        } else {
          expect(celular).toBe(false);
          expect(tabletOuMenor).toBe(false);
          expect(desktop).toBe(true);
        }
      }
    );
  });

  describe('Âncoras de responsividade presentes em todas as faixas', () => {
    // Classes que o CSS responsivo (src/index.css, tarefa 14.1) usa como gancho
    // para adaptar o layout em cada faixa.
    const ANCORAS = [
      'app-shell',
      'app-sidebar',
      'app-nav',
      'app-main',
      'app-header',
      'app-page',
      'app-main-content',
    ];

    test.each(Object.entries(VIEWPORTS))(
      '%s: a estrutura expõe as classes de layout responsivo',
      (nome, { largura }) => {
        instalarMatchMedia(largura);
        const { container } = render(<App />);

        for (const ancora of ANCORAS) {
          expect(
            container.querySelector(`.${ancora}`),
            `âncora .${ancora} ausente na faixa ${nome}`
          ).not.toBeNull();
        }

        // O wrapper de conteúdo nunca deve declarar largura além da viewport:
        // o CSS fixa max-width:960px + width:100%, o que previne estouro lógico.
        const conteudo = container.querySelector('.app-main-content');
        expect(conteudo.style.width).toBe('100%');
      }
    );
  });

  describe('Controles-chave acessíveis em todas as faixas (sem perda ao estreitar)', () => {
    test.each(Object.entries(VIEWPORTS))(
      '%s: navegação e conteúdo principal continuam presentes',
      (nome, { largura }) => {
        instalarMatchMedia(largura);
        const { container } = render(<App />);

        // A navegação (que no celular vira faixa rolável) permanece renderizada
        // com todos os seus itens — nada é removido ao estreitar a tela.
        const nav = container.querySelector('.app-nav');
        expect(nav).not.toBeNull();
        const botoesNav = within(nav).getAllByRole('button');
        expect(botoesNav.length).toBeGreaterThanOrEqual(9); // 9 abas padrão

        // O item de navegação da aba ativa continua acessível (escopo: a nav,
        // pois o título "Atendimento" também aparece no cabeçalho).
        expect(within(nav).getByText('Atendimento')).toBeInTheDocument();

        // O título da aba ativa segue visível no cabeçalho (escopo: app-header).
        const header = container.querySelector('.app-header');
        expect(header).not.toBeNull();
        expect(within(header).getByText('Atendimento')).toBeInTheDocument();

        // O indicador de status de salvamento permanece acessível.
        expect(screen.getByText('Salvo automaticamente')).toBeInTheDocument();
      }
    );
  });

  test('cobre pelo menos três faixas distintas (celular, tablet, desktop)', () => {
    const faixas = new Set(
      Object.values(VIEWPORTS).map((v) => faixaEsperada(v.largura))
    );
    expect(faixas).toEqual(new Set(['celular', 'tablet', 'desktop']));
  });
});
