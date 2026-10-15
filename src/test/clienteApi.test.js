import { describe, test, expect, vi } from 'vitest';
import { criarClienteApi, ErroAutenticacao, provedorTokenDeAuth } from '../auth/clienteApi.js';

/** fetch falso que devolve uma RespostaApi-like simples. */
function fakeFetch({ status = 200, json = null, texto = null, contentType = 'application/json; charset=utf-8' } = {}) {
  return vi.fn(async () => ({
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? contentType : undefined) },
    json: async () => json,
    text: async () => texto ?? '',
  }));
}

const provedorToken = (token = 'tok-123') => ({ obterToken: vi.fn(async () => token) });

describe('clienteApi — anexo de token (R1.1)', () => {
  test('anexa o access token como Bearer no cabeçalho Authorization', async () => {
    const fetch = fakeFetch({ status: 200, json: { ok: true } });
    const cliente = criarClienteApi({ provedorToken: provedorToken('abc'), baseUrl: '/api', fetch });

    const r = await cliente.get('/orcamentos');

    expect(r.status).toBe(200);
    expect(r.dados).toEqual({ ok: true });
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer abc');
  });

  test('obtém o token silenciosamente a cada requisição', async () => {
    const prov = provedorToken('xyz');
    const fetch = fakeFetch({ status: 200, json: {} });
    const cliente = criarClienteApi({ provedorToken: prov, fetch });

    await cliente.get('/health');
    await cliente.put('/orcamentos/1', { a: 1 });

    expect(prov.obterToken).toHaveBeenCalledTimes(2);
    const [, opts] = fetch.mock.calls[1];
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ a: 1 });
  });

  test('anexa o token RENOVADO em requisições subsequentes (R1.1)', async () => {
    // Simula renovação silenciosa: o provedor devolve um novo access token na 2ª chamada.
    const prov = {
      obterToken: vi
        .fn()
        .mockResolvedValueOnce('tok-antigo')
        .mockResolvedValueOnce('tok-renovado'),
    };
    const fetch = fakeFetch({ status: 200, json: {} });
    const cliente = criarClienteApi({ provedorToken: prov, fetch });

    await cliente.get('/orcamentos');
    await cliente.get('/orcamentos');

    const [, primeira] = fetch.mock.calls[0];
    const [, segunda] = fetch.mock.calls[1];
    expect(primeira.headers.Authorization).toBe('Bearer tok-antigo');
    expect(segunda.headers.Authorization).toBe('Bearer tok-renovado');
  });

  test('não anexa Content-Type em GET sem corpo, mas anexa em requisições com corpo', async () => {
    const fetch = fakeFetch({ status: 200, json: {} });
    const cliente = criarClienteApi({ provedorToken: provedorToken('abc'), fetch });

    await cliente.get('/orcamentos');
    await cliente.post('/orcamentos', { nome: 'x' });

    const [, get] = fetch.mock.calls[0];
    const [, post] = fetch.mock.calls[1];
    expect(get.headers['Content-Type']).toBeUndefined();
    expect(get.body).toBeUndefined();
    expect(post.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(post.body)).toEqual({ nome: 'x' });
  });
});

describe('clienteApi — falha/timeout de autenticação (R1.7)', () => {
  test('falha ao obter token vira ErroAutenticacao com nova tentativa permitida', async () => {
    const prov = { obterToken: vi.fn(async () => { throw new Error('sem_token'); }) };
    const cliente = criarClienteApi({ provedorToken: prov, fetch: fakeFetch() });

    await expect(cliente.get('/x')).rejects.toMatchObject({
      name: 'ErroAutenticacao',
      permitirNovaTentativa: true,
      motivo: 'falha_token',
    });
  });

  test('timeout na obtenção do token sinaliza nova tentativa', async () => {
    const prov = { obterToken: () => new Promise(() => {}) }; // nunca resolve
    const cliente = criarClienteApi({ provedorToken: prov, fetch: fakeFetch(), timeoutMs: 10 });

    const erro = await cliente.get('/x').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroAutenticacao);
    expect(erro.motivo).toBe('timeout_autenticacao');
    expect(erro.permitirNovaTentativa).toBe(true);
  });

  test('timeout na requisição à API sinaliza nova tentativa', async () => {
    const fetch = vi.fn(() => new Promise(() => {})); // fetch nunca resolve
    const cliente = criarClienteApi({ provedorToken: provedorToken(), fetch, timeoutMs: 10 });

    const erro = await cliente.get('/x').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroAutenticacao);
    expect(erro.motivo).toBe('timeout_rede');
    expect(erro.permitirNovaTentativa).toBe(true);
  });

  test('falha de rede (rejeição do fetch) vira falha_rede com nova tentativa', async () => {
    // Rejeição imediata (não-timeout) do fetch: comunicação falhou, mas pode retentar (R1.7).
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const cliente = criarClienteApi({ provedorToken: provedorToken(), fetch });

    const erro = await cliente.get('/x').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroAutenticacao);
    expect(erro.motivo).toBe('falha_rede');
    expect(erro.permitirNovaTentativa).toBe(true);
    expect(erro.exigirNovaAutenticacao).toBe(false);
  });

  test('nova tentativa após falha de rede: a segunda chamada tem sucesso (R1.7)', async () => {
    // Primeira chamada falha a rede; a UI retenta e a segunda devolve 200.
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        status: 200,
        headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : undefined) },
        json: async () => ({ ok: true }),
        text: async () => '',
      });
    const cliente = criarClienteApi({ provedorToken: provedorToken(), fetch });

    await expect(cliente.get('/x')).rejects.toMatchObject({ motivo: 'falha_rede', permitirNovaTentativa: true });
    const r = await cliente.get('/x');
    expect(r.status).toBe(200);
    expect(r.dados).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('401 com permitirNovaTentativa (falha de auth) mantém nova tentativa', async () => {
    const fetch = fakeFetch({ status: 401, json: { erro: 'falha_autenticacao', mensagem: 'tente de novo', permitirNovaTentativa: true, motivo: 'timeout_idp' } });
    const cliente = criarClienteApi({ provedorToken: provedorToken(), fetch });

    const erro = await cliente.get('/x').catch((e) => e);
    expect(erro.status).toBe(401);
    expect(erro.permitirNovaTentativa).toBe(true);
    expect(erro.exigirNovaAutenticacao).toBe(false);
  });

  test('401 por token inválido exige nova autenticação (R1.3)', async () => {
    const fetch = fakeFetch({ status: 401, json: { erro: 'token_invalido', permitirNovaTentativa: false } });
    const cliente = criarClienteApi({ provedorToken: provedorToken(), fetch });

    const erro = await cliente.get('/x').catch((e) => e);
    expect(erro.status).toBe(401);
    expect(erro.permitirNovaTentativa).toBe(false);
    expect(erro.exigirNovaAutenticacao).toBe(true);
  });
});

describe('provedorTokenDeAuth — bridge com o contexto 7.1', () => {
  test('adapta adquirirToken() do contexto/wrapper em obterToken() e repassa scopes', async () => {
    const auth = { adquirirToken: vi.fn(async () => 'tok-msal') };
    const prov = provedorTokenDeAuth(auth, { scopes: ['api://x/.default'] });

    const fetch = fakeFetch({ status: 200, json: { ok: 1 } });
    const cliente = criarClienteApi({ provedorToken: prov, baseUrl: '/api', fetch });
    await cliente.get('/orcamentos');

    expect(auth.adquirirToken).toHaveBeenCalledWith({ scopes: ['api://x/.default'] });
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer tok-msal');
  });

  test('rejeita objeto sem adquirirToken', () => {
    expect(() => provedorTokenDeAuth({})).toThrow();
  });
});

describe('clienteApi — acesso não autorizado (R1.6)', () => {
  test('403 vira ErroAutenticacao marcado como não autorizado', async () => {
    const fetch = fakeFetch({ status: 403, json: { erro: 'acesso_negado', mensagem: 'sem permissão' } });
    const cliente = criarClienteApi({ provedorToken: provedorToken(), fetch });

    const erro = await cliente.get('/orcamentos').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroAutenticacao);
    expect(erro.status).toBe(403);
    expect(erro.naoAutorizado).toBe(true);
  });
});
