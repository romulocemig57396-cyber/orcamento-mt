import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ItensObra from '../components/ItensObra';

afterEach(() => vi.restoreAllMocks());

const estadoCom = (inicial) => {
  const ref = { estado: inicial };
  ref.setOrcamento = (fn) => { ref.estado = fn(ref.estado); };
  return ref;
};

describe('B3 — confirmação ao remover item de obra', () => {
  const itemComDif = {
    id: 1, descricao: 'Tri CAA 336,4', categoria: 'pp', valor: 100000, percentualCemig: 30,
    quantidade: 1, unidade: 'km', itemOrigem: 'ext_rural_tri_caa336', diferencaCabo: 20000,
    caboNecessarioTipo: 'Tri CAA 1/0',
  };
  const itemSemDif = { id: 2, descricao: 'Abert/Fecha. De Chave', categoria: 'ctc', valor: 5000, quantidade: 1, unidade: 'ponto' };

  test('pede confirmação com a frase da diferença de cabo; cancelar mantém o item', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const ref = estadoCom({ itensObra: [itemComDif] });
    render(<ItensObra itens={ref.estado.itensObra} setOrcamento={ref.setOrcamento} />);
    fireEvent.click(screen.getByText('Remover'));
    expect(confirm).toHaveBeenCalledWith("Remover o item 'Tri CAA 336,4'? A diferença de cabo calculada também será removida.");
    expect(ref.estado.itensObra).toHaveLength(1);
  });

  test('confirmar remove o item', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const ref = estadoCom({ itensObra: [itemComDif] });
    render(<ItensObra itens={ref.estado.itensObra} setOrcamento={ref.setOrcamento} />);
    fireEvent.click(screen.getByText('Remover'));
    expect(ref.estado.itensObra).toHaveLength(0);
  });

  test('item sem diferença de cabo: só a pergunta', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const ref = estadoCom({ itensObra: [itemSemDif] });
    render(<ItensObra itens={ref.estado.itensObra} setOrcamento={ref.setOrcamento} />);
    fireEvent.click(screen.getByText('Remover'));
    expect(confirm).toHaveBeenCalledWith("Remover o item 'Abert/Fecha. De Chave'?");
  });
});
