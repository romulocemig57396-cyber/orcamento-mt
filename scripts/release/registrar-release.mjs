#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   registrar-release.mjs — runner de release para a esteira de produção (R12.2)

   Objetivo:
   - Após a implantação em produção bem-sucedida, registrar a TAG SemVer única
     da release (R12.2) e atualizar o CHANGELOG com versão, data e mudanças
     (R12.4), reutilizando a lógica pura de `src/versao/release.js`.

   Este runner apenas conecta os efeitos de IO REAIS (git para a tag; sistema de
   arquivos para o CHANGELOG.md) ao módulo testável `registrarRelease`, mantendo
   o YAML do pipeline enxuto.

   Preservação de estado (coerente com R12.3 e R12.5):
   - Conflito de tag (R12.3): a tag existente é preservada; o runner encerra com
     código de saída dedicado, sem tocar no CHANGELOG.
   - Falha de CHANGELOG (R12.5): o conteúdo anterior é preservado pela própria
     lógica de `registrarRelease` (restauração best-effort); o runner apenas
     reporta o erro e encerra, sem quebrar o histórico.

   Códigos de saída (consumíveis pela esteira):
     0 → sucesso (tag criada + CHANGELOG atualizado).
     2 → conflito de tag já existente (R12.3) — não é falha "destrutiva".
     3 → falha ao atualizar/ler o CHANGELOG (R12.5) — estado anterior preservado.
     4 → versão inválida / entrada inválida.
     5 → erro inesperado de ambiente (ex.: git indisponível).

   Uso:
     node scripts/release/registrar-release.mjs [versao]
   A versão pode ser passada:
     - como 1º argumento posicional; ou
     - pela variável de ambiente RELEASE_VERSION; ou
     - lida de package.json (campo "version") — padrão.
   As mudanças do CHANGELOG podem vir da variável RELEASE_CHANGES (uma por linha);
   na ausência, usa-se uma entrada genérica referenciando a tag/execução.
   ───────────────────────────────────────────────────────────────────────────── */

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { registrarRelease, ERRO } from '../../src/versao/release.js';

// Raiz do repositório (duas pastas acima deste arquivo: scripts/release → raiz).
const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(__dirname, '..', '..');
const CAMINHO_PACKAGE = resolve(RAIZ, 'package.json');
const CAMINHO_CHANGELOG = resolve(RAIZ, 'CHANGELOG.md');

/**
 * Resolve a versão da release a partir de (nesta ordem):
 *   1. argumento posicional; 2. RELEASE_VERSION; 3. package.json.
 * @returns {Promise<string>}
 */
export const resolverVersao = async () => {
  const argv = process.argv.slice(2);
  if (argv[0] && argv[0].trim() !== '') {
    return argv[0].trim();
  }
  if (process.env.RELEASE_VERSION && process.env.RELEASE_VERSION.trim() !== '') {
    return process.env.RELEASE_VERSION.trim();
  }
  const pkgTexto = await readFile(CAMINHO_PACKAGE, 'utf8');
  const pkg = JSON.parse(pkgTexto);
  if (!pkg.version || String(pkg.version).trim() === '') {
    throw new Error('package.json não possui o campo "version".');
  }
  return String(pkg.version).trim();
};

/**
 * Resolve a lista de mudanças da release (uma por linha em RELEASE_CHANGES).
 * Na ausência, retorna uma entrada genérica para não deixar o CHANGELOG vazio.
 * @param {string} versao
 * @returns {string[]}
 */
export const resolverMudancas = (versao) => {
  const bruto = process.env.RELEASE_CHANGES ?? '';
  const itens = bruto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  return itens.length > 0 ? itens : [`Release ${versao} publicada em produção.`];
};

/**
 * Monta o objeto `io` com efeitos REAIS: git (tag) e FS (CHANGELOG.md).
 * @returns {object}
 */
export const criarIoReal = () => ({
  // Verifica a existência da tag via git, sem lançar quando a tag não existe.
  tagExiste: (nome) => {
    const saida = execFileSync('git', ['tag', '--list', nome], {
      cwd: RAIZ,
      encoding: 'utf8',
    });
    return saida.split('\n').some((l) => l.trim() === nome);
  },

  // Cria a tag anotada da release (R12.2). Lança em caso de falha do git — a
  // lógica de registrarRelease trata o erro e preserva o estado.
  criarTag: (nome, versaoCanon) => {
    execFileSync('git', ['tag', '-a', nome, '-m', `Release ${versaoCanon}`], {
      cwd: RAIZ,
      encoding: 'utf8',
    });
  },

  // Lê o CHANGELOG atual (string vazia quando o arquivo ainda não existe).
  lerChangelog: async () => {
    if (!existsSync(CAMINHO_CHANGELOG)) {
      return '';
    }
    return readFile(CAMINHO_CHANGELOG, 'utf8');
  },

  // Grava o novo conteúdo do CHANGELOG. Lança em falha de IO — a restauração
  // do conteúdo anterior é feita pela lógica de registrarRelease (R12.5).
  escreverChangelog: async (conteudo) => {
    await writeFile(CAMINHO_CHANGELOG, conteudo, 'utf8');
  },
});

/**
 * Ponto de entrada do runner.
 */
const main = async () => {
  let versao;
  try {
    versao = await resolverVersao();
  } catch (e) {
    console.error(`[release] Não foi possível resolver a versão: ${e.message}`);
    process.exit(4);
    return;
  }

  const mudancas = resolverMudancas(versao);
  const io = criarIoReal();

  console.log(`[release] Registrando release da versão ${versao} (tag + CHANGELOG)…`);

  const resultado = await registrarRelease({ versao, mudancas, data: new Date(), io });

  if (resultado.ok) {
    console.log(
      `[release] OK — tag ${resultado.valor.tag} criada e CHANGELOG atualizado (R12.2/R12.4).`
    );
    process.exit(0);
    return;
  }

  // Mapeia o código de erro do módulo para um código de saída da esteira,
  // sempre preservando o histórico (nenhuma ação destrutiva aqui).
  switch (resultado.codigo) {
    case ERRO.CONFLITO_TAG:
      console.error(`[release] CONFLITO DE TAG (R12.3): ${resultado.mensagem}`);
      console.error('[release] A tag existente foi preservada. Nada foi destruído.');
      process.exit(2);
      break;
    case ERRO.FALHA_CHANGELOG:
      console.error(`[release] FALHA NO CHANGELOG (R12.5): ${resultado.mensagem}`);
      console.error('[release] O conteúdo anterior do CHANGELOG foi preservado.');
      process.exit(3);
      break;
    case ERRO.VERSAO_INVALIDA:
      console.error(`[release] VERSÃO INVÁLIDA (R12.1): ${resultado.mensagem}`);
      process.exit(4);
      break;
    default:
      console.error(`[release] ERRO (${resultado.codigo}): ${resultado.mensagem}`);
      process.exit(5);
  }
};

// Executa o runner apenas quando o módulo é o ponto de entrada direto
// (`node scripts/release/registrar-release.mjs`). Ao ser importado por testes,
// nada é executado — evitando efeitos colaterais (git/FS).
const ehEntrypoint =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (ehEntrypoint) {
  main().catch((e) => {
    // Erro inesperado de ambiente (ex.: git ausente no agente). Não altera o
    // histórico; apenas reporta e encerra com código dedicado.
    console.error(`[release] Erro inesperado: ${e && e.message ? e.message : e}`);
    process.exit(5);
  });
}

export { main };
