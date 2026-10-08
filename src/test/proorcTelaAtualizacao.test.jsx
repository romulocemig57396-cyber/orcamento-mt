import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AtualizarProorc from '../components/AtualizarProorc';

/* Fluxo completo da tela com os relatórios reais: carregar os três arquivos,
   analisar, ver a prévia, gerar a referência e baixar o arquivo.             */

const PASTA = resolve(__dirname, '../../docs/proorc');
const NOMES = [
  'rptOrcamentoGeralSinteticoPorProjetoCemig.xlsx',
  'rptOrcamentoGeralAnalitico.xlsx',
  'rptOrcamentoServicosContratados.xlsx',
];
const temTodos = NOMES.every(n => existsSync(resolve(PASTA, n)));

// jsdom não implementa File.arrayBuffer em toda versão
const arquivoFalso = (nome) => {
  const bytes = readFileSync(resolve(PASTA, nome));
  const file = new File([bytes], nome, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  file.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return file;
};

const carregarTodos = async (container) => {
  const inputs = container.querySelectorAll('input[type=file]');
  expect(inputs).toHaveLength(3);
  NOMES.forEach((nome, i) => fireEvent.change(inputs[i], { target: { files: [arquivoFalso(nome)] } }));
  await waitFor(() => expect(screen.getByText('Analisar relatórios')).not.toBeDisabled());
};

afterEach(() => vi.restoreAllMocks());

describe.skipIf(!temTodos)('Etapa 3 — tela de atualização com os relatórios reais', () => {
  test('carrega os três arquivos e habilita a análise', async () => {
    const { container } = render(<AtualizarProorc />);
    await carregarTodos(container);
    NOMES.forEach(nome => expect(screen.getByText(`✓ ${nome}`)).toBeInTheDocument());
  });

  test('a análise mostra projetos, preços da US e os avisos', async () => {
    const { container } = render(<AtualizarProorc />);
    await carregarTodos(container);
    fireEvent.click(screen.getByText('Analisar relatórios'));

    await waitFor(() => expect(screen.getByText(/16 projetos · data de referência 07\/10\/2026/)).toBeInTheDocument());
    expect(screen.getByText('R$ 2.823,98')).toBeInTheDocument();
    expect(screen.getByText('R$ 82,73')).toBeInTheDocument();
    expect(screen.getByText('R$ 3.272.874,43')).toBeInTheDocument();
    expect(screen.getByText('2 avisos na leitura')).toBeInTheDocument();
    expect(screen.getByText(/9988776654 não tem serviços contratados/)).toBeInTheDocument();
  });

  test('a prévia traz os valores novos e os selos', async () => {
    const { container } = render(<AtualizarProorc />);
    await carregarTodos(container);
    fireEvent.click(screen.getByText('Analisar relatórios'));
    await waitFor(() => expect(screen.getByText('Prévia da nova referência')).toBeInTheDocument());

    expect(screen.getByText('Todos (70)')).toBeInTheDocument();
    expect(screen.getByText('Não atualizados (26)')).toBeInTheDocument();
    expect(screen.getByText('Em verificação (7)')).toBeInTheDocument();

    // RDP 150 Dupla Camada: 10,02861 por poste
    const linha = screen.getByText('RDP 150 Dupla Camada').closest('tr');
    expect(within(linha).getByText('Projeto 1000456789 do PROORC, dividido por 25 unidades')).toBeInTheDocument();
    // O unitário não muda nesta importação, então aparece nas duas colunas
    expect(within(linha).getAllByText('10,02861')).toHaveLength(2);

    // Item em verificação mostra a nota do responsável
    const retirada = screen.getByText('1 Km de RDP 3ᴓ 50 a 150mm²').closest('tr');
    expect(within(retirada).getByText('Em verificação')).toBeInTheDocument();
    expect(within(retirada).getByText('12,00')).toBeInTheDocument();      // valor atual
    expect(within(retirada).getByText('28,90626')).toBeInTheDocument();   // recalculado
    expect(within(retirada).getByText(/Unitário 12 digitado por cima da fórmula/)).toBeInTheDocument();
  });

  test('o filtro de não atualizados mostra o motivo da cópia', async () => {
    const { container } = render(<AtualizarProorc />);
    await carregarTodos(container);
    fireEvent.click(screen.getByText('Analisar relatórios'));
    await waitFor(() => expect(screen.getByText('Prévia da nova referência')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Não atualizados (26)'));
    expect(screen.getAllByText(/Não atualizado — mantém o valor de 2024 \(Atual\)/).length).toBeGreaterThan(20);
  });

  test('gerar exige a confirmação das ligações e depois oferece o download', async () => {
    const { container } = render(<AtualizarProorc />);
    await carregarTodos(container);
    fireEvent.click(screen.getByText('Analisar relatórios'));
    await waitFor(() => expect(screen.getByText('Criar a referência')).toBeInTheDocument());

    // A chave e o rótulo vêm sugeridos da data do relatório
    expect(screen.getByDisplayValue('2026-10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026 — PROORC 07/10/2026')).toBeInTheDocument();

    expect(screen.getByText('Gerar nova referência')).toBeDisabled();
    fireEvent.click(screen.getByText('Revisei a tabela e confirmo as ligações'));
    expect(screen.getByText('Gerar nova referência')).not.toBeDisabled();

    fireEvent.click(screen.getByText('Gerar nova referência'));
    expect(screen.getByText('Referência 2026-10 criada em memória')).toBeInTheDocument();
    expect(screen.getByText('44 itens calculados do PROORC ou das fórmulas')).toBeInTheDocument();
    expect(screen.getByText('26 itens copiados de 2024 (Atual)')).toBeInTheDocument();
    expect(screen.getByText('16 composições gravadas')).toBeInTheDocument();
    expect(screen.getByText('169 materiais no catálogo')).toBeInTheDocument();

    // O download entrega um JSON com a nova referência na frente
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const criarUrl = vi.fn(() => 'blob:fake');
    global.URL.createObjectURL = criarUrl;
    global.URL.revokeObjectURL = vi.fn();
    fireEvent.click(screen.getByText('Baixar biblioteca.json'));
    expect(clique).toHaveBeenCalled();
    expect(criarUrl).toHaveBeenCalledTimes(1);
    const blob = criarUrl.mock.calls[0][0];
    const texto = await blob.text();
    const json = JSON.parse(texto);
    expect(json.referencias[0]).toMatchObject({ chave: '2026-10', atual: true });
    expect(json.referencias.map(r => r.chave)).toEqual(['2026-10', '2024', '2022', '2021']);
    expect(json.itens.find(i => i.id === 'equip_brt_76').custos['2026-10'].unitario).toBeCloseTo(186.97615, 5);
  });

  test('manter o valor anterior de um item aparece na prévia', async () => {
    const { container } = render(<AtualizarProorc />);
    await carregarTodos(container);
    fireEvent.click(screen.getByText('Analisar relatórios'));
    await waitFor(() => expect(screen.getByText('Prévia da nova referência')).toBeInTheDocument());

    const linha = screen.getByText('1 Km de RDP 3ᴓ 50 a 150mm²').closest('tr');
    fireEvent.change(within(linha).getByRole('combobox'), { target: { value: 'anterior' } });

    // Mantido o valor anterior, as colunas "2024" e "Nova" passam a mostrar 12,00
    const depois = screen.getByText('1 Km de RDP 3ᴓ 50 a 150mm²').closest('tr');
    expect(within(depois).getAllByText('12,00')).toHaveLength(2);
    expect(within(depois).queryByText('28,90626')).not.toBeInTheDocument();
  });
});
