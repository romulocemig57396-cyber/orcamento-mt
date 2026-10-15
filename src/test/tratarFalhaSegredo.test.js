import { describe, test, expect, vi } from 'vitest';
import {
  criarRecuperadorSegredosComLog,
  criarAoFalhar,
  comSegredo,
  COMPONENTE,
} from '../api/segredos/tratarFalhaSegredo';
import { criarLogger } from '../observabilidade/logger';
import { mascarar } from '../observabilidade/mascarar';

/**
 * Cliente fake que satisfaz SecretClientLike (mesmo contrato de 9.1).
 */
function criarClienteFake({ valores = {}, falhas = {} } = {}) {
  return {
    getSecret: vi.fn(async (nome) => {
      if (falhas[nome]) throw falhas[nome];
      if (!(nome in valores)) return { name: nome };
      return { name: nome, value: valores[nome] };
    }),
  };
}

/**
 * Logger de teste que captura cada entrada estruturada emitida (pós-mascaramento),
 * aplicando o mesmo mascaramento usado em produção.
 */
function criarLoggerCaptura() {
  const entradas = [];
  const logger = criarLogger({
    componente: COMPONENTE,
    mascarar,
    sink: (entrada) => entradas.push(entrada),
  });
  return { logger, entradas };
}

describe('tratarFalhaSegredo — log mascarado em falha (R9.3, Property 7)', () => {
  test('registra a falha SEM expor o valor do segredo embutido na causa', async () => {
    const valorSensivel = 'AccountKey=SUPER-SECRETO-123==;';
    const { logger, entradas } = criarLoggerCaptura();
    const cliente = criarClienteFake({
      falhas: { conn: new Error(`falhou ao usar ${valorSensivel}`) },
    });
    const recuperador = criarRecuperadorSegredosComLog({ secretClient: cliente, logger });

    await recuperador.obterSegredo('conn');

    expect(entradas).toHaveLength(1);
    const serializado = JSON.stringify(entradas[0]);
    expect(serializado).not.toContain('SUPER-SECRETO-123');
    expect(serializado).not.toContain(valorSensivel);
    expect(serializado).not.toContain('AccountKey=');
    // O log é de erro, do componente correto, e marca o aborto da operação.
    expect(entradas[0].nivel).toBe('ERROR');
    expect(entradas[0].componente).toBe(COMPONENTE);
    expect(entradas[0].mensagem).toMatch(/abortada/i);
  });

  test('não vaza o valor do segredo mesmo quando a causa é uma string crua', async () => {
    const valorSensivel = 'minha-senha-123@acme.com';
    const { logger, entradas } = criarLoggerCaptura();
    // causa como string (não Error) contendo um e-mail sensível
    const cliente = {
      getSecret: vi.fn(async () => {
        // eslint-disable-next-line no-throw-literal
        throw `erro bruto com ${valorSensivel}`;
      }),
    };
    const recuperador = criarRecuperadorSegredosComLog({ secretClient: cliente, logger });

    await recuperador.obterSegredo('conn');

    const serializado = JSON.stringify(entradas[0]);
    expect(serializado).not.toContain(valorSensivel);
  });

  test('criarAoFalhar nunca lança, mesmo se o logger falhar ao emitir', () => {
    const loggerQuebrado = {
      error: () => {
        throw new Error('sink indisponível');
      },
    };
    const aoFalhar = criarAoFalhar(loggerQuebrado);
    expect(() =>
      aoFalhar({ nome: 'conn', codigo: 'indisponivel', mensagem: 'x', causa: new Error('y') }),
    ).not.toThrow();
  });
});

describe('tratarFalhaSegredo — comSegredo aborta e retorna indisponibilidade (R9.3)', () => {
  test('em falha, NÃO executa a operação dependente e retorna erro de indisponibilidade', async () => {
    const { logger } = criarLoggerCaptura();
    const cliente = criarClienteFake({ falhas: { conn: new Error('managed identity sem acesso') } });
    const recuperador = criarRecuperadorSegredosComLog({ secretClient: cliente, logger });

    const operacao = vi.fn(() => 'nunca deveria rodar');

    const r = await comSegredo({ recuperador, nome: 'conn', operacao });

    expect(r.ok).toBe(false);
    expect(r.indisponivel).toBe(true);
    expect(r.codigo).toBe('indisponivel');
    expect(r).not.toHaveProperty('valor');
    expect(operacao).not.toHaveBeenCalled();
  });

  test('não lança em falha de segredo', async () => {
    const { logger } = criarLoggerCaptura();
    const cliente = criarClienteFake({ falhas: { conn: new Error('x') } });
    const recuperador = criarRecuperadorSegredosComLog({ secretClient: cliente, logger });

    await expect(
      comSegredo({ recuperador, nome: 'conn', operacao: () => 1 }),
    ).resolves.toMatchObject({ ok: false, indisponivel: true });
  });

  test('o resultado de indisponibilidade não contém o valor do segredo', async () => {
    const valorSensivel = 'AccountKey=VAZOU-NAO==;';
    const { logger } = criarLoggerCaptura();
    const cliente = criarClienteFake({ falhas: { conn: new Error(`usou ${valorSensivel}`) } });
    const recuperador = criarRecuperadorSegredosComLog({ secretClient: cliente, logger });

    const r = await comSegredo({ recuperador, nome: 'conn', operacao: () => 1 });

    expect(JSON.stringify(r)).not.toContain('VAZOU-NAO');
  });

  test('em sucesso, executa a operação com o valor e retorna o resultado', async () => {
    const { logger, entradas } = criarLoggerCaptura();
    const cliente = criarClienteFake({ valores: { conn: 'segredo-vivo' } });
    const recuperador = criarRecuperadorSegredosComLog({ secretClient: cliente, logger });

    const operacao = vi.fn((valor) => `usou:${valor.length}`);
    const r = await comSegredo({ recuperador, nome: 'conn', operacao });

    expect(r.ok).toBe(true);
    expect(r.resultado).toBe('usou:12');
    expect(operacao).toHaveBeenCalledWith('segredo-vivo');
    // Em sucesso não há log de falha.
    expect(entradas).toHaveLength(0);
  });

  test('exige recuperador e operacao válidos', async () => {
    await expect(comSegredo({ recuperador: {}, nome: 'x', operacao: () => 1 })).rejects.toThrow(
      TypeError,
    );
    const cliente = criarClienteFake({ valores: { x: 'v' } });
    const recuperador = criarRecuperadorSegredosComLog({ secretClient: cliente });
    await expect(comSegredo({ recuperador, nome: 'x', operacao: null })).rejects.toThrow(TypeError);
  });
});
