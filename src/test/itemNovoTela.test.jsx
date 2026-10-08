import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AtualizarProorc from '../components/AtualizarProorc';
import { CONJUNTO } from './fixtures/planilhaFalsa';

afterEach(() => vi.restoreAllMocks());

const arquivo = (nome, b) => {
  const f = new File([b], nome);
  f.arrayBuffer = async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return f;
};

const analisar = async () => {
  const { container } = render(<AtualizarProorc />);
  const inputs = container.querySelectorAll('input[type=file]');
  ['sintetico', 'analitico', 'servicos'].forEach((c, i) => fireEvent.change(inputs[i], { target: { files: [arquivo(`${c}.xlsx`, CONJUNTO[c]())] } }));
  await waitFor(() => expect(screen.getByText('Analisar relatórios')).not.toBeDisabled());
  fireEvent.click(screen.getByText('Analisar relatórios'));
  await waitFor(() => expect(screen.getByText('Prévia da nova referência')).toBeInTheDocument());
};

const linhaDoProjeto = (chave) => screen.getAllByText(chave).map(e => e.closest('tr')).find(Boolean);

const baixar = async (rotuloBotao, escopo = screen) => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const criarUrl = vi.fn(() => 'blob:x');
  global.URL.createObjectURL = criarUrl;
  global.URL.revokeObjectURL = vi.fn();
  fireEvent.click(escopo.getByText(rotuloBotao));
  return JSON.parse(await criarUrl.mock.calls[0][0].text());
};

describe('R9 — "Criar item novo" na tela do PROORC', () => {
  test('projeto com serviços: cria, aparece na prévia e vai para o arquivo com a ligação', async () => {
    await analisar();
    fireEvent.click(within(linhaDoProjeto('1111111111')).getByText('Criar item novo'));

    const dialogo = screen.getByRole('dialog', { name: 'Criar item novo' });
    expect(within(dialogo).getByLabelText('Nome (tipo)')).toHaveValue('Extensão de 01 km de teste');
    expect(within(dialogo).queryByText(/não tem serviços contratados/)).not.toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText('Nome (tipo)'), { target: { value: 'RDP teste' } });
    fireEvent.change(within(dialogo).getByLabelText('Unidade'), { target: { value: 'poste' } });
    fireEvent.change(within(dialogo).getByLabelText('Unidades por projeto'), { target: { value: '25' } });
    expect(within(dialogo).getByText('ext_rdp_teste')).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByText('Criar item'));

    // a linha mostra o item novo e o desfazer
    const linha = linhaDoProjeto('1111111111');
    expect(within(linha).getByText('RDP teste')).toBeInTheDocument();
    expect(within(linha).getByText('Item novo')).toBeInTheDocument();

    // seção própria na prévia
    const tabela = screen.getByRole('table', { name: 'Itens novos criados a partir do PROORC' });
    expect(within(tabela).getByText('RDP teste')).toBeInTheDocument();
    expect(within(tabela).getByText('0,064')).toBeInTheDocument(); // 1.600 ÷ 25 ÷ 1000
    expect(within(tabela).getByText('2 materiais')).toBeInTheDocument();

    // gerar e baixar
    fireEvent.click(screen.getByText('Revisei a tabela e confirmo as ligações'));
    fireEvent.click(screen.getByText('Gerar nova referência'));
    expect(screen.getByText('1 item novo criado a partir do PROORC')).toBeInTheDocument();
    const json = await baixar('Baixar biblioteca.json');
    const item = json.itens.find(i => i.id === 'ext_rdp_teste');
    expect(item).toMatchObject({ status: 'oficial', tipo: 'RDP teste', unidade: 'poste', formacao: { origem: 'proorc', projeto: '1111111111', unidadesPorProjeto: 25 } });
    expect(Object.keys(item.custos)).toEqual(['2026-10']);
    expect(item.composicoes['2026-10'].materiais).toHaveLength(2);
    expect(json.mapeamentoProorc['1111111111']).toMatchObject({ item: 'ext_rdp_teste', unidadesPorProjeto: 25 });
  }, 20000);

  test('projeto sem serviços: avisa, pede a mão de obra; desfazer volta o projeto para sem ligação', async () => {
    await analisar();
    fireEvent.click(within(linhaDoProjeto('1111111111-APP 2')).getByText('Criar item novo'));
    const dialogo = screen.getByRole('dialog', { name: 'Criar item novo' });
    expect(within(dialogo).getByText(/não tem serviços contratados/)).toBeInTheDocument();
    // percentual sugerido: 20%
    expect(within(dialogo).getByLabelText('Mão de obra (%)')).toHaveValue(20);
    fireEvent.click(within(dialogo).getByLabelText(/US de construção informadas/));
    expect(within(dialogo).getByText('Criar item')).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText('US de construção'), { target: { value: '3' } });
    fireEvent.click(within(dialogo).getByText('Criar item'));

    const tabela = screen.getByRole('table', { name: 'Itens novos criados a partir do PROORC' });
    // 2.500,50 de material + 3 US × R$ 2.000,00
    expect(within(tabela).getByText('8,5005')).toBeInTheDocument();

    fireEvent.click(within(linhaDoProjeto('1111111111-APP 2')).getByText('Desfazer criação'));
    expect(screen.queryByRole('table', { name: 'Itens novos criados a partir do PROORC' })).not.toBeInTheDocument();
    expect(within(linhaDoProjeto('1111111111-APP 2')).getByText('Criar item novo')).toBeInTheDocument();
  }, 20000);

  test('"Continuar editando valores" mantém o item novo no arquivo final', async () => {
    await analisar();
    fireEvent.click(within(linhaDoProjeto('1111111111')).getByText('Criar item novo'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Criar item novo' })).getByText('Criar item'));
    fireEvent.click(screen.getByText('Revisei a tabela e confirmo as ligações'));
    fireEvent.click(screen.getByText('Gerar nova referência'));
    fireEvent.click(screen.getByText('Continuar editando valores'));

    const edicao = screen.getByRole('region', { name: 'Editar valores da referência em preparação' });
    // o item novo é proorc: não aparece entre os editáveis
    expect(within(edicao).queryByLabelText(/Extensão de 01 km de teste — material/)).not.toBeInTheDocument();
    fireEvent.change(within(edicao).getByLabelText('Tri CAA 1/0 — material'), { target: { value: '45' } });
    fireEvent.click(within(edicao).getByRole('button', { name: 'Gerar referência' }));
    const json = await baixar('Baixar biblioteca.json', within(edicao));
    const item = json.itens.find(i => i.formacao?.projeto === '1111111111');
    expect(item).toBeDefined();
    expect(item.custos['2026-10'].unitario).toBeCloseTo(1600 / 1000, 8);
    expect(item.composicoes['2026-10'].materiais).toHaveLength(2);
    expect(json.mapeamentoProorc['1111111111'].item).toBe(item.id);
  }, 20000);
});
