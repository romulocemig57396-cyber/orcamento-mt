import { describe, test, expect } from 'vitest';
import {
  AMBIENTES,
  CLASSIFICACOES,
  criarDocumentoOrcamento,
  normalizarDocumentoOrcamento,
  extrairDados,
} from '../persistencia/modelo';
import { VERSAO_SCHEMA } from '../utils/migracao';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const orcamentoExemplo = {
  cliente: 'EMPRESA TESTE',
  ns: '12345',
  tipoAtendimento: 'LN',
  itensObra: [{ categoria: 'ctc', valor: 100, percentualCemig: 0 }],
  erd: 0,
  musd: 0,
  totalObra: 100,
  pfcCliente: 100,
  valorTotal: 100,
  dataBase: '2025-01-01',
  dataValidade: '2025-05-01',
};

describe('modelo.js — documento de orçamento persistido', () => {
  test('criarDocumentoOrcamento envelopa os dados e preenche os metadados', () => {
    const doc = criarDocumentoOrcamento(orcamentoExemplo, {
      ambiente: 'prd',
      proprietarioOid: 'oid-123',
      classificacao: 'interno',
    });

    expect(typeof doc.id).toBe('string');
    expect(doc.id.length).toBeGreaterThan(0);
    expect(doc.ambiente).toBe('prd');
    expect(doc.versaoSchema).toBe(VERSAO_SCHEMA);
    expect(doc.proprietarioOid).toBe('oid-123');
    expect(doc.classificacao).toBe('interno');
    expect(doc.criadoEm).toMatch(ISO_UTC);
    expect(doc.atualizadoEm).toMatch(ISO_UTC);
    expect(doc.dados).toEqual(orcamentoExemplo);
  });

  test('dados é uma cópia independente do estado de orçamento original', () => {
    const doc = criarDocumentoOrcamento(orcamentoExemplo);
    doc.dados.cliente = 'ALTERADO';
    expect(orcamentoExemplo.cliente).toBe('EMPRESA TESTE');
  });

  test('aplica padrões quando ambiente/classificação são inválidos ou ausentes', () => {
    const doc = criarDocumentoOrcamento(orcamentoExemplo, {
      ambiente: 'xpto',
      classificacao: 'secreto',
    });
    expect(AMBIENTES).toContain(doc.ambiente);
    expect(CLASSIFICACOES).toContain(doc.classificacao);
    expect(doc.ambiente).toBe('dev');
    expect(doc.classificacao).toBe('interno');
    expect(doc.proprietarioOid).toBeNull();
  });

  test('normaliza timestamps para instante ISO 8601 em UTC', () => {
    const doc = criarDocumentoOrcamento(orcamentoExemplo, {
      criadoEm: new Date('2025-01-01T12:00:00Z'),
      atualizadoEm: '2025-02-01T08:30:00Z',
    });
    expect(doc.criadoEm).toBe('2025-01-01T12:00:00.000Z');
    expect(doc.atualizadoEm).toBe('2025-02-01T08:30:00.000Z');
  });

  test('normalizarDocumentoOrcamento aceita documento já envelopado e preserva metadados', () => {
    const original = criarDocumentoOrcamento(orcamentoExemplo, {
      id: 'orc-fixo',
      ambiente: 'hml',
      proprietarioOid: 'oid-9',
      classificacao: 'confidencial',
      criadoEm: '2024-12-31T00:00:00Z',
    });

    const normalizado = normalizarDocumentoOrcamento(original);
    expect(normalizado.id).toBe('orc-fixo');
    expect(normalizado.ambiente).toBe('hml');
    expect(normalizado.proprietarioOid).toBe('oid-9');
    expect(normalizado.classificacao).toBe('confidencial');
    expect(normalizado.criadoEm).toBe('2024-12-31T00:00:00.000Z');
    expect(normalizado.versaoSchema).toBe(VERSAO_SCHEMA);
  });

  test('normalizarDocumentoOrcamento trata orçamento cru como dados e migra', () => {
    // Formato antigo: tipo de atendimento por extenso e data ISO completa.
    const cru = {
      cliente: 'EMPRESA',
      tipoAtendimento: 'Ligação Nova',
      itensObra: [],
      dataBase: '2025-01-01T00:00:00.000Z',
    };
    const doc = normalizarDocumentoOrcamento(cru);
    expect(doc).toHaveProperty('dados');
    // A migração converte o tipo por extenso em código e a data em AAAA-MM-DD.
    expect(doc.dados.tipoAtendimento).toBe('LN');
    expect(doc.dados.dataBase).toBe('2025-01-01');
    expect(doc.versaoSchema).toBe(VERSAO_SCHEMA);
  });

  test('extrairDados devolve o estado de orçamento migrado a partir do envelope', () => {
    const doc = criarDocumentoOrcamento({
      ...orcamentoExemplo,
      tipoAtendimento: 'Ligação Nova',
    });
    const dados = extrairDados(doc);
    expect(dados.tipoAtendimento).toBe('LN');
    expect(dados.cliente).toBe('EMPRESA TESTE');
  });
});
