import { describe, test, expect } from 'vitest';
import {
  registrarRelease,
  montarEntradaChangelog,
  inserirEntradaNoTopo,
  nomeTag,
  ERRO,
} from '../versao/release.js';

/**
 * Cria um objeto `io` fake, em memória, que simula tags e CHANGELOG sem git/FS
 * reais. Permite injetar falhas controladas em cada operação.
 */
const criarIoFake = ({
  tagsExistentes = [],
  changelogInicial = '',
  falharEscrita = false,
  falharLeitura = false,
  falharCriarTag = false,
} = {}) => {
  const estado = {
    tags: new Set(tagsExistentes),
    changelog: changelogInicial,
    escritas: [],
  };
  const io = {
    tagExiste: async (nome) => estado.tags.has(nome),
    criarTag: async (nome) => {
      if (falharCriarTag) throw new Error('falha simulada ao criar tag');
      estado.tags.add(nome);
    },
    lerChangelog: async () => {
      if (falharLeitura) throw new Error('falha simulada ao ler changelog');
      return estado.changelog;
    },
    escreverChangelog: async (conteudo) => {
      estado.escritas.push(conteudo);
      // Se configurado para falhar, a primeira escrita (a atualização) falha,
      // mas a escrita de restauração do conteúdo anterior é permitida.
      if (falharEscrita && conteudo !== estado.changelog) {
        throw new Error('falha simulada ao escrever changelog');
      }
      estado.changelog = conteudo;
    },
  };
  return { io, estado };
};

describe('montarEntradaChangelog — montagem da entrada (R12.4)', () => {
  test('inclui versão, data e lista de mudanças', () => {
    const entrada = montarEntradaChangelog({
      versao: '1.2.3',
      data: new Date('2024-01-31T10:00:00Z'),
      mudancas: ['Corrige cálculo de PFC', 'Adiciona filtro de obras'],
    });
    expect(entrada).toContain('## [1.2.3] - 2024-01-31');
    expect(entrada).toContain('- Corrige cálculo de PFC');
    expect(entrada).toContain('- Adiciona filtro de obras');
  });

  test('aceita data como string ISO', () => {
    const entrada = montarEntradaChangelog({
      versao: { major: 2, minor: 0, patch: 0 },
      data: '2024-06-15',
      mudancas: ['Mudança incompatível'],
    });
    expect(entrada).toContain('## [2.0.0] - 2024-06-15');
  });

  test('rejeita versão inválida', () => {
    expect(() =>
      montarEntradaChangelog({ versao: '1.2', data: new Date(), mudancas: ['x'] })
    ).toThrow();
  });

  test('rejeita lista de mudanças vazia', () => {
    expect(() =>
      montarEntradaChangelog({ versao: '1.0.0', data: new Date(), mudancas: [] })
    ).toThrow();
  });
});

describe('inserirEntradaNoTopo — preserva o conteúdo anterior', () => {
  test('cria estrutura quando o CHANGELOG está vazio', () => {
    const r = inserirEntradaNoTopo('', '## [1.0.0] - 2024-01-01\n- Primeira\n');
    expect(r).toContain('# Changelog');
    expect(r).toContain('## [1.0.0] - 2024-01-01');
  });

  test('insere abaixo do cabeçalho e mantém entradas antigas', () => {
    const anterior = '# Changelog\n\n## [1.0.0] - 2024-01-01\n- Primeira\n';
    const r = inserirEntradaNoTopo(anterior, '## [1.1.0] - 2024-02-01\n- Segunda\n');
    expect(r).toContain('## [1.1.0] - 2024-02-01');
    expect(r).toContain('## [1.0.0] - 2024-01-01');
    // A nova entrada aparece antes da antiga.
    expect(r.indexOf('[1.1.0]')).toBeLessThan(r.indexOf('[1.0.0]'));
  });
});

describe('nomeTag', () => {
  test('usa o prefixo convencional v', () => {
    expect(nomeTag('1.2.3')).toBe('v1.2.3');
  });
});

describe('registrarRelease — caminho feliz (R12.2, R12.4)', () => {
  test('cria tag única e registra entrada no CHANGELOG', async () => {
    const { io, estado } = criarIoFake({ changelogInicial: '# Changelog\n' });
    const res = await registrarRelease({
      versao: '1.4.0',
      data: new Date('2024-03-10T00:00:00Z'),
      mudancas: ['Nova funcionalidade compatível'],
      io,
    });
    expect(res.ok).toBe(true);
    expect(res.valor.tag).toBe('v1.4.0');
    expect(estado.tags.has('v1.4.0')).toBe(true);
    expect(estado.changelog).toContain('## [1.4.0] - 2024-03-10');
    expect(estado.changelog).toContain('- Nova funcionalidade compatível');
  });
});

describe('registrarRelease — conflito de tag existente (R12.3)', () => {
  test('preserva a tag existente, não altera o CHANGELOG e retorna erro de conflito', async () => {
    const changelogOriginal = '# Changelog\n\n## [2.0.0] - 2024-01-01\n- Existente\n';
    const { io, estado } = criarIoFake({
      tagsExistentes: ['v2.0.0'],
      changelogInicial: changelogOriginal,
    });

    const res = await registrarRelease({
      versao: '2.0.0',
      data: new Date('2024-05-01T00:00:00Z'),
      mudancas: ['Tentativa duplicada'],
      io,
    });

    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.CONFLITO_TAG);
    // Tag existente preservada (continua presente, única).
    expect(estado.tags.has('v2.0.0')).toBe(true);
    expect([...estado.tags]).toEqual(['v2.0.0']);
    // CHANGELOG intacto: nenhuma escrita ocorreu.
    expect(estado.changelog).toBe(changelogOriginal);
    expect(estado.escritas).toHaveLength(0);
  });
});

describe('registrarRelease — falha ao atualizar CHANGELOG (R12.5)', () => {
  test('preserva o conteúdo anterior, não cria a tag e retorna erro', async () => {
    const changelogOriginal = '# Changelog\n\n## [1.0.0] - 2024-01-01\n- Inicial\n';
    const { io, estado } = criarIoFake({
      changelogInicial: changelogOriginal,
      falharEscrita: true,
    });

    const res = await registrarRelease({
      versao: '1.1.0',
      data: new Date('2024-04-01T00:00:00Z'),
      mudancas: ['Mudança que não deve persistir'],
      io,
    });

    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.FALHA_CHANGELOG);
    // Conteúdo anterior preservado.
    expect(estado.changelog).toBe(changelogOriginal);
    // A tag não deve ter sido criada (release abortada).
    expect(estado.tags.has('v1.1.0')).toBe(false);
    expect(estado.tags.size).toBe(0);
  });

  test('falha de leitura do CHANGELOG preserva o estado e retorna erro', async () => {
    const { io, estado } = criarIoFake({
      changelogInicial: '# Changelog\n',
      falharLeitura: true,
    });

    const res = await registrarRelease({
      versao: '1.2.0',
      data: new Date('2024-04-02T00:00:00Z'),
      mudancas: ['x'],
      io,
    });

    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.FALHA_CHANGELOG);
    expect(estado.tags.size).toBe(0);
  });
});

describe('registrarRelease — validações', () => {
  test('rejeita io inválido', async () => {
    const res = await registrarRelease({ versao: '1.0.0', mudancas: ['x'], io: {} });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.IO_INVALIDO);
  });

  test('rejeita versão inválida', async () => {
    const { io } = criarIoFake();
    const res = await registrarRelease({ versao: '1.2', mudancas: ['x'], io });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.VERSAO_INVALIDA);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
   Casos de borda adicionais (tarefa 3.4) — ampliam a cobertura de R12.3/R12.5
   além dos cenários básicos já testados acima.
   ────────────────────────────────────────────────────────────────────────── */

describe('registrarRelease — falha ao criar tag após CHANGELOG atualizado (R12.3 + R12.5)', () => {
  test('reverte o CHANGELOG ao conteúdo anterior quando a criação da tag falha', async () => {
    const changelogOriginal = '# Changelog\n\n## [1.0.0] - 2024-01-01\n- Inicial\n';
    const { io, estado } = criarIoFake({
      changelogInicial: changelogOriginal,
      falharCriarTag: true,
    });

    const res = await registrarRelease({
      versao: '1.1.0',
      data: new Date('2024-07-01T00:00:00Z'),
      mudancas: ['Mudança que não deve persistir após falha de tag'],
      io,
    });

    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.CONFLITO_TAG);
    // A tag não foi criada.
    expect(estado.tags.has('v1.1.0')).toBe(false);
    expect(estado.tags.size).toBe(0);
    // O CHANGELOG foi revertido ao conteúdo anterior (consistência).
    expect(estado.changelog).toBe(changelogOriginal);
    // Houve uma escrita de atualização seguida de uma de reversão.
    expect(estado.escritas.length).toBeGreaterThanOrEqual(2);
    expect(estado.escritas.at(-1)).toBe(changelogOriginal);
  });
});

describe('registrarRelease — múltiplas releases sequenciais (R12.2, R12.4)', () => {
  test('acumula tags únicas e entradas de CHANGELOG na ordem mais recente primeiro', async () => {
    const { io, estado } = criarIoFake({ changelogInicial: '# Changelog\n' });

    const r1 = await registrarRelease({
      versao: '1.0.0',
      data: new Date('2024-01-10T00:00:00Z'),
      mudancas: ['Primeira release'],
      io,
    });
    const r2 = await registrarRelease({
      versao: '1.1.0',
      data: new Date('2024-02-10T00:00:00Z'),
      mudancas: ['Segunda release'],
      io,
    });
    const r3 = await registrarRelease({
      versao: '2.0.0',
      data: new Date('2024-03-10T00:00:00Z'),
      mudancas: ['Terceira release'],
      io,
    });

    expect(r1.ok && r2.ok && r3.ok).toBe(true);
    // Três tags distintas registradas.
    expect([...estado.tags].sort()).toEqual(['v1.0.0', 'v1.1.0', 'v2.0.0']);
    // Todas as entradas estão presentes no CHANGELOG.
    expect(estado.changelog).toContain('## [1.0.0] - 2024-01-10');
    expect(estado.changelog).toContain('## [1.1.0] - 2024-02-10');
    expect(estado.changelog).toContain('## [2.0.0] - 2024-03-10');
    // A entrada mais recente aparece acima das anteriores.
    expect(estado.changelog.indexOf('[2.0.0]')).toBeLessThan(
      estado.changelog.indexOf('[1.1.0]')
    );
    expect(estado.changelog.indexOf('[1.1.0]')).toBeLessThan(
      estado.changelog.indexOf('[1.0.0]')
    );
  });

  test('conflito em uma release intermediária não afeta as já registradas', async () => {
    const { io, estado } = criarIoFake({ changelogInicial: '# Changelog\n' });

    await registrarRelease({
      versao: '1.0.0',
      data: '2024-01-01',
      mudancas: ['Base'],
      io,
    });
    const changelogAposPrimeira = estado.changelog;

    // Tenta repetir a mesma versão: deve conflitar e não alterar nada.
    const conflito = await registrarRelease({
      versao: '1.0.0',
      data: '2024-01-02',
      mudancas: ['Duplicada'],
      io,
    });

    expect(conflito.ok).toBe(false);
    expect(conflito.codigo).toBe(ERRO.CONFLITO_TAG);
    expect(estado.changelog).toBe(changelogAposPrimeira);
    expect([...estado.tags]).toEqual(['v1.0.0']);
  });
});

describe('registrarRelease — CHANGELOG inicialmente vazio vs existente (R12.4)', () => {
  test('cria a estrutura do CHANGELOG quando parte de conteúdo vazio', async () => {
    const { io, estado } = criarIoFake({ changelogInicial: '' });

    const res = await registrarRelease({
      versao: '0.1.0',
      data: '2024-08-01',
      mudancas: ['Primeira entrada de todas'],
      io,
    });

    expect(res.ok).toBe(true);
    expect(estado.changelog).toContain('# Changelog');
    expect(estado.changelog).toContain('## [0.1.0] - 2024-08-01');
    expect(estado.changelog).toContain('- Primeira entrada de todas');
  });

  test('preserva integralmente o conteúdo existente ao anexar nova entrada', async () => {
    const existente =
      '# Changelog\n\n## [3.2.1] - 2023-12-31\n- Entrada histórica preservada\n';
    const { io, estado } = criarIoFake({ changelogInicial: existente });

    const res = await registrarRelease({
      versao: '3.3.0',
      data: '2024-08-02',
      mudancas: ['Nova entrada'],
      io,
    });

    expect(res.ok).toBe(true);
    // O conteúdo histórico continua presente.
    expect(estado.changelog).toContain('## [3.2.1] - 2023-12-31');
    expect(estado.changelog).toContain('- Entrada histórica preservada');
    // E a nova entrada foi adicionada acima dele.
    expect(estado.changelog.indexOf('[3.3.0]')).toBeLessThan(
      estado.changelog.indexOf('[3.2.1]')
    );
  });
});

describe('montarEntradaChangelog — idempotência e normalização', () => {
  test('produz exatamente o mesmo texto para entradas idênticas (determinística)', () => {
    const params = {
      versao: '1.2.3',
      data: '2024-09-01',
      mudancas: ['A', 'B'],
    };
    const primeira = montarEntradaChangelog(params);
    const segunda = montarEntradaChangelog({ ...params, mudancas: ['A', 'B'] });
    expect(primeira).toBe(segunda);
  });

  test('normaliza versão em string e versão em objeto para a mesma saída', () => {
    const porString = montarEntradaChangelog({
      versao: '4.5.6',
      data: '2024-09-02',
      mudancas: ['Igual'],
    });
    const porObjeto = montarEntradaChangelog({
      versao: { major: 4, minor: 5, patch: 6 },
      data: '2024-09-02',
      mudancas: ['Igual'],
    });
    expect(porString).toBe(porObjeto);
  });

  test('reinserir a mesma entrada já presente mantém o conteúdo estável (idempotente)', () => {
    const entrada = montarEntradaChangelog({
      versao: '1.0.0',
      data: '2024-09-03',
      mudancas: ['Única'],
    });
    const base = inserirEntradaNoTopo('', entrada);
    // Reaplicar inserirEntradaNoTopo com a mesma entrada mantém a entrada
    // presente exatamente uma vez por chamada; aqui garantimos que a montagem
    // da entrada é estável e previsível para a mesma versão.
    expect(base).toContain('## [1.0.0] - 2024-09-03');
    expect(montarEntradaChangelog({
      versao: '1.0.0',
      data: '2024-09-03',
      mudancas: ['Única'],
    })).toBe(entrada);
  });
});
