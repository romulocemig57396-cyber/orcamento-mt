import { describe, test, expect } from 'vitest';
import {
  LIMIAR_INATIVIDADE_MS,
  SESSAO,
  avaliarSessao,
  sessaoValida,
  resolverSessao,
} from '../api/auth/sessao.js';

const MIN = 60 * 1000;
const BASE = Date.parse('2024-01-01T12:00:00Z');

describe('LIMIAR_INATIVIDADE_MS', () => {
  test('é exatamente 30 minutos (R1.4)', () => {
    expect(LIMIAR_INATIVIDADE_MS).toBe(30 * 60 * 1000);
  });
});

describe('avaliarSessao — fronteira dos 30 min (Property 2 / R1.4)', () => {
  test('inatividade < 30 min mantém a sessão válida', () => {
    const r = avaliarSessao(
      { ultimaAtividade: BASE },
      { agora: BASE + 29 * MIN }
    );
    expect(r.valida).toBe(true);
    expect(r.estado).toBe(SESSAO.VALIDA);
    expect(r.requerNovaAutenticacao).toBe(false);
    expect(r.inatividadeMs).toBe(29 * MIN);
  });

  test('inatividade imediatamente abaixo do limiar ainda é válida', () => {
    const r = avaliarSessao(
      { ultimaAtividade: BASE },
      { agora: BASE + LIMIAR_INATIVIDADE_MS - 1 }
    );
    expect(r.valida).toBe(true);
  });

  test('inatividade exatamente 30 min encerra a sessão (limiar fechado em ≥)', () => {
    const r = avaliarSessao(
      { ultimaAtividade: BASE },
      { agora: BASE + 30 * MIN }
    );
    expect(r.valida).toBe(false);
    expect(r.estado).toBe(SESSAO.EXPIRADA_INATIVIDADE);
    expect(r.requerNovaAutenticacao).toBe(true);
    expect(r.inatividadeMs).toBe(30 * MIN);
  });

  test('inatividade > 30 min encerra a sessão', () => {
    const r = avaliarSessao(
      { ultimaAtividade: BASE },
      { agora: BASE + 45 * MIN }
    );
    expect(r.valida).toBe(false);
    expect(r.estado).toBe(SESSAO.EXPIRADA_INATIVIDADE);
  });

  test('aceita ultimaAtividade como Date e como string ISO', () => {
    const agora = BASE + 10 * MIN;
    const comDate = avaliarSessao(
      { ultimaAtividade: new Date(BASE) },
      { agora }
    );
    const comIso = avaliarSessao(
      { ultimaAtividade: '2024-01-01T12:00:00Z' },
      { agora }
    );
    expect(comDate.valida).toBe(true);
    expect(comIso.valida).toBe(true);
    expect(comDate.inatividadeMs).toBe(10 * MIN);
  });

  test('relógio injetável como função é respeitado', () => {
    const relogio = () => BASE + 31 * MIN;
    const r = avaliarSessao({ ultimaAtividade: BASE }, { agora: relogio });
    expect(r.valida).toBe(false);
  });

  test('atividade "no futuro" conta como zero de inatividade (nunca negativa)', () => {
    const r = avaliarSessao(
      { ultimaAtividade: BASE + 5 * MIN },
      { agora: BASE }
    );
    expect(r.inatividadeMs).toBe(0);
    expect(r.valida).toBe(true);
  });

  test('limiar customizado é respeitado', () => {
    const r = avaliarSessao(
      { ultimaAtividade: BASE },
      { agora: BASE + 6 * MIN, limiarMs: 5 * MIN }
    );
    expect(r.valida).toBe(false);
  });

  test('rejeita sessão sem ultimaAtividade', () => {
    expect(() => avaliarSessao({}, { agora: BASE })).toThrow();
    expect(() => avaliarSessao(null, { agora: BASE })).toThrow();
  });
});

describe('sessaoValida — conveniência booleana', () => {
  test('true abaixo do limiar, false no limiar', () => {
    expect(sessaoValida({ ultimaAtividade: BASE }, { agora: BASE + 29 * MIN })).toBe(true);
    expect(sessaoValida({ ultimaAtividade: BASE }, { agora: BASE + 30 * MIN })).toBe(false);
  });
});

describe('resolverSessao — gancho do roteador (R1.4)', () => {
  const req = { metodo: 'GET', caminho: '/api/orcamentos' };

  test('sessão válida: renova a janela de inatividade para o instante atual', () => {
    const agora = BASE + 20 * MIN;
    const sessao = resolverSessao(req, { oid: 'u1', ultimaAtividade: BASE }, { agora });
    expect(sessao.oid).toBe('u1');
    expect(sessao.ultimaAtividade).toBe(agora);
    // Após a renovação, a mesma sessão continua válida a partir de "agora".
    expect(sessaoValida(sessao, { agora: agora + 29 * MIN })).toBe(true);
  });

  test('sessão recém-estabelecida (sem ultimaAtividade) começa agora e é válida', () => {
    const agora = BASE + 100 * MIN;
    const sessao = resolverSessao(req, { oid: 'u2' }, { agora });
    expect(sessao.ultimaAtividade).toBe(agora);
    expect(sessaoValida(sessao, { agora })).toBe(true);
  });

  test('sessão inativa ≥ 30 min lança falha 401 exigindo nova autenticação', () => {
    const agora = BASE + 30 * MIN;
    let capturado;
    try {
      resolverSessao(req, { oid: 'u3', ultimaAtividade: BASE }, { agora });
    } catch (e) {
      capturado = e;
    }
    expect(capturado).toBeDefined();
    expect(capturado.status).toBe(401);
    expect(capturado.corpo.erro).toBe('sessao_expirada');
    expect(capturado).toHaveProperty('corpo');
  });

  test('a janela deslizante impede expiração enquanto houver atividade < 30 min', () => {
    // Atividade a cada 29 min mantém a sessão viva indefinidamente.
    let sessao = { oid: 'u4', ultimaAtividade: BASE };
    let t = BASE;
    for (let i = 0; i < 5; i++) {
      t += 29 * MIN;
      sessao = resolverSessao(req, sessao, { agora: t });
      expect(sessao.ultimaAtividade).toBe(t);
    }
    // Mas uma lacuna de 30 min encerra.
    expect(() => resolverSessao(req, sessao, { agora: t + 30 * MIN })).toThrow();
  });

  test('rejeita sessão parcial inválida', () => {
    expect(() => resolverSessao(req, null, { agora: BASE })).toThrow();
  });
});
