import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  criarClientePersistenciaFront,
  resolverConflito,
  ESTRATEGIA_CONFLITO,
  CHAVE_CACHE,
} from '../persistencia/clienteFront';
import { criarDocumentoOrcamento } from '../persistencia/modelo';

/* ─────────────────────────────────────────────────────────────────────────────
   clienteFrontPersistencia.test.js — cliente de persistência do front (R5.1)

   Cobre: degradação graciosa (só localStorage), API como fonte da verdade,
   cache como offline, e resolução de conflito (último a vencer / preferir
   servidor / manter local). A migração de cálculo NÃO é exercitada aqui — só o
   caminho de persistência.
   ───────────────────────────────────────────────────────────────────────────── */

// Storage em memória compatível com a Storage API (independente do jsdom).
const criarStorageFake = () => {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, String(v)),
    removeItem: (k) => mapa.delete(k),
    clear: () => mapa.clear(),
    get size() { return mapa.size; },
  };
};

const orcamentoExemplo = (over = {}) => ({
  cliente: 'EMPRESA TESTE',
  ns: '12345',
  tipoAtendimento: 'LN',
  itensObra: [],
  totalObra: 100,
  pfcCliente: 100,
  valorTotal: 100,
  dataBase: '2025-01-01',
  dataValidade: '2025-05-01',
  ...over,
});

describe('clienteFront — degradação graciosa (API não configurada)', () => {
  test('sem baseUrl: salva e lê apenas do localStorage, sem tocar a rede', async () => {
    const armazenamento = criarStorageFake();
    const fetchFn = vi.fn();
    const cliente = criarClientePersistenciaFront({ armazenamento, fetchFn });

    expect(cliente.apiAtivaSync()).toBe(false);
    expect(await cliente.apiAtiva()).toBe(false);

    const r = await cliente.salvar(orcamentoExemplo({ cliente: 'LOCAL' }));
    expect(r.servidor).toBe('offline');
    expect(r.cache).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();

    // Cache escrito sob a chave histórica, no formato cru de orçamento (dados).
    const bruto = JSON.parse(armazenamento.getItem(CHAVE_CACHE));
    expect(bruto.cliente).toBe('LOCAL');

    const carregado = await cliente.carregar();
    expect(carregado.origem).toBe('local');
    expect(carregado.dados.cliente).toBe('LOCAL');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('carregarCacheSync devolve o estado cru migrado do cache', () => {
    const armazenamento = criarStorageFake();
    armazenamento.setItem(CHAVE_CACHE, JSON.stringify(orcamentoExemplo({ ns: '999' })));
    const cliente = criarClientePersistenciaFront({ armazenamento });
    expect(cliente.carregarCacheSync().ns).toBe('999');
  });

  test('remover limpa o cache local', async () => {
    const armazenamento = criarStorageFake();
    const cliente = criarClientePersistenciaFront({ armazenamento });
    await cliente.salvar(orcamentoExemplo());
    expect(armazenamento.getItem(CHAVE_CACHE)).not.toBeNull();
    cliente.remover();
    expect(armazenamento.getItem(CHAVE_CACHE)).toBeNull();
  });
});

describe('clienteFront — API como fonte da verdade', () => {
  const baseCfg = (fetchFn) => ({
    baseUrl: 'https://api.interno',
    ambiente: 'prd',
    obterToken: () => 'token-abc',
    fetchFn,
  });

  test('apiAtiva exige baseUrl, fetch e token', async () => {
    const semToken = criarClientePersistenciaFront({
      baseUrl: 'https://api.interno', fetchFn: vi.fn(), obterToken: () => null,
      armazenamento: criarStorageFake(),
    });
    expect(semToken.apiAtivaSync()).toBe(true);
    expect(await semToken.apiAtiva()).toBe(false);

    const comToken = criarClientePersistenciaFront({
      ...baseCfg(vi.fn()), armazenamento: criarStorageFake(),
    });
    expect(await comToken.apiAtiva()).toBe(true);
  });

  test('salvar faz PUT autenticado e reflete o documento do servidor no cache', async () => {
    const armazenamento = criarStorageFake();
    const servidorDoc = criarDocumentoOrcamento(orcamentoExemplo({ cliente: 'DO SERVIDOR' }), {
      id: 'orc-1', ambiente: 'prd', atualizadoEm: '2025-06-01T10:00:00Z',
    });
    const fetchFn = vi.fn(async (url, opcoes) => {
      expect(opcoes.method).toBe('PUT');
      expect(opcoes.headers.authorization).toBe('Bearer token-abc');
      expect(url).toContain('/api/orcamentos/');
      return { ok: true, status: 200, json: async () => servidorDoc };
    });
    const cliente = criarClientePersistenciaFront({ ...baseCfg(fetchFn), armazenamento });

    const r = await cliente.salvar(orcamentoExemplo({ cliente: 'LOCAL' }), { id: 'orc-1' });
    expect(r.servidor).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(armazenamento.getItem(CHAVE_CACHE)).cliente).toBe('DO SERVIDOR');
  });

  test('salvar com falha de rede preserva o cache local (offline/erro)', async () => {
    const armazenamento = criarStorageFake();
    const fetchFn = vi.fn(async () => { throw new Error('rede caiu'); });
    const cliente = criarClientePersistenciaFront({ ...baseCfg(fetchFn), armazenamento });

    const r = await cliente.salvar(orcamentoExemplo({ cliente: 'RASCUNHO' }), { id: 'orc-1' });
    expect(r.cache).toBe(true);
    expect(r.servidor).toBe('erro');
    // O rascunho local nunca se perde.
    expect(JSON.parse(armazenamento.getItem(CHAVE_CACHE)).cliente).toBe('RASCUNHO');
  });

  test('carregar busca no servidor e sincroniza o cache', async () => {
    const armazenamento = criarStorageFake();
    const servidorDoc = criarDocumentoOrcamento(orcamentoExemplo({ cliente: 'SERVIDOR' }), {
      id: 'orc-1', ambiente: 'prd', atualizadoEm: '2025-06-01T10:00:00Z',
    });
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => servidorDoc }));
    const cliente = criarClientePersistenciaFront({ ...baseCfg(fetchFn), armazenamento });

    const r = await cliente.carregar({ id: 'orc-1' });
    expect(r.origem).toBe('servidor');
    expect(r.dados.cliente).toBe('SERVIDOR');
    expect(JSON.parse(armazenamento.getItem(CHAVE_CACHE)).cliente).toBe('SERVIDOR');
  });

  test('servidor indisponível (404) faz carregar cair no cache local', async () => {
    const armazenamento = criarStorageFake();
    armazenamento.setItem(CHAVE_CACHE, JSON.stringify(orcamentoExemplo({ cliente: 'CACHE' })));
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const cliente = criarClientePersistenciaFront({ ...baseCfg(fetchFn), armazenamento });

    const r = await cliente.carregar({ id: 'orc-1' });
    expect(r.origem).toBe('local');
    expect(r.dados.cliente).toBe('CACHE');
  });
});

describe('resolverConflito — resolução de conflito', () => {
  const docCom = (carimbo, cliente) =>
    criarDocumentoOrcamento({ cliente }, { id: 'x', atualizadoEm: carimbo });

  test('último a vencer: carimbo mais recente prevalece', () => {
    const servidor = docCom('2025-01-01T00:00:00Z', 'S');
    const local = docCom('2025-02-01T00:00:00Z', 'L');
    const { origem } = resolverConflito(servidor, local, ESTRATEGIA_CONFLITO.ULTIMO_A_VENCER);
    expect(origem).toBe('local');
  });

  test('último a vencer: empate favorece o servidor (fonte da verdade)', () => {
    const servidor = docCom('2025-01-01T00:00:00Z', 'S');
    const local = docCom('2025-01-01T00:00:00Z', 'L');
    const { origem } = resolverConflito(servidor, local, ESTRATEGIA_CONFLITO.ULTIMO_A_VENCER);
    expect(origem).toBe('servidor');
  });

  test('preferir servidor ignora o carimbo', () => {
    const servidor = docCom('2025-01-01T00:00:00Z', 'S');
    const local = docCom('2025-12-01T00:00:00Z', 'L');
    const { origem } = resolverConflito(servidor, local, ESTRATEGIA_CONFLITO.PREFERIR_SERVIDOR);
    expect(origem).toBe('servidor');
  });

  test('manter local ignora o carimbo', () => {
    const servidor = docCom('2025-12-01T00:00:00Z', 'S');
    const local = docCom('2025-01-01T00:00:00Z', 'L');
    const { origem } = resolverConflito(servidor, local, ESTRATEGIA_CONFLITO.MANTER_LOCAL);
    expect(origem).toBe('local');
  });

  test('apenas um lado presente prevalece; nenhum ⇒ nulo', () => {
    expect(resolverConflito(docCom('2025-01-01T00:00:00Z', 'S'), null).origem).toBe('servidor');
    expect(resolverConflito(null, docCom('2025-01-01T00:00:00Z', 'L')).origem).toBe('local');
    expect(resolverConflito(null, null).documento).toBeNull();
  });
});
