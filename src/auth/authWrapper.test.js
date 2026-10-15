import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  criarAuthWrapper,
  AuthError,
  MODO,
  exigeInteracao,
} from './authWrapper.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Testes do wrapper de autenticação (tarefa 7.1) com o MSAL totalmente mockado.

   O wrapper encapsula o @azure/msal-browser atrás de uma interface injetável;
   aqui injetamos um PublicClientApplication falso (`criarPcaMock`) para exercitar
   inicialização, login/logout (redirect e popup) e aquisição de token com
   fallback — sem rede, navegador ou MSAL real. Isso valida que o front usa o
   fluxo Authorization Code + PKCE do MSAL e redireciona ao Entra ID (R1.1) tendo
   o Entra ID como único provedor (R1.5).
   ──────────────────────────────────────────────────────────────────────────── */

/** Erro que imita o InteractionRequiredAuthError do MSAL. */
class InteractionRequiredAuthError extends Error {
  constructor(msg = 'interaction_required') {
    super(msg);
    this.name = 'InteractionRequiredAuthError';
    this.errorCode = 'interaction_required';
  }
}

/** Cria um PublicClientApplication mockado com estado de conta ativa. */
function criarPcaMock(over = {}) {
  const estado = { ativa: null, contas: [] };
  const pca = {
    initialize: vi.fn(async () => {}),
    handleRedirectPromise: vi.fn(async () => null),
    getActiveAccount: vi.fn(() => estado.ativa),
    setActiveAccount: vi.fn((c) => {
      estado.ativa = c;
    }),
    getAllAccounts: vi.fn(() => estado.contas),
    loginRedirect: vi.fn(async () => {}),
    loginPopup: vi.fn(async () => ({ account: { homeAccountId: 'conta-1' } })),
    logoutRedirect: vi.fn(async () => {}),
    logoutPopup: vi.fn(async () => {}),
    acquireTokenSilent: vi.fn(async () => ({ accessToken: 'tok-silencioso' })),
    acquireTokenRedirect: vi.fn(async () => {}),
    acquireTokenPopup: vi.fn(async () => ({ accessToken: 'tok-popup' })),
    __estado: estado,
    ...over,
  };
  return pca;
}

const ENV = {
  VITE_ENTRA_CLIENT_ID: 'client-abc',
  VITE_ENTRA_TENANT_ID: 'tenant-xyz',
  VITE_ENTRA_API_SCOPES: 'api://orcamento-mt/access',
};

describe('exigeInteracao', () => {
  test('reconhece InteractionRequiredAuthError por nome', () => {
    expect(exigeInteracao(new InteractionRequiredAuthError())).toBe(true);
  });
  test('reconhece por errorCode conhecido', () => {
    expect(exigeInteracao({ errorCode: 'login_required' })).toBe(true);
    expect(exigeInteracao({ errorCode: 'consent_required' })).toBe(true);
  });
  test('não dispara para erros genéricos', () => {
    expect(exigeInteracao(new Error('rede'))).toBe(false);
    expect(exigeInteracao(null)).toBe(false);
  });
});

describe('criarAuthWrapper — pré-condições', () => {
  test('sem pca nem criarPca, operações falham com AuthError sem_instancia', async () => {
    const w = criarAuthWrapper({ env: ENV });
    await expect(w.inicializar()).rejects.toBeInstanceOf(AuthError);
    await expect(w.inicializar()).rejects.toMatchObject({ codigo: 'sem_instancia' });
  });

  test('login antes de inicializar falha com nao_inicializado', async () => {
    const w = criarAuthWrapper({ pca: criarPcaMock(), env: ENV });
    await expect(w.login()).rejects.toMatchObject({ codigo: 'nao_inicializado' });
  });

  test('usa a fábrica criarPca com a config derivada do env', async () => {
    const criarPca = vi.fn((config) => criarPcaMock({ __config: config }));
    const w = criarAuthWrapper({ criarPca, env: ENV });
    await w.inicializar();
    expect(criarPca).toHaveBeenCalledTimes(1);
    const config = criarPca.mock.calls[0][0];
    expect(config.auth.clientId).toBe('client-abc');
    expect(config.auth.authority).toContain('tenant-xyz');
  });
});

describe('inicializar', () => {
  let pca;
  beforeEach(() => {
    pca = criarPcaMock();
  });

  test('chama initialize e handleRedirectPromise', async () => {
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    expect(pca.initialize).toHaveBeenCalled();
    expect(pca.handleRedirectPromise).toHaveBeenCalled();
  });

  test('fixa conta ativa quando o redirect retorna uma conta', async () => {
    const conta = { homeAccountId: 'conta-redirect' };
    pca.handleRedirectPromise = vi.fn(async () => ({ account: conta }));
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    expect(pca.setActiveAccount).toHaveBeenCalledWith(conta);
    expect(w.estaAutenticado()).toBe(true);
    expect(w.obterConta()).toBe(conta);
  });

  test('adota a primeira conta conhecida quando não há conta ativa', async () => {
    const conta = { homeAccountId: 'conta-cache' };
    pca.getAllAccounts = vi.fn(() => [conta]);
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    expect(pca.setActiveAccount).toHaveBeenCalledWith(conta);
  });

  test('sem conta, não autenticado', async () => {
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    expect(w.estaAutenticado()).toBe(false);
    expect(w.obterConta()).toBeNull();
  });
});

describe('login (R1.1 — redireciona ao Entra ID)', () => {
  test('modo redirect chama loginRedirect com escopos OIDC + API', async () => {
    const pca = criarPcaMock();
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    const r = await w.login();
    expect(r).toBeNull();
    expect(pca.loginRedirect).toHaveBeenCalledTimes(1);
    const req = pca.loginRedirect.mock.calls[0][0];
    expect(req.scopes).toEqual(
      expect.arrayContaining(['openid', 'profile', 'api://orcamento-mt/access'])
    );
    expect(pca.loginPopup).not.toHaveBeenCalled();
  });

  test('modo popup chama loginPopup e fixa a conta ativa', async () => {
    const pca = criarPcaMock();
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    const r = await w.login({ modo: MODO.POPUP });
    expect(pca.loginPopup).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ account: { homeAccountId: 'conta-1' } });
    expect(pca.setActiveAccount).toHaveBeenCalledWith({ homeAccountId: 'conta-1' });
    expect(w.estaAutenticado()).toBe(true);
  });

  test('falha de login é encapsulada em AuthError com nova tentativa', async () => {
    const pca = criarPcaMock({
      loginRedirect: vi.fn(async () => {
        throw new Error('popup bloqueado');
      }),
    });
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    await expect(w.login()).rejects.toMatchObject({
      codigo: 'falha_login',
      permitirNovaTentativa: true,
    });
  });
});

describe('logout', () => {
  test('redirect chama logoutRedirect com a conta ativa', async () => {
    const conta = { homeAccountId: 'conta-logout' };
    const pca = criarPcaMock({ getActiveAccount: vi.fn(() => conta) });
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    await w.logout();
    expect(pca.logoutRedirect).toHaveBeenCalledWith({ account: conta });
  });

  test('popup chama logoutPopup', async () => {
    const pca = criarPcaMock();
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    await w.logout({ modo: MODO.POPUP });
    expect(pca.logoutPopup).toHaveBeenCalledTimes(1);
  });
});

describe('adquirirToken (silencioso com fallback)', () => {
  test('retorna o access token da aquisição silenciosa', async () => {
    const pca = criarPcaMock();
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    const token = await w.adquirirToken();
    expect(token).toBe('tok-silencioso');
    expect(pca.acquireTokenSilent).toHaveBeenCalledTimes(1);
    const req = pca.acquireTokenSilent.mock.calls[0][0];
    expect(req.scopes).toEqual(['api://orcamento-mt/access']);
  });

  test('InteractionRequired no modo popup cai para acquireTokenPopup', async () => {
    const pca = criarPcaMock({
      acquireTokenSilent: vi.fn(async () => {
        throw new InteractionRequiredAuthError();
      }),
    });
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    const token = await w.adquirirToken({ modoFallback: MODO.POPUP });
    expect(token).toBe('tok-popup');
    expect(pca.acquireTokenPopup).toHaveBeenCalledTimes(1);
  });

  test('InteractionRequired no modo redirect dispara acquireTokenRedirect e sinaliza interacao_requerida', async () => {
    const pca = criarPcaMock({
      acquireTokenSilent: vi.fn(async () => {
        throw new InteractionRequiredAuthError();
      }),
    });
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    await expect(w.adquirirToken()).rejects.toMatchObject({
      codigo: 'interacao_requerida',
      permitirNovaTentativa: true,
    });
    expect(pca.acquireTokenRedirect).toHaveBeenCalledTimes(1);
  });

  test('erro não-interativo vira AuthError falha_token', async () => {
    const pca = criarPcaMock({
      acquireTokenSilent: vi.fn(async () => {
        throw new Error('indisponível');
      }),
    });
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    await expect(w.adquirirToken()).rejects.toMatchObject({ codigo: 'falha_token' });
  });

  test('aquisição silenciosa sem accessToken vira AuthError sem_token', async () => {
    const pca = criarPcaMock({
      acquireTokenSilent: vi.fn(async () => ({ accessToken: '' })),
    });
    const w = criarAuthWrapper({ pca, env: ENV });
    await w.inicializar();
    await expect(w.adquirirToken()).rejects.toMatchObject({ codigo: 'sem_token' });
  });
});
