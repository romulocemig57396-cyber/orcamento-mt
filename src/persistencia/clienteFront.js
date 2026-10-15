/* ─────────────────────────────────────────────────────────────────────────────
   clienteFront.js — cliente de persistência do front (API + cache localStorage)

   Papel na adequação (R5.1, design "Decisão de persistência" e "Front-end"):
   substitui o acesso DIRETO ao `localStorage` do `useOrcamento` por um cliente
   que fala com a API serverless (`GET`/`PUT /api/orcamentos/{id}`), usando o
   `localStorage` como CACHE local/offline. A API é a fonte da verdade quando
   configurada; o cache garante trabalho offline/rascunho e resiliência a
   oscilação de rede.

   Degradação graciosa (ambiente local, hoje):
   - Se a API NÃO estiver configurada (sem `baseUrl` ou sem token), o cliente
     opera SOMENTE com o `localStorage`, reproduzindo exatamente o comportamento
     atual do app. Nenhuma rede é tocada.

   Injeção de dependência (testabilidade sem rede real):
   - `fetchFn`     função de fetch (default: `globalThis.fetch`).
   - `obterToken`  função (sync/async) que devolve o access token (Bearer) obtido
                   pela camada de autenticação (MSAL, tarefa 7). Sem token ⇒ a
                   API é considerada não configurada e cai no cache local.
   - `armazenamento` objeto compatível com a Storage API (default: localStorage).
   - `baseUrl`     base da API (ex.: '' para mesmo host, ou 'https://.../').

   Este módulo NÃO altera a lógica de cálculo: o estado de orçamento (`dados`) é
   preservado tal como hoje; o envelope corporativo é tratado por `modelo.js`.
   ───────────────────────────────────────────────────────────────────────────── */

import {
  criarDocumentoOrcamento,
  normalizarDocumentoOrcamento,
  extrairDados,
} from './modelo.js';

/** Chave de cache local (mesma chave histórica do app, para herdar rascunhos). */
export const CHAVE_CACHE = 'orcamento_mt_app';

/** Estratégias de resolução de conflito entre a versão do servidor e a local. */
export const ESTRATEGIA_CONFLITO = Object.freeze({
  // "Último a vencer": compara `atualizadoEm`; vence o carimbo mais recente.
  ULTIMO_A_VENCER: 'ultimo-a-vencer',
  // Prefere o servidor como fonte da verdade (ignora `atualizadoEm`).
  PREFERIR_SERVIDOR: 'preferir-servidor',
  // Prefere o local (mantém o rascunho desta máquina).
  MANTER_LOCAL: 'manter-local',
});

const ORIGEM = Object.freeze({ SERVIDOR: 'servidor', LOCAL: 'local', NENHUM: 'nenhum' });

// Converte um instante ISO 8601 em milissegundos; inválido/ausente ⇒ -Infinity
// (assim um documento sem carimbo nunca "vence" um com carimbo válido).
const instante = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? -Infinity : t;
};

/**
 * Resolve o conflito entre o documento do servidor e o do cache local.
 * Retorna qual documento prevalece e a origem escolhida — função PURA, sem rede.
 *
 * @param {Object|null} servidor  Documento envelopado vindo da API (ou null).
 * @param {Object|null} local     Documento envelopado do cache local (ou null).
 * @param {string} [estrategia]   Uma de ESTRATEGIA_CONFLITO.
 * @returns {{ documento: Object|null, origem: string }}
 */
export const resolverConflito = (
  servidor,
  local,
  estrategia = ESTRATEGIA_CONFLITO.ULTIMO_A_VENCER,
) => {
  if (!servidor && !local) return { documento: null, origem: ORIGEM.NENHUM };
  if (!servidor) return { documento: local, origem: ORIGEM.LOCAL };
  if (!local) return { documento: servidor, origem: ORIGEM.SERVIDOR };

  if (estrategia === ESTRATEGIA_CONFLITO.PREFERIR_SERVIDOR) {
    return { documento: servidor, origem: ORIGEM.SERVIDOR };
  }
  if (estrategia === ESTRATEGIA_CONFLITO.MANTER_LOCAL) {
    return { documento: local, origem: ORIGEM.LOCAL };
  }

  // ULTIMO_A_VENCER (default): o carimbo `atualizadoEm` mais recente vence.
  // Empate favorece o servidor (fonte da verdade corporativa).
  return instante(local.atualizadoEm) > instante(servidor.atualizadoEm)
    ? { documento: local, origem: ORIGEM.LOCAL }
    : { documento: servidor, origem: ORIGEM.SERVIDOR };
};

/**
 * Cria um cliente de persistência do front.
 *
 * @param {Object} [cfg]
 * @param {string} [cfg.baseUrl]        Base da API. Vazio ⇒ API desabilitada.
 * @param {string} [cfg.ambiente]       Ambiente/partição ('dev'|'hml'|'prd').
 * @param {Function} [cfg.fetchFn]      fetch injetável (default: globalThis.fetch).
 * @param {Function} [cfg.obterToken]   () => string|Promise<string> do Bearer token.
 * @param {Storage}  [cfg.armazenamento] Storage (default: localStorage).
 * @param {string}   [cfg.chaveCache]   Chave do cache (default: CHAVE_CACHE).
 * @param {string}   [cfg.estrategiaConflito] default: ULTIMO_A_VENCER.
 * @param {number}   [cfg.timeoutMs]    Timeout por requisição (default: 5000, R5.5).
 */
export const criarClientePersistenciaFront = (cfg = {}) => {
  const {
    baseUrl = '',
    ambiente = 'dev',
    fetchFn = (typeof globalThis !== 'undefined' ? globalThis.fetch : undefined),
    obterToken = () => null,
    armazenamento = (typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined),
    chaveCache = CHAVE_CACHE,
    estrategiaConflito = ESTRATEGIA_CONFLITO.ULTIMO_A_VENCER,
    timeoutMs = 5000,
  } = cfg;

  // ── Cache local (localStorage) ────────────────────────────────────────────
  // O cache guarda APENAS o estado de orçamento (`dados`), para manter a mesma
  // forma serializada que o app sempre usou (compat. com rascunhos existentes).

  const lerCacheDados = () => {
    if (!armazenamento) return null;
    try {
      const bruto = armazenamento.getItem(chaveCache);
      if (!bruto) return null;
      return extrairDados(JSON.parse(bruto)); // aplica migração de schema
    } catch {
      return null;
    }
  };

  const gravarCacheDados = (dados) => {
    if (!armazenamento) return;
    try {
      armazenamento.setItem(chaveCache, JSON.stringify(dados));
    } catch {
      /* cota cheia / modo privado: degradação graciosa, segue sem cache */
    }
  };

  const limparCache = () => {
    if (!armazenamento) return;
    try { armazenamento.removeItem(chaveCache); } catch { /* ignora */ }
  };

  // Documento envelopado derivado do cache (para a resolução de conflito).
  const lerCacheDocumento = () => {
    const dados = lerCacheDados();
    if (!dados) return null;
    return normalizarDocumentoOrcamento(dados);
  };

  // ── API (fonte da verdade quando configurada) ──────────────────────────────

  const apiAtivaSync = () => Boolean(baseUrl) && typeof fetchFn === 'function';

  // A API só é usada quando há baseUrl, fetch e um token válido disponível.
  const resolverToken = async () => {
    try { return await obterToken(); } catch { return null; }
  };

  const apiAtiva = async () => {
    if (!apiAtivaSync()) return false;
    const token = await resolverToken();
    return Boolean(token);
  };

  const url = (caminho) => `${String(baseUrl).replace(/\/$/, '')}${caminho}`;

  const requisitar = async (metodo, caminho, corpo) => {
    const token = await resolverToken();
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;

    // Timeout por requisição (R5.5: concluir em ≤ 5 s em rede corporativa).
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const resposta = await fetchFn(url(caminho), {
        method: metodo,
        headers,
        signal: controller?.signal,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      return resposta;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  // Lê o documento do servidor; null quando ausente (404) ou API indisponível.
  const obterDoServidor = async (id) => {
    if (!id || !apiAtivaSync()) return null;
    try {
      const resposta = await requisitar('GET', `/api/orcamentos/${encodeURIComponent(id)}`);
      if (!resposta || !resposta.ok) return null; // 404/401/500 ⇒ sem versão do servidor
      const corpo = await resposta.json();
      // Aceita tanto o documento envelopado quanto o estado cru.
      return normalizarDocumentoOrcamento(corpo);
    } catch {
      return null; // rede indisponível ⇒ degradação graciosa (usa cache)
    }
  };

  // Grava o documento no servidor (gravação atômica da API — PUT por id).
  const gravarNoServidor = async (documento) => {
    if (!apiAtivaSync()) return { ok: false, offline: true };
    try {
      const resposta = await requisitar(
        'PUT',
        `/api/orcamentos/${encodeURIComponent(documento.id)}`,
        documento,
      );
      if (!resposta || !resposta.ok) {
        return { ok: false, status: resposta?.status };
      }
      let persistido = documento;
      try { persistido = normalizarDocumentoOrcamento(await resposta.json()); } catch { /* usa enviado */ }
      return { ok: true, documento: persistido };
    } catch (e) {
      return { ok: false, erro: e?.message };
    }
  };

  // ── Operações públicas ──────────────────────────────────────────────────────

  /**
   * Carrega o orçamento: lê o servidor e o cache local, resolve conflito e
   * devolve o estado de orçamento (`dados`) resultante, atualizando o cache.
   *
   * Sem API configurada ⇒ devolve o cache local (comportamento atual).
   *
   * @param {Object} [opcoes]
   * @param {string} [opcoes.id] Identificador do orçamento (quando conhecido).
   * @param {string} [opcoes.estrategia] Sobrepõe a estratégia de conflito.
   * @returns {Promise<{dados: Object|null, origem: string, documento: Object|null}>}
   */
  const carregar = async ({ id, estrategia = estrategiaConflito } = {}) => {
    const local = lerCacheDocumento();

    if (!apiAtivaSync()) {
      return { dados: local ? extrairDados(local) : null, origem: local ? ORIGEM.LOCAL : ORIGEM.NENHUM, documento: local };
    }

    const idAlvo = id || local?.id;
    const servidor = await obterDoServidor(idAlvo);
    const { documento, origem } = resolverConflito(servidor, local, estrategia);

    if (documento) {
      const dados = extrairDados(documento);
      gravarCacheDados(dados); // mantém o cache em sincronia com a decisão
      return { dados, origem, documento };
    }
    return { dados: null, origem: ORIGEM.NENHUM, documento: null };
  };

  /**
   * Versão síncrona do carregamento inicial a partir do cache local. Usada pela
   * inicialização do hook (React `useState`), que precisa de um valor imediato;
   * a sincronização com o servidor ocorre depois, de forma assíncrona.
   *
   * @returns {Object|null} Estado de orçamento do cache (migrado) ou null.
   */
  const carregarCacheSync = () => lerCacheDados();

  /**
   * Salva o orçamento: grava no cache local SEMPRE (fonte offline) e, se a API
   * estiver ativa, grava no servidor. A ordem (cache primeiro) garante que uma
   * falha de rede nunca perca o rascunho local — degradação graciosa.
   *
   * @param {Object} orcamento  Estado de orçamento (formato do app).
   * @param {Object} [meta]     Metadados do envelope (id, proprietarioOid...).
   * @returns {Promise<{cache: boolean, servidor: 'ok'|'offline'|'erro', documento: Object}>}
   */
  const salvar = async (orcamento, meta = {}) => {
    // 1) Cache local primeiro — nunca perde o rascunho (comportamento atual).
    gravarCacheDados(orcamento);

    // 2) Monta o documento envelopado para o servidor (preserva id quando houver).
    const cacheDoc = lerCacheDocumento();
    const documento = criarDocumentoOrcamento(orcamento, {
      id: meta.id || cacheDoc?.id,
      ambiente: meta.ambiente || ambiente,
      proprietarioOid: meta.proprietarioOid ?? cacheDoc?.proprietarioOid ?? null,
      classificacao: meta.classificacao || cacheDoc?.classificacao,
      criadoEm: meta.criadoEm || cacheDoc?.criadoEm,
    });

    if (!apiAtivaSync()) {
      return { cache: true, servidor: 'offline', documento };
    }

    const r = await gravarNoServidor(documento);
    if (r.ok) {
      // Reflete no cache o estado efetivamente persistido (ex.: carimbo do servidor).
      gravarCacheDados(extrairDados(r.documento));
      return { cache: true, servidor: 'ok', documento: r.documento };
    }
    // Falha de rede/servidor: o cache local preserva o estado — nada se perde.
    return { cache: true, servidor: r.offline ? 'offline' : 'erro', documento };
  };

  /** Remove o orçamento do cache local (e, quando houver, o id associado). */
  const remover = () => { limparCache(); };

  return {
    // estado / introspecção
    apiAtiva,
    apiAtivaSync,
    estrategiaConflito,
    // leitura
    carregar,
    carregarCacheSync,
    lerCacheDados,
    lerCacheDocumento,
    // escrita
    salvar,
    remover,
    // internos reutilizáveis / testáveis
    resolverConflito: (s, l, e = estrategiaConflito) => resolverConflito(s, l, e),
  };
};

export default criarClientePersistenciaFront;
