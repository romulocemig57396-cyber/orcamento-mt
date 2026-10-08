import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { referenciasUsadas, rotuloReferenciasUsadas, chaveReferenciaAtual } from '../data/biblioteca';
import { referenciaPadrao } from '../utils/diferencaCabo';
import { criarItemObraImportado } from '../components/Importacao';
import { migrarOrcamento } from '../utils/migracao';
import BibliotecaCustos from '../components/BibliotecaCustos';

describe('Etapa 4 — referência em uso', () => {
  test('a referência padrão vem da biblioteca, não de 2024 fixo', () => {
    expect(referenciaPadrao()).toBe(chaveReferenciaAtual());
    expect(referenciaPadrao()).toBe('2024');
  });

  test('o item importado grava a referência recebida', () => {
    const detectado = { tipoSelecionado: 'equip_brt_76', quantidade: 1, categoria: 'ctc', unidade: 'ponto', textoOriginal: 'BRT' };
    expect(criarItemObraImportado(detectado, 1, '2021').anoReferencia).toBe('2021');
    // BRT 76 kVA: 215 em 2021 contra 186,97615 em 2024
    expect(criarItemObraImportado(detectado, 1, '2021').valor).toBeCloseTo(215 * 1000, 2);
  });

  test('sem referência informada, o item importado usa a atual', () => {
    const detectado = { tipoSelecionado: 'equip_brt_76', quantidade: 1, categoria: 'ctc', unidade: 'ponto', textoOriginal: 'BRT' };
    const item = criarItemObraImportado(detectado, 1);
    expect(item.anoReferencia).toBe('2024');
    expect(item.valor).toBeCloseTo(186.97615 * 1000, 2);
  });

  test('item manual não ganha referência', () => {
    const detectado = { tipoSelecionado: '', descricaoManual: 'Serviço avulso', quantidade: 1, categoria: 'cti', unidade: '', textoOriginal: 'x' };
    expect(criarItemObraImportado(detectado, 1, '2024').anoReferencia).toBeUndefined();
  });
});

describe('Etapa 4 — referências usadas pelo orçamento', () => {
  test('lista as referências dos itens, sem repetir', () => {
    const itens = [
      { anoReferencia: '2024' }, { anoReferencia: '2024' }, { anoReferencia: '2021' }, { descricao: 'manual' },
    ];
    expect(referenciasUsadas(itens).map(r => r.chave)).toEqual(['2024', '2021']);
    expect(rotuloReferenciasUsadas(itens)).toBe('2024 (Atual) e 2021');
  });

  test('orçamento só com itens manuais não informa referência', () => {
    expect(rotuloReferenciasUsadas([{ descricao: 'manual' }])).toBeNull();
    expect(rotuloReferenciasUsadas([])).toBeNull();
  });

  test('aceita a referência gravada como número, dos orçamentos antigos', () => {
    expect(rotuloReferenciasUsadas([{ anoReferencia: 2021 }])).toBe('2021');
  });
});

describe('Etapa 4 — migração da referência dos itens', () => {
  test('número vira texto', () => {
    const o = migrarOrcamento({ itensObra: [{ id: 1, anoReferencia: 2024 }, { id: 2, anoReferencia: 2021 }] });
    expect(o.itensObra.map(i => i.anoReferencia)).toEqual(['2024', '2021']);
  });

  test('item sem referência continua sem', () => {
    const o = migrarOrcamento({ itensObra: [{ id: 1, descricao: 'manual' }] });
    expect(o.itensObra[0].anoReferencia).toBeUndefined();
  });

  test('referência que não existe mais cai na atual', () => {
    const o = migrarOrcamento({ itensObra: [{ id: 1, anoReferencia: '2019' }] });
    expect(o.itensObra[0].anoReferencia).toBe('2024');
  });
});

describe('Etapa 4 — seletor na Biblioteca', () => {
  const abrir = (chave = '2024') => {
    const setAnoReferencia = vi.fn();
    render(<BibliotecaCustos setOrcamento={() => {}} anoReferencia={chave} setAnoReferencia={setAnoReferencia} />);
    return setAnoReferencia;
  };

  test('lista as referências pelo rótulo e mostra a fonte', () => {
    abrir();
    expect(screen.getByText('Referência de Custos')).toBeInTheDocument();
    expect(screen.getByText('2024 (Atual)')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
    expect(screen.getByText('2021')).toBeInTheDocument();
    expect(screen.getByText(/Fonte: Planilha ORÇAMENTO ESTIMADO MT/)).toBeInTheDocument();
  });

  test('escolher uma referência devolve a chave como texto', () => {
    const setAnoReferencia = abrir();
    fireEvent.click(screen.getByText('2021'));
    expect(setAnoReferencia).toHaveBeenCalledWith('2021');
  });

  test('os valores mostrados seguem a referência escolhida', () => {
    abrir('2021');
    // Religador trifásico 24KV Urbano: 100,00 em 2021 e 63,83 em 2024
    expect(screen.getAllByText('100,00').length).toBeGreaterThan(0);
    expect(screen.queryByText('63,83')).not.toBeInTheDocument();
  });
});
