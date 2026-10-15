/* ─────────────────────────────────────────────────────────────────────────────
   registrar-release.test.mjs — teste leve do runner de release (R12.2)

   Objetivo: validar o objeto `io` REAL montado pelo runner (git para tag; FS
   para CHANGELOG) e os resolvedores de versão/mudanças, SEM efeitos colaterais:
   os módulos `node:child_process` e `node:fs/promises`/`node:fs` são mockados.
   Nenhum git é executado e nenhum arquivo é escrito em disco.
   ───────────────────────────────────────────────────────────────────────────── */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ── Mocks de efeitos colaterais ─────────────────────────────────────────────
const execFileSync = vi.fn();
const readFile = vi.fn();
const writeFile = vi.fn();
const existsSync = vi.fn();

vi.mock('node:child_process', () => {
  const api = { execFileSync: (...a) => execFileSync(...a) };
  return { ...api, default: api };
});
vi.mock('node:fs/promises', () => {
  const api = {
    readFile: (...a) => readFile(...a),
    writeFile: (...a) => writeFile(...a),
  };
  return { ...api, default: api };
});
vi.mock('node:fs', () => {
  const api = { existsSync: (...a) => existsSync(...a) };
  return { ...api, default: api };
});

// Importa o runner DEPOIS dos mocks. Como não é o entrypoint, `main()` não roda.
const { criarIoReal, resolverVersao, resolverMudancas } = await import(
  './registrar-release.mjs'
);

beforeEach(() => {
  execFileSync.mockReset();
  readFile.mockReset();
  writeFile.mockReset();
  existsSync.mockReset();
  delete process.env.RELEASE_VERSION;
  delete process.env.RELEASE_CHANGES;
});

describe('io.tagExiste (git tag --list)', () => {
  test('retorna true quando a tag aparece na listagem do git', () => {
    execFileSync.mockReturnValue('v1.0.0\n');
    const io = criarIoReal();
    expect(io.tagExiste('v1.0.0')).toBe(true);
  });

  test('retorna false quando a tag não está na listagem', () => {
    execFileSync.mockReturnValue('');
    const io = criarIoReal();
    expect(io.tagExiste('v9.9.9')).toBe(false);
  });
});

describe('io.criarTag (git tag -a)', () => {
  test('invoca git com os argumentos de tag anotada', () => {
    execFileSync.mockReturnValue('');
    const io = criarIoReal();
    io.criarTag('v1.2.3', '1.2.3');
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['tag', '-a', 'v1.2.3', '-m', 'Release 1.2.3'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });
});

describe('io.lerChangelog / io.escreverChangelog (FS)', () => {
  test('lerChangelog retorna string vazia quando o arquivo não existe', async () => {
    existsSync.mockReturnValue(false);
    const io = criarIoReal();
    await expect(io.lerChangelog()).resolves.toBe('');
    expect(readFile).not.toHaveBeenCalled();
  });

  test('lerChangelog lê o conteúdo quando o arquivo existe', async () => {
    existsSync.mockReturnValue(true);
    readFile.mockResolvedValue('# Changelog\n\n## [1.0.0] - 2024-01-01\n- Inicial\n');
    const io = criarIoReal();
    await expect(io.lerChangelog()).resolves.toContain('[1.0.0]');
  });

  test('escreverChangelog grava o conteúdo no arquivo', async () => {
    writeFile.mockResolvedValue(undefined);
    const io = criarIoReal();
    await io.escreverChangelog('conteudo');
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('CHANGELOG.md'),
      'conteudo',
      'utf8'
    );
  });
});

describe('resolverVersao', () => {
  test('prioriza RELEASE_VERSION sobre package.json', async () => {
    process.env.RELEASE_VERSION = '2.3.4';
    await expect(resolverVersao()).resolves.toBe('2.3.4');
    expect(readFile).not.toHaveBeenCalled();
  });

  test('lê a versão do package.json quando nada mais é informado', async () => {
    readFile.mockResolvedValue(JSON.stringify({ version: '1.0.0' }));
    await expect(resolverVersao()).resolves.toBe('1.0.0');
  });
});

describe('resolverMudancas', () => {
  test('usa RELEASE_CHANGES (uma por linha) quando presente', () => {
    process.env.RELEASE_CHANGES = 'Mudança A\n  Mudança B  \n\n';
    expect(resolverMudancas('1.0.0')).toEqual(['Mudança A', 'Mudança B']);
  });

  test('cai para uma entrada genérica quando não há mudanças', () => {
    const r = resolverMudancas('1.0.0');
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('1.0.0');
  });
});
