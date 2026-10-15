/* ─────────────────────────────────────────────────────────────────────────────
   logger.js — logger estruturado da Observabilidade (R10.1, R10.5)

   Emite logs em JSON contendo, no mínimo:
     - carimbo de tempo em UTC (ISO 8601)
     - nível de severidade válido (DEBUG, INFO, WARN, ERROR)
     - identificador de correlação da requisição
     - identificador do componente de origem

   Degradação graciosa (R10.5): se a emissão para o sink de Observabilidade
   falhar, a falha é registrada localmente e a operação em curso NÃO é
   interrompida (nenhuma exceção é propagada).

   Ponto de integração para o mascaramento (tarefa 4.2 / Property 7):
   `criarLogger` aceita um `mascarar` injetável que, quando fornecido, é
   aplicado à entrada estruturada antes da emissão. Aqui o mascaramento NÃO é
   implementado — o padrão é a identidade (nenhuma transformação).
   ───────────────────────────────────────────────────────────────────────────── */

/** Níveis de severidade suportados, em ordem crescente. */
export const NIVEIS = Object.freeze(['DEBUG', 'INFO', 'WARN', 'ERROR']);

/** Conjunto para checagem rápida de nível válido. */
const NIVEIS_VALIDOS = new Set(NIVEIS);

/**
 * Indica se `nivel` é um nível de severidade válido.
 * @param {unknown} nivel
 * @returns {boolean}
 */
export const nivelValido = (nivel) => NIVEIS_VALIDOS.has(nivel);

/**
 * Produz o carimbo de tempo em UTC no formato ISO 8601 (sempre com sufixo "Z").
 * Função isolada para ser injetável/testável.
 * @returns {string}
 */
export const agoraUtc = () => new Date().toISOString();

/**
 * Monta a entrada de log estruturada a partir de um evento operacional.
 *
 * Função pura: dado o mesmo conjunto de argumentos (incluindo `timestamp`),
 * produz sempre a mesma saída. Garante a estrutura obrigatória da Property 8:
 * `timestamp` (UTC), `nivel` (válido), `correlacaoId` e `componente`.
 *
 * @param {object} params
 * @param {string} params.nivel        Nível de severidade (DEBUG/INFO/WARN/ERROR).
 * @param {string} params.mensagem     Mensagem do evento.
 * @param {string} params.correlacaoId Identificador de correlação da requisição.
 * @param {string} params.componente   Identificador do componente de origem.
 * @param {object} [params.contexto]   Dados adicionais do evento (opcional).
 * @param {string} [params.timestamp]  Carimbo UTC; se ausente, usa `agoraUtc()`.
 * @returns {{timestamp: string, nivel: string, mensagem: string, correlacaoId: string, componente: string, contexto?: object}}
 */
export const montarEntrada = ({
  nivel,
  mensagem,
  correlacaoId,
  componente,
  contexto,
  timestamp,
}) => {
  const nivelNormalizado = nivelValido(nivel) ? nivel : 'INFO';
  const entrada = {
    timestamp: timestamp ?? agoraUtc(),
    nivel: nivelNormalizado,
    mensagem: mensagem ?? '',
    correlacaoId: correlacaoId ?? '',
    componente: componente ?? '',
  };
  if (contexto !== undefined && contexto !== null) {
    entrada.contexto = contexto;
  }
  return entrada;
};

/**
 * Serializa uma entrada de log para a linha JSON efetivamente gravada.
 * @param {object} entrada
 * @returns {string}
 */
export const serializar = (entrada) => JSON.stringify(entrada);

/**
 * Sink padrão: escreve a linha JSON no console apropriado ao nível.
 * Mantém a saída estruturada (uma linha JSON por evento).
 * @param {object} entrada
 */
const sinkConsole = (entrada) => {
  const linha = serializar(entrada);
  switch (entrada.nivel) {
    case 'ERROR':
      console.error(linha);
      break;
    case 'WARN':
      console.warn(linha);
      break;
    case 'DEBUG':
      console.debug(linha);
      break;
    default:
      console.info(linha);
  }
};

/**
 * Registrador local de último recurso usado quando o sink de Observabilidade
 * falha (R10.5). Nunca lança: engole qualquer erro para não interromper a
 * operação de negócio em curso.
 * @param {object} entrada
 * @param {unknown} causa
 */
const registrarFalhaLocal = (entrada, causa) => {
  try {
    const detalhe = {
      timestamp: agoraUtc(),
      nivel: 'WARN',
      mensagem: 'falha ao emitir log para a Observabilidade',
      correlacaoId: entrada?.correlacaoId ?? '',
      componente: 'observabilidade/logger',
      contexto: {
        causa: causa instanceof Error ? causa.message : String(causa),
        entradaOriginal: entrada,
      },
    };
    console.error(serializar(detalhe));
  } catch {
    // Último recurso: se nem o registro local funcionar, não há como
    // sinalizar sem arriscar interromper a operação — ignora silenciosamente.
  }
};

/**
 * Cria um logger estruturado.
 *
 * @param {object} [opcoes]
 * @param {string} [opcoes.componente]   Identificador padrão do componente de origem.
 * @param {string} [opcoes.correlacaoId] Identificador de correlação padrão.
 * @param {(entrada: object) => void} [opcoes.sink] Destino da emissão
 *        (ex.: adaptador de Application Insights). Padrão: console estruturado.
 * @param {(entrada: object) => object} [opcoes.mascarar] Ponto de integração
 *        do mascaramento (tarefa 4.2). Recebe a entrada estruturada e devolve a
 *        entrada a ser gravada. Padrão: identidade (nenhum mascaramento aqui).
 * @param {() => string} [opcoes.relogio] Fonte do carimbo UTC (injetável para teste).
 * @returns {{
 *   log: (nivel: string, mensagem: string, contexto?: object, extras?: object) => object,
 *   debug: (mensagem: string, contexto?: object, extras?: object) => object,
 *   info: (mensagem: string, contexto?: object, extras?: object) => object,
 *   warn: (mensagem: string, contexto?: object, extras?: object) => object,
 *   error: (mensagem: string, contexto?: object, extras?: object) => object,
 *   comCorrelacao: (correlacaoId: string) => object,
 * }}
 */
export const criarLogger = (opcoes = {}) => {
  const {
    componente = '',
    correlacaoId: correlacaoPadrao = '',
    sink = sinkConsole,
    // Identidade por padrão: o mascaramento real é a tarefa 4.2 (Property 7).
    mascarar = (entrada) => entrada,
    relogio = agoraUtc,
  } = opcoes;

  /**
   * Registra um evento operacional. Nunca lança (R10.5).
   * @param {string} nivel
   * @param {string} mensagem
   * @param {object} [contexto]
   * @param {object} [extras] Sobrescreve `correlacaoId`/`componente` por chamada.
   * @returns {object} A entrada estruturada (já pós-mascaramento) emitida.
   */
  const log = (nivel, mensagem, contexto, extras = {}) => {
    const entrada = montarEntrada({
      nivel,
      mensagem,
      correlacaoId: extras.correlacaoId ?? correlacaoPadrao,
      componente: extras.componente ?? componente,
      contexto,
      timestamp: relogio(),
    });

    // Aplica o ponto de integração de mascaramento antes de qualquer gravação.
    // Se o mascaramento falhar, não interrompe a operação: emite a entrada
    // original e registra a falha localmente.
    let entradaFinal = entrada;
    try {
      entradaFinal = mascarar(entrada) ?? entrada;
    } catch (causa) {
      registrarFalhaLocal(entrada, causa);
      entradaFinal = entrada;
    }

    try {
      sink(entradaFinal);
    } catch (causa) {
      // R10.5: falha de emissão é registrada localmente e a operação continua.
      registrarFalhaLocal(entradaFinal, causa);
    }

    return entradaFinal;
  };

  const api = {
    log,
    debug: (mensagem, contexto, extras) => log('DEBUG', mensagem, contexto, extras),
    info: (mensagem, contexto, extras) => log('INFO', mensagem, contexto, extras),
    warn: (mensagem, contexto, extras) => log('WARN', mensagem, contexto, extras),
    error: (mensagem, contexto, extras) => log('ERROR', mensagem, contexto, extras),
    /**
     * Deriva um logger que carrega um `correlacaoId` fixo (ex.: por requisição),
     * preservando componente, sink, mascaramento e relógio.
     * @param {string} correlacaoId
     */
    comCorrelacao: (correlacaoId) =>
      criarLogger({ componente, correlacaoId, sink, mascarar, relogio }),
  };

  return api;
};

export default criarLogger;
