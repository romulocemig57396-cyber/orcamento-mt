/* ─────────────────────────────────────────────────────────────────────────────
   validarToken.js — validação de token de identidade (OIDC) contra JWKS (R1.2/1.3/1.7)

   A API valida, em toda requisição a rota protegida, o token apresentado pelo
   front (Bearer) contra as chaves públicas (JWKS) do tenant Entra ID. São
   verificados quatro aspectos — emissor, audiência, assinatura e expiração — e
   a sessão só é estabelecida se TODOS forem válidos (R1.2); caso contrário, o
   acesso é recusado com 401 (R1.3). Se a comunicação com o IdP (obtenção do
   JWKS) não concluir em 30 s, devolve-se falha permitindo nova tentativa (R1.7).

   DESIGN — funções puras e injeção de dependências:
   A obtenção do JWKS e a verificação de assinatura são INJETÁVEIS, para que os
   testes exercitem a lógica sem rede nem bibliotecas pesadas de cripto:

     - `resolverJwks(kid, { signal })` → Promise<chave> : resolve a chave pública
       do tenant para o `kid` do cabeçalho do token. Pode respeitar o `signal`
       de aborto (timeout). Lança/rejeita se a chave for desconhecida.
     - `verificarAssinatura(token, chave)` → boolean : confirma a assinatura do
       token com a chave pública (true = íntegra).

   O token é tratado de forma estrutural (header/payload/assinatura já separados
   por `decodificarToken`), mantendo o núcleo determinístico e testável.
   ───────────────────────────────────────────────────────────────────────────── */

import { erro } from '../http.js';

/** Timeout padrão do fluxo de autenticação (R1.7): 30 segundos. */
export const TIMEOUT_AUTENTICACAO_MS = 30_000;

/**
 * Motivos estruturados de recusa. `timeout_idp` é distinto dos demais porque
 * mapeia R1.7 (permite nova tentativa), enquanto os outros mapeiam R1.3.
 * @readonly
 */
export const MOTIVO = Object.freeze({
  AUSENTE: 'token_ausente',
  MALFORMADO: 'token_malformado',
  EMISSOR: 'emissor_invalido',
  AUDIENCIA: 'audiencia_invalida',
  ASSINATURA: 'assinatura_invalida',
  EXPIRADO: 'token_expirado',
  TIMEOUT_IDP: 'timeout_idp',
  FALHA_IDP: 'falha_idp',
});

/**
 * @typedef {Object} ResultadoValidacao
 * @property {boolean} ok                 true se o token é íntegro em todos os aspectos.
 * @property {Object|null} sessao         Sessão parcial estabelecida (quando ok), ou null.
 * @property {string|null} motivo         Código do MOTIVO quando `ok` é false.
 * @property {boolean} permitirNovaTentativa  true quando a falha é de comunicação (R1.7).
 */

/** Extrai o token Bearer do cabeçalho Authorization. */
export function extrairBearer(headers = {}) {
  const bruto = headers.authorization ?? headers.Authorization ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(String(bruto).trim());
  return m ? m[1].trim() : null;
}

/** Decodifica base64url (sem dependência externa) para string UTF-8. */
function base64urlParaTexto(segmento) {
  const base64 = segmento.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  // atob existe em browser e em Node moderno (globalThis.atob).
  const bin = atob(base64 + pad);
  // Reconstrói bytes → UTF-8.
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Decodifica a estrutura de um JWT (header.payload.assinatura) sem validar nada.
 * Retorna null se o formato não for de três segmentos ou o JSON for inválido.
 * @param {string} token
 * @returns {{ header: object, payload: object, assinatura: string }|null}
 */
export function decodificarToken(token) {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3 || partes.some((p) => p.length === 0)) return null;
  try {
    const header = JSON.parse(base64urlParaTexto(partes[0]));
    const payload = JSON.parse(base64urlParaTexto(partes[1]));
    if (header === null || typeof header !== 'object') return null;
    if (payload === null || typeof payload !== 'object') return null;
    return { header, payload, assinatura: partes[2] };
  } catch {
    return null;
  }
}

/** Verdadeiro se o claim `aud` do token contém a audiência esperada. */
function audienciaConfere(aud, esperada) {
  if (Array.isArray(aud)) return aud.includes(esperada);
  return aud === esperada;
}

/**
 * Executa uma promessa com um limite de tempo. Se exceder, rejeita com um erro
 * marcado (`.timeout === true`) e sinaliza o aborto para quem respeita o signal.
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
      .then((valor) => {
        if (terminou) return;
        terminou = true;
        clearTimeout(timer);
        resolve(valor);
      })
      .catch((e) => {
        if (terminou) return;
        terminou = true;
        clearTimeout(timer);
        reject(e);
      });
  });
}

/**
 * Núcleo puro/assíncrono de validação. Retorna um RESULTADO ESTRUTURADO
 * (nunca lança), distinguindo token inválido (R1.3) de timeout do IdP (R1.7).
 *
 * @param {string|null} token  Token JWT bruto (ou null se ausente).
 * @param {Object} opcoes
 * @param {string} opcoes.emissorEsperado        `iss` exigido (autoridade do tenant).
 * @param {string} opcoes.audienciaEsperada      `aud` exigida (client id da API).
 * @param {(kid: string, ctx: { signal: AbortSignal }) => Promise<*>} opcoes.resolverJwks
 *        Resolve a chave pública do tenant para o `kid` do token (injetável).
 * @param {(token: string, chave: *) => (boolean|Promise<boolean>)} opcoes.verificarAssinatura
 *        Confirma a assinatura do token com a chave (injetável).
 * @param {() => number} [opcoes.agora]          Relógio injetável (ms epoch). Default: Date.now.
 * @param {number} [opcoes.toleranciaRelogioS]   Tolerância de clock skew em segundos. Default: 0.
 * @param {number} [opcoes.timeoutMs]            Timeout do fluxo. Default: TIMEOUT_AUTENTICACAO_MS.
 * @returns {Promise<ResultadoValidacao>}
 */
export async function validarTokenNucleo(token, opcoes) {
  const {
    emissorEsperado,
    audienciaEsperada,
    resolverJwks,
    verificarAssinatura,
    agora = Date.now,
    toleranciaRelogioS = 0,
    timeoutMs = TIMEOUT_AUTENTICACAO_MS,
  } = opcoes || {};

  const recusar = (motivo, permitirNovaTentativa = false) => ({
    ok: false,
    sessao: null,
    motivo,
    permitirNovaTentativa,
  });

  if (!token) return recusar(MOTIVO.AUSENTE);

  const decodificado = decodificarToken(token);
  if (!decodificado) return recusar(MOTIVO.MALFORMADO);

  const { header, payload } = decodificado;

  // Emissor (iss) — R1.2/1.3.
  if (payload.iss !== emissorEsperado) return recusar(MOTIVO.EMISSOR);

  // Audiência (aud) — R1.2/1.3.
  if (!audienciaConfere(payload.aud, audienciaEsperada)) return recusar(MOTIVO.AUDIENCIA);

  // Expiração (exp, em segundos epoch) — R1.2/1.3.
  const agoraS = Math.floor(agora() / 1000);
  if (typeof payload.exp !== 'number' || agoraS > payload.exp + toleranciaRelogioS) {
    return recusar(MOTIVO.EXPIRADO);
  }

  // Assinatura (JWKS) — R1.2/1.3, com timeout do IdP — R1.7.
  let chave;
  try {
    chave = await comTimeout(({ signal }) => resolverJwks(header.kid, { signal }), timeoutMs);
  } catch (e) {
    if (e && e.timeout) return recusar(MOTIVO.TIMEOUT_IDP, true);
    // Falha de comunicação (não timeout): também permite nova tentativa (R1.7).
    return recusar(MOTIVO.FALHA_IDP, true);
  }

  let assinaturaOk;
  try {
    assinaturaOk = await verificarAssinatura(token, chave);
  } catch {
    assinaturaOk = false;
  }
  if (!assinaturaOk) return recusar(MOTIVO.ASSINATURA);

  // Todos os aspectos válidos → estabelece a sessão parcial (R1.2).
  return {
    ok: true,
    motivo: null,
    permitirNovaTentativa: false,
    sessao: {
      oid: payload.oid ?? payload.sub ?? null,
      sub: payload.sub ?? null,
      groups: Array.isArray(payload.groups) ? payload.groups : [],
      iss: payload.iss,
      aud: payload.aud,
      exp: payload.exp,
      autenticadoEm: agoraS,
    },
  };
}

/**
 * Cria o gancho `validarToken` consumido por `criarRoteador` (ponto de extensão
 * da tarefa 5.1). Em sucesso, RETORNA a sessão parcial; em falha, LANÇA uma
 * RespostaApi 401 já formatada — o roteador a propaga como resposta.
 *
 * A distinção R1.3 × R1.7 é preservada no corpo da resposta:
 *   - token inválido         → 401 { erro, mensagem, permitirNovaTentativa:false }
 *   - timeout/falha do IdP    → 401 { erro:'falha_autenticacao', permitirNovaTentativa:true }
 *
 * @param {Object} config  Mesmas opções de `validarTokenNucleo` (injeção de deps).
 * @returns {(requisicao: import('../http.js').RequisicaoApi) => Promise<Object>}
 */
export function criarValidadorToken(config) {
  return async function validarToken(requisicao) {
    const token = extrairBearer(requisicao?.headers);
    const resultado = await validarTokenNucleo(token, config);

    if (resultado.ok) return resultado.sessao;

    // Falha de comunicação com o IdP (R1.7): indica falha de autenticação com
    // possibilidade de nova tentativa.
    if (resultado.permitirNovaTentativa) {
      const resposta = erro(
        401,
        'falha_autenticacao',
        'Não foi possível concluir a autenticação. Tente novamente.'
      );
      resposta.corpo.permitirNovaTentativa = true;
      resposta.corpo.motivo = resultado.motivo;
      throw resposta;
    }

    // Token inválido (R1.3): recusa o acesso e exige nova autenticação.
    const resposta = erro(
      401,
      'token_invalido',
      'Token de identidade inválido. Autentique-se novamente.'
    );
    resposta.corpo.permitirNovaTentativa = false;
    resposta.corpo.motivo = resultado.motivo;
    throw resposta;
  };
}
