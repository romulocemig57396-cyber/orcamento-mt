import { describe, test, expect } from 'vitest';
import {
  REFERENCIAS, ANOS_DISPONIVEIS, chaveReferenciaAtual, getReferencia,
  normalizarChaveReferencia, custosDaReferencia, getValorPorAno, getItemById,
  getPrecosUS, getComposicao, getCatalogoMateriais,
} from '../data/biblioteca';

describe('Etapa 1 — chave de referência em texto', () => {
  test('as três referências, com a atual marcada', () => {
    expect(REFERENCIAS.map(r => r.chave)).toEqual(['2024', '2022', '2021']);
    expect(chaveReferenciaAtual()).toBe('2024');
    expect(getReferencia('2024').rotulo).toBe('2024 (Atual)');
    expect(getReferencia('2024').fonte).toMatch(/Custos 2025/);
  });

  test('aceita a chave como número, que é o formato dos orçamentos antigos', () => {
    expect(normalizarChaveReferencia(2024)).toBe('2024');
    expect(normalizarChaveReferencia('2024')).toBe('2024');
    expect(normalizarChaveReferencia(2021)).toBe('2021');
    expect(normalizarChaveReferencia(' 2022 ')).toBe('2022');
  });

  test('chave desconhecida cai na referência atual, não em 2021', () => {
    expect(normalizarChaveReferencia('2026-10')).toBe('2024');
    expect(normalizarChaveReferencia(1999)).toBe('2024');
    expect(normalizarChaveReferencia(undefined)).toBe('2024');
    expect(normalizarChaveReferencia('')).toBe('2024');
  });

  test('getValorPorAno e custosDaReferencia concordam, com número ou texto', () => {
    const item = getItemById('ext_rural_tri_caa336');
    expect(getValorPorAno(item, 2024)).toBe(148.42361);
    expect(getValorPorAno(item, '2024')).toBe(148.42361);
    expect(custosDaReferencia(item, 2021).unitario).toBe(115.63557);
    expect(getValorPorAno(item, 2021, 'unitario')).toBe(115.63557);
  });

  test('getValorPorAno não quebra com item inexistente', () => {
    expect(getValorPorAno(undefined, 2024)).toBeUndefined();
    expect(custosDaReferencia(undefined, 2024)).toEqual({});
  });

  test('ANOS_DISPONIVEIS mantém `ano` numérico e ganha `chave`', () => {
    expect(ANOS_DISPONIVEIS.map(a => a.ano)).toEqual([2024, 2022, 2021]);
    expect(ANOS_DISPONIVEIS.map(a => a.chave)).toEqual(['2024', '2022', '2021']);
    expect(ANOS_DISPONIVEIS[0].label).toBe('2024 (Atual)');
    expect(ANOS_DISPONIVEIS[0].atual).toBe(true);
    expect(ANOS_DISPONIVEIS[1].atual).toBe(false);
  });
});

describe('Etapa 1 — preços da US, composições e catálogo', () => {
  test('preço da US de 2024 em branco; chave desconhecida cai na atual', () => {
    expect(getPrecosUS('2024')).toEqual({ construcao: null, projeto: null });
    expect(getPrecosUS('2026-10')).toEqual({ construcao: null, projeto: null });
  });

  test('nenhum item tem composição nas referências antigas', () => {
    expect(getComposicao(getItemById('ext_urbano_rdp150_dupla'), '2024')).toBeNull();
    expect(getComposicao(undefined, '2024')).toBeNull();
  });

  test('o catálogo de materiais começa vazio', () => {
    expect(getCatalogoMateriais('2024')).toEqual({});
  });
});
