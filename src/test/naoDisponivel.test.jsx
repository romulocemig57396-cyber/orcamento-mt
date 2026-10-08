import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

/* Biblioteca com um item extra que só existe na referência 2024 — como um item
   criado a partir de um projeto do PROORC numa referência nova (R9).        */
vi.mock('../data/biblioteca.json', async (original) => {
  const real = (await original()).default;
  const novo = {
    id: 'equip_item_so_2024', categoria: 'Equipamentos', subcategoria: 'Instalação', tipo: 'Item só em 2024',
    unidade: 'ponto', status: 'oficial',
    formacao: { origem: 'proorc', projeto: '9999999999', unidadesPorProjeto: 1 },
    custos: { 2024: { material: 10, maoObra: 2, usConstr: 0, unitario: 12 } },
    composicoes: {},
  };
  return { default: { ...real, itens: [...real.itens, novo] } };
});

import { TEXTO_NAO_DISPONIVEL, TEXTO_PENDENTE, itensPendentes } from '../data/biblioteca';
import BibliotecaCustos from '../components/BibliotecaCustos';
import Importacao from '../components/Importacao';

beforeEach(() => localStorage.clear());

const biblioteca = (ref) => render(<BibliotecaCustos setOrcamento={() => {}} anoReferencia={ref} setAnoReferencia={() => {}} />);

describe('R9 — item não disponível numa referência', () => {
  test('na referência em que existe, o item aparece normal', () => {
    biblioteca('2024');
    const linha = screen.getByText('Item só em 2024').closest('tr');
    expect(within(linha).queryByText(TEXTO_NAO_DISPONIVEL)).not.toBeInTheDocument();
    expect(within(linha).getByText('12,00')).toBeInTheDocument();
    expect(within(linha).getByText('+ Adicionar')).not.toBeDisabled();
  });

  test('numa referência antiga: selo, valores "—", sem adicionar e sem contar como pendente', () => {
    biblioteca('2022');
    const linha = screen.getByText('Item só em 2024').closest('tr');
    expect(within(linha).getByText(TEXTO_NAO_DISPONIVEL)).toBeInTheDocument();
    expect(within(linha).queryByText(TEXTO_PENDENTE)).not.toBeInTheDocument();
    expect(within(linha).getAllByText('—')).toHaveLength(4);
    expect(within(linha).getByText('+ Adicionar')).toBeDisabled();
    expect(linha).toHaveStyle({ background: '#F2F2F2' });
    // 2022: os 5 de 2024 + recon_urb_rdp150_dupla e sub_13_8kv; o item novo não conta
    expect(itensPendentes('2022').map(i => i.id)).not.toContain('equip_item_so_2024');
    expect(itensPendentes('2022')).toHaveLength(7);
    expect(screen.getByText('7 pendentes')).toBeInTheDocument();
  });

  test('importação: item não disponível na referência avisa e não pode ser adicionado', () => {
    const importacao = {
      textoOriginal: 'x', cabecalhoDetectado: null, textosAltaTensao: [], textoAltaTensao: '', analisado: true,
      itensDetectados: [
        { textoOriginal: 'Item novo', tipoSelecionado: 'equip_item_so_2024', descricaoManual: '', quantidade: 1, unidade: 'ponto', categoria: 'ctc', percentualCemig: 0 },
      ],
    };
    const { unmount } = render(<Importacao setOrcamento={() => {}} importacao={importacao} updateImportacao={() => {}} anoReferencia="2021" />);
    const linha = screen.getByText('Item novo').closest('tr');
    expect(within(linha).getByText(new RegExp(TEXTO_NAO_DISPONIVEL))).toBeInTheDocument();
    expect(within(linha).getByText('Adicionar')).toBeDisabled();
    unmount();

    render(<Importacao setOrcamento={() => {}} importacao={importacao} updateImportacao={() => {}} anoReferencia="2024" />);
    expect(within(screen.getByText('Item novo').closest('tr')).getByText('Adicionar')).not.toBeDisabled();
  });
});
