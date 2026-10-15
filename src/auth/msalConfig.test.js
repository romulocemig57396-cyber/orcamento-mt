import { describe, test, expect } from 'vitest';
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

/* Testes das funções puras de configuração do MSAL a partir de env (R1.1, R1.5).
   Nenhum segredo é lido — apenas clientId/authority/redirectUri públicos. */

describe('parseEscopos', () => {
  test('divide por espaço e vírgula, removendo vazios', () => {
    expect(parseEscopos('a b, c ,,d')).toEqual(['a', 'b', 'c', 'd']);
  });
  test('entrada ausente retorna lista vazia', () => {
    expect(parseEscopos(undefined)).toEqual([]);
    expect(parseEscopos('')).toEqual([]);
  });
});

describe('resolverAuthority', () => {
  test('authority explícita tem prioridade', () => {
    expect(
      resolverAuthority({ VITE_ENTRA_AUTHORITY: 'https://x/y', VITE_ENTRA_TENANT_ID: 't' })
    ).toBe('https://x/y');
  });
  test('monta a authority a partir do tenant', () => {
    expect(resolverAuthority({ VITE_ENTRA_TENANT_ID: 'tenant-1' })).toBe(
      'https://login.microsoftonline.com/tenant-1'
    );
  });
  test('sem authority nem tenant retorna undefined', () => {
    expect(resolverAuthority({})).toBeUndefined();
  });
});

describe('resolverRedirectUri', () => {
  test('usa o valor informado', () => {
    expect(resolverRedirectUri({ VITE_ENTRA_REDIRECT_URI: 'https://app/' })).toBe(
      'https://app/'
    );
  });
  test('cai para a origem atual (jsdom) quando ausente', () => {
    // Em jsdom, window.location.origin existe.
    expect(resolverRedirectUri({})).toBe(window.location.origin);
  });
});

describe('construirMsalConfig', () => {
  const env = {
    VITE_ENTRA_CLIENT_ID: 'client-1',
    VITE_ENTRA_TENANT_ID: 'tenant-1',
    VITE_ENTRA_REDIRECT_URI: 'https://orcamento/',
  };

  test('mapeia clientId/authority/redirectUri públicos', () => {
    const cfg = construirMsalConfig(env);
    expect(cfg.auth.clientId).toBe('client-1');
    expect(cfg.auth.authority).toBe('https://login.microsoftonline.com/tenant-1');
    expect(cfg.auth.redirectUri).toBe('https://orcamento/');
    expect(cfg.auth.navigateToLoginRequestUrl).toBe(true);
  });

  test('não expõe nenhum campo de segredo (sem clientSecret)', () => {
    const cfg = construirMsalConfig(env);
    expect(JSON.stringify(cfg).toLowerCase()).not.toContain('secret');
  });

  test('cacheLocation em sessionStorage, sem cookie', () => {
    const cfg = construirMsalConfig(env);
    expect(cfg.cache.cacheLocation).toBe('sessionStorage');
    expect(cfg.cache.storeAuthStateInCookie).toBe(false);
  });
});

describe('login/token requests', () => {
  test('login inclui escopos OIDC + escopos de API, sem duplicatas', () => {
    const req = construirLoginRequest({
      VITE_ENTRA_API_SCOPES: 'openid api://x/acesso',
    });
    expect(req.scopes).toEqual(
      expect.arrayContaining([...ESCOPOS_OIDC, 'api://x/acesso'])
    );
    // 'openid' não deve duplicar.
    expect(req.scopes.filter((s) => s === 'openid')).toHaveLength(1);
  });

  test('tokenRequest usa apenas escopos de API quando presentes', () => {
    const req = construirTokenRequest({ VITE_ENTRA_API_SCOPES: 'api://x/acesso' });
    expect(req.scopes).toEqual(['api://x/acesso']);
  });

  test('tokenRequest cai para OIDC quando não há escopos de API', () => {
    const req = construirTokenRequest({});
    expect(req.scopes).toEqual([...ESCOPOS_OIDC]);
  });
});

describe('msalConfigurado', () => {
  test('true quando clientId e authority presentes', () => {
    expect(
      msalConfigurado({ VITE_ENTRA_CLIENT_ID: 'c', VITE_ENTRA_TENANT_ID: 't' })
    ).toBe(true);
  });
  test('false quando falta clientId', () => {
    expect(msalConfigurado({ VITE_ENTRA_TENANT_ID: 't' })).toBe(false);
  });
});
