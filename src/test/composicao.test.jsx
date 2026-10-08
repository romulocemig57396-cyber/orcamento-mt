import { describe, test, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { explicarFormacao, subtotaisPorClasse } from '../proorc/explicarFormacao';
import { getItemById, BIBLIOTECA } from '../data/biblioteca';
import { lerSintetico } from '../proorc/lerSintetico';
import { lerAnalitico } from '../proorc/lerAnalitico';
import { lerServicos } from '../proorc/lerServicos';
import { consolidarProorc } from '../proorc/consolidar';
import { calcularNovaReferencia } from '../proorc/calcularReferencia';
import { aplicarNovaReferencia } from '../proorc/gerarBibliotecaJson';
import ComposicaoModal from '../components/ComposicaoModal';
import BibliotecaCustos from '../components/BibliotecaCustos';

const PASTA = resolve(__dirname, '../../docs/proorc');
const NOMES = {
  sintetico: 'rptOrcamentoGeralSinteticoPorProjetoCemig.xlsx',
  analitico: 'rptOrcamentoGeralAnalitico.xlsx',
  servicos: 'rptOrcamentoServicosContratados.xlsx',
};
const temTodos = Object.values(NOMES).every(n => existsSync(resolve(PASTA, n)));

// Biblioteca com a referência 2026-10 já gerada, como ficará depois do commit
const comReferenciaNova = () => {
  const consolidado = consolidarProorc({
    sintetico: lerSintetico(readFileSync(resolve(PASTA, NOMES.sintetico))),
    analitico: lerAnalitico(readFileSync(resolve(PASTA, NOMES.analitico))),
    servicos: lerServicos(readFileSync(resolve(PASTA, NOMES.servicos))),
  });
  const resultado = calcularNovaReferencia({ biblioteca: BIBLIOTECA, consolidado, chaveAnterior: '2024' });
  const nova = aplicarNovaReferencia({
    biblioteca: BIBLIOTECA, resultado, chave: '2026-10',
    rotulo: '2026 — PROORC 07/10/2026', fonte: 'PROORC, relatórios de 07/10/2026',
  });
  return { nova, itemPorId: (id) => nova.itens.find(i => i.id === id), precosUS: resultado.precosUS };
};

describe('Etapa 5 — explicação sem composição na referência', () => {
  test('item fixo: avisa que não há composição e dá o motivo', () => {
    const d = explicarFormacao(getItemById('sub_22kv'), '2024');
    expect(d.disponivel).toBe(false);
    expect(d.mensagem).toMatch(/Composição não disponível para esta referência/);
    expect(d.mensagem).toMatch(/Valor digitado/);
  });

  test('item do PROORC sem composição na referência explica por quê', () => {
    expect(explicarFormacao(getItemById('ext_urbano_rdp150_dupla'), '2024').mensagem)
      .toMatch(/O projeto 1000456789 não foi importado aqui/);
    expect(explicarFormacao(getItemById('ext_rural_tri_caa336'), '2024').mensagem)
      .toMatch(/ainda não foi exportado do PROORC/);
  });

  test('item de fórmula mostra a conta mesmo sem composição importada', () => {
    const d = explicarFormacao(getItemById('recon_caa4_1_0'), '2024');
    expect(d.disponivel).toBe(true);
    expect(d.conta).toBe('0,33 × Tri CAA 4 (68,91) + Tri CAA 1/0 (79,9869) = 102,7272');
    expect(d.termos.map(t => t.id)).toEqual(['ext_rural_tri_caa4', 'ext_rural_tri_caa1_0']);
  });

  test('recondutoramento urbano mostra material e mão de obra com o fator', () => {
    const d = explicarFormacao(getItemById('recon_urb_rdp50'), '2024');
    expect(d.conta).toBe('Material de RDP 50 (3,94404) + 1,05 × mão de obra (3,12698) = 7,22737');
    expect(d.termos).toHaveLength(1);
    expect(d.termos[0]).toMatchObject({ id: 'ext_urbano_rdp50', tipo: 'RDP 50' });
    expect(d.termos[0].unitario).toBeCloseTo(7.07102, 5);
  });

  test('item de mão de obra: em 2024 o preço da US não está registrado', () => {
    const d = explicarFormacao(getItemById('rede_ret_rdr_3f_4_0_336'), '2024');
    expect(d.disponivel).toBe(true);
    expect(d.conta).toMatch(/10,236 US de construção \(preço da US não registrado nesta referência\)/);
  });

  test('com o preço da US informado, a conta aparece completa', () => {
    const d = explicarFormacao(getItemById('rede_ret_rdr_3f_4_0_336'), '2024', { precosUS: { construcao: 2823.98, projeto: 82.73 } });
    expect(d.conta).toBe('10,236 US × R$ 2.823,98 = R$ 28.906,26');
  });

  test('item em verificação carrega a nota do responsável', () => {
    expect(explicarFormacao(getItemById('rede_ret_rdp_3f_50_150'), '2024').verificacao)
      .toMatch(/Unitário 12 digitado/);
  });

  test('subtotais por classe', () => {
    expect(subtotaisPorClasse([
      { classe: 'cabo', total: 10 }, { classe: 'cabo', total: 5 },
      { classe: 'patrimonial', total: 100 }, { classe: 'consumo', total: 1 },
    ])).toEqual({ patrimonial: 100, cabo: 15, consumo: 1 });
    expect(subtotaisPorClasse([])).toEqual({ patrimonial: 0, cabo: 0, consumo: 0 });
  });
});

/* A montagem fica em beforeAll, e não no corpo do describe: o corpo roda mesmo
   quando `skipIf` pula os testes, e aí a falta dos arquivos quebraria a coleta. */
describe.skipIf(!temTodos)('Etapa 5 — composição na referência gerada pelo PROORC', () => {
  let itemPorId, precosUS;
  beforeAll(() => { ({ itemPorId, precosUS } = comReferenciaNova()); });

  test('RDP 150 Dupla Camada: 43 materiais, R$ 250.715,19 no projeto e 10,02861 por poste', () => {
    const d = explicarFormacao(itemPorId('ext_urbano_rdp150_dupla'), '2026-10');
    expect(d.disponivel).toBe(true);
    expect(d.projeto).toBe('1000456789');
    expect(d.dataReferencia).toBe('07/10/2026');
    expect(d.materiais).toHaveLength(43);
    expect(d.totalProjeto).toBeCloseTo(250715.19, 2);
    expect(d.unidadesPorProjeto).toBe(25);
    expect(d.custos.unitario).toBeCloseTo(10.0286076, 6);
    expect(d.passos.find(p => p.rotulo === 'Materiais requisitados').valor).toBe('R$ 172.540,68');
    expect(d.passos.find(p => p.rotulo === 'Serviços contratados').valor).toBe('R$ 78.174,51');
    expect(d.passos.find(p => p.rotulo === 'Total do projeto').valor).toBe('R$ 250.715,19');
    expect(d.passos.find(p => p.rotulo === 'Dividido por 25 postes').valor).toBe('÷ 25');
    expect(d.passos.at(-1)).toMatchObject({ rotulo: 'Unitário por poste (R$ mil)', valor: '10,02861' });
  });

  test('os materiais vêm classificados e com subtotais', () => {
    const d = explicarFormacao(itemPorId('ext_urbano_rdp150_dupla'), '2026-10');
    const soma = d.subtotais.patrimonial + d.subtotais.cabo + d.subtotais.consumo;
    expect(soma).toBeCloseTo(172540.68, 2);
    expect(d.subtotais.cabo).toBeGreaterThan(0);
    expect(d.materiais.every(m => ['patrimonial', 'cabo', 'consumo'].includes(m.classe))).toBe(true);
  });

  test('a mão de obra traz US de construção e de projeto', () => {
    const d = explicarFormacao(itemPorId('ext_urbano_rdp150_dupla'), '2026-10');
    expect(d.servicos).toHaveLength(2);
    expect(d.servicos[0]).toMatchObject({ grupo: 'construcao', quantidadeUS: 26.95, precoUS: 2823.98 });
    expect(d.servicos[1]).toMatchObject({ grupo: 'projeto', quantidadeUS: 25, precoUS: 82.73 });
  });

  test('Posto de Transformação: projeto + religador adicional + 20% de mão de obra', () => {
    const d = explicarFormacao(itemPorId('equip_pt_5mva'), '2026-10');
    expect(d.passos.map(p => p.rotulo)).toEqual([
      'Materiais requisitados', 'Religador adicional', 'Mão de obra (20% do material)',
      'Total do projeto', 'Unitário por ponto (R$ mil)',
    ]);
    expect(d.passos[0].valor).toBe('R$ 744.308,58');
    expect(d.passos[1].valor).toBe('R$ 88.142,90');
    expect(d.passos[2].valor).toBe('R$ 166.490,30');
    expect(d.custos.unitario).toBeCloseTo(998.94178, 5);
    expect(d.servicos).toEqual([]);
  });

  test('item de mão de obra usa o preço da US da nova referência', () => {
    const d = explicarFormacao(itemPorId('rede_ret_rdr_3f_4_0_336'), '2026-10', { precosUS });
    expect(d.conta).toBe('10,236 US × R$ 2.823,98 = R$ 28.906,26');
  });

  test('item copiado avisa que não foi atualizado', () => {
    const d = explicarFormacao(itemPorId('sub_22kv'), '2026-10');
    expect(d.naoAtualizado).toBe(true);
  });
});

describe.skipIf(!temTodos)('Etapa 5 — diálogo de composição', () => {
  let itemPorId;
  beforeAll(() => { ({ itemPorId } = comReferenciaNova()); });

  test('mostra projeto, passos, mão de obra e a tabela de materiais', () => {
    render(<ComposicaoModal item={itemPorId('ext_urbano_rdp150_dupla')} referencia="2026-10" onFechar={() => {}} />);
    expect(screen.getByText('RDP 150 Dupla Camada')).toBeInTheDocument();
    expect(screen.getByText(/Projeto-padrão do PROORC · referência 2026-10 · por poste/)).toBeInTheDocument();
    expect(screen.getByText(/Extensão de 01 km de RDP 150mm² Dupla camada/)).toBeInTheDocument();
    expect(screen.getByText('R$ 250.715,19')).toBeInTheDocument();
    expect(screen.getByText('10,02861')).toBeInTheDocument();
    expect(screen.getByText('Materiais (43)')).toBeInTheDocument();
    expect(screen.getByText('US de construção')).toBeInTheDocument();
    expect(screen.getByText('26,9500 US')).toBeInTheDocument();
  });

  test('a busca filtra os materiais', () => {
    render(<ComposicaoModal item={itemPorId('ext_urbano_rdp150_dupla')} referencia="2026-10" onFechar={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Buscar por código ou descrição'), { target: { value: 'CABO AL' } });
    const linhas = screen.getAllByText(/^CABO AL/);
    expect(linhas.length).toBeGreaterThan(0);
    expect(screen.queryByText(/PARAFUSO/)).not.toBeInTheDocument();
  });

  test('busca sem resultado avisa', () => {
    render(<ComposicaoModal item={itemPorId('ext_urbano_rdp150_dupla')} referencia="2026-10" onFechar={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Buscar por código ou descrição'), { target: { value: 'zzzz' } });
    expect(screen.getByText('Nenhum material encontrado.')).toBeInTheDocument();
  });

  test('item de fórmula tem botões para abrir as bases', () => {
    const abrir = vi.fn();
    render(<ComposicaoModal item={getItemById('recon_caa4_1_0')} referencia="2024" onFechar={() => {}} onAbrirItem={abrir} />);
    expect(screen.getByText('0,33 × Tri CAA 4 (68,91) + Tri CAA 1/0 (79,9869) = 102,7272')).toBeInTheDocument();
    fireEvent.click(screen.getByText('ver Tri CAA 1/0'));
    expect(abrir).toHaveBeenCalledWith('ext_rural_tri_caa1_0');
  });

  test('item sem composição mostra o aviso e nenhuma tabela', () => {
    render(<ComposicaoModal item={getItemById('sub_22kv')} referencia="2024" onFechar={() => {}} />);
    expect(screen.getByText(/Composição não disponível para esta referência/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Buscar por código ou descrição')).not.toBeInTheDocument();
  });

  test('fecha pelo botão', () => {
    const fechar = vi.fn();
    render(<ComposicaoModal item={getItemById('sub_22kv')} referencia="2024" onFechar={fechar} />);
    fireEvent.click(screen.getByText('Fechar'));
    expect(fechar).toHaveBeenCalled();
  });
});

describe('Etapa 5 — botão na Biblioteca', () => {
  test('cada item tem o botão Composição, que abre o diálogo', () => {
    render(<BibliotecaCustos setOrcamento={() => {}} anoReferencia="2024" setAnoReferencia={() => {}} />);
    const botoes = screen.getAllByText('Composição');
    expect(botoes).toHaveLength(70);
    fireEvent.click(botoes[0]);
    expect(screen.getByText(/referência 2024 \(Atual\)/)).toBeInTheDocument();
  });

  test('o diálogo segue a referência selecionada', () => {
    render(<BibliotecaCustos setOrcamento={() => {}} anoReferencia="2021" setAnoReferencia={() => {}} />);
    fireEvent.click(screen.getAllByText('Composição')[0]);
    expect(screen.getByText(/referência 2021/)).toBeInTheDocument();
  });
});
