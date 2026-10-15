import { describe, test, expect, vi } from 'vitest';
import {
  criarRecuperadorSegredos,
  criarSecretClientManagedIdentity,
} from '../api/segredos/keyvault';

/**
 * Cliente fake que satisfaz SecretClientLike. Permite controlar valor retornado,
 * falhas injetadas e contar quantas idas ao cofre ocorreram (para validar cache).
 */
function criarClienteFake({ valores = {}, falhas = {} } = {}) {
  const chamadas = [];
  return {
    chamadas,
    getSecret: vi.fn(async (nome) => {
      chamadas.push(nome);
      if (falhas[nome]) {
        throw falhas[nome];
      }
      if (!(nome in valores)) {
        // Simula o SDK devolvendo um objeto sem value utilizável.
        return { name: nome };
      }
      return { name: nome, value: valores[nome] };
    }),
  };
}

describe('keyvault — construção e contrato', () => {
  test('exige um secretClient com getSecret', () => {
    expect(() => criarRecuperadorSegredos({})).toThrow(TypeError);
    expect(() => criarRecuperadorSegredos({ secretClient: {} })).toThrow(TypeError);
  });

  test('a fábrica do SDK real falha explicitamente até ser ligada em produção', () => {
    expect(() => criarSecretClientManagedIdentity({ vaultUrl: 'https://x' })).toThrow();
  });
});

describe('keyvault — recuperação em tempo de execução (R9.2)', () => {
  test('recupera o segredo do cofre e devolve resultado estruturado', async () => {
    const cliente = criarClienteFake({
      valores: { 'cosmos-conn': 'AccountEndpoint=https://db;AccountKey=xyz==;' },
    });
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente });

    const r = await recuperador.obterSegredo('cosmos-conn');

    expect(r.ok).toBe(true);
    expect(r.nome).toBe('cosmos-conn');
    expect(r.valor).toBe('AccountEndpoint=https://db;AccountKey=xyz==;');
    expect(r.doCache).toBe(false);
    expect(typeof r.recuperadoEm).toBe('string');
    expect(cliente.getSecret).toHaveBeenCalledWith('cosmos-conn');
  });

  test('normaliza o nome do segredo (trim)', async () => {
    const cliente = criarClienteFake({ valores: { 'api-key': 'segredo' } });
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente });

    const r = await recuperador.obterSegredo('  api-key  ');

    expect(r.ok).toBe(true);
    expect(cliente.getSecret).toHaveBeenCalledWith('api-key');
  });

  test('nome ausente/inválido retorna configuracao_invalida sem chamar o cofre', async () => {
    const cliente = criarClienteFake();
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente });

    const r = await recuperador.obterSegredo('   ');

    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('configuracao_invalida');
    expect(cliente.getSecret).not.toHaveBeenCalled();
  });

  test('segredo sem valor utilizável retorna nao_encontrado', async () => {
    const cliente = criarClienteFake({ valores: {} });
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente });

    const r = await recuperador.obterSegredo('inexistente');

    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('nao_encontrado');
  });
});

describe('keyvault — tratamento de falha e ausência de vazamento (R9.1, R9.3)', () => {
  test('falha de recuperação retorna indisponivel sem lançar', async () => {
    const cliente = criarClienteFake({
      falhas: { 'cosmos-conn': new Error('managed identity sem acesso') },
    });
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente });

    const r = await recuperador.obterSegredo('cosmos-conn');

    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('indisponivel');
    expect(typeof r.ocorridoEm).toBe('string');
  });

  test('o resultado de erro NUNCA contém o valor do segredo', async () => {
    const valorSensivel = 'AccountKey=SUPER-SECRETO-123==;';
    // Erro cuja mensagem embute o valor — não deve vazar para o resultado.
    const cliente = criarClienteFake({
      falhas: { 'conn': new Error(`falhou ao usar ${valorSensivel}`) },
    });
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente });

    const r = await recuperador.obterSegredo('conn');
    const serializado = JSON.stringify(r);

    expect(serializado).not.toContain('SUPER-SECRETO-123');
    expect(serializado).not.toContain(valorSensivel);
    // Também não deve haver campo 'valor' no resultado de erro.
    expect(r).not.toHaveProperty('valor');
  });

  test('invoca o ponto de tratamento de falha (aoFalhar) sem o valor do segredo', async () => {
    const causa = new Error('timeout de rede');
    const cliente = criarClienteFake({ falhas: { 'conn': causa } });
    const aoFalhar = vi.fn();
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente, aoFalhar });

    await recuperador.obterSegredo('conn');

    expect(aoFalhar).toHaveBeenCalledTimes(1);
    const info = aoFalhar.mock.calls[0][0];
    expect(info.nome).toBe('conn');
    expect(info.codigo).toBe('indisponivel');
    expect(info).not.toHaveProperty('valor');
    // A causa é repassada só ao ponto de tratamento (tarefa 9.2), não ao resultado.
    expect(info.causa).toBe(causa);
  });

  test('exceção no callback aoFalhar não quebra o resultado estruturado', async () => {
    const cliente = criarClienteFake({ falhas: { 'conn': new Error('x') } });
    const aoFalhar = vi.fn(() => {
      throw new Error('callback com defeito');
    });
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente, aoFalhar });

    const r = await recuperador.obterSegredo('conn');

    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('indisponivel');
  });
});

describe('keyvault — cache em memória de curta duração (opcional)', () => {
  test('sem TTL (padrão), cada recuperação vai ao cofre', async () => {
    const cliente = criarClienteFake({ valores: { 's': 'v' } });
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente });

    await recuperador.obterSegredo('s');
    await recuperador.obterSegredo('s');

    expect(cliente.getSecret).toHaveBeenCalledTimes(2);
    expect(recuperador.tamanhoCache()).toBe(0);
  });

  test('com TTL, a segunda leitura vem do cache sem ir ao cofre', async () => {
    const cliente = criarClienteFake({ valores: { 's': 'v' } });
    let t = 1000;
    const recuperador = criarRecuperadorSegredos({
      secretClient: cliente,
      ttlMs: 5000,
      monotonico: () => t,
    });

    const r1 = await recuperador.obterSegredo('s');
    const r2 = await recuperador.obterSegredo('s');

    expect(r1.doCache).toBe(false);
    expect(r2.doCache).toBe(true);
    expect(r2.valor).toBe('v');
    expect(cliente.getSecret).toHaveBeenCalledTimes(1);
  });

  test('o cache expira após o TTL e vai ao cofre novamente', async () => {
    const cliente = criarClienteFake({ valores: { 's': 'v' } });
    let t = 0;
    const recuperador = criarRecuperadorSegredos({
      secretClient: cliente,
      ttlMs: 1000,
      monotonico: () => t,
    });

    await recuperador.obterSegredo('s');
    t = 1500; // além do TTL
    const r = await recuperador.obterSegredo('s');

    expect(r.doCache).toBe(false);
    expect(cliente.getSecret).toHaveBeenCalledTimes(2);
  });

  test('limparCache e invalidar removem entradas do cache em memória', async () => {
    const cliente = criarClienteFake({ valores: { 'a': '1', 'b': '2' } });
    let t = 0;
    const recuperador = criarRecuperadorSegredos({
      secretClient: cliente,
      ttlMs: 10000,
      monotonico: () => t,
    });

    await recuperador.obterSegredo('a');
    await recuperador.obterSegredo('b');
    expect(recuperador.tamanhoCache()).toBe(2);

    recuperador.invalidar('a');
    expect(recuperador.tamanhoCache()).toBe(1);

    recuperador.limparCache();
    expect(recuperador.tamanhoCache()).toBe(0);
  });

  test('falha não é cacheada', async () => {
    const cliente = criarClienteFake({ falhas: { 's': new Error('x') } });
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente, ttlMs: 5000 });

    await recuperador.obterSegredo('s');
    expect(recuperador.tamanhoCache()).toBe(0);
  });
});
