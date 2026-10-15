/* ─────────────────────────────────────────────────────────────────────────────
   rbac.test.js — testes unitários do mapeamento grupo → papel e permissões (R2.1)

   Exemplos e casos de borda. A propriedade universal (Property 3: união das
   permissões) é coberta por teste de propriedade separado (tarefa 5.7).
   ───────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  papeisDosGrupos,
  permissoesDosPapeis,
  autorizarSessao,
} from './rbac.js';
import { RBAC_CONFIG } from './rbac.config.js';

const G_LEITOR = '00000000-0000-0000-0000-000000000001';
const G_EDITOR = '00000000-0000-0000-0000-000000000002';
const G_ADMIN = '00000000-0000-0000-0000-000000000003';

describe('papeisDosGrupos', () => {
  it('mapeia um grupo para o papel correspondente', () => {
    expect(papeisDosGrupos([G_LEITOR])).toEqual(['leitor']);
    expect(papeisDosGrupos([G_EDITOR])).toEqual(['editor']);
    expect(papeisDosGrupos([G_ADMIN])).toEqual(['admin']);
  });

  it('mapeia múltiplos grupos para múltiplos papéis', () => {
    expect(papeisDosGrupos([G_LEITOR, G_EDITOR])).toEqual(['leitor', 'editor']);
  });

  it('ignora grupos sem mapeamento (negação por padrão)', () => {
    expect(papeisDosGrupos(['grupo-desconhecido'])).toEqual([]);
    expect(papeisDosGrupos([G_LEITOR, 'grupo-desconhecido'])).toEqual(['leitor']);
  });

  it('elimina papéis duplicados preservando a primeira ocorrência', () => {
    expect(papeisDosGrupos([G_EDITOR, G_EDITOR])).toEqual(['editor']);
  });

  it('retorna vazio para lista de grupos vazia', () => {
    expect(papeisDosGrupos([])).toEqual([]);
  });

  it('é tolerante a entradas inválidas', () => {
    expect(papeisDosGrupos(null)).toEqual([]);
    expect(papeisDosGrupos(undefined)).toEqual([]);
    expect(papeisDosGrupos([null, '', 42, G_ADMIN])).toEqual(['admin']);
  });
});

describe('permissoesDosPapeis', () => {
  it('retorna as permissões de um único papel', () => {
    expect(permissoesDosPapeis(['leitor'])).toEqual(['orcamentos:ler']);
  });

  it('une as permissões de múltiplos papéis sem duplicatas', () => {
    const perms = permissoesDosPapeis(['leitor', 'editor']);
    expect(new Set(perms)).toEqual(
      new Set(['orcamentos:ler', 'orcamentos:gravar', 'titular:registrar']),
    );
    // 'orcamentos:ler' aparece em ambos os papéis mas só uma vez na união.
    expect(perms.filter((p) => p === 'orcamentos:ler')).toHaveLength(1);
  });

  it('admin tem a permissão exclusiva de remover', () => {
    expect(permissoesDosPapeis(['admin'])).toContain('orcamentos:remover');
  });

  it('ignora papéis desconhecidos (negação por padrão)', () => {
    expect(permissoesDosPapeis(['papel-inexistente'])).toEqual([]);
    expect(permissoesDosPapeis(['leitor', 'papel-inexistente'])).toEqual([
      'orcamentos:ler',
    ]);
  });

  it('retorna vazio para lista de papéis vazia ou inválida', () => {
    expect(permissoesDosPapeis([])).toEqual([]);
    expect(permissoesDosPapeis(null)).toEqual([]);
  });
});

describe('autorizarSessao', () => {
  it('concede a união das permissões dos papéis mapeados (R2.1)', () => {
    const { papeis, permissoes } = autorizarSessao([G_LEITOR, G_EDITOR]);
    expect(papeis).toEqual(['leitor', 'editor']);
    expect(new Set(permissoes)).toEqual(
      new Set(['orcamentos:ler', 'orcamentos:gravar', 'titular:registrar']),
    );
  });

  it('sessão sem grupo mapeável não recebe permissão alguma (R2.3/R2.4)', () => {
    const { papeis, permissoes } = autorizarSessao(['grupo-aleatorio']);
    expect(papeis).toEqual([]);
    expect(permissoes).toEqual([]);
  });

  it('admin recebe todas as permissões configuradas', () => {
    const { permissoes } = autorizarSessao([G_ADMIN]);
    expect(new Set(permissoes)).toEqual(
      new Set(RBAC_CONFIG.permissoesPorPapel.admin),
    );
  });

  it('aceita configuração customizada injetada', () => {
    const config = {
      mapeamentos: [{ grupoEntraId: 'g1', papel: 'especial' }],
      permissoesPorPapel: { especial: ['x:y'] },
    };
    const { papeis, permissoes } = autorizarSessao(['g1'], config);
    expect(papeis).toEqual(['especial']);
    expect(permissoes).toEqual(['x:y']);
  });

  it('calcula a autorização bem abaixo de 2 s mesmo com muitos grupos (R2.1)', () => {
    const grupos = Array.from({ length: 10000 }, (_, i) => `grupo-${i}`);
    grupos.push(G_ADMIN);
    const inicio = performance.now();
    const { permissoes } = autorizarSessao(grupos);
    const decorrido = performance.now() - inicio;
    expect(permissoes).toContain('orcamentos:remover');
    expect(decorrido).toBeLessThan(2000);
  });
});
