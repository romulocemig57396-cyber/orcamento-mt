import { describe, test, expect } from 'vitest';
import { criarApi, criarApiDoAmbiente } from '../api/app.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Wiring da API (tarefa 16.1): o bootstrap `criarApi` monta o roteador com os
   ganchos reais (validarToken, resolverSessao+RBAC, autorizar, persistência,
   segredos, logger/métricas), sem deixar nenhum gancho órfão. Estes testes
   exercitam o FLUXO ponta a ponta da API com dependências de borda falsas
   (JWKS/Cosmos/Key Vault), sem Azure real.
   ───────────────────────────────────────────────────────────────────────────── */

const req = (metodo, caminho, extra = {}) => ({
  metodo,
  caminho,
  params: {},
  query: {},
  headers: {},
  corpo: null,
  sessao: null,
  ...extra,
});

// Token JWT falso (3 segmentos base64url) com claims controláveis.
const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const criarToken = (payload, kid = 'k1') =>
  `${b64url({ alg: 'RS256', kid })}.${b64url(payload)}.assinatura`;

const EMISSOR = 'https://login.microsoftonline.com/tenant/v2.0';
const AUDIENCIA = 'api://orcamento-mt';
const GRUPO_EDITOR = '00000000-0000-0000-0000-000000000002';

const configToken = () => ({
  emissorEsperado: EMISSOR,
  audienciaEsperada: AUDIENCIA,
  resolverJwks: async () => ({ chave: 'publica' }),
  verificarAssinatura: () => true,
});

// Container Cosmos falso em memória (contrato mínimo + query p/ listar).
function criarContainerFake() {
  const dados = new Map(); // chave `${ambiente}:${id}` → documento
  return {
    _dados: dados,
    item(id, ambiente) {
      const chave = `${ambiente}:${id}`;
      return {
        async read() {
          const doc = dados.get(chave);
          if (!doc) {
            const e = new Error('not found');
            e.code = 404;
            throw e;
          }
          return { resource: doc };
        },
        async delete() {
          dados.delete(chave);
          return { resource: null };
        },
      };
    },
    items: {
      async upsert(documento) {
        dados.set(`${documento.ambiente}:${documento.id}`, documento);
        return { resource: documento };
      },
      query(_consulta) {
        return {
          async fetchAll() {
            return { resources: [...dados.values()] };
          },
        };
      },
    },
  };
}

describe('Bootstrap da API — wiring ponta a ponta (tarefa 16.1)', () => {
  test('health é pública: responde 200 sem token', async () => {
    const { despachar } = criarApi({ config: configToken() });
    const res = await despachar(req('GET', '/api/health'));
    expect(res.status).toBe(200);
    expect(res.corpo).toEqual({ status: 'ok' });
  });

  test('rota protegida sem token → 401 (validarToken ligado)', async () => {
    const { despachar } = criarApi({ config: configToken() });
    const res = await despachar(req('GET', '/api/orcamentos/1'));
    expect(res.status).toBe(401);
  });

  test('token íntegro de grupo sem mapeamento → 403 sem permissões (RBAC + autorizar)', async () => {
    const { despachar } = criarApi({ config: configToken(), container: criarContainerFake(), ambiente: 'dev' });
    const token = criarToken({
      iss: EMISSOR,
      aud: AUDIENCIA,
      exp: Math.floor(Date.now() / 1000) + 3600,
      oid: 'u1',
      groups: ['grupo-sem-mapeamento'],
    });
    const res = await despachar(
      req('GET', '/api/orcamentos/1', { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(res.status).toBe(403);
    expect(res.corpo.erro).toBe('sem_permissoes');
  });

  test('fluxo autorizado grava e lê um orçamento (persistência Cosmos ligada)', async () => {
    const container = criarContainerFake();
    const { despachar } = criarApi({ config: configToken(), container, ambiente: 'dev' });
    const token = criarToken({
      iss: EMISSOR,
      aud: AUDIENCIA,
      exp: Math.floor(Date.now() / 1000) + 3600,
      oid: 'u1',
      groups: [GRUPO_EDITOR],
    });
    const auth = { authorization: `Bearer ${token}` };

    const grav = await despachar(
      req('PUT', '/api/orcamentos/orc-1', { headers: auth, corpo: { cliente: 'ACME', valorTotal: 10 } }),
    );
    expect([200, 201]).toContain(grav.status);
    expect(grav.corpo.id).toBe('orc-1');
    expect(grav.corpo.dados.cliente).toBe('ACME');

    const leitura = await despachar(req('GET', '/api/orcamentos/orc-1', { headers: auth }));
    expect(leitura.status).toBe(200);
    expect(leitura.corpo.dados.cliente).toBe('ACME');

    const lista = await despachar(req('GET', '/api/orcamentos', { headers: auth }));
    expect(lista.status).toBe(200);
    expect(Array.isArray(lista.corpo)).toBe(true);
    expect(lista.corpo).toHaveLength(1);
  });

  test('leitor não grava: 403 acesso negado, estado inalterado (negação por padrão)', async () => {
    const container = criarContainerFake();
    const { despachar } = criarApi({ config: configToken(), container, ambiente: 'dev' });
    const token = criarToken({
      iss: EMISSOR,
      aud: AUDIENCIA,
      exp: Math.floor(Date.now() / 1000) + 3600,
      oid: 'u2',
      groups: ['00000000-0000-0000-0000-000000000001'], // leitor
    });
    const res = await despachar(
      req('PUT', '/api/orcamentos/orc-2', {
        headers: { authorization: `Bearer ${token}` },
        corpo: { cliente: 'X' },
      }),
    );
    expect(res.status).toBe(403);
    expect(res.corpo.erro).toBe('acesso_negado');
    expect(container._dados.size).toBe(0); // nada gravado
  });

  test('token expirado → 401 (validação de expiração ligada)', async () => {
    const { despachar } = criarApi({ config: configToken() });
    const token = criarToken({
      iss: EMISSOR,
      aud: AUDIENCIA,
      exp: Math.floor(Date.now() / 1000) - 10,
      oid: 'u3',
      groups: [GRUPO_EDITOR],
    });
    const res = await despachar(
      req('GET', '/api/orcamentos/1', { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(res.status).toBe(401);
  });

  test('segredos: recuperador ligado quando há secretClient', async () => {
    const secretClient = {
      async getSecret(nome) {
        return { name: nome, value: 'segredo-valor' };
      },
    };
    const { deps } = criarApi({ config: configToken(), secretClient });
    expect(deps.segredos).toBeDefined();
    const r = await deps.segredos.obterSegredo('cosmos-conn');
    expect(r.ok).toBe(true);
    expect(r.valor).toBe('segredo-valor');
  });

  test('criarApiDoAmbiente lê ambiente e compõe a API', async () => {
    const container = criarContainerFake();
    const { despachar, deps } = criarApiDoAmbiente(
      { API_AMBIENTE: 'hml' },
      { config: configToken(), container },
    );
    expect(deps.persistencia).toBeDefined();
    const res = await despachar(req('GET', '/api/health'));
    expect(res.status).toBe(200);
  });
});
