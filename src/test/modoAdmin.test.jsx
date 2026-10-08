import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ehModoAdmin } from '../utils/modoAdmin';
import App from '../App';
import AtualizarProorc from '../components/AtualizarProorc';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('Etapa 3 — modo administrador', () => {
  test('ligado só por ?admin=1', () => {
    expect(ehModoAdmin('?admin=1')).toBe(true);
    expect(ehModoAdmin('?cliente=x&admin=1')).toBe(true);
    expect(ehModoAdmin('?admin=0')).toBe(false);
    expect(ehModoAdmin('?admin=sim')).toBe(false);
    expect(ehModoAdmin('')).toBe(false);
    expect(ehModoAdmin(undefined)).toBe(false);
  });

  test('sem o parâmetro, a aba de manutenção não aparece', () => {
    render(<App />);
    expect(screen.queryByText('Atualizar pelo PROORC')).not.toBeInTheDocument();
    expect(screen.queryByText('Modo administrador')).not.toBeInTheDocument();
  });

  test('com ?admin=1, aparecem a faixa e a aba', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, search: '?admin=1' });
    render(<App />);
    expect(screen.getByText('Modo administrador')).toBeInTheDocument();
    expect(screen.getByText('Atualizar pelo PROORC')).toBeInTheDocument();
  });

  test('a aba abre a tela de atualização', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, search: '?admin=1' });
    render(<App />);
    fireEvent.click(screen.getByText('Atualizar pelo PROORC'));
    expect(screen.getByText('Carregar os relatórios do PROORC')).toBeInTheDocument();
  });
});

describe('Etapa 3 — tela de atualização', () => {
  test('pede os três relatórios e começa com o botão desabilitado', () => {
    render(<AtualizarProorc />);
    expect(screen.getByText('rptOrcamentoGeralSinteticoPorProjetoCemig.xlsx')).toBeInTheDocument();
    expect(screen.getByText('rptOrcamentoGeralAnalitico.xlsx')).toBeInTheDocument();
    expect(screen.getByText('rptOrcamentoServicosContratados.xlsx')).toBeInTheDocument();
    expect(screen.getByText('Analisar relatórios')).toBeDisabled();
  });

  test('os passos seguintes só aparecem depois da análise', () => {
    render(<AtualizarProorc />);
    expect(screen.queryByText('Prévia da nova referência')).not.toBeInTheDocument();
    expect(screen.queryByText('Criar a referência')).not.toBeInTheDocument();
  });
});
