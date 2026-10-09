import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import {
  CHAVE_PROPOSTAS, lerPropostas, salvarPropostas, slugDoTipo, gerarIdProposta,
  calcularProposta, validarProposta, montarProposta, lerArquivoPropostas,
  empacotarPropostas, juntarPropostas,
} from '../utils/propostas';
import { explicarFormacao } from '../proorc/explicarFormacao';
import CriarItem from '../components/CriarItem';
import BibliotecaCustos from '../components/BibliotecaCustos';
import App from '../App';

const PRECOS = { construcao: 2823.98, projeto: 82.73 };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('Etapa 6 — identificador da proposta', () => {
  test('o slug limpa acentos e pontuação', () => {
    expect(slugDoTipo('RDP 185 Dupla Camada')).toBe('rdp_185_dupla_camada');
    expect(slugDoTipo('Conversão Monofásica → Trifásica')).toBe('conversao_monofasica_trifasica');
    expect(slugDoTipo('')).toBe('item');
  });

  test('o id tem o formato prop_<slug>_<4> e não repete', () => {
    const id = gerarIdProposta('RDP 185');
    expect(id).toMatch(/^prop_rdp_185_[a-z0-9]{4}$/);
    const outro = gerarIdProposta('RDP 185', [{ id }]);
    expect(outro).not.toBe(id);
  });
});

describe('Etapa 6 — cálculo do item montado', () => {
  const materiais = [
    { codigo: '00380856', descricao: 'CABO', unidade: 'M', classe: 'cabo', quantidade: 3150, precoUnitario: 27.14 },
    { codigo: '00066886', descricao: 'PARAFUSO', unidade: 'PC', classe: 'consumo', quantidade: 222, precoUnitario: 5.81 },
  ];

  test('materiais, US e divisão pelas unidades do projeto', () => {
    const c = calcularProposta({ materiais, usConstrucao: 26.95, usProjeto: 25, precosUS: PRECOS, unidadesPorProjeto: 25 });
    expect(c.totalMateriais).toBeCloseTo(3150 * 27.14 + 222 * 5.81, 2);
    expect(c.totalConstrucao).toBeCloseTo(26.95 * 2823.98, 2);
    expect(c.totalProjeto).toBeCloseTo(25 * 82.73, 2);
    expect(c.totalServicos).toBeCloseTo(78174.51, 2);
    expect(c.custos.material).toBeCloseTo(c.totalMateriais / 25 / 1000, 8);
    expect(c.custos.maoObra).toBeCloseTo(78174.51 / 25 / 1000, 6);
    expect(c.custos.usConstr).toBeCloseTo(26.95 / 25, 6);
    expect(c.custos.unitario).toBeCloseTo(c.custos.material + c.custos.maoObra, 10);
  });

  test('sem unidades por projeto informadas, divide por 1', () => {
    const c = calcularProposta({ materiais: [], usConstrucao: 1, precosUS: PRECOS });
    expect(c.custos.maoObra).toBeCloseTo(2.82398, 5);
  });

  test('item só de mão de obra tem material zero', () => {
    const c = calcularProposta({ usConstrucao: 10.236, precosUS: PRECOS, unidadesPorProjeto: 1 });
    expect(c.custos.material).toBe(0);
    expect(c.custos.unitario).toBeCloseTo(28.906259, 5);
  });

  test('sem preço da US, a mão de obra fica zerada', () => {
    const c = calcularProposta({ usConstrucao: 5, precosUS: { construcao: null, projeto: null }, unidadesPorProjeto: 1 });
    expect(c.custos.maoObra).toBe(0);
  });
});

describe('Etapa 6 — validações', () => {
  const base = { tipo: 'RDP 185', categoria: 'Extensão', unidade: 'poste', autor: 'Rômulo', unidadesPorProjeto: 25, materiais: [{ codigo: '1', quantidade: 2 }] };

  test('aceita um item completo', () => {
    expect(validarProposta(base).valido).toBe(true);
  });

  test('nome, categoria, unidade e autor são obrigatórios', () => {
    expect(validarProposta({ ...base, tipo: '' }).erros).toContain('Informe o nome do item.');
    expect(validarProposta({ ...base, categoria: '' }).erros).toContain('Informe a categoria.');
    expect(validarProposta({ ...base, unidade: '' }).erros).toContain('Informe a unidade.');
    expect(validarProposta({ ...base, autor: '  ' }).erros).toContain('Informe o seu nome.');
  });

  test('exige ao menos um material ou US', () => {
    const r = validarProposta({ ...base, materiais: [] });
    expect(r.erros).toContain('Inclua ao menos um material ou uma quantidade de US.');
    expect(validarProposta({ ...base, materiais: [], usConstrucao: 3 }).valido).toBe(true);
  });

  test('quantidades precisam ser maiores que zero', () => {
    expect(validarProposta({ ...base, materiais: [{ codigo: 'X', quantidade: 0 }] }).erros)
      .toContain('A quantidade do material X precisa ser maior que zero.');
    expect(validarProposta({ ...base, unidadesPorProjeto: 0 }).erros)
      .toContain('As unidades por projeto precisam ser maiores que zero.');
    expect(validarProposta({ ...base, usConstrucao: -1 }).erros)
      .toContain('As quantidades de US não podem ser negativas.');
  });

  test('nome repetido na mesma categoria é aviso, não erro', () => {
    const r = validarProposta(
      { ...base, tipo: 'RDP 150 Dupla Camada', categoria: 'Extensão' },
      { itensExistentes: [{ tipo: 'RDP 150 Dupla Camada', categoria: 'Extensão', subcategoria: 'Urbano' }], subcategoria: 'Urbano' },
    );
    expect(r.valido).toBe(true);
    expect(r.avisos[0]).toMatch(/Já existe "RDP 150 Dupla Camada" em Extensão › Urbano/);
  });
});

describe('Etapa 6 — proposta montada', () => {
  const proposta = () => montarProposta({
    tipo: 'RDP 185 Dupla Camada', categoria: 'Extensão', subcategoria: 'Urbano',
    unidade: 'poste', unidadesPorProjeto: 25,
    materiais: [{ codigo: '00380856', descricao: 'CABO', unidade: 'M', classe: 'cabo', quantidade: 3150, precoUnitario: 27.14 }],
    usConstrucao: 26.95, usProjeto: 25, tipoUS: 'USRDA',
    precosUS: PRECOS, referencia: '2026-10', autor: 'Rômulo', criadoEm: '2026-10-08',
  });

  test('tem a forma de um item da biblioteca, com status de proposta', () => {
    const p = proposta();
    expect(p.status).toBe('proposta');
    expect(p.id).toMatch(/^prop_rdp_185_dupla_camada_/);
    expect(p.formacao.origem).toBe('proorc');
    expect(p.formacao.unidadesPorProjeto).toBe(25);
    expect(p.custos['2026-10'].unitario).toBeGreaterThan(0);
    expect(p.autor).toBe('Rômulo');
    expect(p.criadoEm).toBe('2026-10-08');
    expect(p.referenciaPrecos).toBe('2026-10');
  });

  test('a composição guarda materiais e as duas US', () => {
    const c = proposta().composicoes['2026-10'];
    expect(c.materiais).toHaveLength(1);
    expect(c.materiais[0].total).toBeCloseTo(3150 * 27.14, 2);
    expect(c.servicos.map(s => s.grupo)).toEqual(['construcao', 'projeto']);
    expect(c.servicos[0].codigo).toBe('USRDA');
    expect(c.total).toBeCloseTo(3150 * 27.14 + 78174.51, 2);
    expect(c.descricaoProjeto).toBe('Montado por Rômulo em 08/10/2026');
  });

  test('a tela de composição entende a proposta', () => {
    const d = explicarFormacao(proposta(), '2026-10');
    expect(d.disponivel).toBe(true);
    expect(d.materiais).toHaveLength(1);
    expect(d.passos.at(-1).rotulo).toBe('Unitário por poste (R$ mil)');
    expect(d.servicos).toHaveLength(2);
  });

  test('item sem US não grava serviços', () => {
    const p = montarProposta({
      tipo: 'Só material', categoria: 'Equipamentos', unidade: 'ponto', unidadesPorProjeto: 1,
      materiais: [{ codigo: '1', descricao: 'X', unidade: 'PC', quantidade: 1, precoUnitario: 10 }],
      precosUS: PRECOS, referencia: '2024', autor: 'A', criadoEm: '2026-10-08',
    });
    expect(p.composicoes['2024'].servicos).toEqual([]);
  });
});

describe('Etapa 6 — armazenamento e arquivo', () => {
  test('salva e lê do localStorage, em chave separada do orçamento', () => {
    const p = montarProposta({ tipo: 'A', categoria: 'C', unidade: 'ponto', materiais: [], usConstrucao: 1, precosUS: PRECOS, referencia: '2024', autor: 'X', criadoEm: '2026-10-08' });
    expect(salvarPropostas([p])).toBe(true);
    expect(localStorage.getItem('orcamento_mt_app')).toBeNull();
    expect(JSON.parse(localStorage.getItem(CHAVE_PROPOSTAS))).toHaveLength(1);
    expect(lerPropostas()[0].tipo).toBe('A');
  });

  test('localStorage com lixo não quebra a leitura', () => {
    localStorage.setItem(CHAVE_PROPOSTAS, '{isso nao e json');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(lerPropostas()).toEqual([]);
    localStorage.setItem(CHAVE_PROPOSTAS, '{"nao":"lista"}');
    expect(lerPropostas()).toEqual([]);
  });

  test('o arquivo exportado tem tipo, versão e as propostas', () => {
    const pacote = empacotarPropostas([{ id: 'prop_a_1234', tipo: 'A', custos: {} }]);
    expect(pacote).toMatchObject({ tipo: 'propostas-orcamento-mt', versao: 1 });
    expect(pacote.propostas).toHaveLength(1);
  });

  test('a leitura do arquivo aceita o pacote e uma lista solta', () => {
    const p = { id: 'prop_a_1234', tipo: 'A', custos: { 2024: {} } };
    expect(lerArquivoPropostas(JSON.stringify(empacotarPropostas([p])))).toHaveLength(1);
    expect(lerArquivoPropostas(JSON.stringify([p]))).toHaveLength(1);
  });

  test('arquivo inválido explica o problema', () => {
    expect(() => lerArquivoPropostas('nada')).toThrow(/não é um JSON válido/);
    expect(() => lerArquivoPropostas('{}')).toThrow(/não tem uma lista de propostas/);
    expect(() => lerArquivoPropostas('[{"tipo":"sem id"}]')).toThrow(/sem id ou sem nome/);
    expect(() => lerArquivoPropostas('[{"id":"a","tipo":"B"}]')).toThrow(/está sem custos/);
  });

  test('juntar propostas não repete id', () => {
    const a = { id: 'x', tipo: 'A' };
    const b = { id: 'x', tipo: 'B' };
    const c = { id: 'y', tipo: 'C' };
    expect(juntarPropostas([a], [b, c]).map(p => p.tipo)).toEqual(['A', 'C']);
  });
});

describe('Etapa 6 — tela Criar Item', () => {
  const preencher = (dados = {}) => {
    const campos = { nome: 'RDP 185 de teste', autor: 'Rômulo', us: '10,236', ...dados };
    fireEvent.change(screen.getByPlaceholderText('Ex: RDP 185 Dupla Camada'), { target: { value: campos.nome } });
    fireEvent.change(screen.getByPlaceholderText('Quem está propondo o item'), { target: { value: campos.autor } });
    fireEvent.change(screen.getByLabelText('US de construção', { selector: 'input' }), { target: { value: '10.236' } });
    fireEvent.change(screen.getByRole('combobox', { name: '' }), { target: { value: 'Extensão' } });
  };

  test('a referência 2024 não tem catálogo do PROORC, mas a busca usa a TOD', () => {
    render(<CriarItem anoReferencia="2024" />);
    expect(screen.getByText(/não tem catálogo do PROORC/)).toBeInTheDocument();
    expect(screen.getByText(/TOD dez\/2024/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Buscar material por código ou descrição')).toBeInTheDocument();
  });

  test('o botão de salvar começa desabilitado', () => {
    render(<CriarItem anoReferencia="2024" />);
    expect(screen.getByText('Salvar como proposta')).toBeDisabled();
  });

  test('salva uma proposta só com US e mostra na lista', () => {
    render(<CriarItem anoReferencia="2024" />);
    fireEvent.change(screen.getByPlaceholderText('Ex: RDP 185 Dupla Camada'), { target: { value: 'Retirada de teste' } });
    fireEvent.change(screen.getByPlaceholderText('Quem está propondo o item'), { target: { value: 'Rômulo' } });
    const categoria = screen.getAllByRole('combobox').find(el => within(el).queryByText('+ nova categoria'));
    fireEvent.change(categoria, { target: { value: 'Rede' } });
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '5' } }); // US de construção

    expect(screen.getByText('Salvar como proposta')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Salvar como proposta'));

    expect(screen.getByText(/Proposta salva: Retirada de teste/)).toBeInTheDocument();
    expect(screen.getByText('Minhas propostas (1)')).toBeInTheDocument();
    expect(lerPropostas()).toHaveLength(1);
    expect(lerPropostas()[0].tipo).toBe('Retirada de teste');
  });

  test('editar e excluir a própria proposta', () => {
    const p = montarProposta({ tipo: 'Item antigo', categoria: 'Rede', unidade: 'km', unidadesPorProjeto: 1, materiais: [], usConstrucao: 2, precosUS: PRECOS, referencia: '2024', autor: 'Rômulo', criadoEm: '2026-10-01' });
    salvarPropostas([p]);
    render(<CriarItem anoReferencia="2024" />);

    fireEvent.click(screen.getByText('Editar'));
    expect(screen.getByDisplayValue('Item antigo')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Item antigo'), { target: { value: 'Item renomeado' } });
    fireEvent.click(screen.getByText('Salvar alterações'));
    expect(lerPropostas()).toHaveLength(1);
    expect(lerPropostas()[0].tipo).toBe('Item renomeado');
    expect(lerPropostas()[0].id).toBe(p.id);
    expect(lerPropostas()[0].criadoEm).toBe('2026-10-01');

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByText('Excluir'));
    expect(lerPropostas()).toHaveLength(1);
    window.confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText('Excluir'));
    expect(lerPropostas()).toHaveLength(0);
  });

  test('exportar entrega o arquivo de propostas', () => {
    const p = montarProposta({ tipo: 'Para exportar', categoria: 'Rede', unidade: 'km', unidadesPorProjeto: 1, materiais: [], usConstrucao: 1, precosUS: PRECOS, referencia: '2024', autor: 'Rômulo', criadoEm: '2026-10-08' });
    salvarPropostas([p]);
    render(<CriarItem anoReferencia="2024" />);

    const criarUrl = vi.fn(() => 'blob:x');
    global.URL.createObjectURL = criarUrl;
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByText('Exportar propostas'));
    expect(criarUrl).toHaveBeenCalled();
  });

  test('importar um arquivo junta as propostas', async () => {
    const p = montarProposta({ tipo: 'Importada', categoria: 'Rede', unidade: 'km', unidadesPorProjeto: 1, materiais: [], usConstrucao: 1, precosUS: PRECOS, referencia: '2024', autor: 'Outro', criadoEm: '2026-10-08' });
    const { container } = render(<CriarItem anoReferencia="2024" />);
    const arquivo = new File([JSON.stringify(empacotarPropostas([p]))], 'propostas.json', { type: 'application/json' });
    arquivo.text = async () => JSON.stringify(empacotarPropostas([p]));

    fireEvent.change(container.querySelector('input[type=file]'), { target: { files: [arquivo] } });
    await waitFor(() => expect(screen.getByText(/1 proposta\(s\) lidas do arquivo/)).toBeInTheDocument());
    expect(lerPropostas()[0].tipo).toBe('Importada');
  });

  test('a aba aparece no menu, depois da Biblioteca', () => {
    render(<App />);
    const nav = screen.getByText('Criar Item');
    expect(nav).toBeInTheDocument();
    fireEvent.click(nav);
    expect(screen.getByText('Materiais do item')).toBeInTheDocument();
  });
});

describe('Etapa 6 — proposta na Biblioteca e no orçamento', () => {
  const comProposta = () => {
    const p = montarProposta({
      tipo: 'Item proposto de teste', categoria: 'Equipamentos', subcategoria: 'Instalação',
      unidade: 'ponto', unidadesPorProjeto: 1, materiais: [], usConstrucao: 10,
      precosUS: PRECOS, referencia: '2024', autor: 'Rômulo', criadoEm: '2026-10-08',
    });
    salvarPropostas([p]);
    return p;
  };

  test('aparece na lista com o selo de não oficial', () => {
    comProposta();
    render(<BibliotecaCustos setOrcamento={() => {}} anoReferencia="2024" setAnoReferencia={() => {}} />);
    expect(screen.getByText('Item proposto de teste')).toBeInTheDocument();
    expect(screen.getByText('Proposta — não oficial')).toBeInTheDocument();
  });

  test('pode ser adicionada ao orçamento, marcada como não oficial', () => {
    const p = comProposta();
    let estado = { itensObra: [] };
    const setOrcamento = (fn) => { estado = fn(estado); };
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<BibliotecaCustos setOrcamento={setOrcamento} anoReferencia="2024" setAnoReferencia={() => {}} />);

    const linha = screen.getByText('Item proposto de teste').closest('tr');
    fireEvent.click(within(linha).getByText('+ Adicionar'));
    fireEvent.change(screen.getByPlaceholderText('Ex: 14.84'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao Orçamento' }));

    expect(estado.itensObra).toHaveLength(1);
    expect(estado.itensObra[0]).toMatchObject({
      descricao: 'Item proposto de teste', itemOrigem: p.id, naoOficial: true,
      autorProposta: 'Rômulo', anoReferencia: '2024',
    });
    expect(estado.itensObra[0].valor).toBeCloseTo(10 * 2823.98 * 2, 2);
  });

  test('item oficial não ganha a marca de não oficial', () => {
    let estado = { itensObra: [] };
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<BibliotecaCustos setOrcamento={(fn) => { estado = fn(estado); }} anoReferencia="2024" setAnoReferencia={() => {}} />);
    const linha = screen.getByText('BRT trif 76,2 kVA').closest('tr');
    fireEvent.click(within(linha).getByText('+ Adicionar'));
    fireEvent.change(screen.getByPlaceholderText('Ex: 14.84'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao Orçamento' }));
    expect(estado.itensObra[0].naoOficial).toBeUndefined();
  });
});
