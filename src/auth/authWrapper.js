/* ─────────────────────────────────────────────────────────────────────────────
   authWrapper.js — wrapper injetável sobre o MSAL.js (R1.1, R1.5)

   Encapsula o @azure/msal-browser atrás de uma interface pequena e estável, de
   modo que o restante do front-end nunca dependa diretamente da biblioteca. Isso
   atende dois objetivos do design:

   1. Testabilidade: o `PublicClientApplication` é injetado (ou criado por uma
      fábrica injetável), permitindo testar login/logout/aquisição de token com o
      MSAL totalmente mockado, sem rede nem navegador real.
   2. Isolamento: o fluxo é SEMPRE Authorization Code + PKCE (padrão do
      msal-browser) e o Entra ID é o único provedor de identidade (R1.5). Nenhuma
      decisão de segurança é confiada ao front — ele apenas obtém e anexa o token
      (a validação de assinatura/claims ocorre na API, tarefa 5.2).

   Contrato exposto por `criarAuthWrapper`:
   - `inicializar()`                  → inicializa o PublicClientApplication e
                                         conclui qualquer redirect pendente.
   - `obterConta()`                   → conta ativa atual (ou null).
   - `estaAutenticado()`              → booleano.
   - `login({ modo })`                → login via 'redirect' (padrão) ou 'popup'.
   - `logout({ modo })`               → logout via 'redirect' (padrão) ou 'popup'.
   - `adquirirToken({ scopes })`      → acquireTokenSilent com fallback para
                                         redirect/popup quando exigir interação.
   ───────────────────────────────────────────────────────────────────────────── */

import {
  construirMsalConfig,
  construirLoginRequest,
  construirTokenRequest,
} from './msalConfig.js';

/** Modos de interação suportados. */
export const MODO = Object.freeze({ REDIRECT: 'redirect', POPUP: 'popup' });

/**
 * Erro padronizado deste wrapper. `causa` preserva o erro original do MSAL para
 * diagnóstico, sem vazá-lo para a UI.
 */
export class AuthError extends Error {
  /**
   * @param {string} codigo  Código estável (ex.: 'nao_inicializado', 'interacao_requerida').
   * @param {string} mensagem
   * @param {{ causa?: unknown, permitirNovaTentativa?: boolean }} [opcoes]
   */
  constructor(codigo, mensagem, opcoes = {}) {
    super(mensagem);
    this.name = 'AuthError';
    this.codigo = codigo;
    this.causa = opcoes.causa;
    this.permitirNovaTentativa = opcoes.permitirNovaTentativa ?? false;
  }
}

/**
 * Detecta, de forma resiliente a mocks, se um erro do MSAL indica que
 * interação do usuário é necessária (`InteractionRequiredAuthError`).
 *
 * @param {unknown} erro
 * @returns {boolean}
 */
export function exigeInteracao(erro) {
  if (!erro) return false;
  const nome = erro.name || '';
  const codigo = erro.errorCode || '';
  return (
    nome === 'InteractionRequiredAuthError' ||
    /interaction_required|login_required|consent_required|no_tokens_found|no_account_error/i.test(
      String(codigo)
    )
  );
}

/**
 * Cria o wrapper de autenticação sobre uma instância de MSAL
 * (`PublicClientApplication`). A instância pode ser passada diretamente
 * (`deps.pca`) — ideal para testes — ou criada por uma fábrica injetável
 * (`deps.criarPca`), que recebe a configuração do MSAL.
 *
 * @param {Object} [deps]
 * @param {import('@azure/msal-browser').IPublicClientApplication} [deps.pca]
 *   Instância pronta do MSAL (tem prioridade sobre `criarPca`).
 * @param {(config: object) => import('@azure/msal-browser').IPublicClientApplication} [deps.criarPca]
 *   Fábrica que constrói o `PublicClientApplication` a partir da config.
 * @param {Record<string,string|undefined>} [deps.env]
 *   Ambiente para `construir*` (padrão: `import.meta.env`).
 * @param {() => object} [deps.loginRequest]  Override do request de login.
 * @param {() => object} [deps.tokenRequest]  Override do request de token.
 * @returns {{
 *   inicializar: () => Promise<void>,
 *   obterConta: () => (object|null),
 *   estaAutenticado: () => boolean,
 *   login: (opcoes?: {modo?: string, scopes?: string[]}) => Promise<object|null>,
 *   logout: (opcoes?: {modo?: string}) => Promise<void>,
 *   adquirirToken: (opcoes?: {scopes?: string[], modoFallback?: string}) => Promise<string>,
 *   instancia: () => (object|null)
 * }}
 */
export function criarAuthWrapper(deps = {}) {
  const env = deps.env;
  let pca = deps.pca ?? null;
  let inicializado = false;

  const loginRequestBase = deps.loginRequest
    ? deps.loginRequest()
    : construirLoginRequest(env);
  const tokenRequestBase = deps.tokenRequest
    ? deps.tokenRequest()
    : construirTokenRequest(env);

  function garantirInstancia() {
    if (pca) return pca;
    if (typeof deps.criarPca === 'function') {
      pca = deps.criarPca(construirMsalConfig(env));
      return pca;
    }
    throw new AuthError(
      'sem_instancia',
      'Nenhuma instância do MSAL foi fornecida (pca) nem fábrica (criarPca).'
    );
  }

  function garantirInicializado() {
    if (!inicializado) {
      throw new AuthError(
        'nao_inicializado',
        'O wrapper de autenticação não foi inicializado. Chame inicializar() primeiro.'
      );
    }
    return garantirInstancia();
  }

  /** Seleciona uma conta ativa; se não houver, usa a primeira conhecida. */
  function resolverConta() {
    const inst = garantirInstancia();
    const ativa = inst.getActiveAccount ? inst.getActiveAccount() : null;
    if (ativa) return ativa;
    const todas = inst.getAllAccounts ? inst.getAllAccounts() : [];
    return todas && todas.length ? todas[0] : null;
  }

  return {
    /**
     * Inicializa o PublicClientApplication (obrigatório no msal-browser v3+)
     * e processa o retorno de um fluxo por redirect, se houver, fixando a conta
     * ativa resultante. Deve ser chamado uma vez no bootstrap do app.
     */
    async inicializar() {
      const inst = garantirInstancia();
      if (typeof inst.initialize === 'function') {
        await inst.initialize();
      }
      // Conclui um login iniciado por redirect (retorna null se não houver).
      if (typeof inst.handleRedirectPromise === 'function') {
        const resultado = await inst.handleRedirectPromise();
        if (resultado && resultado.account && inst.setActiveAccount) {
          inst.setActiveAccount(resultado.account);
        }
      }
      // Fixa a conta ativa quando já existe sessão em cache.
      if (!inst.getActiveAccount || !inst.getActiveAccount()) {
        const conta = resolverConta();
        if (conta && inst.setActiveAccount) inst.setActiveAccount(conta);
      }
      inicializado = true;
    },

    /** Instância bruta do MSAL (uso avançado, ex.: MsalProvider). */
    instancia() {
      return pca;
    },

    /** @returns {object|null} conta ativa (ou null). */
    obterConta() {
      if (!pca) return null;
      return resolverConta();
    },

    /** @returns {boolean} se há uma conta/sessão ativa. */
    estaAutenticado() {
      return Boolean(this.obterConta());
    },

    /**
     * Dispara o login OIDC (Authorization Code + PKCE). Por padrão usa redirect
     * — o fluxo recomendado para SPAs e o que satisfaz "redirecionar usuário não
     * autenticado para o Entra ID" (R1.1). O modo 'popup' resolve com o resultado.
     *
     * @param {{ modo?: string, scopes?: string[] }} [opcoes]
     * @returns {Promise<object|null>} resultado do popup (ou null no redirect).
     */
    async login(opcoes = {}) {
      const inst = garantirInicializado();
      const modo = opcoes.modo || MODO.REDIRECT;
      const request = {
        ...loginRequestBase,
        ...(opcoes.scopes ? { scopes: opcoes.scopes } : {}),
      };
      try {
        if (modo === MODO.POPUP) {
          const resultado = await inst.loginPopup(request);
          if (resultado && resultado.account && inst.setActiveAccount) {
            inst.setActiveAccount(resultado.account);
          }
          return resultado ?? null;
        }
        // Redirect: a navegação ocorre; a Promise normalmente não resolve.
        await inst.loginRedirect(request);
        return null;
      } catch (erro) {
        throw new AuthError('falha_login', 'Falha ao iniciar o login no Entra ID.', {
          causa: erro,
          permitirNovaTentativa: true,
        });
      }
    },

    /**
     * Encerra a sessão no Entra ID. Padrão redirect; 'popup' disponível.
     * @param {{ modo?: string }} [opcoes]
     */
    async logout(opcoes = {}) {
      const inst = garantirInicializado();
      const modo = opcoes.modo || MODO.REDIRECT;
      const conta = resolverConta();
      const request = conta ? { account: conta } : {};
      try {
        if (modo === MODO.POPUP) {
          await inst.logoutPopup(request);
          return;
        }
        await inst.logoutRedirect(request);
      } catch (erro) {
        throw new AuthError('falha_logout', 'Falha ao encerrar a sessão.', {
          causa: erro,
        });
      }
    },

    /**
     * Adquire um access token de forma silenciosa (acquireTokenSilent). Quando o
     * MSAL sinaliza que interação é necessária (`InteractionRequiredAuthError`),
     * cai para aquisição interativa (redirect por padrão; popup opcional). No
     * redirect, a navegação acontece e um AuthError 'interacao_requerida' é
     * lançado para o chamador aguardar o retorno.
     *
     * @param {{ scopes?: string[], modoFallback?: string }} [opcoes]
     * @returns {Promise<string>} o access token.
     */
    async adquirirToken(opcoes = {}) {
      const inst = garantirInicializado();
      const conta = resolverConta();
      const request = {
        ...tokenRequestBase,
        ...(opcoes.scopes ? { scopes: opcoes.scopes } : {}),
        ...(conta ? { account: conta } : {}),
      };

      try {
        const resultado = await inst.acquireTokenSilent(request);
        const token = resultado && resultado.accessToken;
        if (!token) {
          throw new AuthError(
            'sem_token',
            'A aquisição silenciosa não retornou um access token.'
          );
        }
        return token;
      } catch (erro) {
        if (erro instanceof AuthError) throw erro;
        if (!exigeInteracao(erro)) {
          throw new AuthError('falha_token', 'Falha ao adquirir token de acesso.', {
            causa: erro,
            permitirNovaTentativa: true,
          });
        }

        // Fallback interativo.
        const modo = opcoes.modoFallback || MODO.REDIRECT;
        if (modo === MODO.POPUP && typeof inst.acquireTokenPopup === 'function') {
          const resultado = await inst.acquireTokenPopup(request);
          const token = resultado && resultado.accessToken;
          if (!token) {
            throw new AuthError('sem_token', 'O popup não retornou um access token.');
          }
          return token;
        }
        if (typeof inst.acquireTokenRedirect === 'function') {
          await inst.acquireTokenRedirect(request);
        }
        // No redirect a navegação já ocorreu; sinaliza ao chamador aguardar.
        throw new AuthError(
          'interacao_requerida',
          'Interação do usuário necessária; redirecionando ao Entra ID.',
          { causa: erro, permitirNovaTentativa: true }
        );
      }
    },
  };
}
