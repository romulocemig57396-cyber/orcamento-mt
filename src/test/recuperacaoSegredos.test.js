/* ─────────────────────────────────────────────────────────────────────────────
   recuperacaoSegredos.test.js — Tarefa 9.3

   Testes unitários da recuperação de segredos do Cofre_Segredos, AMPLIANDO a
   cobertura já existente (keyvault.test.js — 9.1; tratarFalhaSegredo.test.js — 9.2).

   O caminho feliz (R9.2), a falha de indisponibilidade e a ausência de vazamento
   no log de FALHA já são cobertos pelas suítes citadas. Aqui focamos em casos de
   borda NÃO cobertos:

     - Múltiplos segredos recuperados de forma independente (sucesso/falha/cache),
       incluindo falha de um não afetar o sucesso dos demais.
     - Segredo recuperado USADO por uma operação dependente SEM que o valor
       apareça em NENHUM log emitido durante toda a operação (caminho de sucesso).
     - Interação com o cache em TTL: HIT de cache não loga o valor; expiração e
       invalidação por rotação não logam o valor; valor do cache nunca aparece
       em log de falha de OUTRO segredo.

   _Requirements: 9.2, 9.3_
   ───────────────────────────────────────────────────────────────────────────── */

import { describe, test, expect, vi } from 'vitest';
import { criarRecuperadorSegredos } from '../api/segredos/keyvault';
import {
  criarRecuperadorSegredosComLog,
  comSegredo,
  COMPONENTE,
} from '../api/segredos/tratarFalhaSegredo';
import { criarLogger } from '../observabilidade/logger';
import { mascarar } from '../observabilidade/mascarar';

/**
 * Cliente fake que satisfaz SecretClientLike. Conta idas ao cofre por nome e
 * permite controlar valores e falhas por segredo (para cenários multi-segredo).
 */
function criarClienteFake({ valores = {}, falhas = {} } = {}) {
  const chamadasPorNome = {};
  return {
    chamadasPorNome,
    getSecret: vi.fn(async (nome) => {
      chamadasPorNome[nome] = (chamadasPorNome[nome] ?? 0) + 1;
      if (falhas[nome]) throw falhas[nome];
      if (!(nome in valores)) return { name: nome };
      return { name: nome, value: valores[nome] };
    }),
  };
}

/**
 * Logger de teste que captura TODAS as entradas emitidas (qualquer nível),
 * aplicando o mesmo mascaramento usado em produção. Diferente das suítes
 * existentes, aqui também queremos observar que caminhos de SUCESSO/CACHE não
 * emitem o valor em log algum.
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

/** Serializa todas as entradas capturadas num único texto para asserção. */
const todosOsLogs = (entradas) => entradas.map((e) => JSON.stringify(e)).join('\n');

describe('recuperação de segredos — múltiplos segredos (R9.2)', () => {
  test('recupera vários segredos distintos de forma independente', async () => {
    const cliente = criarClienteFake({
      valores: {
        'cosmos-conn': 'AccountEndpoint=https://db;AccountKey=aaa==;',
        'api-key': 'chave-api-xyz',
        'jwt-secret': 'assinatura-jwt-123',
      },
    });
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente });

    const [a, b, c] = await Promise.all([
      recuperador.obterSegredo('cosmos-conn'),
      recuperador.obterSegredo('api-key'),
      recuperador.obterSegredo('jwt-secret'),
    ]);

    expect(a.ok).toBe(true);
    expect(a.valor).toBe('AccountEndpoint=https://db;AccountKey=aaa==;');
    expect(b.ok).toBe(true);
    expect(b.valor).toBe('chave-api-xyz');
    expect(c.ok).toBe(true);
    expect(c.valor).toBe('assinatura-jwt-123');
    // Cada segredo foi buscado exatamente uma vez no cofre.
    expect(cliente.chamadasPorNome).toEqual({
      'cosmos-conn': 1,
      'api-key': 1,
      'jwt-secret': 1,
    });
  });

  test('falha de um segredo não impede o sucesso dos demais', async () => {
    const cliente = criarClienteFake({
      valores: { bom1: 'v1', bom2: 'v2' },
      falhas: { ruim: new Error('managed identity sem acesso ao segredo ruim') },
    });
    const recuperador = criarRecuperadorSegredos({ secretClient: cliente });

    const bom1 = await recuperador.obterSegredo('bom1');
    const ruim = await recuperador.obterSegredo('ruim');
    const bom2 = await recuperador.obterSegredo('bom2');

    expect(bom1).toMatchObject({ ok: true, valor: 'v1' });
    expect(bom2).toMatchObject({ ok: true, valor: 'v2' });
    expect(ruim).toMatchObject({ ok: false, codigo: 'indisponivel' });
  });

  test('log de falha de um segredo não vaza o valor de outro recuperado com sucesso', async () => {
    const valorSensivel = 'AccountKey=NAO-PODE-VAZAR-999==;';
    const { logger, entradas } = criarLoggerCaptura();
    const cliente = criarClienteFake({
      valores: { bom: valorSensivel },
      falhas: { ruim: new Error('indisponível') },
    });
    const recuperador = criarRecuperadorSegredosComLog({ secretClient: cliente, logger });

    const bom = await recuperador.obterSegredo('bom'); // sucesso
    await recuperador.obterSegredo('ruim'); // falha -> gera log

    expect(bom.ok).toBe(true);
    expect(bom.valor).toBe(valorSensivel);
    // Houve exatamente um log (o da falha); e ele não contém o valor do segredo bom.
    expect(entradas).toHaveLength(1);
    expect(todosOsLogs(entradas)).not.toContain('NAO-PODE-VAZAR-999');
  });
});

describe('recuperação de segredos — operação dependente sem logar o valor (R9.2, R9.3)', () => {
  test('o valor é entregue à operação, mas não aparece em NENHUM log de sucesso', async () => {
    const valorSensivel = 'AccountKey=USO-INTERNO-SECRETO==;';
    const { logger, entradas } = criarLoggerCaptura();
    const cliente = criarClienteFake({ valores: { conn: valorSensivel } });
    const recuperador = criarRecuperadorSegredosComLog({ secretClient: cliente, logger });

    // A operação dependente usa o valor em memória (ex.: abrir conexão) e devolve
    // apenas um dado derivado NÃO sensível (o comprimento).
    const operacao = vi.fn((valor) => ({ conectado: true, tamanho: valor.length }));
    const r = await comSegredo({ recuperador, nome: 'conn', operacao });

    expect(r.ok).toBe(true);
    expect(operacao).toHaveBeenCalledWith(valorSensivel);
    expect(r.resultado).toEqual({ conectado: true, tamanho: valorSensivel.length });
    // Caminho de sucesso: nenhum log emitido e, por garantia, nada contém o valor.
    expect(entradas).toHaveLength(0);
    expect(todosOsLogs(entradas)).not.toContain('USO-INTERNO-SECRETO');
  });

  test('o resultado da operação dependente nunca carrega o valor do segredo de volta', async () => {
    const valorSensivel = 'senha-super-secreta-abc';
    const { logger } = criarLoggerCaptura();
    const cliente = criarClienteFake({ valores: { s: valorSensivel } });
    const recuperador = criarRecuperadorSegredosComLog({ secretClient: cliente, logger });

    // Operação bem comportada: devolve um token derivado, não o segredo.
    const r = await comSegredo({
      recuperador,
      nome: 's',
      operacao: (v) => `derivado:${v.length}`,
    });

    expect(r.ok).toBe(true);
    expect(JSON.stringify(r)).not.toContain(valorSensivel);
  });

  test('operação dependente assíncrona recebe o valor e não há log do segredo', async () => {
    const valorSensivel = 'token-async-xyz-123';
    const { logger, entradas } = criarLoggerCaptura();
    const cliente = criarClienteFake({ valores: { tok: valorSensivel } });
    const recuperador = criarRecuperadorSegredosComLog({ secretClient: cliente, logger });

    const r = await comSegredo({
      recuperador,
      nome: 'tok',
      operacao: async (v) => {
        await Promise.resolve();
        return v.startsWith('token-');
      },
    });

    expect(r).toEqual({ ok: true, resultado: true });
    expect(todosOsLogs(entradas)).not.toContain('token-async-xyz-123');
  });
});

describe('recuperação de segredos — interação com cache em TTL sem logar valor (R9.2, R9.3)', () => {
  test('HIT de cache não emite log e não vaza o valor', async () => {
    const valorSensivel = 'AccountKey=CACHE-NAO-LOGA==;';
    const { logger, entradas } = criarLoggerCaptura();
    const cliente = criarClienteFake({ valores: { conn: valorSensivel } });
    let t = 1000;
    const recuperador = criarRecuperadorSegredosComLog({
      secretClient: cliente,
      logger,
      ttlMs: 5000,
      monotonico: () => t,
    });

    const r1 = await recuperador.obterSegredo('conn'); // MISS -> cofre
    const r2 = await recuperador.obterSegredo('conn'); // HIT -> cache

    expect(r1.doCache).toBe(false);
    expect(r2.doCache).toBe(true);
    expect(r2.valor).toBe(valorSensivel);
    // Uma única ida ao cofre; nenhum log emitido no sucesso/HIT.
    expect(cliente.getSecret).toHaveBeenCalledTimes(1);
    expect(entradas).toHaveLength(0);
    expect(todosOsLogs(entradas)).not.toContain('CACHE-NAO-LOGA');
  });

  test('expiração do TTL rebusca no cofre sem logar o valor', async () => {
    const valorSensivel = 'segredo-ttl-expira-777';
    const { logger, entradas } = criarLoggerCaptura();
    const cliente = criarClienteFake({ valores: { s: valorSensivel } });
    let t = 0;
    const recuperador = criarRecuperadorSegredosComLog({
      secretClient: cliente,
      logger,
      ttlMs: 1000,
      monotonico: () => t,
    });

    await recuperador.obterSegredo('s'); // MISS
    t = 1500; // além do TTL
    const r = await recuperador.obterSegredo('s'); // expirou -> MISS novamente

    expect(r.doCache).toBe(false);
    expect(cliente.getSecret).toHaveBeenCalledTimes(2);
    expect(todosOsLogs(entradas)).not.toContain('segredo-ttl-expira-777');
  });

  test('invalidar o cache após rotação não loga o valor (nem antigo nem novo)', async () => {
    const valorAntigo = 'segredo-antigo-AAA';
    const valorNovo = 'segredo-rotacionado-BBB';
    const { logger, entradas } = criarLoggerCaptura();
    const cliente = criarClienteFake({ valores: { s: valorAntigo } });
    let t = 0;
    const recuperador = criarRecuperadorSegredosComLog({
      secretClient: cliente,
      logger,
      ttlMs: 10000,
      monotonico: () => t,
    });

    const r1 = await recuperador.obterSegredo('s');
    expect(r1.valor).toBe(valorAntigo);
    expect(recuperador.tamanhoCache()).toBe(1);

    // Rotação: o cofre passa a devolver o novo valor; invalidamos o cache.
    cliente.getSecret.mockImplementation(async (nome) => ({ name: nome, value: valorNovo }));
    recuperador.invalidar('s');
    expect(recuperador.tamanhoCache()).toBe(0);

    const r2 = await recuperador.obterSegredo('s');
    expect(r2.valor).toBe(valorNovo);
    expect(r2.doCache).toBe(false);

    const logs = todosOsLogs(entradas);
    expect(logs).not.toContain('segredo-antigo-AAA');
    expect(logs).not.toContain('segredo-rotacionado-BBB');
  });

  test('falha após HIT de cache de outro segredo: log de falha não contém valor cacheado', async () => {
    const valorCacheado = 'AccountKey=EM-CACHE-NAO-VAZA==;';
    const { logger, entradas } = criarLoggerCaptura();
    const cliente = criarClienteFake({
      valores: { bom: valorCacheado },
      falhas: { ruim: new Error(`erro contendo ${valorCacheado}`) },
    });
    let t = 0;
    const recuperador = criarRecuperadorSegredosComLog({
      secretClient: cliente,
      logger,
      ttlMs: 10000,
      monotonico: () => t,
    });

    await recuperador.obterSegredo('bom'); // popula cache (sem log)
    const hit = await recuperador.obterSegredo('bom'); // HIT (sem log)
    expect(hit.doCache).toBe(true);

    await recuperador.obterSegredo('ruim'); // falha -> log mascarado

    // Apenas o log da falha foi emitido; o valor cacheado não aparece em nenhum log.
    expect(entradas).toHaveLength(1);
    expect(entradas[0].nivel).toBe('ERROR');
    expect(todosOsLogs(entradas)).not.toContain('EM-CACHE-NAO-VAZA');
  });
});
