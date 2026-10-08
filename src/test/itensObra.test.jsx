import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ItensObra from '../components/ItensObra';

describe('A5 — item manual: valor em reais', () => {
  test('rótulo é "Valor (R$)", não "R$ mil"', () => {
    render(<ItensObra itens={[]} setOrcamento={() => {}} />);
    expect(screen.getByText('Valor (R$)')).toBeInTheDocument();
    expect(screen.queryByText('Valor (R$ mil)')).not.toBeInTheDocument();
  });

  test('valor digitado é gravado sem conversão', () => {
    let estado = { itensObra: [] };
    const setOrcamento = vi.fn(fn => { estado = fn(estado); });
    render(<ItensObra itens={[]} setOrcamento={setOrcamento} />);
    fireEvent.change(screen.getByPlaceholderText('Descrição do item'), { target: { value: 'Serviço avulso' } });
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '1500.50' } });
    fireEvent.click(screen.getByText('+ Adicionar'));
    expect(estado.itensObra[0].valor).toBe(1500.5);
  });
});
