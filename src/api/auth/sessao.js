/* ─────────────────────────────────────────────────────────────────────────────
   sessao.js — expiração de sessão por inatividade (R1.4)

   Responsabilidade (Acceptance Criteria 1.4 / design "Fluxo de autenticação"):
   - "WHILE uma sessão autenticada permanece inativa por período igual ou
      superior a 30 minutos, THE Sistema_Orcamento_MT SHALL encerrar a sessão e
      exigir nova autenticação."
   - Design: "Sessão: expiração por inatividade ≥ 30 min encerra a sessão (R1.4)."

   Property 2 (design.md): para qualquer duração de inatividade `t`, a sessão
   permanece válida se `t < 30 min` e é encerrada (exigindo nova autenticação) se
   `t ≥ 30 min`. O limiar é fechado em 30 min no lado da expiração (≥).

   Design para testabilidade:
   - A passagem do tempo NÃO é lida de `Date.now()` dentro da regra: o instante
     "agora" é injetado (parâmetro `agora` ou um relógio `() => number`), de modo
     que o limiar de 30 min possa ser exercitado sem esperar.
   - A regra de validade (`avaliarSessao`) é uma função pura sobre timestamps.
   - `resolverSessao` é o gancho que o roteador (`criarRoteador`) injeta via
     `deps.resolverSessao`: recebe a requisição e a sessão parcial produzida pela
     validação de token (tarefa 5.2) e devolve a sessão com a última atividade
     renovada quando ainda válida, ou lança uma falha 401 exigindo nova
     autenticação quando expirada.
   ───────────────────────────────────────────────────────────────────────────── */

/** Limiar de inatividade: 30 minutos, em milissegundos (R1.4). */
export const LIMIAR_INATIVIDADE_MS = 30 * 60 * 1000;

/**
 * Códigos de resultado padronizados deste módulo.
 * @readonly
 */
export const SESSAO = Object.freeze({
  VALIDA: 'VALIDA',
  EXPIRADA_INATIVIDADE: 'EXPIRADA_INATIVIDADE',
});

/**
 * Normaliza um instante (Date | number | string ISO) para epoch em ms.
 * @param {Date|number|string} valor
 * @returns {number}
 */
function paraEpochMs(valor) {
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') {
    const t = Date.parse(valor);
    if (!Number.isNaN(t)) return t;
  }
  throw new TypeError('instante de tempo inválido: use Date, epoch em ms ou string ISO');
}

/**
 * Resolve o instante "agora" a partir de um parâmetro ou relógio injetável.
 * Mantém a regra determinística e testável sem depender do relógio real.
 * @param {Date|number|string|(() => number|Date)} [agora]
 * @returns {number} epoch em ms
 */
function resolverAgora(agora) {
  if (agora === undefined || agora === null) return Date.now();
  if (typeof agora === 'function') return paraEpochMs(agora());
  return paraEpochMs(agora);
}

/**
 * Avalia a validade de uma sessão com base na inatividade acumulada.
 *
 * Função pura: a sessão é válida enquanto a inatividade for estritamente menor
 * que o limiar (`< 30 min`) e é considerada expirada quando a inatividade
 * atinge ou ultrapassa o limiar (`≥ 30 min`) — exatamente a fronteira da
 * Property 2.
 *
 * @param {{ ultimaAtividade: Date|number|string }} sessao
 *   Sessão contendo o timestamp da última atividade.
 * @param {Object} [opcoes]
 * @param {Date|number|string|(() => number|Date)} [opcoes.agora]
 *   Instante atual injetável (padrão: `Date.now()`).
 * @param {number} [opcoes.limiarMs=LIMIAR_INATIVIDADE_MS]
 *   Limiar de inatividade em ms (padrão: 30 min).
 * @returns {{
 *   valida: boolean,
 *   estado: string,
 *   inatividadeMs: number,
 *   limiarMs: number,
 *   requerNovaAutenticacao: boolean
 * }}
 */
export function avaliarSessao(sessao, opcoes = {}) {
  if (!sessao || sessao.ultimaAtividade === undefined || sessao.ultimaAtividade === null) {
    throw new TypeError('sessão inválida: `ultimaAtividade` é obrigatória');
  }

  const limiarMs = opcoes.limiarMs ?? LIMIAR_INATIVIDADE_MS;
  if (!(typeof limiarMs === 'number') || !Number.isFinite(limiarMs) || limiarMs < 0) {
    throw new TypeError('`limiarMs` deve ser um número não negativo');
  }

  const agoraMs = resolverAgora(opcoes.agora);
  const ultimaMs = paraEpochMs(sessao.ultimaAtividade);

  // Inatividade nunca negativa: atividade "no futuro" conta como 0 de inatividade.
  const inatividadeMs = Math.max(0, agoraMs - ultimaMs);

  // Fronteira da Property 2: válida se < limiar; expirada se ≥ limiar.
  const valida = inatividadeMs < limiarMs;

  return {
    valida,
    estado: valida ? SESSAO.VALIDA : SESSAO.EXPIRADA_INATIVIDADE,
    inatividadeMs,
    limiarMs,
    requerNovaAutenticacao: !valida,
  };
}

/**
 * Conveniência booleana sobre `avaliarSessao`.
 * @param {{ ultimaAtividade: Date|number|string }} sessao
 * @param {Object} [opcoes]  Ver {@link avaliarSessao}.
 * @returns {boolean} `true` se a sessão ainda é válida (inatividade `< 30 min`).
 */
export function sessaoValida(sessao, opcoes = {}) {
  return avaliarSessao(sessao, opcoes).valida;
}

/**
 * Falha de sessão expirada no formato `RespostaApi` que o roteador reconhece
 * (objeto com `status` numérico e `corpo`), lançada por `resolverSessao` para
 * encerrar a sessão e exigir nova autenticação (R1.4).
 *
 * @param {ReturnType<typeof avaliarSessao>} avaliacao
 * @returns {{ status: number, headers: Object<string,string>, corpo: object }}
 */
function falhaSessaoExpirada(avaliacao) {
  const resposta = {
    status: 401,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    corpo: {
      erro: 'sessao_expirada',
      mensagem:
        'Sessão encerrada por inatividade. É necessária nova autenticação.',
      detalhes: {
        inatividadeMs: avaliacao.inatividadeMs,
        limiarMs: avaliacao.limiarMs,
      },
    },
  };
  // Lançável e, ao mesmo tempo, reconhecido pelo catch do roteador
  // (que verifica `status` numérico e a presença de `corpo`).
  return resposta;
}

/**
 * Gancho `deps.resolverSessao` do roteador (`src/api/roteador.js`).
 *
 * Recebe a requisição e a `sessaoParcial` produzida pela validação de token
 * (tarefa 5.2) e devolve a sessão efetiva:
 * - Se a inatividade for `< 30 min`: mantém a sessão válida e renova
 *   `ultimaAtividade` para o instante atual (a atividade desta requisição),
 *   preservando a janela deslizante de inatividade.
 * - Se a inatividade for `≥ 30 min`: encerra a sessão lançando uma falha 401
 *   que exige nova autenticação (R1.4).
 *
 * O instante "agora" é injetável via `opcoes.agora` para teste determinístico.
 *
 * @param {import('../http.js').RequisicaoApi} _req
 * @param {{ ultimaAtividade?: Date|number|string } & Object} sessaoParcial
 * @param {Object} [opcoes]
 * @param {Date|number|string|(() => number|Date)} [opcoes.agora]
 * @param {number} [opcoes.limiarMs=LIMIAR_INATIVIDADE_MS]
 * @returns {{ ...sessaoParcial, ultimaAtividade: number }}
 * @throws {{ status: 401, corpo: object }} quando a sessão expirou por inatividade.
 */
export function resolverSessao(_req, sessaoParcial, opcoes = {}) {
  if (!sessaoParcial || typeof sessaoParcial !== 'object') {
    throw new TypeError('sessão parcial inválida: objeto esperado');
  }

  const agoraMs = resolverAgora(opcoes.agora);

  // Sem `ultimaAtividade` prévia (sessão recém-estabelecida pela validação de
  // token), a atividade começa agora — ainda não há inatividade acumulada.
  const ultimaAtividade = sessaoParcial.ultimaAtividade ?? agoraMs;

  const avaliacao = avaliarSessao(
    { ...sessaoParcial, ultimaAtividade },
    { agora: agoraMs, limiarMs: opcoes.limiarMs }
  );

  if (!avaliacao.valida) {
    throw falhaSessaoExpirada(avaliacao);
  }

  // Sessão válida: renova a janela de inatividade para esta atividade.
  return { ...sessaoParcial, ultimaAtividade: agoraMs };
}
