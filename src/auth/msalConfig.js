/* ─────────────────────────────────────────────────────────────────────────────
   msalConfig.js — configuração do MSAL.js a partir de variáveis de ambiente (R1)

   Responsabilidade (design "Fluxo de autenticação" / "Components — Front-end"):
   - Produzir a `Configuration` do @azure/msal-browser para o fluxo OIDC
     "Authorization Code + PKCE" (padrão do msal-browser) — R1.1.
   - Expor exclusivamente o Entra ID como provedor de identidade, sem cadastro
     ou senha próprios — R1.5.

   Segurança (diretrizes/03-seguranca-e-compliance):
   - NENHUM segredo no código. Apps SPA são "public clients": usam PKCE e NÃO
     possuem client secret. Apenas valores PÚBLICOS são lidos — `clientId`,
     `authority`/`tenant` e `redirectUri` — e sempre via variáveis `VITE_` (que
     o Vite expõe ao bundle do navegador). Connection strings, chaves e segredos
     permanecem no Key Vault, consumidos apenas pela API (R9).

   Testabilidade:
   - A leitura do ambiente é injetável (`env`), de modo que a montagem da
     configuração seja uma função pura exercitável sem `import.meta.env` real.
   ───────────────────────────────────────────────────────────────────────────── */

/** Escopo base de OIDC sempre solicitado no login. */
export const ESCOPOS_OIDC = Object.freeze(['openid', 'profile']);

/**
 * Lê as variáveis `VITE_` do ambiente do Vite de forma segura.
 * Em runtime no navegador, `import.meta.env` carrega os valores embutidos no
 * build; em teste, um objeto `env` pode ser injetado.
 *
 * @returns {Record<string, string|undefined>}
 */
function lerEnvVite() {
  try {
    // `import.meta.env` existe sob Vite/Vitest; o try protege ambientes sem ele.
    return import.meta && import.meta.env ? import.meta.env : {};
  } catch {
    return {};
  }
}

/**
 * Divide uma lista de escopos informada por env (separada por espaço ou vírgula)
 * em um array limpo, sem itens vazios.
 *
 * @param {string|undefined} valor
 * @returns {string[]}
 */
export function parseEscopos(valor) {
  if (!valor || typeof valor !== 'string') return [];
  return valor
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Monta a `authority` do Entra ID a partir do tenant quando a authority completa
 * não for fornecida. Aceita tenant como GUID, domínio ou `common/organizations`.
 *
 * @param {Record<string, string|undefined>} env
 * @returns {string|undefined}
 */
export function resolverAuthority(env) {
  if (env.VITE_ENTRA_AUTHORITY) return env.VITE_ENTRA_AUTHORITY;
  const tenant = env.VITE_ENTRA_TENANT_ID;
  if (!tenant) return undefined;
  return `https://login.microsoftonline.com/${tenant}`;
}

/**
 * Resolve o `redirectUri`. Quando ausente, cai para a origem atual da página
 * (comportamento usual de SPA servida de uma única origem).
 *
 * @param {Record<string, string|undefined>} env
 * @returns {string|undefined}
 */
export function resolverRedirectUri(env) {
  if (env.VITE_ENTRA_REDIRECT_URI) return env.VITE_ENTRA_REDIRECT_URI;
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return undefined;
}

/**
 * Constrói a `Configuration` do @azure/msal-browser (fluxo Authorization Code +
 * PKCE, que é o padrão do msal-browser — não há fluxo implícito).
 *
 * @param {Record<string, string|undefined>} [env=import.meta.env]
 * @returns {{
 *   auth: {
 *     clientId: string,
 *     authority: string|undefined,
 *     redirectUri: string|undefined,
 *     postLogoutRedirectUri: string|undefined,
 *     navigateToLoginRequestUrl: boolean
 *   },
 *   cache: { cacheLocation: string, storeAuthStateInCookie: boolean }
 * }}
 */
export function construirMsalConfig(env = lerEnvVite()) {
  const clientId = env.VITE_ENTRA_CLIENT_ID || '';

  return {
    auth: {
      // Identificador PÚBLICO do app registrado no Entra ID (não é segredo).
      clientId,
      authority: resolverAuthority(env),
      redirectUri: resolverRedirectUri(env),
      postLogoutRedirectUri:
        env.VITE_ENTRA_POST_LOGOUT_REDIRECT_URI || resolverRedirectUri(env),
      // Retorna o usuário à rota originalmente solicitada após o redirect.
      navigateToLoginRequestUrl: true,
    },
    cache: {
      // `sessionStorage` reduz a janela de persistência do token no navegador.
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  };
}

/**
 * Request de login (OIDC + escopos de API opcionais). Os escopos de acesso à
 * API vêm de `VITE_ENTRA_API_SCOPES` (ex.: `api://orcamento-mt/access`), usados
 * para obter o access token anexado às chamadas (tarefa 7.2).
 *
 * @param {Record<string, string|undefined>} [env=import.meta.env]
 * @returns {{ scopes: string[] }}
 */
export function construirLoginRequest(env = lerEnvVite()) {
  const escoposApi = parseEscopos(env.VITE_ENTRA_API_SCOPES);
  const scopes = Array.from(new Set([...ESCOPOS_OIDC, ...escoposApi]));
  return { scopes };
}

/**
 * Request para aquisição de access token da API (apenas escopos de API).
 *
 * @param {Record<string, string|undefined>} [env=import.meta.env]
 * @returns {{ scopes: string[] }}
 */
export function construirTokenRequest(env = lerEnvVite()) {
  const escoposApi = parseEscopos(env.VITE_ENTRA_API_SCOPES);
  return { scopes: escoposApi.length ? escoposApi : [...ESCOPOS_OIDC] };
}

/**
 * Indica se a configuração mínima necessária está presente (clientId + authority).
 * Permite ao app degradar com indicação clara quando o ambiente não está
 * configurado, em vez de falhar de forma opaca.
 *
 * @param {Record<string, string|undefined>} [env=import.meta.env]
 * @returns {boolean}
 */
export function msalConfigurado(env = lerEnvVite()) {
  const cfg = construirMsalConfig(env);
  return Boolean(cfg.auth.clientId && cfg.auth.authority);
}
