/* ─────────────────────────────────────────────────────────────────────────────
   sessaoApp.js — raiz de composição da autenticação do front (wiring, tarefa 16.1)

   Este módulo é o PONTO ÚNICO que decide, a partir do ambiente, se o front opera
   COM autenticação Entra ID (quando as variáveis `VITE_` estão configuradas) ou
   SEM autenticação (ambiente local atual — degradação graciosa). Ele também
   expõe o access token da sessão para o cliente de persistência, ligando a
   camada de auth (MSAL, tarefa 7) ao `clienteFront` (tarefa 8.4) — de modo que a
   persistência use a API autenticada quando a API estiver configurada.

   Decisões de wiring:
   - `entraConfigurado()` → há configuração mínima do Entra (clientId+authority)?
     Guarda a exigência de login: só exige quando TRUE (não trava o uso local).
   - `apiConfigurada()`   → há `VITE_API_BASE_URL`? Guarda o uso da API pela
     persistência (sem base, o clienteFront opera só com localStorage).
   - `wrapperApp()`       → wrapper MSAL compartilhado (singleton), criado uma só
     vez e reaproveitado pelo AuthProvider e pelo provedor de token da
     persistência, para que SPA e persistência falem da MESMA sessão.
   - `obterTokenApp()`    → obtém SILENCIOSAMENTE o access token da sessão para a
     API (via `provedorTokenDeAuth`). Sem Entra configurado, devolve null ⇒ a
     persistência cai no cache local (comportamento atual).

   Nenhuma destas funções é chamada na importação do módulo: a criação do wrapper
   é preguiçosa (lazy) para não exigir MSAL/janela em testes e no build.
   ───────────────────────────────────────────────────────────────────────────── */

import {
  criarAuthWrapper,
  criarPublicClientApplication,
  msalConfigurado,
  construirTokenRequest,
} from './index.js';
import { provedorTokenDeAuth } from './clienteApi.js';

/**
 * Lê uma variável `VITE_` do ambiente do Vite de forma segura (sem quebrar em
 * ambientes sem `import.meta.env`, como alguns runners de teste).
 * @param {string} chave
 * @returns {string|undefined}
 */
export function lerEnv(chave) {
  try {
    return typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env[chave]
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Snapshot do ambiente `VITE_` relevante para o wiring. Injetável nos testes.
 * @returns {Record<string,string|undefined>}
 */
function envVite() {
  return {
    VITE_ENTRA_CLIENT_ID: lerEnv('VITE_ENTRA_CLIENT_ID'),
    VITE_ENTRA_AUTHORITY: lerEnv('VITE_ENTRA_AUTHORITY'),
    VITE_ENTRA_TENANT_ID: lerEnv('VITE_ENTRA_TENANT_ID'),
    VITE_ENTRA_REDIRECT_URI: lerEnv('VITE_ENTRA_REDIRECT_URI'),
    VITE_ENTRA_API_SCOPES: lerEnv('VITE_ENTRA_API_SCOPES'),
    VITE_API_BASE_URL: lerEnv('VITE_API_BASE_URL'),
    VITE_AMBIENTE: lerEnv('VITE_AMBIENTE'),
  };
}

/**
 * Indica se o Microsoft Entra ID está configurado (clientId + authority). Quando
 * FALSO, a aplicação continua operando como hoje, sem exigir login (R1.1 —
 * degradação graciosa para o ambiente local).
 *
 * @param {Record<string,string|undefined>} [env]
 * @returns {boolean}
 */
export function entraConfigurado(env = envVite()) {
  return msalConfigurado(env);
}

/**
 * Indica se a API está configurada para a persistência do front (presença de
 * `VITE_API_BASE_URL`). Sem ela, o `clienteFront` usa somente o localStorage.
 *
 * @param {Record<string,string|undefined>} [env]
 * @returns {boolean}
 */
export function apiConfigurada(env = envVite()) {
  return Boolean(env.VITE_API_BASE_URL);
}

// ── Wrapper MSAL compartilhado (singleton preguiçoso) ────────────────────────
let _wrapper = null;

/**
 * Devolve o wrapper de autenticação compartilhado pela aplicação, criando-o na
 * primeira chamada. Reaproveitado pelo AuthProvider (SPA) e pelo provedor de
 * token da persistência, garantindo uma única sessão/fronteira com o MSAL.
 *
 * Só deve ser chamado quando `entraConfigurado()` é verdadeiro (o chamador
 * decide); criar o wrapper sem configuração não falha, mas não há sessão útil.
 *
 * @param {Record<string,string|undefined>} [env]
 * @returns {ReturnType<typeof criarAuthWrapper>}
 */
export function wrapperApp(env = envVite()) {
  if (!_wrapper) {
    _wrapper = criarAuthWrapper({ criarPca: criarPublicClientApplication, env });
  }
  return _wrapper;
}

/**
 * Permite injetar um wrapper nos testes (ou reiniciar o singleton). Em produção
 * não é necessário.
 * @param {ReturnType<typeof criarAuthWrapper>|null} wrapper
 */
export function definirWrapperApp(wrapper) {
  _wrapper = wrapper;
}

/**
 * Obtém SILENCIOSAMENTE o access token da API a partir da sessão compartilhada.
 *
 * - Sem Entra configurado: devolve `null` (a persistência cai no cache local —
 *   comportamento local atual, sem rede).
 * - Com Entra configurado: usa o wrapper compartilhado via `provedorTokenDeAuth`
 *   para adquirir o token nos escopos da API (`VITE_ENTRA_API_SCOPES`). Qualquer
 *   falha (ex.: sem sessão ainda) resulta em `null`, mantendo a degradação
 *   graciosa — a persistência não quebra, apenas não grava no servidor.
 *
 * @param {Record<string,string|undefined>} [env]
 * @returns {Promise<string|null>}
 */
export async function obterTokenApp(env = envVite()) {
  if (!entraConfigurado(env)) return null;
  try {
    const scopes = construirTokenRequest(env).scopes;
    const provedor = provedorTokenDeAuth(wrapperApp(env), { scopes });
    const token = await provedor.obterToken();
    return token || null;
  } catch {
    // Degradação graciosa: sem token ⇒ persistência usa somente o cache local.
    return null;
  }
}
