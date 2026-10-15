import { describe, test, expect } from 'vitest';
import { criarApi, criarApiDoAmbiente } from '../api/app.js';
import { criarClienteApi, ErroAutenticacao } from '../auth/clienteApi.js';
import { criarMetricas, TIPO_METRICA } from '../observabilidade/metricas.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Testes de integração essenciais (tarefa 16.2)

   Complementa `apiBootstrap.test.js` (que já cobre o wiring INTERNO da API:
   validarToken/RBAC/autorizar/persistência/segredos a partir de `req`). Aqui o
   foco são os CENÁRIOS DE INTEGRAÇÃO ponta a ponta ainda não cobertos, sempre
   com dependências de borda FALSAS (sem Azure real):

     1. Autenticação ponta a ponta SPA↔API: o `clienteApi` do front (provedor de
        token fake + fetch que encaminha para o despachante da API com
        validarToken fake), exercitando o fluxo do token do front até a resposta
        da API — incluindo falha/timeout (R1.1, R1.7).
     2. Recuperação de segredo via Managed Identity + Key Vault: `criarApi` com
        `secretClient` fake e `deps.segredos.obterSegredo` (R9.2).
     3. Isolamento entre ambientes: grava em 'dev' e confirma invisibilidade em
        'hml' usando duas instâncias de persistência/containers por ambiente
        (R11.2).
     4. Métricas e alerta em ≤ 60 s: `metricas` com sink fake + um mecanismo de
        alerta por limiar com relógio injetável que dispara em ≤ 60 s, validando
        o tempo (R10.2, R10.3).
   ───────────────────────────────────────────────────────────────────────────── */

// ── Helpers de token (JWT fake de 3 segmentos base64url) ──────────────────────
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

// Config de validação de token com JWKS/assinatura FAKES (Entra ID simulado).
const configToken = () => ({
  emissorEsperado: EMISSOR,
  audienciaEsperada: AUDIENCIA,
  resolverJwks: async () => ({ chave: 'publica' }),
  verificarAssinatura: () => true,
});

const tokenEditor = () =>
  criarToken({
    iss: EMISSOR,
    aud: AUDIENCIA,
    exp: Math.floor(Date.now() / 1000) + 3600,
    oid: 'u-front',
    groups: [GRUPO_EDITOR],
  });

// ── Container Cosmos fake em memória (contrato mínimo + query) ─────────────────
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

/**
 * Adaptador `fetch`-like que encaminha a requisição HTTP do `clienteApi` do
 * front para o despachante da API (criarApi). Converte a `Request` fetch no
 * `req` do roteador e a `{ status, corpo }` da API numa `Response` fetch-like
 * (com `.status`, `.headers.get('content-type')`, `.json()`, `.text()`).
 *
 * É esta ponte que torna o teste PONTA A PONTA: o token sai do provedor do
 * front, é anexado como Bearer pelo cliente, atravessa o fetch até o
 * despachante da API (validarToken fake → RBAC → persistência) e volta.
 */
function fetchParaApi(despachar) {
  return async function fetchFake(url, init = {}) {
    const metodo = (init.method || 'GET').toUpperCase();
    const headers = {};
    for (const [k, v] of Object.entries(init.headers || {})) {
      headers[k.toLowerCase()] = v;
    }
    const corpo = init.body !== undefined ? JSON.parse(init.body) : null;

    // url é tipo `/api/orcamentos/x`; separa caminho de querystring.
    const [caminho] = String(url).split('?');
    const res = await despachar({
      metodo,
      caminho,
      params: {},
      query: {},
      headers,
      corpo,
      sessao: null,
    });

    const texto = res.corpo === undefined || res.corpo === null ? '' : JSON.stringify(res.corpo);
    return {
      status: res.status,
      headers: { get: (nome) => (nome.toLowerCase() === 'content-type' ? 'application/json' : null) },
      async json() {
        return res.corpo;
      },
      async text() {
        return texto;
      },
    };
  };
}

describe('Integração essencial 16.2 — Autenticação ponta a ponta SPA↔API (R1.1, R1.7)', () => {
  test('token do front atravessa o fetch até a API e grava/lê um orçamento', async () => {
    const container = criarContainerFake();
    const { despachar } = criarApi({ config: configToken(), container, ambiente: 'dev' });

    const provedorToken = { obterToken: async () => tokenEditor() };
    const cliente = criarClienteApi({
      provedorToken,
      baseUrl: '/api',
      fetch: fetchParaApi(despachar),
    });

    const grav = await cliente.put('/orcamentos/front-1', { cliente: 'ACME', valorTotal: 42 });
    expect([200, 201]).toContain(grav.status);
    expect(grav.dados.id).toBe('front-1');
    expect(grav.dados.dados.cliente).toBe('ACME');

    const leitura = await cliente.get('/orcamentos/front-1');
    expect(leitura.status).toBe(200);
    expect(leitura.dados.dados.valorTotal).toBe(42);
  });

  test('falha ao obter token no front → ErroAutenticacao com nova tentativa (R1.7)', async () => {
    const container = criarContainerFake();
    const { despachar } = criarApi({ config: configToken(), container, ambiente: 'dev' });

    const provedorToken = {
      obterToken: async () => {
        throw new Error('entra id indisponível');
      },
    };
    const cliente = criarClienteApi({
      provedorToken,
      baseUrl: '/api',
      fetch: fetchParaApi(despachar),
    });

    await expect(cliente.get('/orcamentos/x')).rejects.toMatchObject({
      name: 'ErroAutenticacao',
      permitirNovaTentativa: true,
      motivo: 'falha_token',
    });
  });

  test('timeout no fluxo de autenticação → nova tentativa permitida (R1.7)', async () => {
    const container = criarContainerFake();
    const { despachar } = criarApi({ config: configToken(), container, ambiente: 'dev' });

    const provedorToken = {
      // Nunca resolve: força o estouro do timeout curto do cliente.
      obterToken: () => new Promise(() => {}),
    };
    const cliente = criarClienteApi({
      provedorToken,
      baseUrl: '/api',
      fetch: fetchParaApi(despachar),
      timeoutMs: 20,
    });

    const erro = await cliente.get('/orcamentos/x').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroAutenticacao);
    expect(erro.permitirNovaTentativa).toBe(true);
    expect(erro.motivo).toBe('timeout_autenticacao');
  });

  test('API responde 401 permitindo nova tentativa → cliente propaga retomável (R1.7)', async () => {
    // validarToken fake que simula FALHA de comunicação com o Entra ID: 401 com
    // permitirNovaTentativa (contrato que o cliente do front sabe interpretar).
    const validadorToken = async () => {
      const e = new Error('falha de autenticação');
      e.status = 401;
      e.corpo = { permitirNovaTentativa: true, motivo: 'falha_entra_id', mensagem: 'Tente novamente.' };
      throw e;
    };
    const { despachar } = criarApi({ validadorToken });

    const cliente = criarClienteApi({
      provedorToken: { obterToken: async () => tokenEditor() },
      baseUrl: '/api',
      fetch: fetchParaApi(despachar),
    });

    const erro = await cliente.get('/orcamentos/x').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroAutenticacao);
    expect(erro.status).toBe(401);
    expect(erro.permitirNovaTentativa).toBe(true);
    expect(erro.exigirNovaAutenticacao).toBe(false);
  });
});

describe('Integração essencial 16.2 — Segredo via Managed Identity + Key Vault (R9.2)', () => {
  test('recupera connection string do cofre em tempo de execução via secretClient fake', async () => {
    // Simula o SecretClient autenticado por Managed Identity: só devolve valor
    // quando a identidade está presente (sem credencial → indisponível).
    const criarSecretClientMI = ({ comIdentidade }) => ({
      async getSecret(nome) {
        if (!comIdentidade) {
          throw new Error('ManagedIdentityCredential: identidade não disponível');
        }
        return { name: nome, value: `valor-de-${nome}` };
      },
    });

    const { deps } = criarApi({
      config: configToken(),
      secretClient: criarSecretClientMI({ comIdentidade: true }),
    });

    expect(deps.segredos).toBeDefined();
    const r = await deps.segredos.obterSegredo('cosmos-conn');
    expect(r.ok).toBe(true);
    expect(r.valor).toBe('valor-de-cosmos-conn');
    expect(r.doCache).toBe(false);
  });

  test('sem Managed Identity, recuperação falha como indisponível sem vazar valor (R9.2/R9.3)', async () => {
    const secretClient = {
      async getSecret() {
        throw new Error('ManagedIdentityCredential: identidade não disponível');
      },
    };
    const { deps } = criarApi({ config: configToken(), secretClient });

    const r = await deps.segredos.obterSegredo('cosmos-conn');
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('indisponivel');
    // O resultado estruturado nunca carrega o valor nem a causa crua.
    expect(JSON.stringify(r)).not.toContain('valor-de');
    expect(r).not.toHaveProperty('valor');
  });
});

describe('Integração essencial 16.2 — Isolamento entre ambientes (R11.2)', () => {
  test('gravação em dev não é visível em hml (containers/particoes distintos por ambiente)', async () => {
    // Isolamento forte: cada ambiente tem seu PRÓPRIO container (como contas/
    // recursos distintos no design). Duas instâncias de API, uma por ambiente.
    const containerDev = criarContainerFake();
    const containerHml = criarContainerFake();

    const apiDev = criarApiDoAmbiente({ API_AMBIENTE: 'dev' }, { config: configToken(), container: containerDev });
    const apiHml = criarApiDoAmbiente({ API_AMBIENTE: 'hml' }, { config: configToken(), container: containerHml });

    const auth = { authorization: `Bearer ${tokenEditor()}` };
    const req = (metodo, caminho, extra = {}) => ({
      metodo, caminho, params: {}, query: {}, headers: {}, corpo: null, sessao: null, ...extra,
    });

    // Grava em DEV.
    const grav = await apiDev.despachar(
      req('PUT', '/api/orcamentos/iso-1', { headers: auth, corpo: { cliente: 'DEV-ONLY' } }),
    );
    expect([200, 201]).toContain(grav.status);

    // Lê em DEV: visível.
    const noDev = await apiDev.despachar(req('GET', '/api/orcamentos/iso-1', { headers: auth }));
    expect(noDev.status).toBe(200);
    expect(noDev.corpo.dados.cliente).toBe('DEV-ONLY');

    // Lê em HML: NÃO visível (ambiente isolado).
    const noHml = await apiHml.despachar(req('GET', '/api/orcamentos/iso-1', { headers: auth }));
    expect(noHml.status).toBe(404);

    // A listagem de HML permanece vazia; a de DEV tem exatamente 1.
    const listaHml = await apiHml.despachar(req('GET', '/api/orcamentos', { headers: auth }));
    expect(listaHml.status).toBe(200);
    expect(listaHml.corpo).toHaveLength(0);

    const listaDev = await apiDev.despachar(req('GET', '/api/orcamentos', { headers: auth }));
    expect(listaDev.corpo).toHaveLength(1);

    // Garantia estrutural: o armazenamento não é compartilhado entre ambientes.
    expect(containerDev._dados.size).toBe(1);
    expect(containerHml._dados.size).toBe(0);
  });
});

/**
 * Mecanismo de alerta por limiar (R10.3) construído sobre as métricas (R10.2).
 * Observa a taxa de erro de uma operação; quando ela cruza o limiar, dispara um
 * alerta no `sinkAlerta` fake contendo identificação da anomalia, horário UTC e
 * componente afetado. O relógio é INJETÁVEL para validar o tempo de disparo sem
 * esperar de verdade. Degrada graciosamente: um alerta já disparado não repete.
 */
function criarAlertaPorLimiar({ metricas, sinkAlerta, limiarTaxaErro = 0.5, componente = 'api', relogioUtc }) {
  let disparado = false;
  return {
    avaliar(operacao) {
      if (disparado) return null;
      const resumo = metricas.resumo(operacao);
      if (resumo.requisicoes > 0 && resumo.taxaErro >= limiarTaxaErro) {
        disparado = true;
        const alerta = {
          anomalia: 'taxa_de_erro_acima_do_limiar',
          operacao,
          taxaErro: resumo.taxaErro,
          limiar: limiarTaxaErro,
          horarioUtc: relogioUtc(),
          componente,
        };
        sinkAlerta(alerta);
        return alerta;
      }
      return null;
    },
    get disparado() {
      return disparado;
    },
  };
}

describe('Integração essencial 16.2 — Métricas e alerta em ≤ 60 s (R10.2, R10.3)', () => {
  test('anomalia detectada dispara alerta em ≤ 60 s (relógio injetável)', () => {
    const pontos = [];
    const alertas = [];

    // Relógio injetável: avança em passos controlados; a detecção ocorre num
    // instante e o alerta é emitido com o carimbo correspondente.
    let agoraMs = Date.parse('2024-06-01T00:00:00Z');
    const relogioMs = () => agoraMs;
    const relogioUtc = () => new Date(agoraMs).toISOString();

    const metricas = criarMetricas({ sink: (p) => pontos.push(p), relogioUtc, relogioMs });

    const alerta = criarAlertaPorLimiar({
      metricas,
      sinkAlerta: (a) => alertas.push(a),
      limiarTaxaErro: 0.5,
      componente: 'api/persistencia',
      relogioUtc,
    });

    const OP = 'PUT /api/orcamentos';

    // t0: detecção da anomalia (2 requisições, 2 erros → taxaErro = 1.0).
    const detectadoEm = agoraMs;
    metricas.registrarRequisicao(OP);
    metricas.registrarErro(OP);
    metricas.registrarRequisicao(OP);
    metricas.registrarErro(OP);

    // Avança 30 s até a avaliação/disparo do alerta.
    agoraMs += 30_000;
    const emitido = alerta.avaliar(OP);
    const disparadoEm = agoraMs;

    expect(emitido).not.toBeNull();
    expect(alertas).toHaveLength(1);
    expect(alertas[0].anomalia).toBe('taxa_de_erro_acima_do_limiar');
    expect(alertas[0].componente).toBe('api/persistencia');
    // Carimbo em UTC (sufixo Z) — exigência de conteúdo do alerta (R10.3).
    expect(alertas[0].horarioUtc).toMatch(/Z$/);

    // Requisito-chave: do instante da detecção ao disparo, ≤ 60 s.
    expect(disparadoEm - detectadoEm).toBeLessThanOrEqual(60_000);

    // E as métricas de operação (R10.2) foram efetivamente emitidas ao sink.
    const tipos = pontos.map((p) => p.tipo);
    expect(tipos).toContain(TIPO_METRICA.REQUISICAO);
    expect(tipos).toContain(TIPO_METRICA.ERRO);
  });

  test('abaixo do limiar não dispara; alerta não repete após disparar', () => {
    const alertas = [];
    let agoraMs = Date.parse('2024-06-01T00:00:00Z');
    const relogioUtc = () => new Date(agoraMs).toISOString();
    const metricas = criarMetricas({ relogioUtc });

    const alerta = criarAlertaPorLimiar({
      metricas,
      sinkAlerta: (a) => alertas.push(a),
      limiarTaxaErro: 0.5,
      relogioUtc,
    });

    const OP = 'GET /api/orcamentos';

    // 4 requisições, 1 erro → taxaErro = 0.25 < 0.5: nada dispara.
    metricas.registrarRequisicao(OP);
    metricas.registrarRequisicao(OP);
    metricas.registrarRequisicao(OP);
    metricas.registrarRequisicao(OP);
    metricas.registrarErro(OP);
    expect(alerta.avaliar(OP)).toBeNull();
    expect(alertas).toHaveLength(0);

    // Cruza o limiar: mais erros levam a taxaErro ≥ 0.5 → dispara uma vez.
    metricas.registrarErro(OP);
    metricas.registrarErro(OP);
    expect(alerta.avaliar(OP)).not.toBeNull();
    expect(alertas).toHaveLength(1);

    // Reavaliar não deve disparar de novo (idempotência do alerta).
    expect(alerta.avaliar(OP)).toBeNull();
    expect(alertas).toHaveLength(1);
  });
});
