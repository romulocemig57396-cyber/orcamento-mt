/* ─────────────────────────────────────────────────────────────────────────────
   rbac.config.js — configuração versionada de mapeamento grupo → papel (RBAC)

   Fonte única de verdade da autorização baseada em papéis (R2). Segue o Data
   Model do design ("Modelo de mapeamento grupo → papel (RBAC)"):

     - `mapeamentos`: cada entrada associa um grupo do Entra ID (claim `groups`,
       identificado pelo GUID do grupo) a um Papel_Aplicacao.
     - `permissoesPorPapel`: permissões explicitamente concedidas a cada papel.

   Em produção, estes GUIDs são injetados por parâmetro de IaC / Key Vault
   (configuração, não dado de usuário). Os valores abaixo são PLACEHOLDERS de
   exemplo e devem ser substituídos pelos GUIDs reais dos grupos corporativos.

   Negação por padrão (R2.3): um papel recebe SOMENTE as permissões listadas
   explicitamente aqui; nenhuma permissão é inferida.
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} MapeamentoGrupoPapel
 * @property {string} grupoEntraId  GUID do grupo do Entra ID (claim `groups`).
 * @property {string} papel         Papel_Aplicacao associado ao grupo.
 */

/**
 * @typedef {Object} ConfiguracaoRbac
 * @property {MapeamentoGrupoPapel[]} mapeamentos            Mapeamentos grupo → papel.
 * @property {Object<string,string[]>} permissoesPorPapel    Permissões por papel.
 */

/** @type {ConfiguracaoRbac} */
export const RBAC_CONFIG = {
  mapeamentos: [
    { grupoEntraId: '00000000-0000-0000-0000-000000000001', papel: 'leitor' },
    { grupoEntraId: '00000000-0000-0000-0000-000000000002', papel: 'editor' },
    { grupoEntraId: '00000000-0000-0000-0000-000000000003', papel: 'admin' },
  ],
  permissoesPorPapel: {
    leitor: ['orcamentos:ler'],
    editor: ['orcamentos:ler', 'orcamentos:gravar', 'titular:registrar'],
    admin: ['orcamentos:ler', 'orcamentos:gravar', 'orcamentos:remover', 'titular:registrar'],
  },
};

export default RBAC_CONFIG;
