import { describe, test, expect } from 'vitest';
import {
  construirMsalConfig,
  construirLoginRequest,
  construirTokenRequest,
  criarAuthWrapper,
  criarPublicClientApplication,
  AuthProvider,
  useAuth,
  AuthError,
  MODO,
  ESCOPOS_OIDC,
} from './index.js';

/* Smoke test do barrel: garante que todos os módulos da camada de autenticação
   (incluindo msalInstance → @azure/msal-browser e AuthContext → react) resolvem
   e são exportados. Valida o grafo de importação que o bundler usará. */

describe('src/auth — barrel index', () => {
  test('exporta a API pública esperada', () => {
    expect(typeof construirMsalConfig).toBe('function');
    expect(typeof construirLoginRequest).toBe('function');
    expect(typeof construirTokenRequest).toBe('function');
    expect(typeof criarAuthWrapper).toBe('function');
    expect(typeof criarPublicClientApplication).toBe('function');
    expect(typeof AuthProvider).toBe('function');
    expect(typeof useAuth).toBe('function');
    expect(AuthError).toBeTypeOf('function');
    expect(MODO).toEqual({ REDIRECT: 'redirect', POPUP: 'popup' });
    expect(ESCOPOS_OIDC).toEqual(['openid', 'profile']);
  });

  test('criarPublicClientApplication constrói uma instância real do MSAL', () => {
    const pca = criarPublicClientApplication(
      construirMsalConfig({
        VITE_ENTRA_CLIENT_ID: '11111111-1111-1111-1111-111111111111',
        VITE_ENTRA_TENANT_ID: '22222222-2222-2222-2222-222222222222',
        VITE_ENTRA_REDIRECT_URI: 'https://orcamento.interno/',
      })
    );
    expect(pca).toBeTruthy();
    // A instância do msal-browser expõe estes métodos do contrato usado pelo wrapper.
    expect(typeof pca.initialize).toBe('function');
    expect(typeof pca.acquireTokenSilent).toBe('function');
    expect(typeof pca.loginRedirect).toBe('function');
  });
});
