import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { montarProposta, salvarPropostas, empacotarPropostas } from '../utils/propostas';
import { recalcularPropostaNaReferencia, aprovarProposta, entradaDaProposta } from '../proorc/propostasAdmin';
import { serializarBiblioteca } from '../proorc/gerarBibliotecaJson';
import { explicarFormacao } from '../proorc/explicarFormacao';
import { BIBLIOTECA } from '../data/biblioteca';
import PropostasAdmin from '../components/PropostasAdmin';
import App from '../App';

const PRECOS_CRIACAO = { construcao: 2823.98, projeto: 82.73 };
const CATALOGO_CRIACAO = {
  '00380856': { codigo: '00380856', descricao: 'CABO AL 1X150MM²', unidade: 'M', classe: 'cabo', ucUar: 'MUT', precoUnitario: 27.14 },
  '00066886': { codigo: '00066886', descricao: 'PARAFUSO M16X70MM', unidade: 'PC', classe: 'consumo', ucUar: '-', precoUnitario: 5.81 },
};

const proposta = (extra = {}) => montarProposta({
  tipo: 'RDP 185 Dupla Camada', categoria: 'Extensão', subcategoria: 'Urbano',
  unidade: 'poste', unidadesPorProjeto: 25,
  materiais: [
    { ...CATALOGO_CRIACAO['00380856'], quantidade: 3150 },
    { ...CATALOGO_CRIACAO['00066886'], quantidade: 222 },
  ],
  usConstrucao: 26.95, usProjeto: 25, tipoUS: 'USRDA',
  precosUS: PRECOS_CRIACAO, referencia: '2026-10', autor: 'Rômulo', criadoEm: '2026-10-08',
  ...extra,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('Etapa 7 — recálculo na referência atual', () => {
  test('sem mudança de preço, o unitário se mantém', () => {
    const p = proposta();
    const r = recalcularPropostaNaReferencia(p, {
      catalogoMateriais: CATALOGO_CRIACAO, precosUS: PRECOS_CRIACAO, referencia: '2026-10',
    });
    expect(r.possivel).toBe(true);
    expect(r.mudancas).toEqual([]);
    expect(r.mudouUnitario).toBe(false);
    expect(r.custos.unitario).toBeCloseTo(p.custos['2026-10'].unitario, 10);
  });

  test('preço de material que subiu aparece na lista de mudanças', () => {
    const catalogo = {
      ...CATALOGO_CRIACAO,
      '00380856': { ...CATALOGO_CRIACAO['00380856'], precoUnitario: 30 },
    };
    const r = recalcularPropostaNaReferencia(proposta(), { catalogoMateriais: catalogo, precosUS: PRECOS_CRIACAO, referencia: '2026-10' });
    expect(r.mudouUnitario).toBe(true);
    expect(r.mudancas[0]).toBe('00380856 (CABO AL 1X150MM²): R$ 27,14 → R$ 30,00');
    expect(r.materiais[0]).toMatchObject({ precoOriginal: 27.14, precoUnitario: 30, mudou: true });
    expect(r.totais.totalMateriais).toBeCloseTo(3150 * 30 + 222 * 5.81, 2);
  });

  test('preço da US que mudou é apontado', () => {
    const r = recalcularPropostaNaReferencia(proposta(), {
      catalogoMateriais: CATALOGO_CRIACAO, precosUS: { construcao: 3000, projeto: 90 }, referencia: '2027-01',
    });
    expect(r.mudancas).toContain('Preço da US de construção: R$ 2.823,98 → R$ 3.000,00');
    expect(r.mudancas).toContain('Preço da US de projeto: R$ 82,73 → R$ 90,00');
    expect(r.mudouUnitario).toBe(true);
  });

  test('material fora do catálogo é avisado e mantém o preço da criação', () => {
    const r = recalcularPropostaNaReferencia(proposta(), {
      catalogoMateriais: { '00380856': CATALOGO_CRIACAO['00380856'] }, precosUS: PRECOS_CRIACAO, referencia: '2026-10',
    });
    expect(r.mudancas).toContain('00066886 (PARAFUSO M16X70MM) não está no catálogo desta referência.');
    expect(r.materiais[1]).toMatchObject({ ausenteNoCatalogo: true, precoUnitario: 5.81 });
  });

  test('referência sem catálogo nem preço da US não dá para recalcular', () => {
    const r = recalcularPropostaNaReferencia(proposta(), {
      catalogoMateriais: {}, precosUS: { construcao: null, projeto: null }, referencia: '2024',
    });
    expect(r.possivel).toBe(false);
    expect(r.motivoIndisponivel).toMatch(/não tem catálogo de materiais nem preço da US/);
    // mantém os valores da criação
    expect(r.custos.unitario).toBeCloseTo(proposta().custos['2026-10'].unitario, 10);
  });

  test('proposta antiga, sem o registro da entrada, é reconstruída pela composição', () => {
    const p = proposta();
    delete p.entrada;
    const e = entradaDaProposta(p);
    expect(e.materiais).toHaveLength(2);
    expect(e.usConstrucao).toBe(26.95);
    expect(e.usProjeto).toBe(25);
    expect(e.precosUS).toEqual(PRECOS_CRIACAO);
  });
});

describe('Etapa 7 — aprovação', () => {
  const aprovar = (p = proposta(), referencia = '2026-10') => aprovarProposta({
    biblioteca: BIBLIOTECA,
    proposta: p,
    referencia,
    recalculo: recalcularPropostaNaReferencia(p, { catalogoMateriais: CATALOGO_CRIACAO, precosUS: PRECOS_CRIACAO, referencia }),
    aprovadoEm: '2026-10-09',
  });

  test('o item entra como oficial, com o mesmo id', () => {
    const p = proposta();
    const nova = aprovar(p);
    expect(nova.itens).toHaveLength(71);
    const item = nova.itens.at(-1);
    expect(item.id).toBe(p.id);
    expect(item.status).toBe('oficial');
    expect(item).toMatchObject({ tipo: 'RDP 185 Dupla Camada', categoria: 'Extensão', subcategoria: 'Urbano', unidade: 'poste' });
  });

  test('guarda de quem veio a proposta', () => {
    const item = aprovar().itens.at(-1);
    expect(item.propostaOrigem).toEqual({
      autor: 'Rômulo', criadoEm: '2026-10-08', referenciaPrecos: '2026-10', aprovadoEm: '2026-10-09',
    });
  });

  test('os custos e a composição ficam na referência escolhida', () => {
    const item = aprovar().itens.at(-1);
    expect(Object.keys(item.custos)).toEqual(['2026-10']);
    expect(item.custos['2026-10'].unitario).toBeCloseTo((3150 * 27.14 + 222 * 5.81 + 78174.51) / 25 / 1000, 7);
    const c = item.composicoes['2026-10'];
    expect(c.materiais).toHaveLength(2);
    expect(c.servicos.map(s => s.grupo)).toEqual(['construcao', 'projeto']);
    expect(c.total).toBeCloseTo(3150 * 27.14 + 222 * 5.81 + 78174.51, 2);
    expect(c.descricaoProjeto).toMatch(/proposta de Rômulo/);
  });

  test('a formação fica como item sem projeto do PROORC, com a observação', () => {
    const item = aprovar().itens.at(-1);
    expect(item.formacao).toMatchObject({ origem: 'proorc', projeto: null, unidadesPorProjeto: 25 });
    expect(item.formacao.observacao).toMatch(/montado na aba Criar Item/);
  });

  test('a tela de composição entende o item aprovado', () => {
    const item = aprovar().itens.at(-1);
    const d = explicarFormacao(item, '2026-10');
    expect(d.disponivel).toBe(true);
    expect(d.materiais).toHaveLength(2);
  });

  test('a biblioteca original não é alterada e o arquivo sai serializável', () => {
    const antes = JSON.stringify(BIBLIOTECA);
    const nova = aprovar();
    expect(JSON.stringify(BIBLIOTECA)).toBe(antes);
    expect(JSON.parse(serializarBiblioteca(nova)).itens).toHaveLength(71);
  });

  test('recusa id repetido', () => {
    const p = proposta();
    const nova = aprovar(p);
    expect(() => aprovarProposta({
      biblioteca: nova, proposta: p, referencia: '2026-10',
      recalculo: recalcularPropostaNaReferencia(p, { catalogoMateriais: CATALOGO_CRIACAO, precosUS: PRECOS_CRIACAO, referencia: '2026-10' }),
    })).toThrow(/já tem um item com o id/);
  });
});

describe('Etapa 7 — tela de propostas', () => {
  const arquivoCom = (propostas) => {
    const texto = JSON.stringify(empacotarPropostas(propostas));
    const file = new File([texto], 'propostas.json', { type: 'application/json' });
    file.text = async () => texto;
    return file;
  };

  const importar = async (container, propostas) => {
    fireEvent.change(container.querySelector('input[type=file]'), { target: { files: [arquivoCom(propostas)] } });
    await waitFor(() => expect(screen.getByText(/proposta\(s\) de 1 arquivo\(s\)/)).toBeInTheDocument());
  };

  test('importa um arquivo e mostra autor, data e os valores', async () => {
    const { container } = render(<PropostasAdmin anoReferencia="2024" />);
    await importar(container, [proposta()]);

    expect(screen.getByText('RDP 185 Dupla Camada')).toBeInTheDocument();
    expect(screen.getByText(/Proposta de/)).toBeInTheDocument();
    expect(screen.getByText('Rômulo')).toBeInTheDocument();
    expect(screen.getByText(/em 08\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Aprovar')).toBeInTheDocument();
  });

  test('em 2024 avisa que não há com o que recalcular', async () => {
    const { container } = render(<PropostasAdmin anoReferencia="2024" />);
    await importar(container, [proposta()]);
    expect(screen.getByText(/não tem catálogo de materiais nem preço da US/)).toBeInTheDocument();
  });

  test('aprovar inclui o item e libera o download', async () => {
    const { container } = render(<PropostasAdmin anoReferencia="2024" />);
    await importar(container, [proposta()]);

    expect(screen.queryByText('Baixar biblioteca.json')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Aprovar'));
    expect(screen.getByText(/aprovada e incluída na biblioteca como oficial/)).toBeInTheDocument();
    expect(screen.getByText('Aprovada')).toBeInTheDocument();
    expect(screen.getByText(/A biblioteca passa a ter 71 itens/)).toBeInTheDocument();

    const criarUrl = vi.fn(() => 'blob:x');
    global.URL.createObjectURL = criarUrl;
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByText('Baixar biblioteca.json'));

    const json = JSON.parse(await criarUrl.mock.calls[0][0].text());
    expect(json.itens).toHaveLength(71);
    expect(json.itens.at(-1).status).toBe('oficial');
    expect(json.itens.at(-1).tipo).toBe('RDP 185 Dupla Camada');
  });

  test('recusar guarda o motivo e não inclui o item', async () => {
    const { container } = render(<PropostasAdmin anoReferencia="2024" />);
    await importar(container, [proposta()]);

    fireEvent.change(screen.getByPlaceholderText('Motivo da recusa (opcional)'), { target: { value: 'Falta o cabo de aço' } });
    fireEvent.click(screen.getByText('Recusar'));

    expect(screen.getByText('Recusada')).toBeInTheDocument();
    expect(screen.getByText('Motivo: Falta o cabo de aço')).toBeInTheDocument();
    expect(screen.getByText(/Todas as propostas foram recusadas/)).toBeInTheDocument();
    expect(screen.queryByText('Baixar biblioteca.json')).not.toBeInTheDocument();
  });

  test('carrega as propostas salvas neste navegador', () => {
    salvarPropostas([proposta()]);
    render(<PropostasAdmin anoReferencia="2024" />);
    fireEvent.click(screen.getByText('Carregar as deste navegador'));
    expect(screen.getByText(/1 proposta\(s\) deste navegador/)).toBeInTheDocument();
    expect(screen.getByText('RDP 185 Dupla Camada')).toBeInTheDocument();
  });

  test('sem propostas no navegador, avisa', () => {
    render(<PropostasAdmin anoReferencia="2024" />);
    fireEvent.click(screen.getByText('Carregar as deste navegador'));
    expect(screen.getByText('Não há propostas salvas neste navegador.')).toBeInTheDocument();
  });

  test('arquivo inválido mostra o erro', async () => {
    const { container } = render(<PropostasAdmin anoReferencia="2024" />);
    const file = new File(['nada'], 'x.json', { type: 'application/json' });
    file.text = async () => 'nada';
    fireEvent.change(container.querySelector('input[type=file]'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/não é um JSON válido/)).toBeInTheDocument());
  });

  test('ver composição abre o diálogo', async () => {
    const { container } = render(<PropostasAdmin anoReferencia="2024" />);
    await importar(container, [proposta()]);
    fireEvent.click(screen.getByText('Ver composição'));
    expect(screen.getByText('Materiais (2)')).toBeInTheDocument();
  });

  test('a aba só existe no modo administrador', () => {
    render(<App />);
    expect(screen.queryByText('Propostas de Itens')).not.toBeInTheDocument();
  });

  test('com ?admin=1 a aba abre a tela', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, search: '?admin=1' });
    render(<App />);
    fireEvent.click(screen.getByText('Propostas de Itens'));
    expect(screen.getByText('Importar arquivos de propostas')).toBeInTheDocument();
  });
});
