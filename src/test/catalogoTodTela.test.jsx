import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import CriarItem from '../components/CriarItem';
import ComposicaoModal from '../components/ComposicaoModal';
import PropostasAdmin from '../components/PropostasAdmin';
import { lerPropostas, montarProposta, salvarPropostas } from '../utils/propostas';

/* A biblioteca fixa dos testes não tem catálogo do PROORC. Para a referência
   2022, este arquivo simula um, com os casos dos relatórios de 07/10/2026.  */
const PROORC_2022 = {
  '00375259': { codigo: '00375259', descricao: 'RELIGADOR TRIFÁSICO 36,2KV 560A 12KA P/AUTOMAÇÃO', unidade: 'PC', classe: 'patrimonial', ucUar: '320', precoUnitario: 55480.53 },
};
vi.mock('../data/biblioteca', async (original) => {
  const real = await original();
  return {
    ...real,
    getCatalogoMateriais: (ref) => (String(ref) === '2022' ? PROORC_2022 : real.getCatalogoMateriais(ref)),
    getReferencia: (ref) => (String(ref) === '2022'
      ? { ...real.getReferencia('2022'), fonte: 'PROORC, relatórios de 07/10/2026' }
      : real.getReferencia(ref)),
  };
});

beforeEach(() => localStorage.clear());

const buscar = (texto) =>
  fireEvent.change(screen.getByPlaceholderText('Buscar material por código ou descrição'), { target: { value: texto } });

const preencherESalvar = (nome) => {
  fireEvent.change(screen.getByPlaceholderText('Ex: RDP 185 Dupla Camada'), { target: { value: nome } });
  fireEvent.change(screen.getByPlaceholderText('Quem está propondo o item'), { target: { value: 'Rômulo' } });
  const categoria = screen.getAllByRole('combobox').find(el => within(el).queryByText('+ nova categoria'));
  fireEvent.change(categoria, { target: { value: 'Equipamentos' } });
  fireEvent.change(screen.getByDisplayValue('25'), { target: { value: '1' } }); // unidades por projeto
  fireEvent.click(screen.getByText('Salvar como proposta'));
};

describe('Criar Item com o catálogo da TOD', () => {
  test('material só da TOD (00207415): composição com fonte "tod" e custo correto', async () => {
    render(<CriarItem anoReferencia="2024" />);
    buscar('207415');
    const resultado = await screen.findByTestId('resultado-00207415');
    expect(within(resultado).getByText(/POSTE CONCRETO CIRCULAR 11M 300DAN/)).toBeInTheDocument();
    expect(within(resultado).getByText('TOD dez/2024')).toBeInTheDocument();
    expect(within(resultado).queryByText(/PROORC/)).not.toBeInTheDocument();
    fireEvent.click(within(resultado).getByText('Incluir'));

    fireEvent.change(screen.getByLabelText('Quantidade de 00207415'), { target: { value: '3' } });
    const linhaTabela = screen.getByLabelText('Quantidade de 00207415').closest('tr');
    expect(within(linhaTabela).getByText('TOD dez/2024')).toBeInTheDocument();
    expect(within(linhaTabela).getByText('R$ 4.689,48')).toBeInTheDocument();

    preencherESalvar('Poste de teste da TOD');
    const [p] = lerPropostas();
    const m = p.composicoes['2024'].materiais[0];
    expect(m).toMatchObject({ codigo: '00207415', unidade: 'PC', quantidade: 3, precoUnitario: 1563.16, fonte: 'tod', dataFonte: '2024-12-06' });
    expect(m.total).toBeCloseTo(4689.48, 2);
    expect(p.custos['2024'].material).toBeCloseTo(4.68948, 8);
  });

  test('a busca espera a digitação terminar', async () => {
    vi.useFakeTimers();
    try {
      render(<CriarItem anoReferencia="2024" />);
      buscar('poste circular 11m');
      expect(screen.queryByTestId('resultado-00207415')).not.toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(300);
      expect(screen.getByTestId('resultado-00207415')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('busca ampla avisa para refinar e mostra no máximo 50', async () => {
    render(<CriarItem anoReferencia="2024" />);
    buscar('cabo');
    expect(await screen.findByText(/Refine a busca/)).toBeInTheDocument();
    expect(screen.getAllByTestId(/^resultado-/)).toHaveLength(50);
  });

  test('filtros de unidade e de fonte', async () => {
    render(<CriarItem anoReferencia="2022" />);
    fireEvent.change(screen.getByLabelText('Filtrar por fonte'), { target: { value: 'proorc' } });
    buscar('religador');
    await waitFor(() => expect(screen.getAllByTestId(/^resultado-/).map(e => e.dataset.testid)).toEqual(['resultado-00375259']));
    fireEvent.change(screen.getByLabelText('Filtrar por fonte'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filtrar por unidade'), { target: { value: 'M' } });
    await waitFor(() => expect(screen.getByText('Nenhum material encontrado.')).toBeInTheDocument());
  });

  test('código nas duas fontes: uma linha, os dois preços, aviso e escolha da fonte', async () => {
    render(<CriarItem anoReferencia="2022" />);
    buscar('375259');
    const resultado = await screen.findByTestId('resultado-00375259');
    expect(screen.getAllByTestId(/^resultado-00375259/)).toHaveLength(1);
    expect(within(resultado).getByText('PROORC 07/10/2026')).toBeInTheDocument();
    expect(within(resultado).getByText('TOD dez/2024')).toBeInTheDocument();
    expect(within(resultado).getByText('R$ 55.480,53')).toBeInTheDocument();
    expect(within(resultado).getByText('R$ 88.142,96')).toBeInTheDocument();
    expect(within(resultado).getByText(/preço diverge entre PROORC e TOD/)).toBeInTheDocument();
    fireEvent.click(within(resultado).getByText('Incluir'));

    const fonte = screen.getByLabelText('Fonte do preço de 00375259');
    expect(fonte.value).toBe('proorc');                       // padrão: PROORC
    const linhaTabela = fonte.closest('tr');
    expect(within(linhaTabela).getAllByText('R$ 55.480,53').length).toBeGreaterThan(0);
    fireEvent.change(fonte, { target: { value: 'tod' } });
    expect(within(linhaTabela).getAllByText('R$ 88.142,96').length).toBeGreaterThan(0);

    preencherESalvar('Religador de teste');
    const m = lerPropostas()[0].composicoes['2022'].materiais[0];
    expect(m).toMatchObject({ codigo: '00375259', precoUnitario: 88142.96, fonte: 'tod', dataFonte: '2024-12-06', classe: 'patrimonial' });
  });
});

describe('Diálogo "Composição" mostra a fonte', () => {
  const PRECOS = { construcao: 2823.98, projeto: 82.73 };

  test('selo por material; linha antiga, sem fonte, aparece como PROORC', () => {
    const p = montarProposta({
      tipo: 'Item com duas fontes', categoria: 'Equipamentos', unidade: 'ponto', unidadesPorProjeto: 1,
      materiais: [
        { codigo: '00207415', descricao: 'POSTE CONCRETO CIRCULAR 11M 300DAN', unidade: 'PC', classe: 'naoInformada', quantidade: 1, precoUnitario: 1563.16, fonte: 'tod', dataFonte: '2024-12-06' },
        { codigo: '00002931', descricao: 'CABO AÇO', unidade: 'KG', classe: 'consumo', quantidade: 1, precoUnitario: 14.24 },
      ],
      precosUS: PRECOS, referencia: '2024', autor: 'Rômulo', criadoEm: '2026-10-09',
    });
    render(<ComposicaoModal item={p} referencia="2024" onFechar={() => {}} />);
    const poste = screen.getByText('POSTE CONCRETO CIRCULAR 11M 300DAN').closest('tr');
    expect(within(poste).getByText('TOD dez/2024')).toBeInTheDocument();
    expect(within(poste).getByText('Não informada')).toBeInTheDocument();
    const cabo = screen.getByText('CABO AÇO').closest('tr');
    expect(within(cabo).getByText('PROORC')).toBeInTheDocument();
  });
});

describe('Tela de aprovação mostra a fonte', () => {
  test('conta os materiais por fonte e não acusa o da TOD como ausente', () => {
    const p = montarProposta({
      tipo: 'Poste aprovado', categoria: 'Equipamentos', unidade: 'ponto', unidadesPorProjeto: 1,
      materiais: [
        { codigo: '00207415', descricao: 'POSTE CONCRETO CIRCULAR 11M 300DAN', unidade: 'PC', classe: 'naoInformada', quantidade: 1, precoUnitario: 1563.16, fonte: 'tod', dataFonte: '2024-12-06' },
        { codigo: '00375259', descricao: 'RELIGADOR', unidade: 'PC', classe: 'patrimonial', quantidade: 1, precoUnitario: 55480.53, fonte: 'proorc', dataFonte: '2026-10-07' },
      ],
      precosUS: { construcao: 2823.98, projeto: 82.73 }, referencia: '2022', autor: 'Rômulo', criadoEm: '2026-10-09',
    });
    salvarPropostas([p]);
    render(<PropostasAdmin anoReferencia="2022" />);
    fireEvent.click(screen.getByText('Carregar as deste navegador'));
    expect(screen.getByText('Fonte dos materiais: 1 do PROORC · 1 da TOD dez/2024')).toBeInTheDocument();
    expect(screen.queryByText(/não está/)).not.toBeInTheDocument();
  });
});
