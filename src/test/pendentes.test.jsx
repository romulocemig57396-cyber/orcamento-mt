import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  BIBLIOTECA, getItemById, ehPendente, itensPendentes, itemDoOrcamentoPendente,
  TEXTO_PENDENTE, AVISO_PENDENTE,
} from '../data/biblioteca';
import BibliotecaCustos from '../components/BibliotecaCustos';
import ItensObra from '../components/ItensObra';
import Importacao from '../components/Importacao';

afterEach(() => vi.restoreAllMocks());

const PENDENTES_2024 = [
  'ext_urbano_rdi185', 'ext_urbano_rdi50', 'recon_urb_4_0_ca', 'recon_urb_rdi185', 'recon_urb_rdi50',
];

describe('R3 — regra de item pendente', () => {
  test('unitário 0 na referência → pendente; maior que 0 → não', () => {
    expect(ehPendente(getItemById('recon_urb_rdi50'), '2024')).toBe(true);
    expect(ehPendente(getItemById('sub_13_8kv'), '2024')).toBe(false);
    expect(ehPendente(getItemById('ext_urbano_rdp150_dupla'), '2024')).toBe(false);
  });

  test('a regra segue a referência selecionada', () => {
    // recon_urb_rdp150_dupla ficou sem unitário em 2022, mas tem valor em 2024
    expect(ehPendente(getItemById('recon_urb_rdp150_dupla'), '2022')).toBe(true);
    expect(ehPendente(getItemById('recon_urb_rdp150_dupla'), '2024')).toBe(false);
  });

  test('hoje são 5 pendentes em 2024', () => {
    expect(itensPendentes('2024').map(i => i.id).sort()).toEqual(PENDENTES_2024);
  });

  test('item do orçamento: pendente pela referência gravada nele; item manual nunca', () => {
    expect(itemDoOrcamentoPendente({ itemOrigem: 'recon_urb_rdi50', anoReferencia: '2024' })).toBe(true);
    expect(itemDoOrcamentoPendente({ itemOrigem: 'recon_urb_rdp150_dupla', anoReferencia: '2022' })).toBe(true);
    expect(itemDoOrcamentoPendente({ itemOrigem: 'recon_urb_rdp150_dupla', anoReferencia: '2024' })).toBe(false);
    expect(itemDoOrcamentoPendente({ itemOrigem: 'equip_brt_76', anoReferencia: '2024' })).toBe(false);
    expect(itemDoOrcamentoPendente({ descricao: 'manual', valor: 0 })).toBe(false);
  });

  test('os 3 recondutoramentos zerados: o texto de verificação vira o motivo da formação', () => {
    ['recon_urb_4_0_ca', 'recon_urb_rdi50', 'recon_urb_rdi185'].forEach(id => {
      const item = BIBLIOTECA.itens.find(i => i.id === id);
      expect(item.verificacao, id).toBeUndefined();
      expect(item.formacao, id).toEqual({ origem: 'fixo', motivo: 'Zerado em 2024, mas com valor em 2022/2021 na planilha de origem.' });
    });
  });
});

describe('R3 — Biblioteca', () => {
  const renderizar = () => render(<BibliotecaCustos setOrcamento={() => {}} anoReferencia="2024" setAnoReferencia={() => {}} />);

  test('linha pendente com fundo âmbar, texto cinza escuro e selo', () => {
    renderizar();
    const linha = screen.getByText('p/ RDI 50').closest('tr');
    expect(linha).toHaveStyle({ background: '#FFF4E0', color: '#444' });
    expect(within(linha).getByText(TEXTO_PENDENTE)).toBeInTheDocument();
    expect(TEXTO_PENDENTE).toBe('Pendente — sem custo cadastrado');

    const comCusto = screen.getByText('RDP 150 Dupla Camada').closest('tr');
    expect(comCusto).not.toHaveStyle({ background: '#FFF4E0' });
    expect(within(comCusto).queryByText(TEXTO_PENDENTE)).not.toBeInTheDocument();
  });

  test('contagem no topo e filtro "Mostrar só pendentes"', () => {
    renderizar();
    expect(screen.getByText('5 pendentes')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Mostrar só pendentes'));
    expect(screen.getAllByText(TEXTO_PENDENTE)).toHaveLength(5);
    expect(screen.queryByText('RDP 150 Dupla Camada')).not.toBeInTheDocument();
  });

  test('ao adicionar um pendente, o diálogo avisa e permite', () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    let estado = { itensObra: [] };
    render(<BibliotecaCustos setOrcamento={fn => { estado = fn(estado); }} anoReferencia="2024" setAnoReferencia={() => {}} />);
    const linha = screen.getByText('p/ RDI 50').closest('tr');
    fireEvent.click(within(linha).getByText('+ Adicionar'));
    expect(screen.getByText(AVISO_PENDENTE)).toBeInTheDocument();
    expect(AVISO_PENDENTE).toBe('Este item está sem custo cadastrado e entrará com R$ 0,00');

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao Orçamento' }));
    expect(estado.itensObra).toHaveLength(1);
    expect(estado.itensObra[0].valor).toBe(0);
  });

  test('item com custo não mostra o aviso no diálogo', () => {
    renderizar();
    fireEvent.click(within(screen.getByText('RDP 150 Dupla Camada').closest('tr')).getByText('+ Adicionar'));
    expect(screen.queryByText(AVISO_PENDENTE)).not.toBeInTheDocument();
  });
});

describe('R3 — orçamento e importação', () => {
  test('a linha do item pendente no orçamento recebe o selo', () => {
    const itens = [
      { id: 1, descricao: 'p/ RDI 50', categoria: 'cti', valor: 0, quantidade: 10, unidade: 'poste', itemOrigem: 'recon_urb_rdi50', anoReferencia: '2024' },
      { id: 2, descricao: 'BRT trif 76,2 kVA', categoria: 'ctc', valor: 186976.15, quantidade: 1, unidade: 'ponto', itemOrigem: 'equip_brt_76', anoReferencia: '2024' },
    ];
    render(<ItensObra itens={itens} setOrcamento={() => {}} />);
    expect(screen.getAllByText(TEXTO_PENDENTE)).toHaveLength(1);
    expect(screen.getByDisplayValue('p/ RDI 50').closest('tr')).toHaveTextContent(TEXTO_PENDENTE);
  });

  test('importação: item pendente selecionado mostra o aviso na linha', () => {
    const importacao = {
      textoOriginal: 'x', cabecalhoDetectado: null, textosAltaTensao: [], textoAltaTensao: '', analisado: true,
      itensDetectados: [
        { textoOriginal: 'Recondutoramento RDI 50', tipoSelecionado: 'recon_urb_rdi50', descricaoManual: '', quantidade: 10, unidade: 'poste', categoria: 'cti', percentualCemig: 0 },
        { textoOriginal: 'BRT 76', tipoSelecionado: 'equip_brt_76', descricaoManual: '', quantidade: 1, unidade: 'ponto', categoria: 'ctc', percentualCemig: 0 },
      ],
    };
    render(<Importacao setOrcamento={() => {}} importacao={importacao} updateImportacao={() => {}} anoReferencia="2024" />);
    expect(screen.getAllByText(AVISO_PENDENTE)).toHaveLength(1);
    expect(screen.getByText('Recondutoramento RDI 50').closest('tr')).toHaveTextContent(AVISO_PENDENTE);
  });
});
