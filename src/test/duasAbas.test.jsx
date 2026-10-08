import { describe, test, expect, beforeEach } from 'vitest';
import { renderHook, act, render, screen, fireEvent } from '@testing-library/react';
import { useOrcamento } from '../hooks/useOrcamento';
import App from '../App';

const KEY = 'orcamento_mt_app';

// Simula outra aba gravando no localStorage (o navegador só avisa as OUTRAS abas)
const outraAbaGrava = (dados) => {
  const valor = JSON.stringify(dados);
  localStorage.setItem(KEY, valor);
  window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: valor }));
};

const salvo = () => JSON.parse(localStorage.getItem(KEY));

describe('B2 — duas abas abertas', () => {
  beforeEach(() => localStorage.clear());

  test('alteração em outra aba suspende o salvamento automático desta aba', () => {
    const { result } = renderHook(() => useOrcamento());
    expect(result.current.salvamentoSuspenso).toBe(false);

    act(() => outraAbaGrava({ ...result.current.orcamento, cliente: 'DA OUTRA ABA' }));
    expect(result.current.salvamentoSuspenso).toBe(true);

    act(() => result.current.updateField('cliente', 'DESTA ABA'));
    expect(salvo().cliente).toBe('DA OUTRA ABA');
  });

  test('evento de outra chave é ignorado', () => {
    const { result } = renderHook(() => useOrcamento());
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'outra_chave', newValue: '{}' })));
    expect(result.current.salvamentoSuspenso).toBe(false);
  });

  test('"Carregar versão da outra aba" traz os dados e retoma o salvamento', () => {
    const { result } = renderHook(() => useOrcamento());
    act(() => result.current.updateField('cliente', 'DESTA ABA'));
    act(() => outraAbaGrava({ ...result.current.orcamento, cliente: 'DA OUTRA ABA', tipoAtendimento: 'Ligação Nova' }));

    act(() => result.current.carregarVersaoOutraAba());
    expect(result.current.salvamentoSuspenso).toBe(false);
    expect(result.current.orcamento.cliente).toBe('DA OUTRA ABA');
    expect(result.current.orcamento.tipoAtendimento).toBe('LN'); // passa pela migração

    act(() => result.current.updateField('ns', '123'));
    expect(salvo().ns).toBe('123');
  });

  test('"Manter esta versão" retoma o salvamento e sobrescreve', () => {
    const { result } = renderHook(() => useOrcamento());
    act(() => result.current.updateField('cliente', 'DESTA ABA'));
    act(() => outraAbaGrava({ ...result.current.orcamento, cliente: 'DA OUTRA ABA' }));

    act(() => result.current.manterEstaVersao());
    expect(result.current.salvamentoSuspenso).toBe(false);
    expect(salvo().cliente).toBe('DESTA ABA');
  });

  test('tela: faixa de aviso, botões e indicador do cabeçalho', () => {
    render(<App />);
    expect(screen.getByText('Salvo automaticamente')).toBeInTheDocument();

    act(() => outraAbaGrava({ ...salvo(), cliente: 'DA OUTRA ABA' }));
    expect(screen.getByText('Este orçamento foi alterado em outra aba')).toBeInTheDocument();
    expect(screen.getByText('Salvamento suspenso')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Manter esta versão'));
    expect(screen.queryByText('Este orçamento foi alterado em outra aba')).not.toBeInTheDocument();
    expect(screen.getByText('Salvo automaticamente')).toBeInTheDocument();
  });
});
