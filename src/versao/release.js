/* ─────────────────────────────────────────────────────────────────────────────
   release.js — processo de tag e CHANGELOG de release (R12.2–R12.5)

   Responsabilidades:
   - Registrar uma tag única no formato SemVer para a release (R12.2).
   - Se a tag já existe, preservar a existente e retornar erro de conflito (R12.3).
   - Registrar uma entrada no CHANGELOG com versão, data e lista de mudanças (R12.4).
   - Se a atualização do CHANGELOG falhar, preservar o conteúdo anterior e
     retornar erro (R12.5).

   Design (Error Handling do design.md):
   - "Tag de versão já existente → preserva a tag; retorna erro de conflito" (R12.3)
   - "Falha ao atualizar CHANGELOG → preserva conteúdo anterior; retorna erro" (R12.5)
   - "Preservação de estado em falha": o CHANGELOG preserva o estado anterior em
     caso de falha.

   A lógica é mantida pura e testável: os efeitos colaterais (listar/criar tag,
   ler/escrever CHANGELOG) são injetados via um objeto `io`, de modo que a
   detecção de conflito de tag, a montagem da entrada do CHANGELOG e a
   preservação em falha possam ser testadas sem git ou sistema de arquivos reais.
   ───────────────────────────────────────────────────────────────────────────── */

import { parse, format } from './semver.js';

/**
 * Códigos de erro padronizados retornados por este módulo.
 * @readonly
 */
export const ERRO = Object.freeze({
  VERSAO_INVALIDA: 'VERSAO_INVALIDA',
  CONFLITO_TAG: 'CONFLITO_TAG',
  FALHA_CHANGELOG: 'FALHA_CHANGELOG',
  IO_INVALIDO: 'IO_INVALIDO',
});

/**
 * Resultado de sucesso.
 * @template T
 * @param {T} valor
 * @returns {{ ok: true, valor: T }}
 */
const ok = (valor) => ({ ok: true, valor });

/**
 * Resultado de erro.
 * @param {string} codigo
 * @param {string} mensagem
 * @param {object} [detalhes]
 * @returns {{ ok: false, codigo: string, mensagem: string, detalhes?: object }}
 */
const erro = (codigo, mensagem, detalhes) =>
  detalhes === undefined
    ? { ok: false, codigo, mensagem }
    : { ok: false, codigo, mensagem, detalhes };

/**
 * Normaliza uma versão (string ou objeto) para a sua string canônica SemVer.
 * Reaproveita parse/format de semver.js para validar e canonizar.
 * @param {string | { major: number, minor: number, patch: number }} versao
 * @returns {string}
 * @throws {Error} Se a versão for inválida.
 */
const versaoCanonica = (versao) =>
  typeof versao === 'string' ? format(parse(versao)) : format(versao);

/**
 * Nome da tag a partir da versão canônica. Usa o prefixo convencional "v".
 * @param {string} versaoCanon
 * @returns {string}
 */
export const nomeTag = (versaoCanon) => `v${versaoCanon}`;

/**
 * Formata a data da release em ISO 8601 (YYYY-MM-DD, UTC).
 * @param {Date | string} data
 * @returns {string}
 */
const formatarData = (data) => {
  if (data instanceof Date) {
    if (Number.isNaN(data.getTime())) {
      throw new Error('Data de release inválida.');
    }
    return data.toISOString().slice(0, 10);
  }
  if (typeof data === 'string' && data.trim() !== '') {
    return data.trim();
  }
  throw new Error('Data de release inválida: esperado Date ou string não vazia.');
};

/**
 * Monta a entrada de CHANGELOG (texto Markdown) para uma release.
 *
 * Formato (Keep a Changelog, simplificado):
 *
 *   ## [1.2.3] - 2024-01-31
 *   - Mudança A
 *   - Mudança B
 *
 * Função pura: não lê nem escreve nada.
 *
 * @param {object} params
 * @param {string | { major: number, minor: number, patch: number }} params.versao
 * @param {Date | string} params.data Data da release.
 * @param {string[]} params.mudancas Lista de mudanças incluídas na release.
 * @returns {string} Bloco Markdown da entrada do CHANGELOG.
 * @throws {Error} Se a versão, a data ou a lista de mudanças forem inválidas.
 */
export const montarEntradaChangelog = ({ versao, data, mudancas }) => {
  const versaoCanon = versaoCanonica(versao);
  const dataFmt = formatarData(data);
  if (!Array.isArray(mudancas) || mudancas.length === 0) {
    throw new Error('Lista de mudanças inválida: esperado um array não vazio.');
  }
  const linhas = mudancas.map((m) => {
    if (typeof m !== 'string' || m.trim() === '') {
      throw new Error('Mudança inválida: cada item deve ser uma string não vazia.');
    }
    return `- ${m.trim()}`;
  });
  return `## [${versaoCanon}] - ${dataFmt}\n${linhas.join('\n')}\n`;
};

/**
 * Insere uma nova entrada no topo do CHANGELOG (abaixo de um cabeçalho `#`, se
 * houver), preservando todo o conteúdo anterior. Função pura.
 *
 * @param {string} conteudoAnterior Conteúdo atual do CHANGELOG (pode ser vazio).
 * @param {string} entrada Bloco da entrada já formatado (montarEntradaChangelog).
 * @returns {string} Novo conteúdo do CHANGELOG.
 */
export const inserirEntradaNoTopo = (conteudoAnterior, entrada) => {
  const atual = typeof conteudoAnterior === 'string' ? conteudoAnterior : '';
  const bloco = entrada.endsWith('\n') ? entrada : `${entrada}\n`;

  if (atual.trim() === '') {
    return `# Changelog\n\n${bloco}`;
  }

  const linhas = atual.split('\n');
  // Se a primeira linha não vazia for um cabeçalho de nível 1, inserimos a
  // entrada logo após ele (e após uma eventual linha em branco). Caso
  // contrário, inserimos no topo absoluto.
  const idxCabecalho = linhas.findIndex((l) => l.trim() !== '');
  if (idxCabecalho !== -1 && /^#\s/.test(linhas[idxCabecalho].trim())) {
    const antes = linhas.slice(0, idxCabecalho + 1).join('\n');
    const resto = linhas.slice(idxCabecalho + 1).join('\n').replace(/^\n+/, '');
    return `${antes}\n\n${bloco}\n${resto}`.replace(/\n{3,}/g, '\n\n');
  }

  return `${bloco}\n${atual}`.replace(/\n{3,}/g, '\n\n');
};

/**
 * Valida que o objeto `io` fornece as operações necessárias.
 * @param {object} io
 * @returns {string | null} Mensagem de erro, ou null se válido.
 */
const validarIo = (io) => {
  if (io === null || typeof io !== 'object') {
    return 'IO inválido: esperado um objeto com as operações de tag e CHANGELOG.';
  }
  const requeridas = ['tagExiste', 'criarTag', 'lerChangelog', 'escreverChangelog'];
  for (const op of requeridas) {
    if (typeof io[op] !== 'function') {
      return `IO inválido: operação "${op}" ausente ou não é uma função.`;
    }
  }
  return null;
};

/**
 * Executa o processo de release: cria a tag SemVer única e registra a entrada
 * no CHANGELOG, com preservação de estado em caso de falha.
 *
 * Fluxo (determinístico e sem exceções não tratadas):
 *  1. Valida a versão (SemVer) e o objeto `io`.
 *  2. Verifica conflito de tag (R12.3): se a tag já existe, preserva-a e
 *     retorna erro de conflito, sem tocar no CHANGELOG.
 *  3. Monta a entrada do CHANGELOG (versão, data, mudanças) — R12.4.
 *  4. Lê o conteúdo anterior do CHANGELOG e tenta escrever o novo conteúdo.
 *     Se a escrita falhar (R12.5), restaura o conteúdo anterior (best-effort)
 *     e retorna erro, sem criar a tag.
 *  5. Cria a tag (R12.2) somente após o CHANGELOG ter sido atualizado com
 *     sucesso. Se a criação da tag falhar, tenta reverter o CHANGELOG.
 *
 * O objeto `io` injeta todos os efeitos colaterais:
 *   - tagExiste(nome): boolean — indica se a tag já existe no repositório.
 *   - criarTag(nome, versaoCanon): cria a tag (pode lançar/rejeitar em falha).
 *   - lerChangelog(): string — conteúdo atual do CHANGELOG.
 *   - escreverChangelog(conteudo): grava o novo conteúdo (pode lançar/rejeitar).
 *
 * @param {object} params
 * @param {string | { major: number, minor: number, patch: number }} params.versao
 * @param {string[]} params.mudancas Lista de mudanças incluídas na release.
 * @param {Date | string} [params.data] Data da release (padrão: agora, UTC).
 * @param {object} params.io Operações de efeito colateral injetadas.
 * @returns {Promise<
 *   | { ok: true, valor: { versao: string, tag: string, changelog: string } }
 *   | { ok: false, codigo: string, mensagem: string, detalhes?: object }
 * >}
 */
export const registrarRelease = async ({ versao, mudancas, data = new Date(), io }) => {
  // 1. Validações de entrada.
  const ioErro = validarIo(io);
  if (ioErro) {
    return erro(ERRO.IO_INVALIDO, ioErro);
  }

  let versaoCanon;
  let tag;
  let entrada;
  try {
    versaoCanon = versaoCanonica(versao);
    tag = nomeTag(versaoCanon);
    entrada = montarEntradaChangelog({ versao: versaoCanon, data, mudancas });
  } catch (e) {
    return erro(ERRO.VERSAO_INVALIDA, e.message);
  }

  // 2. Conflito de tag (R12.3): preserva a existente, não altera o CHANGELOG.
  let existe;
  try {
    existe = await io.tagExiste(tag);
  } catch (e) {
    return erro(ERRO.IO_INVALIDO, `Falha ao verificar a tag "${tag}": ${e.message}`);
  }
  if (existe) {
    return erro(
      ERRO.CONFLITO_TAG,
      `Conflito de versão: a tag "${tag}" já existe no repositório.`,
      { tag, versao: versaoCanon }
    );
  }

  // 3 e 4. Atualização do CHANGELOG com preservação do conteúdo anterior (R12.5).
  let conteudoAnterior = '';
  try {
    conteudoAnterior = (await io.lerChangelog()) ?? '';
  } catch (e) {
    return erro(
      ERRO.FALHA_CHANGELOG,
      `Falha ao ler o CHANGELOG; conteúdo anterior preservado: ${e.message}`
    );
  }

  const novoConteudo = inserirEntradaNoTopo(conteudoAnterior, entrada);
  try {
    await io.escreverChangelog(novoConteudo);
  } catch (e) {
    // R12.5: preservar o conteúdo anterior do CHANGELOG e retornar erro.
    try {
      await io.escreverChangelog(conteudoAnterior);
    } catch {
      // Restauração best-effort; a falha de restauração não altera o resultado.
    }
    return erro(
      ERRO.FALHA_CHANGELOG,
      `Falha ao atualizar o CHANGELOG; conteúdo anterior preservado: ${e.message}`,
      { tag, versao: versaoCanon }
    );
  }

  // 5. Criação da tag (R12.2) após o CHANGELOG atualizado com sucesso.
  try {
    await io.criarTag(tag, versaoCanon);
  } catch (e) {
    // Reverte o CHANGELOG para manter consistência (best-effort).
    try {
      await io.escreverChangelog(conteudoAnterior);
    } catch {
      // best-effort
    }
    return erro(
      ERRO.CONFLITO_TAG,
      `Falha ao criar a tag "${tag}": ${e.message}`,
      { tag, versao: versaoCanon }
    );
  }

  return ok({ versao: versaoCanon, tag, changelog: novoConteudo });
};
