import { describe, test, expect } from 'vitest';
import {
  gravarOrcamento,
  obterOrcamento,
  removerOrcamento,
  criarClientePersistencia,
  ERRO,
} from '../api/persistencia/cosmos.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Testes unitários do cliente de persistência Cosmos (R5.2–R5.4).

   Usamos um container Cosmos FAKE em memória, injetado por DI, que replica o
   subconjunto do contrato do SDK que o cliente usa:
     container.item(id, partitionKey).read()/replace()/delete()
     container.items.upsert(documento)
   O fake permite:
     - particionar por `ambiente` (chave composta id+partição) → valida R5.3;
     - injetar falha no upsert/read/delete → valida preservação em falha (R5.4).
   ───────────────────────────────────────────────────────────────────────────── */

/** Erro que imita o 404 do SDK Cosmos (item inexistente). */
const erroNaoEncontrado = () => Object.assign(new Error('not found'), { code: 404 });

/**
 * Cria um container fake em memória.
 * @param {Object} [cfg]
 * @param {boolean} [cfg.falharUpsert]  upsert sempre lança.
 * @param {boolean} [cfg.falharRead]    read lança (erro real, não 404).
 * @param {boolean} [cfg.falharDelete]  delete lança (erro real, não 404).
 */
const criarContainerFake = ({ falharUpsert = false, falharRead = false, falharDelete = false } = {}) => {
  // chave de armazenamento: `${ambiente}::${id}` para enxergar a partição.
  const store = new Map();
  const chave = (id, pk) => `${pk}::${id}`;

  const container = {
    item(id, partitionKey) {
      return {
        async read() {
          if (falharRead) throw new Error('falha simulada de leitura');
          const doc = store.get(chave(id, partitionKey));
          if (!doc) throw erroNaoEncontrado();
          return { resource: doc };
        },
        async delete() {
          if (falharDelete) throw new Error('falha simulada de remoção');
          const k = chave(id, partitionKey);
          if (!store.has(k)) throw erroNaoEncontrado();
          store.delete(k);
          return { resource: undefined };
        },
      };
    },
    items: {
      async upsert(documento) {
        if (falharUpsert) throw new Error('falha simulada de gravação');
        store.set(chave(documento.id, documento.ambiente), documento);
        return { resource: documento };
      },
    },
  };
  return { container, store, chave };
};

const orcamentoExemplo = () => ({
  cliente: 'ACME',
  ns: '123',
  itensObra: [{ categoria: 'ctc', valor: 10, percentualCemig: 50 }],
  totalObra: 10,
});

describe('gravarOrcamento — caminho feliz (R5.3, R5.4)', () => {
  test('cria documento particionado por ambiente e retorna ok', async () => {
    const { container, store, chave } = criarContainerFake();
    const res = await gravarOrcamento({
      container,
      ambiente: 'prd',
      orcamento: orcamentoExemplo(),
      meta: { proprietarioOid: 'oid-1', classificacao: 'interno' },
    });

    expect(res.ok).toBe(true);
    expect(res.valor.criado).toBe(true);
    expect(res.valor.documento.ambiente).toBe('prd');
    expect(res.valor.documento.dados.cliente).toBe('ACME');
    // Armazenado sob a partição do ambiente informado.
    expect(store.has(chave(res.valor.documento.id, 'prd'))).toBe(true);
  });

  test('atualiza preservando id e criadoEm do estado anterior', async () => {
    const { container } = criarContainerFake();
    const criacao = await gravarOrcamento({
      container,
      ambiente: 'dev',
      orcamento: orcamentoExemplo(),
    });
    const { id, criadoEm } = criacao.valor.documento;

    const atualizacao = await gravarOrcamento({
      container,
      ambiente: 'dev',
      orcamento: { ...orcamentoExemplo(), cliente: 'ACME 2' },
      meta: { id },
    });

    expect(atualizacao.ok).toBe(true);
    expect(atualizacao.valor.criado).toBe(false);
    expect(atualizacao.valor.documento.id).toBe(id);
    expect(atualizacao.valor.documento.criadoEm).toBe(criadoEm);
    expect(atualizacao.valor.documento.dados.cliente).toBe('ACME 2');
  });
});

describe('gravarOrcamento — particionamento por ambiente (R5.3)', () => {
  test('dado gravado em um ambiente não é visível a partir de outro', async () => {
    const { container } = criarContainerFake();
    const criacao = await gravarOrcamento({
      container,
      ambiente: 'prd',
      orcamento: orcamentoExemplo(),
    });
    const id = criacao.valor.documento.id;

    const emPrd = await obterOrcamento({ container, ambiente: 'prd', id });
    const emHml = await obterOrcamento({ container, ambiente: 'hml', id });

    expect(emPrd.ok).toBe(true);
    expect(emHml.ok).toBe(false);
    expect(emHml.codigo).toBe(ERRO.NAO_ENCONTRADO);
  });
});

describe('gravarOrcamento — falha de gravação preserva estado anterior (R5.4)', () => {
  test('criação com upsert falho não grava nada e retorna erro estruturado', async () => {
    const { container, store } = criarContainerFake({ falharUpsert: true });
    const res = await gravarOrcamento({
      container,
      ambiente: 'prd',
      orcamento: orcamentoExemplo(),
    });

    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.FALHA_GRAVACAO);
    // Nenhuma gravação parcial.
    expect(store.size).toBe(0);
  });

  test('atualização com upsert falho preserva o documento anterior intacto', async () => {
    // Primeiro grava com um container que funciona.
    const bom = criarContainerFake();
    const criacao = await gravarOrcamento({
      container: bom.container,
      ambiente: 'prd',
      orcamento: orcamentoExemplo(),
    });
    const id = criacao.valor.documento.id;
    const docAnterior = bom.store.get(bom.chave(id, 'prd'));

    // Agora injetamos falha de upsert no MESMO store (reusa a referência).
    const containerFalho = {
      ...bom.container,
      items: {
        async upsert() {
          throw new Error('falha simulada de gravação');
        },
      },
    };

    const atualizacao = await gravarOrcamento({
      container: containerFalho,
      ambiente: 'prd',
      orcamento: { ...orcamentoExemplo(), cliente: 'NAO DEVE PERSISTIR' },
      meta: { id },
    });

    expect(atualizacao.ok).toBe(false);
    expect(atualizacao.codigo).toBe(ERRO.FALHA_GRAVACAO);
    // Estado anterior preservado byte-a-byte no store.
    expect(bom.store.get(bom.chave(id, 'prd'))).toBe(docAnterior);
    expect(bom.store.get(bom.chave(id, 'prd')).dados.cliente).toBe('ACME');
    // O erro traz o estado anterior para o chamador reter/reexibir.
    expect(atualizacao.detalhes.estadoAnterior.dados.cliente).toBe('ACME');
  });

  test('falha de leitura do estado anterior aborta sem gravar', async () => {
    const { container, store } = criarContainerFake({ falharRead: true });
    const res = await gravarOrcamento({
      container,
      ambiente: 'prd',
      orcamento: orcamentoExemplo(),
      meta: { id: 'orc-existente' },
    });

    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.FALHA_LEITURA);
    expect(store.size).toBe(0);
  });
});

describe('gravarOrcamento — validações', () => {
  test('rejeita container inválido', async () => {
    const res = await gravarOrcamento({ container: {}, ambiente: 'prd', orcamento: {} });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.CONTAINER_INVALIDO);
  });

  test('rejeita ambiente inválido', async () => {
    const { container } = criarContainerFake();
    const res = await gravarOrcamento({ container, ambiente: 'qa', orcamento: {} });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.AMBIENTE_INVALIDO);
  });

  test('rejeita orçamento ausente', async () => {
    const { container } = criarContainerFake();
    const res = await gravarOrcamento({ container, ambiente: 'prd', orcamento: null });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.ID_INVALIDO);
  });
});

describe('obterOrcamento', () => {
  test('retorna NAO_ENCONTRADO quando ausente', async () => {
    const { container } = criarContainerFake();
    const res = await obterOrcamento({ container, ambiente: 'prd', id: 'inexistente' });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.NAO_ENCONTRADO);
  });

  test('propaga erro de leitura real como FALHA_LEITURA', async () => {
    const { container } = criarContainerFake({ falharRead: true });
    const res = await obterOrcamento({ container, ambiente: 'prd', id: 'x' });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.FALHA_LEITURA);
  });
});

describe('removerOrcamento — remoção atômica, estado preservado em falha (R5.4)', () => {
  test('remove existente e retorna ok', async () => {
    const { container, store } = criarContainerFake();
    const criacao = await gravarOrcamento({ container, ambiente: 'prd', orcamento: orcamentoExemplo() });
    const id = criacao.valor.documento.id;

    const res = await removerOrcamento({ container, ambiente: 'prd', id });
    expect(res.ok).toBe(true);
    expect(res.valor.removido).toBe(true);
    expect(store.size).toBe(0);
  });

  test('remoção de item ausente retorna NAO_ENCONTRADO', async () => {
    const { container } = criarContainerFake();
    const res = await removerOrcamento({ container, ambiente: 'prd', id: 'inexistente' });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.NAO_ENCONTRADO);
  });

  test('falha de remoção preserva o item e retorna erro', async () => {
    const bom = criarContainerFake();
    const criacao = await gravarOrcamento({ container: bom.container, ambiente: 'prd', orcamento: orcamentoExemplo() });
    const id = criacao.valor.documento.id;

    const containerFalho = {
      item() {
        return {
          async read() {
            return { resource: bom.store.get(bom.chave(id, 'prd')) };
          },
          async delete() {
            throw new Error('falha simulada de remoção');
          },
        };
      },
      items: bom.container.items,
    };

    const res = await removerOrcamento({ container: containerFalho, ambiente: 'prd', id });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.FALHA_REMOCAO);
    // Item preservado no store.
    expect(bom.store.has(bom.chave(id, 'prd'))).toBe(true);
  });
});

describe('criarClientePersistencia — conveniência com ambiente/container fixados', () => {
  test('encapsula gravar/obter/remover para um ambiente', async () => {
    const { container } = criarContainerFake();
    const cliente = criarClientePersistencia({ container, ambiente: 'hml' });

    const grav = await cliente.gravar(orcamentoExemplo());
    expect(grav.ok).toBe(true);
    const id = grav.valor.documento.id;

    const obt = await cliente.obter(id);
    expect(obt.ok).toBe(true);
    expect(obt.valor.ambiente).toBe('hml');

    const rem = await cliente.remover(id);
    expect(rem.ok).toBe(true);
  });
});
