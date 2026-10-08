import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BIBLIOTECA } from '../data/biblioteca';
import { calcularNovaReferencia } from '../proorc/calcularReferencia';
import { aplicarNovaReferencia } from '../proorc/gerarBibliotecaJson';
import EditarValores from '../components/EditarValores';
import App from '../App';

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, '', '/'); });

const prevista = () => screen.getByTestId('previa-edicao');

describe('R7 — tela "Editar valores"', () => {
  test('agrupa os itens por origem e mostra os parâmetros', () => {
    render(<EditarValores />);
    expect(screen.getByText(/Base: 2024 \(Atual\)/)).toBeInTheDocument();
    expect(screen.getByText('Itens da TOD (5)')).toBeInTheDocument();
    expect(screen.getByText('Itens manuais e fixos (17)')).toBeInTheDocument();
    expect(screen.getByLabelText('Fonte/versão da TOD')).toHaveValue('TOD dez/2024');
    expect(screen.getByLabelText('Fator da rede existente')).toHaveValue(0.33);
    expect(screen.getByLabelText('Fator de mão de obra do recondutoramento urbano')).toHaveValue(1.05);
    expect(screen.getByLabelText('Religador adicional dos PT (R$ mil)')).toHaveValue(88.1429);
    expect(screen.getByLabelText('Mão de obra dos PT (%)')).toHaveValue(20);
    // itens do PROORC, de fórmula e de mão de obra não têm campo
    expect(screen.queryByLabelText('RDP 150 Dupla Camada — material')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('CAA 4 p/ 1/0 — material')).not.toBeInTheDocument();
  });

  test('alterar a TOD de Tri CAA 1/0 recalcula ao vivo os dependentes', () => {
    render(<EditarValores />);
    expect(screen.getByText('Nenhuma alteração ainda.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tri CAA 1/0 — material'), { target: { value: '45' } });

    const tabela = prevista();
    expect(within(tabela).getAllByRole('row')).toHaveLength(1 + 7);
    const linha = within(tabela).getByText('CAA 1/0 p/ 4/0').closest('tr');
    expect(within(linha).getByText('153,63883')).toBeInTheDocument();
    expect(within(linha).getByText('154,73869')).toBeInTheDocument();
    expect(within(linha).getByText('base Tri CAA 1/0 alterada')).toBeInTheDocument();
    expect(within(tabela).getByText('83,31981')).toBeInTheDocument();
    expect(within(tabela).getByText('99,11361')).toBeInTheDocument();
  });

  test('valor negativo bloqueia a geração; variação grande e unitário zerado avisam', () => {
    render(<EditarValores />);
    fireEvent.change(screen.getByLabelText('Seção 22,0 kV — material'), { target: { value: '-1' } });
    expect(screen.getByText(/não pode ser negativo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar referência' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Seção 22,0 kV — material'), { target: { value: '950' } });
    fireEvent.change(screen.getByLabelText('Tri CAA 4 — unitário'), { target: { value: '0' } });
    const linha = within(prevista()).getByText('Tri CAA 4').closest('tr');
    expect(within(linha).getByText('Pendente — sem custo cadastrado')).toBeInTheDocument();
    expect(within(linha).getByText(/Variação acima de 30%/)).toBeInTheDocument();
    expect(screen.getByText(/1 item ficará sem custo \(pendente\)/)).toBeInTheDocument();
  });

  test('gera a referência e oferece o download', () => {
    const criarUrl = vi.fn(() => 'blob:x');
    URL.createObjectURL = criarUrl;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<EditarValores />);
    fireEvent.change(screen.getByLabelText('Tri CAA 1/0 — material'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Chave'), { target: { value: '2026-10' } });
    fireEvent.change(screen.getByLabelText('Rótulo'), { target: { value: '2026 — TOD dez/2024 + edições' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar referência' }));

    expect(screen.getByText('Referência 2026-10 criada em memória')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar biblioteca.json' }));
    expect(criarUrl).toHaveBeenCalledTimes(1);
  });

  test('chave que já existe é recusada', () => {
    render(<EditarValores />);
    fireEvent.change(screen.getByLabelText('Tri CAA 1/0 — material'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Chave'), { target: { value: '2024' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar referência' }));
    expect(screen.getByText(/já existe/)).toBeInTheDocument();
  });

  test('sobre a referência em preparação do PROORC', () => {
    const consolidado = { projetos: [], precosUS: { construcao: 2823.98, projeto: 82.73 }, catalogoMateriais: {}, dataReferencia: '07/10/2026' };
    const resultado = calcularNovaReferencia({ biblioteca: BIBLIOTECA, consolidado, chaveAnterior: '2024' });
    const emPreparacao = aplicarNovaReferencia({ biblioteca: BIBLIOTECA, resultado, chave: '2026-10', rotulo: '2026 — PROORC 07/10/2026', fonte: 'PROORC', atual: true });
    render(<EditarValores base={{ biblioteca: emPreparacao, chave: '2026-10', rotulo: '2026 — PROORC 07/10/2026', fonte: 'PROORC' }} />);
    expect(screen.getByText(/referência em preparação 2026-10/)).toBeInTheDocument();
    expect(screen.getByLabelText('Chave')).toHaveValue('2026-10');
  });

  test('a aba aparece só no modo administrador', () => {
    const { unmount } = render(<App />);
    expect(screen.queryByRole('button', { name: 'Editar valores' })).not.toBeInTheDocument();
    unmount();
    window.history.replaceState({}, '', '/?admin=1');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar valores' }));
    expect(screen.getByText('Itens da TOD (5)')).toBeInTheDocument();
  });
});
