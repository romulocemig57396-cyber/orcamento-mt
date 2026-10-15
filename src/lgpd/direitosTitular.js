/* ─────────────────────────────────────────────────────────────────────────────
   direitosTitular.js — registro e atendimento de direitos do titular (LGPD).

   Modela a solicitação de exercício de um direito do titular sobre seus
   Dado_Pessoal e as transições de estado previstas pelo design:

     { id, titularRef, tipo, status, motivoRecusa, registradaEm, prazoLimite }

   - tipo   ∈ { acesso, correcao, exclusao, portabilidade }
   - status ∈ { registrada, atendida, recusada }

   Garantias (requisitos):
   - R11.4: ao registrar uma solicitação, calcula `prazoLimite` = `registradaEm`
            + 15 DIAS CORRIDOS (prazo para atendimento).
   - R11.5: quando a solicitação NÃO pode ser atendida, a recusa registra o
            MOTIVO e PRESERVA o estado do Dado_Pessoal SEM ALTERAÇÃO. Além do
            motivo na solicitação, a recusa jamais toca no Dado_Pessoal — a
            função de recusa é pura e devolve o dado recebido sem cópia mutada.

   Todas as funções deste módulo são PURAS: não mutam a entrada e sempre
   retornam novos objetos (congelados), preservando o estado anterior.
   ───────────────────────────────────────────────────────────────────────────── */

/** Tipos de direito do titular previstos (R11.4). */
export const TIPOS_DIREITO = Object.freeze([
  'acesso',
  'correcao',
  'exclusao',
  'portabilidade',
]);

/** Estados possíveis de uma solicitação. */
export const STATUS = Object.freeze({
  REGISTRADA: 'registrada',
  ATENDIDA: 'atendida',
  RECUSADA: 'recusada',
});

/** Prazo legal de atendimento, em dias corridos (R11.4). */
export const PRAZO_DIAS_CORRIDOS = 15;

/** Milissegundos em um dia corrido (24h) — usado no cálculo do prazo. */
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Códigos de erro padronizados retornados por este módulo. */
export const ERRO = Object.freeze({
  TIPO_INVALIDO: 'TIPO_INVALIDO',
  TITULAR_INVALIDO: 'TITULAR_INVALIDO',
  SOLICITACAO_INVALIDA: 'SOLICITACAO_INVALIDA',
  TRANSICAO_INVALIDA: 'TRANSICAO_INVALIDA',
  MOTIVO_OBRIGATORIO: 'MOTIVO_OBRIGATORIO',
});

/** Resultado de sucesso. */
const ok = (valor) => ({ ok: true, valor });

/** Resultado de erro estruturado. */
const erro = (codigo, mensagem) => ({ ok: false, codigo, mensagem });

/** Gera um identificador único (uuid quando disponível). */
const gerarId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'sol-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
};

/**
 * Normaliza um instante para ISO 8601 em UTC. Entrada inválida → `null`
 * (o chamador decide o default), para não mascarar erro de data.
 * @param {string|number|Date|undefined} valor
 * @returns {string|null}
 */
const paraInstanteUTC = (valor) => {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
  }
  if (typeof valor === 'string' || typeof valor === 'number') {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
};

/** Verifica se o tipo informado é um direito do titular conhecido (R11.4). */
export const tipoValido = (tipo) => TIPOS_DIREITO.includes(tipo);

/**
 * Calcula o prazo-limite de atendimento somando `PRAZO_DIAS_CORRIDOS` dias
 * corridos ao instante de registro (R11.4). Dias corridos = somar o número de
 * dias de calendário, independentemente de finais de semana/feriados.
 *
 * @param {string|number|Date} registradaEm instante de registro
 * @returns {string} prazo-limite em ISO 8601 (UTC)
 * @throws {Error} se `registradaEm` for inválido
 */
export const calcularPrazoLimite = (registradaEm) => {
  const base = paraInstanteUTC(registradaEm);
  if (base === null) {
    throw new Error('Instante de registro inválido para cálculo do prazo.');
  }
  const limite = new Date(new Date(base).getTime() + PRAZO_DIAS_CORRIDOS * MS_POR_DIA);
  return limite.toISOString();
};

/**
 * Registra uma solicitação de direito do titular (R11.4).
 *
 * Produz um registro no estado `registrada`, com `prazoLimite` calculado como
 * `registradaEm` + 15 dias corridos. `titularRef` deve ser uma referência NÃO
 * reidentificável (nunca Dado_Pessoal direto) — este módulo não a transforma,
 * apenas exige que seja informada.
 *
 * @param {Object} args
 * @param {string} args.tipo        'acesso' | 'correcao' | 'exclusao' | 'portabilidade'
 * @param {string} args.titularRef  referência não reidentificável do titular
 * @param {string} [args.id]        identificador (gerado se ausente)
 * @param {string|number|Date} [args.registradaEm]  instante de registro (default: agora)
 * @returns {{ok:true, valor:object} | {ok:false, codigo:string, mensagem:string}}
 */
export const registrarSolicitacao = ({ tipo, titularRef, id, registradaEm } = {}) => {
  if (!tipoValido(tipo)) {
    return erro(
      ERRO.TIPO_INVALIDO,
      `Tipo de direito inválido: esperado um de ${TIPOS_DIREITO.join(', ')}.`,
    );
  }
  if (typeof titularRef !== 'string' || titularRef.trim().length === 0) {
    return erro(
      ERRO.TITULAR_INVALIDO,
      'Referência do titular ausente ou inválida (deve ser uma referência não reidentificável).',
    );
  }

  const registrada = paraInstanteUTC(registradaEm) ?? new Date().toISOString();
  const solicitacao = Object.freeze({
    id: id || gerarId(),
    titularRef,
    tipo,
    status: STATUS.REGISTRADA,
    motivoRecusa: null,
    registradaEm: registrada,
    prazoLimite: calcularPrazoLimite(registrada),
  });

  return ok(solicitacao);
};

/** Confere se o objeto tem a forma mínima de uma solicitação registrada. */
const ehSolicitacao = (s) =>
  !!s &&
  typeof s === 'object' &&
  typeof s.id === 'string' &&
  tipoValido(s.tipo) &&
  typeof s.registradaEm === 'string';

/**
 * Marca a solicitação como ATENDIDA. Transição válida apenas a partir de
 * `registrada` (R11.4). Função pura: devolve novo objeto, não muta a entrada.
 *
 * @param {Object} solicitacao
 * @returns {{ok:true, valor:object} | {ok:false, codigo:string, mensagem:string}}
 */
export const atenderSolicitacao = (solicitacao) => {
  if (!ehSolicitacao(solicitacao)) {
    return erro(ERRO.SOLICITACAO_INVALIDA, 'Solicitação ausente ou inválida.');
  }
  if (solicitacao.status !== STATUS.REGISTRADA) {
    return erro(
      ERRO.TRANSICAO_INVALIDA,
      `Só é possível atender uma solicitação no estado "${STATUS.REGISTRADA}".`,
    );
  }

  const atendida = Object.freeze({
    ...solicitacao,
    status: STATUS.ATENDIDA,
    motivoRecusa: null,
  });
  return ok(atendida);
};

/**
 * RECUSA a solicitação quando ela NÃO pode ser atendida (R11.5): registra o
 * MOTIVO e PRESERVA o Dado_Pessoal SEM ALTERAÇÃO.
 *
 * Esta função é pura e, por construção, NÃO recebe nem toca o Dado_Pessoal: ela
 * apenas transiciona a SOLICITAÇÃO para `recusada` anotando o motivo. O dado do
 * titular, mantido em outro repositório, permanece intocado. Quando o chamador
 * quiser evidenciar essa preservação, pode passar `dadoPessoal`: a função o
 * devolve em `valor.dadoPreservado` pela MESMA referência recebida, sem cópia
 * mutada, comprovando que o estado anterior foi preservado.
 *
 * @param {Object} solicitacao
 * @param {string} motivo              motivo da recusa (obrigatório)
 * @param {*} [dadoPessoal]            opcional: dado a ter sua preservação evidenciada
 * @returns {{ok:true, valor:object} | {ok:false, codigo:string, mensagem:string}}
 */
export const recusarSolicitacao = (solicitacao, motivo, dadoPessoal) => {
  if (!ehSolicitacao(solicitacao)) {
    return erro(ERRO.SOLICITACAO_INVALIDA, 'Solicitação ausente ou inválida.');
  }
  if (solicitacao.status !== STATUS.REGISTRADA) {
    return erro(
      ERRO.TRANSICAO_INVALIDA,
      `Só é possível recusar uma solicitação no estado "${STATUS.REGISTRADA}".`,
    );
  }
  if (typeof motivo !== 'string' || motivo.trim().length === 0) {
    return erro(ERRO.MOTIVO_OBRIGATORIO, 'A recusa exige o registro de um motivo.');
  }

  const recusada = Object.freeze({
    ...solicitacao,
    status: STATUS.RECUSADA,
    motivoRecusa: motivo,
  });

  // Preservação do Dado_Pessoal (R11.5): devolvemos a MESMA referência recebida,
  // sem qualquer alteração. A recusa nunca produz escrita sobre o dado.
  const valor =
    dadoPessoal === undefined
      ? { solicitacao: recusada }
      : { solicitacao: recusada, dadoPreservado: dadoPessoal };

  return ok(valor);
};
