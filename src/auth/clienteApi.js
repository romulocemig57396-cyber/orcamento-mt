/* ─────────────────────────────────────────────────────────────────────────────
   clienteApi.js — cliente HTTP do front que anexa o access token (Bearer) (R1.1/1.7)

   Toda chamada à API serverless é autenticada: o cliente obtém SILENCIOSAMENTE o
   access token do provedor de autenticação (injetado — ver src/auth/contexto) e
   o anexa como `Authorization: Bearer <token>`. O front não valida o token; a
   validação de assinatura/claims é server-side (src/api/auth/validarToken).

   TRATAMENTO DE FALHA/TIMEOUT DE AUTENTICAÇÃO (R1.7):
   - Se a aquisição do token falhar/expirar, OU se a API responder 401 por falha
     de autenticação (corpo { permitirNovaTentativa: true } vindo da API), o
     cliente devolve um ERRO ESTRUTURADO `ErroAutenticacao` com `permitirNovaTentativa`,
     para a UI apresentar a indicação de falha e oferecer nova tentativa.
   - Há um timeout configurável no fluxo (default 30 s, alinhado ao back-end): se a
     obtenção do token ou a requisição exceder o limite, trata-se como falha de
     autenticação/comunicação com nova tentativa permitida.
   - 401 por token inválido (sem `permitirNovaTentativa`) sinaliza necessidade de
     NOVA AUTENTICAÇÃO (`exigirNovaAutenticacao: true`).

   INTEGRAÇÃO COM A TAREFA 7.1:
   O token é obtido do contexto/wrapper de autenticação (MSAL) da tarefa 7.1, que
   expõe `adquirirToken({ scopes })`. O cliente, porém, depende apenas de um
   `provedorToken` com `obterToken()` — contrato mínimo e injetável. O adaptador
   `provedorTokenDeAuth` converte `adquirirToken` nesse contrato, mantendo o
   cliente desacoplado do MSAL e plenamente testável com mocks.

   TESTÁVEL: o provedor de token e a implementação de `fetch` são injetáveis.
   ───────────────────────────────────────────────────────────────────────────── */

/** Timeout padrão do fluxo de autenticação no front (R1.7): 30 s (alinhado ao back-end). */
export const TIMEOUT_AUTENTICACAO_MS = 30_000;

/** Erro estruturado de autenticação/autorização em chamadas à API. */
export class ErroAutenticacao extends Error {
  /**
   * @param {string} mensagem
   * @param {Object} [opcoes]
   * @param {string} [opcoes.motivo]                 Código legível do motivo.
   * @param {boolean} [opcoes.permitirNovaTentativa] true quando a UI pode retentar (R1.7).
   * @param {boolean} [opcoes.exigirNovaAutenticacao] true quando é preciso reautenticar (R1.3).
   * @param {boolean} [opcoes.naoAutorizado]         true quando autenticado porém sem autorização (R1.6).
   * @param {number} [opcoes.status]                 Status HTTP associado, se houver.
   */
  constructor(mensagem, opcoes = {}) {
    super(mensagem);
    this.name = 'ErroAutenticacao';
    this.motivo = opcoes.motivo ?? null;
    this.permitirNovaTentativa = Boolean(opcoes.permitirNovaTentativa);
    this.exigirNovaAutenticacao = Boolean(opcoes.exigirNovaAutenticacao);
    this.naoAutorizado = Boolean(opcoes.naoAutorizado);
    this.status = opcoes.status ?? null;
  }
}

/**
 * Executa uma promessa com limite de tempo. Em estouro, rejeita com erro marcado
 * (`.timeout === true`) e aborta via signal para quem o respeitar.
 * @template T
 * @param {(args: { signal: AbortSignal }) => Promise<T>} fn
 * @param {number} ms
 * @returns {Promise<T>}
 */
export function comTimeout(fn, ms) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let terminou = false;
    const timer = setTimeout(() => {
      if (terminou) return;
      terminou = true;
      controller.abort();
      const e = new Error('timeout');
      e.timeout = true;
      reject(e);
    }, ms);

    Promise.resolve()
      .then(() => fn({ signal: controller.signal }))
      .then((v) => {
        if (terminou) return;
        terminou = true;
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        if (terminou) return;
        terminou = true;
        clearTimeout(timer);
        reject(e);
      });
  });
}

/** Normaliza um nome de header para comparação case-insensitive. */
function cabecalho(headers, nome) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(nome);
  const alvo = nome.toLowerCase();
  for (const chave of Object.keys(headers)) {
    if (chave.toLowerCase() === alvo) return headers[chave];
  }
  return undefined;
}

/**
 * Cria um cliente de API que anexa o Bearer token e trata falha/timeout de auth.
 *
 * @param {Object} config
 * @param {{ obterToken: () => Promise<string> }} config.provedorToken
 *        Provedor que obtém SILENCIOSAMENTE o access token (ex.: o contexto de auth).
 * @param {string} [config.baseUrl='']   Prefixo de URL da API (ex.: '/api').
 * @param {typeof fetch} [config.fetch]  Implementação de fetch (injetável para testes).
 * @param {number} [config.timeoutMs]    Timeout do fluxo. Default: TIMEOUT_AUTENTICACAO_MS.
 * @returns {{ requisicao: Function, get: Function, put: Function, delete: Function, post: Function }}
 */
export function criarClienteApi(config) {
  const {
    provedorToken,
    baseUrl = '',
    fetch: fetchImpl = (typeof fetch !== 'undefined' ? fetch : undefined),
    timeoutMs = TIMEOUT_AUTENTICACAO_MS,
  } = config || {};

  if (!provedorToken || typeof provedorToken.obterToken !== 'function') {
    throw new Error('criarClienteApi requer um provedorToken com obterToken().');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('criarClienteApi requer uma implementação de fetch.');
  }

  /**
   * Executa uma requisição autenticada à API.
   * @param {string} caminho            Caminho relativo (concatenado a baseUrl).
   * @param {Object} [opcoes]
   * @param {string} [opcoes.metodo='GET']
   * @param {*} [opcoes.corpo]          Corpo a ser serializado como JSON.
   * @param {Object<string,string>} [opcoes.headers]
   * @returns {Promise<{ status: number, dados: * }>}
   * @throws {ErroAutenticacao} Em falha/timeout de autenticação ou acesso não autorizado.
   */
  async function requisicao(caminho, opcoes = {}) {
    const { metodo = 'GET', corpo, headers = {} } = opcoes;

    // 1) Obtém SILENCIOSAMENTE o access token, respeitando o timeout (R1.7).
    let token;
    try {
      token = await comTimeout(() => provedorToken.obterToken(), timeoutMs);
    } catch (e) {
      if (e && e.timeout) {
        throw new ErroAutenticacao('Tempo de autenticação esgotado. Tente novamente.', {
          motivo: 'timeout_autenticacao',
          permitirNovaTentativa: true,
        });
      }
      throw new ErroAutenticacao('Não foi possível obter as credenciais de acesso.', {
        motivo: 'falha_token',
        permitirNovaTentativa: true,
      });
    }

    // 2) Monta e dispara a requisição com o Bearer anexado, respeitando o timeout.
    const url = `${baseUrl}${caminho}`;
    const cabecalhos = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...headers,
    };
    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';

    let resposta;
    try {
      resposta = await comTimeout(
        ({ signal }) =>
          fetchImpl(url, {
            method: metodo,
            headers: cabecalhos,
            body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
            signal,
          }),
        timeoutMs,
      );
    } catch (e) {
      if (e && e.timeout) {
        throw new ErroAutenticacao('A chamada à API expirou. Tente novamente.', {
          motivo: 'timeout_rede',
          permitirNovaTentativa: true,
        });
      }
      // Falha de rede/comunicação: também permite nova tentativa.
      throw new ErroAutenticacao('Falha de comunicação com a API. Tente novamente.', {
        motivo: 'falha_rede',
        permitirNovaTentativa: true,
      });
    }

    // 3) Interpreta a resposta, com atenção especial a 401/403 (auth/authz).
    const dados = await lerCorpo(resposta);

    if (resposta.status === 401) {
      // A API distingue falha de autenticação (R1.7) de token inválido (R1.3).
      const permitir = Boolean(dados && dados.permitirNovaTentativa);
      throw new ErroAutenticacao(
        (dados && dados.mensagem) || 'Falha de autenticação.',
        {
          motivo: (dados && dados.motivo) || 'nao_autenticado',
          status: 401,
          permitirNovaTentativa: permitir,
          exigirNovaAutenticacao: !permitir,
        },
      );
    }

    if (resposta.status === 403) {
      // Autenticado, porém sem autorização para a operação/aplicação (R1.6/R2).
      throw new ErroAutenticacao(
        (dados && dados.mensagem) || 'Acesso não autorizado.',
        {
          motivo: (dados && dados.motivo) || 'acesso_negado',
          status: 403,
          naoAutorizado: true,
        },
      );
    }

    return { status: resposta.status, dados };
  }

  /** Lê o corpo da resposta como JSON quando aplicável; caso contrário, texto. */
  async function lerCorpo(resposta) {
    const tipo = cabecalho(resposta.headers, 'content-type') || '';
    try {
      if (tipo.includes('application/json')) return await resposta.json();
      const texto = await resposta.text();
      return texto === '' ? null : texto;
    } catch {
      return null;
    }
  }

  return {
    requisicao,
    get: (caminho, opcoes) => requisicao(caminho, { ...opcoes, metodo: 'GET' }),
    put: (caminho, corpo, opcoes) => requisicao(caminho, { ...opcoes, metodo: 'PUT', corpo }),
    post: (caminho, corpo, opcoes) => requisicao(caminho, { ...opcoes, metodo: 'POST', corpo }),
    delete: (caminho, opcoes) => requisicao(caminho, { ...opcoes, metodo: 'DELETE' }),
  };
}

/**
 * Adapta o contexto/wrapper de autenticação da tarefa 7.1 (que expõe
 * `adquirirToken({ scopes })`) para o contrato `provedorToken` que o cliente
 * espera (`obterToken()`). Permite:
 *
 *   const auth = useAuth();                       // AuthContext.jsx (7.1)
 *   const cliente = criarClienteApi({
 *     baseUrl: '/api',
 *     provedorToken: provedorTokenDeAuth(auth),   // bridge
 *   });
 *
 * @param {{ adquirirToken: (opcoes?: object) => Promise<string> }} auth
 *        Objeto com `adquirirToken` (contexto `useAuth` ou wrapper MSAL).
 * @param {Object} [opcoes]
 * @param {string[]} [opcoes.scopes]  Scopes do access token (ex.: scope da API).
 * @returns {{ obterToken: () => Promise<string> }}
 */
export function provedorTokenDeAuth(auth, opcoes = {}) {
  if (!auth || typeof auth.adquirirToken !== 'function') {
    throw new Error('provedorTokenDeAuth requer um objeto com adquirirToken().');
  }
  const { scopes } = opcoes;
  return {
    obterToken: () => auth.adquirirToken(scopes ? { scopes } : undefined),
  };
}
