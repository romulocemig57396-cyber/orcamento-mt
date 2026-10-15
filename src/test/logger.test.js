import { describe, test, expect, vi } from 'vitest';
import {
  NIVEIS,
  nivelValido,
  montarEntrada,
  serializar,
  criarLogger,
} from '../observabilidade/logger';

describe('observabilidade/logger — estrutura obrigatória do log (R10.1)', () => {
  test('montarEntrada inclui os campos obrigatórios', () => {
    const entrada = montarEntrada({
      nivel: 'INFO',
      mensagem: 'operação concluída',
      correlacaoId: 'req-123',
      componente: 'api/orcamentos',
      timestamp: '2025-01-01T12:00:00.000Z',
    });
    expect(entrada).toMatchObject({
      timestamp: '2025-01-01T12:00:00.000Z',
      nivel: 'INFO',
      mensagem: 'operação concluída',
      correlacaoId: 'req-123',
      componente: 'api/orcamentos',
    });
  });

  test('timestamp padrão é UTC em ISO 8601 (sufixo Z)', () => {
    const entrada = montarEntrada({
      nivel: 'INFO',
      mensagem: 'm',
      correlacaoId: 'c',
      componente: 'comp',
    });
    expect(entrada.timestamp).toMatch(/Z$/);
    // Reparseável e estável no mesmo instante.
    expect(new Date(entrada.timestamp).toISOString()).toBe(entrada.timestamp);
  });

  test('nível inválido é normalizado para INFO, mantendo um nível válido', () => {
    const entrada = montarEntrada({
      nivel: 'TRACE',
      mensagem: 'm',
      correlacaoId: 'c',
      componente: 'comp',
    });
    expect(nivelValido(entrada.nivel)).toBe(true);
    expect(entrada.nivel).toBe('INFO');
  });

  test('nivelValido reconhece apenas DEBUG/INFO/WARN/ERROR', () => {
    expect(NIVEIS).toEqual(['DEBUG', 'INFO', 'WARN', 'ERROR']);
    for (const n of NIVEIS) expect(nivelValido(n)).toBe(true);
    expect(nivelValido('FATAL')).toBe(false);
    expect(nivelValido(undefined)).toBe(false);
  });
});

describe('observabilidade/logger — emissão pelo sink', () => {
  test('cada método de nível emite uma entrada bem formada ao sink', () => {
    const emitidas = [];
    const log = criarLogger({
      componente: 'api',
      correlacaoId: 'req-1',
      sink: (e) => emitidas.push(e),
      relogio: () => '2025-01-01T00:00:00.000Z',
    });

    log.debug('d');
    log.info('i', { chave: 'v' });
    log.warn('w');
    log.error('e');

    expect(emitidas.map((e) => e.nivel)).toEqual(['DEBUG', 'INFO', 'WARN', 'ERROR']);
    expect(emitidas.every((e) => e.correlacaoId === 'req-1')).toBe(true);
    expect(emitidas.every((e) => e.componente === 'api')).toBe(true);
    expect(emitidas[1].contexto).toEqual({ chave: 'v' });
    // Saída serializável como JSON (uma linha por evento).
    expect(() => serializar(emitidas[0])).not.toThrow();
  });

  test('comCorrelacao deriva logger com correlacaoId fixo', () => {
    const emitidas = [];
    const base = criarLogger({ componente: 'api', sink: (e) => emitidas.push(e) });
    base.comCorrelacao('req-xyz').info('oi');
    expect(emitidas[0].correlacaoId).toBe('req-xyz');
    expect(emitidas[0].componente).toBe('api');
  });
});

describe('observabilidade/logger — degradação graciosa (R10.5)', () => {
  test('falha do sink não interrompe a operação e é registrada localmente', () => {
    const spyErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = criarLogger({
      componente: 'api',
      sink: () => {
        throw new Error('observabilidade indisponível');
      },
    });

    let entrada;
    expect(() => {
      entrada = log.info('tentativa de emissão');
    }).not.toThrow();

    // A operação segue e devolve a entrada estruturada.
    expect(entrada.nivel).toBe('INFO');
    // A falha de emissão foi registrada localmente.
    expect(spyErr).toHaveBeenCalled();
    spyErr.mockRestore();
  });
});

describe('observabilidade/logger — ponto de integração do mascaramento (tarefa 4.2)', () => {
  test('mascarar injetável transforma a entrada antes da emissão', () => {
    const emitidas = [];
    const mascarar = (e) => ({ ...e, contexto: { ...(e.contexto ?? {}), cpf: '***' } });
    const log = criarLogger({
      componente: 'api',
      sink: (e) => emitidas.push(e),
      mascarar,
    });

    log.info('com dado pessoal', { cpf: '111.222.333-44' });
    expect(emitidas[0].contexto.cpf).toBe('***');
  });

  test('mascaramento padrão é identidade (nenhuma transformação aqui)', () => {
    const emitidas = [];
    const log = criarLogger({ componente: 'api', sink: (e) => emitidas.push(e) });
    log.info('sem mascaramento', { valor: 42 });
    expect(emitidas[0].contexto).toEqual({ valor: 42 });
  });

  test('falha no mascarar não interrompe e emite a entrada original', () => {
    const spyErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const emitidas = [];
    const log = criarLogger({
      componente: 'api',
      sink: (e) => emitidas.push(e),
      mascarar: () => {
        throw new Error('falha de mascaramento');
      },
    });

    expect(() => log.info('x', { a: 1 })).not.toThrow();
    expect(emitidas).toHaveLength(1);
    expect(emitidas[0].contexto).toEqual({ a: 1 });
    expect(spyErr).toHaveBeenCalled();
    spyErr.mockRestore();
  });
});
