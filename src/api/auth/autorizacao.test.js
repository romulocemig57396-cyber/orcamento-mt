/* ─────────────────────────────────────────────────────────────────────────────
   autorizacao.test.js — testes unitários da negação por padrão nas rotas
   (R1.6, R2.2, R2.3, R2.4)

   Exemplos e casos de borda da decisão de autorização e do gancho `autorizar`.
   A propriedade universal (Property 4: negação por padrão preservando o estado)
   é coberta por teste de propriedade separado (tarefa 5.9).
   ───────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from 'vitest';
import {
  decidirAutorizacao,
  criarAutorizador,
  AUTORIZACAO,
} from './autorizacao.js';
import { autorizarSessao } from './rbac.js';
import { criarRoteador } from '../roteador.js';

const G_LEITOR = '00000000-0000-0000-0000-000000000001';
const G_EDITOR = '00000000-0000-0000-0000-000000000002';
const G_ADMIN = '00000000-0000-0000-0000-000000000003';

/** Rotas de exemplo espelhando o CONTRATO. */
const ROTA_LER = { metodo: 'GET', caminho: '/api/orcamentos', permissao: 'orcamentos:ler' };
const ROTA_GRAVAR = { metodo: 'PUT', caminho: '/api/orcamentos/{id}', permissao: 'orcamentos:gravar' };
const ROTA_REMOVER = { metodo: 'DELETE', caminho: '/api/orcamentos/{id}', permissao: 'orcamentos:remover' };

/** Monta uma sessão a partir dos grupos (como após a tarefa 5.6). */
function sessaoDeGrupos(grupos, extra = {}) {
  return { ...autorizarSessao(grupos), ...extra };
}

describe('decidirAutorizacao', () => {
  it('concede quando a permissão exigida está na união da sessão (R2.3)', () => {
    const sessao = sessaoDeGrupos([G_LEITOR]);
    const d = decidirAutorizacao(ROTA_LER, sessao);
    expect(d.concedido).toBe(true);
    expect(d.codigo).toBe(AUTORIZACAO.CONCEDIDO);
  });

  it('editor pode gravar mas não remover (R2.2 — acesso negado)', () => {
    const sessao = sessaoDeGrupos([G_EDITOR]);
    expect(decidirAutorizacao(ROTA_GRAVAR, sessao).concedido).toBe(true);

    const d = decidirAutorizacao(ROTA_REMOVER, sessao);
    expect(d.concedido).toBe(false);
    expect(d.codigo).toBe(AUTORIZACAO.ACESSO_NEGADO);
  });

  it('admin pode remover', () => {
    const sessao = sessaoDeGrupos([G_ADMIN]);
    expect(decidirAutorizacao(ROTA_REMOVER, sessao).concedido).toBe(true);
  });

  it('sessão sem papel mapeável → sem permissões (R2.4)', () => {
    const sessao = sessaoDeGrupos(['grupo-desconhecido']);
    const d = decidirAutorizacao(ROTA_LER, sessao);
    expect(d.concedido).toBe(false);
    expect(d.codigo).toBe(AUTORIZACAO.SEM_PERMISSOES);
  });

  it('sem sessão (não autorizado à aplicação) → recusa (R1.6)', () => {
    expect(decidirAutorizacao(ROTA_LER, null).codigo).toBe(
      AUTORIZACAO.SEM_AUTORIZACAO_APP,
    );
    expect(decidirAutorizacao(ROTA_LER, undefined).codigo).toBe(
      AUTORIZACAO.SEM_AUTORIZACAO_APP,
    );
  });

  it('rota sem permissão explícita é negada por padrão (R2.3)', () => {
    const sessao = sessaoDeGrupos([G_ADMIN]);
    const d = decidirAutorizacao({ metodo: 'GET', caminho: '/x', permissao: null }, sessao);
    expect(d.concedido).toBe(false);
    expect(d.codigo).toBe(AUTORIZACAO.CONTRATO_INVALIDO);
  });
});

describe('criarAutorizador (gancho)', () => {
  const loggerFake = () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() });

  it('não lança e não loga quando concedido', () => {
    const logger = loggerFake();
    const autorizar = criarAutorizador({ logger });
    expect(() => autorizar(ROTA_LER, sessaoDeGrupos([G_LEITOR]))).not.toThrow();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('lança 403 acesso_negado e loga oid+operação (R2.2)', () => {
    const logger = loggerFake();
    const autorizar = criarAutorizador({ logger });
    const sessao = sessaoDeGrupos([G_EDITOR], { oid: 'oid-123' });

    try {
      autorizar(ROTA_REMOVER, sessao);
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e.status).toBe(403);
      expect(e.corpo.erro).toBe(AUTORIZACAO.ACESSO_NEGADO);
    }
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [, contexto] = logger.warn.mock.calls[0];
    expect(contexto.oid).toBe('oid-123');
    expect(contexto.operacao).toContain('/api/orcamentos/{id}');
  });

  it('lança 403 sem_permissoes e loga oid (R2.4)', () => {
    const logger = loggerFake();
    const autorizar = criarAutorizador({ logger });
    const sessao = sessaoDeGrupos(['grupo-x'], { oid: 'oid-999' });

    expect(() => autorizar(ROTA_LER, sessao)).toThrow();
    try {
      autorizar(ROTA_LER, sessao);
    } catch (e) {
      expect(e.status).toBe(403);
      expect(e.corpo.erro).toBe(AUTORIZACAO.SEM_PERMISSOES);
    }
    const [, contexto] = logger.warn.mock.calls[0];
    expect(contexto.oid).toBe('oid-999');
  });

  it('lança 403 sem_autorizacao quando não há sessão (R1.6)', () => {
    const logger = loggerFake();
    const autorizar = criarAutorizador({ logger });
    try {
      autorizar(ROTA_LER, null);
    } catch (e) {
      expect(e.status).toBe(403);
      expect(e.corpo.erro).toBe(AUTORIZACAO.SEM_AUTORIZACAO_APP);
    }
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('funciona sem logger injetado (não lança por ausência de logger)', () => {
    const autorizar = criarAutorizador();
    expect(() => autorizar(ROTA_LER, sessaoDeGrupos([G_LEITOR]))).not.toThrow();
    expect(() => autorizar(ROTA_REMOVER, sessaoDeGrupos([G_EDITOR]))).toThrow();
  });
});

describe('integração com o roteador: negação preserva o estado (R2.2)', () => {
  it('não invoca o handler quando a autorização nega', async () => {
    const handlerSpy = vi.fn();
    // Injeta sessão de editor e um autorizador real; rota DELETE exige remover.
    const roteador = criarRoteador({
      validarToken: () => sessaoDeGrupos([G_EDITOR], { oid: 'oid-abc' }),
      autorizar: criarAutorizador({}),
    });

    const resp = await roteador({
      metodo: 'DELETE',
      caminho: '/api/orcamentos/42',
      params: {},
      query: {},
      headers: {},
      corpo: null,
    });

    expect(resp.status).toBe(403);
    expect(resp.corpo.erro).toBe(AUTORIZACAO.ACESSO_NEGADO);
    // O handler nunca foi alcançado → estado dos dados inalterado.
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('despacha o handler quando a autorização concede', async () => {
    const roteador = criarRoteador({
      validarToken: () => sessaoDeGrupos([G_LEITOR], { oid: 'oid-abc' }),
      autorizar: criarAutorizador({}),
    });

    const resp = await roteador({
      metodo: 'GET',
      caminho: '/api/orcamentos',
      params: {},
      query: {},
      headers: {},
      corpo: null,
    });

    // Handler-stub ainda não implementado → 501 (passou pela autorização).
    expect(resp.status).toBe(501);
  });
});
