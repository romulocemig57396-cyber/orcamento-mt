import { describe, test, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lerSintetico } from '../proorc/lerSintetico';
import { lerAnalitico } from '../proorc/lerAnalitico';
import { lerServicos } from '../proorc/lerServicos';
import { consolidarProorc } from '../proorc/consolidar';
import { calcularNovaReferencia, variacaoPercentual, indexarMapeamento } from '../proorc/calcularReferencia';
import { aplicarNovaReferencia, serializarBiblioteca } from '../proorc/gerarBibliotecaJson';
import { BIBLIOTECA } from '../data/biblioteca';

const PASTA = resolve(__dirname, '../../docs/proorc');
const ARQUIVOS = {
  sintetico: 'rptOrcamentoGeralSinteticoPorProjetoCemig.xlsx',
  analitico: 'rptOrcamentoGeralAnalitico.xlsx',
  servicos: 'rptOrcamentoServicosContratados.xlsx',
};
const caminho = (nome) => resolve(PASTA, nome);
const temTodos = Object.values(ARQUIVOS).every(nome => existsSync(caminho(nome)));

const consolidar = () => consolidarProorc({
  sintetico: lerSintetico(readFileSync(caminho(ARQUIVOS.sintetico))),
  analitico: lerAnalitico(readFileSync(caminho(ARQUIVOS.analitico))),
  servicos: lerServicos(readFileSync(caminho(ARQUIVOS.servicos))),
});

const calcular = (extra = {}) => calcularNovaReferencia({
  biblioteca: BIBLIOTECA,
  consolidado: consolidar(),
  chaveAnterior: '2024',
  ...extra,
});

describe('Etapa 3 — variação e mapeamento', () => {
  test('variação percentual do unitário', () => {
    expect(variacaoPercentual(100, 110)).toBeCloseTo(10, 6);
    expect(variacaoPercentual(100, 50)).toBeCloseTo(-50, 6);
    expect(variacaoPercentual(0, 0)).toBe(0);
    expect(variacaoPercentual(0, 10)).toBeNull();
  });

  test('o mapeamento é indexado nos dois sentidos', () => {
    const { porItem, porProjeto } = indexarMapeamento(BIBLIOTECA.mapeamentoProorc);
    expect(porItem.ext_urbano_rdp150_dupla).toMatchObject({ projeto: '1000456789', unidadesPorProjeto: 25 });
    expect(porProjeto['1207191220-APP 3'].item).toBe('equip_relig_tri_24kv_urbano');
  });
});

/* O cálculo fica em beforeAll, e não no corpo do describe: o corpo roda mesmo
   quando `skipIf` pula os testes, e aí a falta dos arquivos quebraria a coleta. */
describe.skipIf(!temTodos)('Etapa 3 — nova referência com os relatórios de 07/10/2026', () => {
  let r;
  const linha = (id) => r.previa.find(l => l.id === id);
  const custo = (id) => r.custos[id];

  beforeAll(() => { r = calcular(); });

  test('os 70 itens entram na prévia', () => {
    expect(r.previa).toHaveLength(70);
    expect(Object.keys(r.custos)).toHaveLength(70);
  });

  test('preços da US e catálogo vêm do relatório', () => {
    expect(r.precosUS).toEqual({ construcao: 2823.98, projeto: 82.73 });
    expect(Object.keys(r.catalogoMateriais)).toHaveLength(169);
  });

  // ── Aceites do prompt ──────────────────────────────────────────────────────
  test('equip_brt_76 = 186,97615', () => {
    expect(custo('equip_brt_76').unitario).toBeCloseTo(186.97615, 5);
  });

  test('ext_urbano_rdp150_dupla = 10,0286076 por poste', () => {
    expect(custo('ext_urbano_rdp150_dupla').unitario).toBeCloseTo(10.0286076, 7);
  });

  test('equip_relig_tri_24kv_urbano = 63,8299', () => {
    expect(custo('equip_relig_tri_24kv_urbano').unitario).toBeCloseTo(63.8299, 5);
  });

  test('equip_bcap_600_auto = 45,05843', () => {
    expect(custo('equip_bcap_600_auto').unitario).toBeCloseTo(45.05843, 5);
  });

  test('equip_pt_5mva: material 832,45148, mão de obra 166,4903, unitário 998,94178 (igual ao atual)', () => {
    const c = custo('equip_pt_5mva');
    expect(c.material).toBeCloseTo(832.45148, 5);
    expect(c.maoObra).toBeCloseTo(166.4903, 4);
    expect(c.unitario).toBeCloseTo(998.94178, 5);
    expect(c.unitario).toBeCloseTo(linha('equip_pt_5mva').anterior.unitario, 4);
  });

  test('equip_pt_2_5mva = 430,1336 (igual ao atual)', () => {
    expect(custo('equip_pt_2_5mva').unitario).toBeCloseTo(430.1336, 4);
    expect(custo('equip_pt_2_5mva').unitario).toBeCloseTo(linha('equip_pt_2_5mva').anterior.unitario, 4);
  });

  test('recon_urb_rdp150_dupla = 6,90163 + 1,05 × 3,12698 = 10,184959 (igual ao atual)', () => {
    // O valor novo sai dos relatórios sem o arredondamento de 5 casas que a
    // planilha de 2024 trazia, então fecha até o sexto decimal de R$ mil.
    expect(custo('recon_urb_rdp150_dupla').unitario).toBeCloseTo(10.184959, 5);
    expect(custo('recon_urb_rdp150_dupla').material).toBeCloseTo(6.90163, 5);
    expect(custo('recon_urb_rdp150_dupla').maoObra).toBeCloseTo(1.05 * 3.12698, 5);
  });

  test('rede_ret_rdp_3f_50_150 = 28,906, igual à referência anterior desde a decisão R1', () => {
    expect(custo('rede_ret_rdp_3f_50_150').unitario).toBeCloseTo(28.906259, 5);
    expect(linha('rede_ret_rdp_3f_50_150').emVerificacao).toBe(false);
    expect(linha('rede_ret_rdp_3f_50_150').anterior.unitario).toBe(28.906259280000004);
  });

  test('itens de fórmula rurais ficam iguais aos atuais, porque as bases não mudaram', () => {
    const rurais = r.previa.filter(l => l.regra === 'redeExistenteMaisNova');
    expect(rurais).toHaveLength(15);
    rurais.forEach(l => {
      expect(l.efetivo.unitario, l.id).toBeCloseTo(l.anterior.unitario, 4);
      expect(l.motivo, l.id).toBe('Bases sem mudança nesta importação');
    });
  });

  test('itens do PROORC sem relatório e itens fixos são copiados, com aviso', () => {
    const naoAtualizados = r.previa.filter(l => l.naoAtualizado).map(l => l.id);
    // 1 item proorc sem projeto + 3 aguardando relatório + 12 fixos + 5 tod + 5 manuais
    expect(naoAtualizados).toHaveLength(26);
    ['ext_rural_mono_caa2', 'ext_rural_tri_caa336', 'equip_brt_250_rural', 'equip_brt_250_urbano',
      'equip_bcap_600_fixo', 'equip_bcap_300_fixo', 'sub_22kv', 'deriv_rdu_ramal_sub']
      .forEach(id => expect(naoAtualizados, id).toContain(id));
    naoAtualizados.forEach(id => {
      const l = linha(id);
      expect(l.efetivo, id).toEqual(l.anterior);
    });
  });

  test('os três projetos que aguardavam relatório explicam o motivo', () => {
    ['equip_brt_250_rural', 'equip_brt_250_urbano', 'equip_bcap_600_fixo'].forEach(id => {
      expect(linha(id).motivo, id).toMatch(/não veio neste relatório/);
    });
  });

  test('as referências 2024, 2022 e 2021 não são tocadas', () => {
    expect(BIBLIOTECA.referencias.map(x => x.chave)).toEqual(['2024', '2022', '2021']);
    expect(BIBLIOTECA.itens.find(i => i.id === 'equip_brt_76').custos['2024'].unitario).toBeCloseTo(186.97615, 5);
    expect(BIBLIOTECA.itens.find(i => i.id === 'rede_ret_rdp_3f_50_150').custos['2024'].unitario).toBe(28.906259280000004);
  });

  test('a composição é gravada só nos 16 itens ligados a um projeto', () => {
    expect(Object.keys(r.composicoes)).toHaveLength(16);
    const c = r.composicoes.ext_urbano_rdp150_dupla;
    expect(c.projeto).toBe('1000456789');
    expect(c.materiais).toHaveLength(43);
    expect(c.total).toBeCloseTo(250715.19, 2);
    expect(c.unidadesPorProjeto).toBe(25);
    expect(c.dataReferencia).toBe('07/10/2026');
    expect(c.servicos.map(s => s.grupo)).toEqual(['construcao', 'projeto']);
  });

  test('a composição do PT guarda o religador adicional e o percentual', () => {
    expect(r.composicoes.equip_pt_5mva).toMatchObject({ religadorAdicional: 88142.9, percentualMaoObra: 0.2 });
    expect(r.composicoes.equip_pt_5mva.servicos).toEqual([]);
  });

  test('a US de construção passa a vir do relatório, não da divisão da mão de obra', () => {
    // 26,95 US do projeto ÷ 25 postes
    expect(custo('ext_urbano_rdp150_dupla').usConstr).toBeCloseTo(26.95 / 25, 6);
    // o valor antigo era mão de obra ÷ preço da US, que incluía a US de projeto
    expect(linha('ext_urbano_rdp150_dupla').anterior.usConstr).toBeCloseTo(1.107295, 5);
  });

  test('o resumo conta atualizados, copiados e em verificação', () => {
    expect(r.resumo).toMatchObject({ total: 70, atualizados: 44, naoAtualizados: 26, emVerificacao: 2, mantidos: 0 });
  });

  test('nenhum projeto do relatório fica sem uso', () => {
    expect(r.projetosNaoUsados).toEqual([]);
  });

  test('os motivos aparecem em português, por origem', () => {
    expect(linha('ext_urbano_rdp150_dupla').motivo).toBe('Projeto 1000456789 do PROORC, dividido por 25 unidades');
    expect(linha('equip_relig_tri_24kv_urbano').motivo).toBe('Projeto 1207191220-APP 3 do PROORC');
    expect(linha('equip_pt_5mva').motivo).toMatch(/religador adicional de R\$ 88.142,90 e 20% de mão de obra/);
    expect(linha('rede_ret_rdr_1f_4_1_0').motivo).toBe('5,466 US × R$ 2.823,98 (preço da US do relatório)');
    expect(linha('sub_22kv').motivo).toMatch(/Valor digitado/);
  });

  test('itens em verificação com preço novo do PROORC mostram a variação', () => {
    const brt = linha('equip_brt_167_urbano');
    expect(brt.emVerificacao).toBe(true);
    expect(brt.recalculado.unitario).toBeCloseTo(291.93376, 5);
    expect(brt.variacao).toBeLessThan(0);
    const relig = linha('equip_relig_tri_36kv');
    expect(relig.recalculado.unitario).toBeCloseTo(93.95449, 5);
    expect(relig.anterior.unitario).toBeCloseTo(126.61692, 5);
  });
});

describe.skipIf(!temTodos)('Etapa 3 — escolha item a item', () => {
  test('manter o valor anterior de uma base arrasta os itens de fórmula', () => {
    const semEscolha = calcular();
    // O preço do religador 36 kV caiu; mantendo o anterior, o item fica igual
    const comEscolha = calcular({ escolhas: { equip_relig_tri_36kv: 'anterior' } });
    expect(semEscolha.custos.equip_relig_tri_36kv.unitario).toBeCloseTo(93.95449, 5);
    expect(comEscolha.custos.equip_relig_tri_36kv.unitario).toBeCloseTo(126.61692, 5);
    expect(comEscolha.previa.find(l => l.id === 'equip_relig_tri_36kv').escolha).toBe('anterior');
    expect(comEscolha.resumo.mantidos).toBe(1);
  });

  test('mantendo uma extensão urbana, o recondutoramento que depende dela acompanha', () => {
    const r = calcular({ escolhas: { ext_urbano_rdp150_dupla: 'anterior' } });
    const base = r.custos.ext_urbano_rdp150_dupla;
    const dependente = r.custos.recon_urb_rdp150_dupla;
    expect(base.material).toBeCloseTo(6.90163, 5);
    expect(dependente.material).toBeCloseTo(base.material, 6);
    expect(dependente.maoObra).toBeCloseTo(base.maoObra * 1.05, 6);
  });

  test('tirar a ligação de um projeto deixa o item sem atualizar', () => {
    const mapeamento = { ...BIBLIOTECA.mapeamentoProorc };
    delete mapeamento['2003202424-APP 21'];
    const r = calcular({ mapeamento });
    const l = r.previa.find(x => x.id === 'equip_brt_76');
    expect(l.naoAtualizado).toBe(true);
    expect(l.motivo).toMatch(/ainda não exportado/);
    expect(r.projetosNaoUsados.map(p => p.chave)).toEqual(['2003202424-APP 21']);
  });
});

describe.skipIf(!temTodos)('Etapa 3 — geração do biblioteca.json', () => {
  const gerar = (opcoes = {}) => aplicarNovaReferencia({
    biblioteca: BIBLIOTECA,
    resultado: calcular(),
    chave: '2026-10',
    rotulo: '2026 — PROORC 07/10/2026',
    fonte: 'PROORC, relatórios de 07/10/2026',
    ...opcoes,
  });

  test('a nova referência entra na frente e passa a ser a atual', () => {
    const nova = gerar();
    expect(nova.referencias.map(r => r.chave)).toEqual(['2026-10', '2024', '2022', '2021']);
    expect(nova.referencias[0]).toMatchObject({ atual: true, rotulo: '2026 — PROORC 07/10/2026' });
    expect(nova.referencias.filter(r => r.atual)).toHaveLength(1);
  });

  test('pode ser gerada sem virar a atual', () => {
    const nova = gerar({ atual: false });
    expect(nova.referencias.find(r => r.chave === '2026-10').atual).toBe(false);
    expect(nova.referencias.find(r => r.chave === '2024').atual).toBe(true);
  });

  test('cada item ganha o bloco de custos da nova referência, sem perder os antigos', () => {
    const nova = gerar();
    expect(nova.itens).toHaveLength(70);
    nova.itens.forEach(i => {
      expect(Object.keys(i.custos).sort(), i.id).toEqual(['2021', '2022', '2024', '2026-10']);
    });
    const brt = nova.itens.find(i => i.id === 'equip_brt_76');
    expect(brt.custos['2026-10'].unitario).toBeCloseTo(186.97615, 5);
    expect(brt.custos['2024'].unitario).toBeCloseTo(186.97615, 5);
  });

  test('os itens copiados ficam marcados como não atualizados pelo PROORC', () => {
    const nova = gerar();
    const fixo = nova.itens.find(i => i.id === 'sub_22kv');
    expect(fixo.custos['2026-10'].naoAtualizadoPeloProorc).toBe(true);
    const calculado = nova.itens.find(i => i.id === 'equip_brt_76');
    expect(calculado.custos['2026-10'].naoAtualizadoPeloProorc).toBeUndefined();
  });

  test('preços da US, catálogo e composições são gravados na nova referência', () => {
    const nova = gerar();
    expect(nova.precosUS['2026-10']).toEqual({ construcao: 2823.98, projeto: 82.73 });
    expect(Object.keys(nova.catalogoMateriais['2026-10'])).toHaveLength(169);
    const item = nova.itens.find(i => i.id === 'ext_urbano_rdp150_dupla');
    expect(item.composicoes['2026-10'].materiais).toHaveLength(43);
    expect(nova.itens.find(i => i.id === 'sub_22kv').composicoes['2026-10']).toBeUndefined();
  });

  test('recusa chave repetida ou vazia', () => {
    expect(() => gerar({ chave: '2024' })).toThrow(/já existe/);
    expect(() => gerar({ chave: '  ' })).toThrow(/Informe a chave/);
  });

  test('a serialização é estável e termina com uma linha nova', () => {
    const nova = gerar();
    const texto = serializarBiblioteca(nova);
    expect(texto).toBe(serializarBiblioteca(gerar()));
    expect(texto.endsWith('\n')).toBe(true);
    expect(JSON.parse(texto).referencias[0].chave).toBe('2026-10');
    expect(texto.split('\n')[1]).toBe('  "versao": 1,');
  });

  test('o objeto original da biblioteca não é alterado', () => {
    const antes = JSON.stringify(BIBLIOTECA);
    gerar();
    expect(JSON.stringify(BIBLIOTECA)).toBe(antes);
  });
});
