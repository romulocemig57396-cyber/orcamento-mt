/* ─────────────────────────────────────────────────────────────────────────────
   metricas.js — instrumentação de métricas de operação da Observabilidade
                 (R10.2, R10.5)

   Emite, para a Observabilidade, métricas de operação contendo, no mínimo
   (R10.2):
     - taxa de requisições  (contagem de requisições por operação)
     - taxa de erros        (contagem de erros e proporção erros/requisições)
     - latência de resposta (duração em ms por operação)

   Cada métrica é emitida como um "ponto de métrica" estruturado e também é
   agregada em memória por operação, de modo que o chamador possa consultar a
   taxa de requisições, a taxa de erros e a distribuição de latência (média,
   mínimo, máximo, p95) sem depender do backend.

   Adaptador injetável (sink): a emissão é desacoplada do destino. Em teste,
   injeta-se um sink fake que apenas coleta os pontos. Em produção, injeta-se o
   adaptador do Application Insights (ver `criarSinkApplicationInsights` abaixo e
   a seção "Plugando o Application Insights real").

   Degradação graciosa (R10.5): uma falha ao emitir uma métrica NUNCA interrompe
   a operação de negócio em curso. O erro é capturado, registrado localmente e a
   execução prossegue — tanto na emissão direta quanto no wrapper `medirOperacao`.

   ── Plugando o Application Insights real em produção ───────────────────────────
   Este módulo NÃO depende do SDK do Application Insights; ele apenas define o
   contrato do sink. Para plugar o backend real em produção, instale o SDK
   (`applicationinsights`) e passe um TelemetryClient ao adaptador:

     // uma única vez, no bootstrap do processo (ex.: na API serverless):
     import appInsights from 'applicationinsights';
     appInsights
       .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
       .start();
     const client = appInsights.defaultClient;

     import { criarMetricas, criarSinkApplicationInsights } from './metricas.js';
     const metricas = criarMetricas({
       sink: criarSinkApplicationInsights(client),
     });

   A connection string NÃO fica em código: é recuperada do Key Vault via Managed
   Identity (R9) e injetada como variável de ambiente. O adaptador traduz cada
   ponto de métrica para a telemetria do App Insights (`trackMetric` para
   requisições/erros/latência e, quando houver, `trackDependency`/`trackRequest`
   no ponto de integração da API). Nenhuma mudança neste módulo é necessária.
   ───────────────────────────────────────────────────────────────────────────── */

/** Tipos de métrica suportados. */
export const TIPO_METRICA = Object.freeze({
  REQUISICAO: 'requisicao',
  ERRO: 'erro',
  LATENCIA: 'latencia',
});

/**
 * Produz o carimbo de tempo em UTC no formato ISO 8601 (sempre com sufixo "Z").
 * Isolado para ser injetável/testável.
 * @returns {string}
 */
export const agoraUtc = () => new Date().toISOString();

/**
 * Fonte monotônica de tempo em milissegundos para medir duração.
 * Usa `performance.now()` quando disponível (monotônico, imune a ajustes de
 * relógio); cai para `Date.now()` caso contrário. Injetável para teste.
 * @returns {number}
 */
export const relogioMs = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/**
 * Registrador local de último recurso usado quando o sink de métricas falha
 * (R10.5). Nunca lança: engole qualquer erro para não interromper a operação de
 * negócio em curso.
 * @param {object} ponto  O ponto de métrica que se tentou emitir.
 * @param {unknown} causa O erro ocorrido na emissão.
 */
const registrarFalhaLocal = (ponto, causa) => {
  try {
    const detalhe = {
      timestamp: agoraUtc(),
      nivel: 'WARN',
      componente: 'observabilidade/metricas',
      mensagem: 'falha ao emitir métrica para a Observabilidade',
      causa: causa instanceof Error ? causa.message : String(causa),
      pontoOriginal: ponto,
    };
    console.error(JSON.stringify(detalhe));
  } catch {
    // Último recurso: se nem o registro local funcionar, ignora silenciosamente
    // para não arriscar interromper a operação.
  }
};

/**
 * Calcula o percentil `p` (0..100) de uma lista de números.
 * Usa o método do "índice mais próximo" (nearest-rank), estável e simples.
 * @param {number[]} valores
 * @param {number} p
 * @returns {number} 0 se a lista estiver vazia.
 */
const percentil = (valores, p) => {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * ordenados.length);
  const indice = Math.min(Math.max(rank, 1), ordenados.length) - 1;
  return ordenados[indice];
};

/**
 * Cria um agregado vazio para uma operação.
 * @returns {{requisicoes: number, erros: number, latencias: number[]}}
 */
const novoAgregado = () => ({ requisicoes: 0, erros: 0, latencias: [] });

/**
 * Monta o resumo consultável de uma operação a partir do seu agregado.
 * @param {{requisicoes: number, erros: number, latencias: number[]}} ag
 * @returns {{
 *   requisicoes: number, erros: number, taxaErro: number,
 *   latenciaMediaMs: number, latenciaMinMs: number, latenciaMaxMs: number, latenciaP95Ms: number
 * }}
 */
const resumirAgregado = (ag) => {
  const n = ag.latencias.length;
  const soma = ag.latencias.reduce((acc, v) => acc + v, 0);
  return {
    requisicoes: ag.requisicoes,
    erros: ag.erros,
    taxaErro: ag.requisicoes > 0 ? ag.erros / ag.requisicoes : 0,
    latenciaMediaMs: n > 0 ? soma / n : 0,
    latenciaMinMs: n > 0 ? Math.min(...ag.latencias) : 0,
    latenciaMaxMs: n > 0 ? Math.max(...ag.latencias) : 0,
    latenciaP95Ms: percentil(ag.latencias, 95),
  };
};

/**
 * Sink padrão: no-op silencioso. Não emite para lugar nenhum; serve apenas para
 * que o módulo funcione sem backend configurado (ex.: em ambiente local/teste
 * sem Application Insights). Em produção, injetar um sink real.
 * @param {object} _ponto
 */
const sinkNoop = (_ponto) => {};

/**
 * Adaptador para o Application Insights.
 *
 * Recebe um `TelemetryClient` do SDK `applicationinsights` e devolve um sink
 * compatível com `criarMetricas`. NÃO importa o SDK — o cliente é injetado pelo
 * bootstrap da aplicação (ver cabeçalho). Traduz cada ponto de métrica em uma
 * chamada `trackMetric`, usando o nome da métrica por tipo e anexando a operação
 * e demais dimensões como propriedades.
 *
 * @param {{ trackMetric: (telemetria: object) => void }} client
 *        Cliente de telemetria do Application Insights.
 * @returns {(ponto: object) => void} Sink pronto para injeção.
 */
export const criarSinkApplicationInsights = (client) => {
  if (!client || typeof client.trackMetric !== 'function') {
    throw new TypeError(
      'criarSinkApplicationInsights requer um TelemetryClient com trackMetric()'
    );
  }
  const nomePorTipo = {
    [TIPO_METRICA.REQUISICAO]: 'operacao.requisicoes',
    [TIPO_METRICA.ERRO]: 'operacao.erros',
    [TIPO_METRICA.LATENCIA]: 'operacao.latencia_ms',
  };
  return (ponto) => {
    client.trackMetric({
      name: nomePorTipo[ponto.tipo] ?? `operacao.${ponto.tipo}`,
      value: ponto.valor,
      properties: {
        operacao: ponto.operacao,
        ...(ponto.dimensoes ?? {}),
      },
    });
  };
};

/**
 * Cria o instrumentador de métricas de operação.
 *
 * @param {object} [opcoes]
 * @param {(ponto: object) => void} [opcoes.sink] Destino de emissão (adaptador).
 *        Padrão: no-op. Para produção, use `criarSinkApplicationInsights`.
 * @param {() => string} [opcoes.relogioUtc] Fonte do carimbo UTC (injetável).
 * @param {() => number} [opcoes.relogioMs]  Fonte monotônica de duração (injetável).
 * @returns {{
 *   registrarRequisicao: (operacao: string, dimensoes?: object) => void,
 *   registrarErro: (operacao: string, dimensoes?: object) => void,
 *   registrarLatencia: (operacao: string, duracaoMs: number, dimensoes?: object) => void,
 *   medirOperacao: <T>(operacao: string, fn: () => (Promise<T>|T), dimensoes?: object) => Promise<T>,
 *   resumo: (operacao: string) => object,
 *   resumoGeral: () => Record<string, object>,
 *   reiniciar: () => void,
 * }}
 */
export const criarMetricas = (opcoes = {}) => {
  const {
    sink = sinkNoop,
    relogioUtc = agoraUtc,
    relogioMs: relogioDuracao = relogioMs,
  } = opcoes;

  /** @type {Map<string, {requisicoes: number, erros: number, latencias: number[]}>} */
  const agregados = new Map();

  const obterAgregado = (operacao) => {
    let ag = agregados.get(operacao);
    if (!ag) {
      ag = novoAgregado();
      agregados.set(operacao, ag);
    }
    return ag;
  };

  /**
   * Emite um ponto de métrica para o sink. Nunca lança (R10.5): a falha de
   * emissão é registrada localmente e a execução prossegue.
   * @param {string} tipo
   * @param {string} operacao
   * @param {number} valor
   * @param {object} [dimensoes]
   */
  const emitir = (tipo, operacao, valor, dimensoes) => {
    const ponto = {
      timestamp: relogioUtc(),
      tipo,
      operacao: operacao ?? '',
      valor,
    };
    if (dimensoes !== undefined && dimensoes !== null) {
      ponto.dimensoes = dimensoes;
    }
    try {
      sink(ponto);
    } catch (causa) {
      registrarFalhaLocal(ponto, causa);
    }
    return ponto;
  };

  /** Conta uma requisição da operação e emite a métrica correspondente. */
  const registrarRequisicao = (operacao, dimensoes) => {
    obterAgregado(operacao).requisicoes += 1;
    return emitir(TIPO_METRICA.REQUISICAO, operacao, 1, dimensoes);
  };

  /** Conta um erro da operação e emite a métrica correspondente. */
  const registrarErro = (operacao, dimensoes) => {
    obterAgregado(operacao).erros += 1;
    return emitir(TIPO_METRICA.ERRO, operacao, 1, dimensoes);
  };

  /** Registra a latência (ms) da operação e emite a métrica correspondente. */
  const registrarLatencia = (operacao, duracaoMs, dimensoes) => {
    const valor = Number.isFinite(duracaoMs) && duracaoMs >= 0 ? duracaoMs : 0;
    obterAgregado(operacao).latencias.push(valor);
    return emitir(TIPO_METRICA.LATENCIA, operacao, valor, dimensoes);
  };

  /**
   * Mede a latência de uma operação assíncrona (ou síncrona), emitindo:
   *   - uma métrica de requisição ao iniciar;
   *   - uma métrica de latência ao finalizar (sucesso OU erro);
   *   - uma métrica de erro se a operação lançar.
   *
   * O resultado da operação é devolvido como está; se a operação lançar, o erro
   * é repropagado APÓS as métricas serem emitidas. A emissão de métricas em si
   * nunca interrompe a operação (R10.5) — somente o erro da própria operação é
   * propagado, conforme esperado pelo chamador.
   *
   * @template T
   * @param {string} operacao
   * @param {() => (Promise<T>|T)} fn
   * @param {object} [dimensoes]
   * @returns {Promise<T>}
   */
  const medirOperacao = async (operacao, fn, dimensoes) => {
    registrarRequisicao(operacao, dimensoes);
    const inicio = relogioDuracao();
    try {
      const resultado = await fn();
      registrarLatencia(operacao, relogioDuracao() - inicio, dimensoes);
      return resultado;
    } catch (erro) {
      registrarLatencia(operacao, relogioDuracao() - inicio, dimensoes);
      registrarErro(operacao, dimensoes);
      throw erro;
    }
  };

  /**
   * Resumo consultável de uma operação (taxa de requisições/erros e latência).
   * @param {string} operacao
   */
  const resumo = (operacao) => resumirAgregado(obterAgregado(operacao));

  /**
   * Resumo de todas as operações observadas até o momento.
   * @returns {Record<string, object>}
   */
  const resumoGeral = () => {
    const saida = {};
    for (const [operacao, ag] of agregados) {
      saida[operacao] = resumirAgregado(ag);
    }
    return saida;
  };

  /** Zera todos os agregados em memória (útil entre janelas de medição/testes). */
  const reiniciar = () => agregados.clear();

  return {
    registrarRequisicao,
    registrarErro,
    registrarLatencia,
    medirOperacao,
    resumo,
    resumoGeral,
    reiniciar,
  };
};

export default criarMetricas;
