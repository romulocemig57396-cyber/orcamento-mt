/* ─────────────────────────────────────────────────────────────────────────────
   mascarar.js — mascaramento de dados pessoais (Dado_Pessoal) e segredos antes
   da gravação em logs e do retorno em mensagens de erro.

   Garantia (Property 7 / R9.3, R10.4): o conteúdo mascarado NUNCA contém o valor
   original de forma recuperável. O mascaramento é NÃO REVERSÍVEL a partir do
   conteúdo gravado — os valores sensíveis são substituídos por um marcador fixo
   (não por hash, cifra ou qualquer transformação que permita recompor o original).

   Funções puras: não mutam a entrada, sempre retornam uma cópia nova.
   Suporta strings, objetos aninhados, arrays, Map, Set e primitivos.
   ───────────────────────────────────────────────────────────────────────────── */

// Marcador fixo não reversível. O mesmo marcador para qualquer valor garante que
// o conteúdo gravado não carregue informação sobre o original (sem comprimento,
// sem fragmento, sem hash).
export const MARCADOR = '[REDACTED]';

/**
 * Chaves cujo VALOR deve ser integralmente mascarado onde quer que apareçam
 * (comparação por nome de campo, sem diferenciar maiúsculas/minúsculas).
 * Cobre Dado_Pessoal (R10.4) e segredos (R9.3).
 */
export const CHAVES_SENSIVEIS_PADRAO = [
  // Dado_Pessoal
  'cpf',
  'cnpj',
  'rg',
  'email',
  'e-mail',
  'nome',
  'nomecompleto',
  'telefone',
  'celular',
  'endereco',
  'cep',
  'titular',
  'dadopessoal',
  // Segredos
  'senha',
  'password',
  'pwd',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authorization',
  'secret',
  'clientsecret',
  'apikey',
  'api-key',
  'chave',
  'chaveprivada',
  'privatekey',
  'connectionstring',
  'connstring',
  'credential',
  'credenciais',
];

/**
 * Padrões (regex) que identificam valores sensíveis EMBUTIDOS em strings livres,
 * mesmo quando não estão sob uma chave reconhecida (ex.: mensagens de erro).
 * Cada ocorrência é substituída pelo MARCADOR.
 *
 * A ordem importa: padrões mais específicos/compridos primeiro para evitar que
 * um padrão genérico mascare apenas parte de um valor maior.
 */
export const PADROES_SENSIVEIS_PADRAO = [
  // Connection strings (Azure/SQL/Cosmos): algo=...;algo=...;
  /(?:AccountKey|Password|Pwd|SharedAccessKey|AccountEndpoint|Server|Data Source)\s*=\s*[^;\s]+/gi,
  // JWT (três segmentos base64url separados por ponto)
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  // Bearer token em cabeçalho
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  // E-mail
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // CPF formatado 000.000.000-00
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
  // CNPJ formatado 00.000.000/0000-00
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
  // CPF/CNPJ só dígitos (11 ou 14) — isolado por limites não numéricos
  /(?<![\d.])\d{11}(?![\d.])/g,
  /(?<![\d.])\d{14}(?![\d.])/g,
];

const ehObjetoSimples = (valor) =>
  valor !== null && typeof valor === 'object';

const normalizarChave = (chave) =>
  String(chave).toLowerCase().replace(/[\s_-]/g, '');

/**
 * Indica se um nome de chave está na lista de chaves sensíveis.
 * @param {string} chave
 * @param {string[]} chavesSensiveis
 * @returns {boolean}
 */
export const chaveEhSensivel = (chave, chavesSensiveis = CHAVES_SENSIVEIS_PADRAO) => {
  const alvo = normalizarChave(chave);
  return chavesSensiveis.some((c) => normalizarChave(c) === alvo);
};

/**
 * Mascara padrões sensíveis embutidos numa string livre.
 * Qualquer trecho que corresponda a um padrão é trocado pelo MARCADOR.
 * @param {string} texto
 * @param {RegExp[]} padroes
 * @returns {string}
 */
export const mascararString = (texto, padroes = PADROES_SENSIVEIS_PADRAO) => {
  if (typeof texto !== 'string') return texto;
  let saida = texto;
  for (const padrao of padroes) {
    // Reinicia lastIndex de regex globais para reutilização segura.
    if (padrao.global) padrao.lastIndex = 0;
    saida = saida.replace(padrao, MARCADOR);
  }
  return saida;
};

/**
 * Mascara um valor avulso de forma não reversível.
 * - Se `sensivel` é true (valor conhecidamente sensível, ex.: segredo recuperado
 *   do Cofre_Segredos ou campo sob chave sensível), retorna o MARCADOR fixo.
 * - Caso contrário, se for string, mascara padrões sensíveis embutidos.
 * - Objetos/arrays são percorridos recursivamente via mascararObjeto.
 *
 * @param {*} valor valor a mascarar
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.sensivel=false] força o mascaramento integral do valor
 * @param {string[]} [opcoes.chavesSensiveis]
 * @param {RegExp[]} [opcoes.padroes]
 * @returns {*} cópia mascarada (nunca a referência original para objetos)
 */
export const mascararValor = (valor, opcoes = {}) => {
  const {
    sensivel = false,
    chavesSensiveis = CHAVES_SENSIVEIS_PADRAO,
    padroes = PADROES_SENSIVEIS_PADRAO,
  } = opcoes;

  if (sensivel) {
    // Valor inteiramente sensível: substitui por marcador fixo, inclusive quando
    // é objeto/array — não devolve nada do conteúdo original.
    return MARCADOR;
  }

  if (typeof valor === 'string') {
    return mascararString(valor, padroes);
  }

  if (ehObjetoSimples(valor)) {
    return mascararObjeto(valor, { chavesSensiveis, padroes });
  }

  // Primitivos não sensíveis (number, boolean, null, undefined, bigint): inalterados.
  return valor;
};

/**
 * Percorre um objeto/array/Map/Set recursivamente, retornando uma CÓPIA em que:
 * - valores sob chaves sensíveis viram o MARCADOR fixo (não reversível);
 * - strings livres têm padrões sensíveis mascarados;
 * - estruturas aninhadas são tratadas recursivamente.
 *
 * Protege contra referências cíclicas (substitui ciclos pelo marcador '[CYCLIC]').
 *
 * @param {*} entrada
 * @param {object} [opcoes]
 * @param {string[]} [opcoes.chavesSensiveis]
 * @param {RegExp[]} [opcoes.padroes]
 * @returns {*} cópia mascarada
 */
export const mascararObjeto = (entrada, opcoes = {}) => {
  const {
    chavesSensiveis = CHAVES_SENSIVEIS_PADRAO,
    padroes = PADROES_SENSIVEIS_PADRAO,
  } = opcoes;

  const vistos = new WeakSet();

  const percorrer = (valor) => {
    if (typeof valor === 'string') {
      return mascararString(valor, padroes);
    }

    if (!ehObjetoSimples(valor)) {
      return valor;
    }

    if (vistos.has(valor)) {
      return '[CYCLIC]';
    }
    vistos.add(valor);

    if (Array.isArray(valor)) {
      return valor.map((item) => percorrer(item));
    }

    if (valor instanceof Map) {
      const saida = new Map();
      for (const [chave, v] of valor.entries()) {
        const chaveSensivel =
          typeof chave === 'string' && chaveEhSensivel(chave, chavesSensiveis);
        saida.set(chave, chaveSensivel ? MARCADOR : percorrer(v));
      }
      return saida;
    }

    if (valor instanceof Set) {
      return new Set([...valor].map((item) => percorrer(item)));
    }

    if (valor instanceof Date) {
      // Datas não são sensíveis por si; devolve cópia.
      return new Date(valor.getTime());
    }

    if (valor instanceof Error) {
      // Mensagens de erro podem conter dados sensíveis embutidos (R9.3/R10.4).
      const copia = new Error(mascararString(valor.message, padroes));
      copia.name = valor.name;
      return copia;
    }

    // Objeto simples.
    const saida = {};
    for (const chave of Object.keys(valor)) {
      if (chaveEhSensivel(chave, chavesSensiveis)) {
        saida[chave] = MARCADOR;
      } else {
        saida[chave] = percorrer(valor[chave]);
      }
    }
    return saida;
  };

  return percorrer(entrada);
};

/**
 * Ponto de entrada conveniente: mascara qualquer entrada (string, objeto, etc.)
 * aplicando as mesmas regras. Equivalente a mascararValor sem forçar sensível.
 *
 * Uso típico: `logger.info(mascarar(payload))` antes de gravar.
 *
 * @param {*} entrada
 * @param {object} [opcoes]
 * @returns {*} cópia mascarada
 */
export const mascarar = (entrada, opcoes = {}) => mascararValor(entrada, opcoes);

export default mascarar;
