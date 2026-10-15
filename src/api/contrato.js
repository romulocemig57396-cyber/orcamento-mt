/* ─────────────────────────────────────────────────────────────────────────────
   contrato.js — contrato REST da API serverless (tabela do design)

   Fonte única de verdade das rotas: método, caminho, papel mínimo e requisitos
   rastreados. O roteador (`roteador.js`) e os handlers (`handlers/`) consomem
   esta tabela. Alterar uma rota aqui é alterar o contrato publicado.

   Papéis (RBAC — ver Data Model do design):
     - null    → rota aberta (sem exigência de papel; ainda exige token válido
                 nas rotas protegidas, exceto health check)
     - 'leitor'  → orcamentos:ler
     - 'editor'  → orcamentos:ler, orcamentos:gravar, titular:registrar
     - 'admin'   → + orcamentos:remover

   Ponto de extensão: a coluna `permissao` nomeia a permissão exigida que o
   middleware RBAC (tarefa 5.6/5.8) avaliará contra as permissões da sessão.
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} RotaContrato
 * @property {string} metodo        Método HTTP (GET, PUT, DELETE, POST).
 * @property {string} caminho       Padrão de rota com parâmetros `{nome}`.
 * @property {string|null} papelMinimo  Papel mínimo exigido, ou null.
 * @property {string|null} permissao    Permissão RBAC exigida, ou null.
 * @property {boolean} publica      true se não exige token (apenas health check).
 * @property {string} descricao     Descrição funcional da rota.
 * @property {string[]} requisitos  Requisitos rastreados (R#).
 * @property {string} handler       Chave do handler em `handlers/`.
 */

/** @type {RotaContrato[]} */
export const CONTRATO = [
  {
    metodo: 'GET',
    caminho: '/api/health',
    papelMinimo: null,
    permissao: null,
    publica: true,
    descricao: 'Health check (sem dados).',
    requisitos: ['10'],
    handler: 'health',
  },
  {
    metodo: 'GET',
    caminho: '/api/orcamentos',
    papelMinimo: 'leitor',
    permissao: 'orcamentos:ler',
    publica: false,
    descricao: 'Lista orçamentos do usuário/escopo.',
    requisitos: ['2'],
    handler: 'listarOrcamentos',
  },
  {
    metodo: 'GET',
    caminho: '/api/orcamentos/{id}',
    papelMinimo: 'leitor',
    permissao: 'orcamentos:ler',
    publica: false,
    descricao: 'Recupera um orçamento.',
    requisitos: ['5'],
    handler: 'obterOrcamento',
  },
  {
    metodo: 'PUT',
    caminho: '/api/orcamentos/{id}',
    papelMinimo: 'editor',
    permissao: 'orcamentos:gravar',
    publica: false,
    descricao: 'Cria/atualiza orçamento (gravação atômica).',
    requisitos: ['5.4'],
    handler: 'gravarOrcamento',
  },
  {
    metodo: 'DELETE',
    caminho: '/api/orcamentos/{id}',
    papelMinimo: 'editor',
    permissao: 'orcamentos:remover',
    publica: false,
    descricao: 'Remove orçamento.',
    requisitos: ['2'],
    handler: 'removerOrcamento',
  },
  {
    metodo: 'POST',
    caminho: '/api/titular/solicitacoes',
    papelMinimo: 'editor',
    permissao: 'titular:registrar',
    publica: false,
    descricao: 'Registra solicitação de direito do titular (LGPD).',
    requisitos: ['11.4'],
    handler: 'registrarSolicitacaoTitular',
  },
];
