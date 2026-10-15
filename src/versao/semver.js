/* ─────────────────────────────────────────────────────────────────────────────
   semver.js — versionamento semântico (SemVer) MAJOR.MINOR.PATCH

   Funções puras para analisar (parse), formatar (format) e incrementar versões
   semânticas. Cada componente (MAJOR, MINOR, PATCH) é um inteiro de 0 a 999999.

   Regras de incremento (R12.1):
   - MAJOR: incrementa MAJOR e zera MINOR e PATCH (mudanças incompatíveis).
   - MINOR: incrementa MINOR e zera PATCH (funcionalidades compatíveis).
   - PATCH: incrementa PATCH (correções compatíveis).

   Round-trip (Property 10): para toda versão válida, parse → format reproduz a
   mesma string de versão.
   ───────────────────────────────────────────────────────────────────────────── */

/** Menor valor permitido para um componente de versão. */
export const MIN_COMPONENTE = 0;
/** Maior valor permitido para um componente de versão. */
export const MAX_COMPONENTE = 999999;

/**
 * Indica se um valor é um componente de versão válido:
 * inteiro de MIN_COMPONENTE a MAX_COMPONENTE.
 * @param {unknown} n
 * @returns {boolean}
 */
export const componenteValido = (n) =>
  typeof n === 'number' &&
  Number.isInteger(n) &&
  n >= MIN_COMPONENTE &&
  n <= MAX_COMPONENTE;

/**
 * Analisa uma string de versão no formato MAJOR.MINOR.PATCH.
 * Rejeita formatos inválidos, zeros à esquerda, componentes fora do intervalo
 * [0, 999999] e qualquer caractere extra.
 * @param {string} versao
 * @returns {{ major: number, minor: number, patch: number }}
 * @throws {Error} Se a versão for inválida.
 */
export const parse = (versao) => {
  if (typeof versao !== 'string') {
    throw new Error('Versão inválida: esperado uma string no formato MAJOR.MINOR.PATCH.');
  }
  // Cada componente: um único "0", ou um dígito 1-9 seguido de outros dígitos
  // (sem zeros à esquerda). Até 6 dígitos por componente garantem ≤ 999999 no
  // nível léxico; o limite exato é reconferido abaixo.
  const match = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.exec(versao);
  if (!match) {
    throw new Error(
      `Versão inválida: "${versao}". Esperado MAJOR.MINOR.PATCH com inteiros de ${MIN_COMPONENTE} a ${MAX_COMPONENTE} sem zeros à esquerda.`
    );
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!componenteValido(major) || !componenteValido(minor) || !componenteValido(patch)) {
    throw new Error(
      `Versão inválida: "${versao}". Cada componente deve ser um inteiro de ${MIN_COMPONENTE} a ${MAX_COMPONENTE}.`
    );
  }
  return { major, minor, patch };
};

/**
 * Formata um objeto de versão como string MAJOR.MINOR.PATCH.
 * Valida que cada componente é um inteiro no intervalo permitido.
 * @param {{ major: number, minor: number, patch: number }} versao
 * @returns {string}
 * @throws {Error} Se algum componente for inválido.
 */
export const format = (versao) => {
  if (versao === null || typeof versao !== 'object') {
    throw new Error('Versão inválida: esperado um objeto { major, minor, patch }.');
  }
  const { major, minor, patch } = versao;
  if (!componenteValido(major) || !componenteValido(minor) || !componenteValido(patch)) {
    throw new Error(
      `Versão inválida: cada componente deve ser um inteiro de ${MIN_COMPONENTE} a ${MAX_COMPONENTE}.`
    );
  }
  return `${major}.${minor}.${patch}`;
};

/**
 * Normaliza a entrada (string ou objeto) para um objeto de versão validado.
 * @param {string | { major: number, minor: number, patch: number }} versao
 * @returns {{ major: number, minor: number, patch: number }}
 */
const normalizar = (versao) => {
  if (typeof versao === 'string') return parse(versao);
  // Para objetos, reaproveitamos format para validar e devolvemos uma cópia.
  format(versao);
  return { major: versao.major, minor: versao.minor, patch: versao.patch };
};

/**
 * Garante que um componente não ultrapasse o limite máximo após incremento.
 * @param {number} valor
 * @param {string} nome
 */
const assertDentroDoLimite = (valor, nome) => {
  if (valor > MAX_COMPONENTE) {
    throw new Error(
      `Incremento de ${nome} excede o limite máximo (${MAX_COMPONENTE}).`
    );
  }
};

/**
 * Incrementa o componente MAJOR, zerando MINOR e PATCH.
 * @param {string | { major: number, minor: number, patch: number }} versao
 * @returns {{ major: number, minor: number, patch: number }}
 * @throws {Error} Se a versão for inválida ou o incremento ultrapassar o limite.
 */
export const incrementMajor = (versao) => {
  const { major } = normalizar(versao);
  const novoMajor = major + 1;
  assertDentroDoLimite(novoMajor, 'MAJOR');
  return { major: novoMajor, minor: 0, patch: 0 };
};

/**
 * Incrementa o componente MINOR, zerando PATCH e preservando MAJOR.
 * @param {string | { major: number, minor: number, patch: number }} versao
 * @returns {{ major: number, minor: number, patch: number }}
 * @throws {Error} Se a versão for inválida ou o incremento ultrapassar o limite.
 */
export const incrementMinor = (versao) => {
  const { major, minor } = normalizar(versao);
  const novoMinor = minor + 1;
  assertDentroDoLimite(novoMinor, 'MINOR');
  return { major, minor: novoMinor, patch: 0 };
};

/**
 * Incrementa o componente PATCH, preservando MAJOR e MINOR.
 * @param {string | { major: number, minor: number, patch: number }} versao
 * @returns {{ major: number, minor: number, patch: number }}
 * @throws {Error} Se a versão for inválida ou o incremento ultrapassar o limite.
 */
export const incrementPatch = (versao) => {
  const { major, minor, patch } = normalizar(versao);
  const novoPatch = patch + 1;
  assertDentroDoLimite(novoPatch, 'PATCH');
  return { major, minor, patch: novoPatch };
};
