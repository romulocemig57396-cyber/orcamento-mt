/* ─────────────────────────────────────────────────────────────────────────────
   src/auth — camada de autenticação do front-end (R1.1, R1.5)

   Fluxo OIDC Authorization Code + PKCE via MSAL.js (@azure/msal-browser),
   usando exclusivamente o Microsoft Entra ID como provedor de identidade.
   Nenhum cadastro/senha próprios; nenhum segredo no código (apenas valores
   públicos via variáveis `VITE_`).

   Peças:
   - msalConfig.js    → configuração a partir de variáveis de ambiente.
   - authWrapper.js   → wrapper injetável sobre o MSAL (login/logout/token).
   - msalInstance.js  → fábrica da instância real do PublicClientApplication.
   - AuthContext.jsx  → provider/contexto React de estado de autenticação.

   Uso típico no bootstrap do app:

     import { AuthProvider, criarAuthWrapper, criarPublicClientApplication } from './auth';
     const wrapper = criarAuthWrapper({ criarPca: criarPublicClientApplication });
     <AuthProvider wrapper={wrapper}>...</AuthProvider>

   Nota: usamos import + re-export explícito (em vez de `export ... from`) para
   garantir a ordem de inicialização dos módulos e bindings estáveis em todos os
   ambientes (bundler e runner de testes).
   ───────────────────────────────────────────────────────────────────────────── */

import {
  construirMsalConfig,
  construirLoginRequest,
  construirTokenRequest,
  resolverAuthority,
  resolverRedirectUri,
  parseEscopos,
  msalConfigurado,
  ESCOPOS_OIDC,
} from './msalConfig.js';

import { criarAuthWrapper, AuthError, MODO, exigeInteracao } from './authWrapper.js';
import { criarPublicClientApplication } from './msalInstance.js';
import { AuthProvider, useAuth, AuthContext } from './AuthContext.jsx';

export {
  // config
  construirMsalConfig,
  construirLoginRequest,
  construirTokenRequest,
  resolverAuthority,
  resolverRedirectUri,
  parseEscopos,
  msalConfigurado,
  ESCOPOS_OIDC,
  // wrapper
  criarAuthWrapper,
  AuthError,
  MODO,
  exigeInteracao,
  // instância MSAL real
  criarPublicClientApplication,
  // React
  AuthProvider,
  useAuth,
  AuthContext,
};
