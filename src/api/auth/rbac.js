/* ─────────────────────────────────────────────────────────────────────────────
   rbac.js — mapeamento grupo → papel e cálculo de permissões (RBAC)

   Autorização baseada em papéis (R2). A partir dos grupos do Entra ID presentes
   no token (claim `groups`) e da configuração versionada de mapeamento
   (`rbac.config.js`), este módulo deriva:

     1. o conjunto de Papel_Aplicacao mapeados a partir dos grupos; e
     2. a UNIÃO das permissões de todos esses papéis — as permissões concedidas
        à sessão (R2.1).

   Funções puras: dados os mesmos grupos e configuração, o resultado é sempre o
   mesmo, sem efeitos colaterais. Negação por padrão (R2.3): um grupo sem
   mapeamento não contribui com papel algum; um papel contribui apenas com as
   permissões explicitamente listadas na configuração.

   Projetado para a Property 3 do design: "as permissões concedidas à sessão são
   exatamente a união das permissões de todos os Papel_Aplicacao mapeados a
   partir desses grupos".
   ───────────────────────────────────────────────────────────────────────────── */

import { RBAC_CONFIG } from './rbac.config.js';

/**
 * @typedef {import('./rbac.config.js').ConfiguracaoRbac} ConfiguracaoRbac
 */

/**
 * Resolve os papéis (Papel_Aplicacao) mapeados a partir dos grupos do Entra ID.
 *
 * Ordem de primeiro aparecimento preservada e papéis duplicados eliminados.
 * Grupos sem mapeamento são ignorados (negação por padrão — R2.3). Entradas
 * inválidas na lista de grupos (não-string, vazias) são descartadas.
 *
 * @param {string[]} grupos            GUIDs de grupos do Entra ID (claim `groups`).
 * @param {ConfiguracaoRbac} [config]  Configuração de mapeamento (default: RBAC_CONFIG).
 * @returns {string[]}                 Papéis mapeados, sem duplicatas.
 */
export function papeisDosGrupos(grupos, config = RBAC_CONFIG) {
  const mapeamentos = Array.isArray(config?.mapeamentos) ? config.mapeamentos : [];

  // Índice grupo → papel para resolução O(1) por grupo.
  const grupoParaPapel = new Map();
  for (const m of mapeamentos) {
    if (m && typeof m.grupoEntraId === 'string' && typeof m.papel === 'string') {
      // Primeiro mapeamento vence em caso de grupo repetido na configuração.
      if (!grupoParaPapel.has(m.grupoEntraId)) {
        grupoParaPapel.set(m.grupoEntraId, m.papel);
      }
    }
  }

  const listaGrupos = Array.isArray(grupos) ? grupos : [];
  const papeis = [];
  const vistos = new Set();

  for (const g of listaGrupos) {
    if (typeof g !== 'string' || g.length === 0) continue;
    const papel = grupoParaPapel.get(g);
    if (papel !== undefined && !vistos.has(papel)) {
      vistos.add(papel);
      papeis.push(papel);
    }
  }

  return papeis;
}

/**
 * Calcula a UNIÃO das permissões concedidas a um conjunto de papéis.
 *
 * Cada papel contribui apenas com as permissões explicitamente listadas na
 * configuração (R2.3). Papéis desconhecidos (sem entrada em
 * `permissoesPorPapel`) não contribuem com permissão alguma. Permissões
 * duplicadas entre papéis aparecem uma única vez.
 *
 * @param {string[]} papeis            Papéis cujas permissões serão unidas.
 * @param {ConfiguracaoRbac} [config]  Configuração de mapeamento (default: RBAC_CONFIG).
 * @returns {string[]}                 União das permissões, sem duplicatas.
 */
export function permissoesDosPapeis(papeis, config = RBAC_CONFIG) {
  const tabela = config?.permissoesPorPapel ?? {};
  const listaPapeis = Array.isArray(papeis) ? papeis : [];

  const permissoes = [];
  const vistas = new Set();

  for (const papel of listaPapeis) {
    const perms = tabela[papel];
    if (!Array.isArray(perms)) continue;
    for (const p of perms) {
      if (typeof p !== 'string' || p.length === 0) continue;
      if (!vistas.has(p)) {
        vistas.add(p);
        permissoes.push(p);
      }
    }
  }

  return permissoes;
}

/**
 * Concede à sessão a união das permissões dos papéis mapeados a partir dos
 * grupos do Entra ID do usuário (R2.1).
 *
 * Função pura de composição: resolve papéis a partir dos grupos e, em seguida,
 * a união de suas permissões. Projetada para rodar em ≤ 2 s após o
 * estabelecimento da sessão — por ser puro em memória (sem I/O), o custo é
 * desprezível mesmo com muitos grupos.
 *
 * @param {string[]} grupos            GUIDs de grupos do Entra ID (claim `groups`).
 * @param {ConfiguracaoRbac} [config]  Configuração de mapeamento (default: RBAC_CONFIG).
 * @returns {{ papeis: string[], permissoes: string[] }}
 *   `papeis`: papéis mapeados (sem duplicatas);
 *   `permissoes`: união das permissões concedidas à sessão (sem duplicatas).
 */
export function autorizarSessao(grupos, config = RBAC_CONFIG) {
  const papeis = papeisDosGrupos(grupos, config);
  const permissoes = permissoesDosPapeis(papeis, config);
  return { papeis, permissoes };
}

export default autorizarSessao;
