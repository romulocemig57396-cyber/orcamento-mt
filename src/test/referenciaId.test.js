import { describe, test, expect } from 'vitest';
import { analisarTexto, criarItemObraImportado, OPCOES_BIBLIOTECA } from '../components/Importacao';
import { gerarMemorialDescritivo } from '../utils/gerarTexto';
import { migrarOrcamento } from '../utils/migracao';

const TEXTO_RECON = `Obras de Média Tensão (MT):
Obras de responsabilidade do interessado
- Modificação de RDR para CAA 1/0. 2 km coordenada pelo interessado.`;

const dadosMemorial = (itensObra) => ({
  cliente: 'EMPRESA TESTE', tipoAtendimento: 'LN', demandaFutura: 300, cargaAtual: 0,
  tensaoKv: '13.8', localUnidade: 'Fazenda Modelo', municipio: 'Belo Horizonte',
  observacoes: '', itensObra,
});

describe('A1 + E4 — itens da biblioteca referenciados por id', () => {
  test('modificação de RDR para CAA 1/0 → recondutoramento recon_caa4_1_0', () => {
    const { itens } = analisarTexto(TEXTO_RECON);
    const item = itens.find(i => !i.retiradaPendente);
    expect(item.tipoSelecionado).toBe('recon_caa4_1_0');
  });

  test('item importado usa o preço do recondutoramento: 2 × 102,7272 × 1000 = R$ 205.454,40', () => {
    const { itens } = analisarTexto(TEXTO_RECON);
    const item = criarItemObraImportado(itens.find(i => !i.retiradaPendente), 1);
    expect(item.itemOrigem).toBe('recon_caa4_1_0');
    expect(item.valor).toBeCloseTo(205454.40, 2);
  });

  test('regras de recondutoramento RDR apontam para os ids de recondutoramento', () => {
    const tipoDe = (linha) => analisarTexto(`Obras de responsabilidade do interessado\n- ${linha}`)
      .itens.find(i => !i.retiradaPendente).tipoSelecionado;
    expect(tipoDe('Modificação de RDR para CAA 336. 1 km')).toBe('recon_caa2_336');
    expect(tipoDe('Modificação de RDR para CAA 4/0. 1 km')).toBe('recon_caa2_4_0');
    expect(tipoDe('Modificação de RDR para CAA 2. 1 km')).toBe('conv_caa2_2');
  });

  test('memorial do recondutoramento diz "modificação ... CAA 4 para CAA 1/0"', () => {
    const texto = gerarMemorialDescritivo(dadosMemorial([
      { descricao: 'CAA 4 p/ 1/0', itemOrigem: 'recon_caa4_1_0', quantidade: 2, unidade: 'km', categoria: 'pp' },
    ]));
    expect(texto).toContain('modificação de 2,00 km de rede rural trifásica CAA 4 para CAA 1/0');
  });

  test('memorial da conversão continua "conversão ... monofásica para trifásica CAA 1/0"', () => {
    const texto = gerarMemorialDescritivo(dadosMemorial([
      { descricao: 'CAA 4 p/ 1/0', itemOrigem: 'conv_caa4_1_0', quantidade: 2, unidade: 'km', categoria: 'pp' },
    ]));
    expect(texto).toContain('conversão de 2,00 km de rede monofásica para trifásica CAA 1/0');
  });

  test('conversão CAA 2 p/ 4/0 não sai como modificação', () => {
    const texto = gerarMemorialDescritivo(dadosMemorial([
      { descricao: 'CAA 2 p/ 4/0', itemOrigem: 'conv_caa2_4_0', quantidade: 1, unidade: 'km', categoria: 'pp' },
    ]));
    expect(texto).toContain('conversão de 1,00 km de rede monofásica para trifásica CAA 4/0');
  });

  test('conversão e recondutoramento do mesmo tipo não são agrupados juntos', () => {
    const texto = gerarMemorialDescritivo(dadosMemorial([
      { descricao: 'CAA 4 p/ 1/0', itemOrigem: 'conv_caa4_1_0', quantidade: 1, unidade: 'km', categoria: 'pp' },
      { descricao: 'CAA 4 p/ 1/0', itemOrigem: 'recon_caa4_1_0', quantidade: 2, unidade: 'km', categoria: 'pp' },
    ]));
    expect(texto).toContain('conversão de 1,00 km');
    expect(texto).toContain('modificação de 2,00 km');
  });

  test('item manual sem itemOrigem continua usando a descrição', () => {
    const texto = gerarMemorialDescritivo(dadosMemorial([
      { descricao: 'Tri CAA 336,4', quantidade: 1, unidade: 'km', categoria: 'pp' },
    ]));
    expect(texto).toContain('construção de 1,00 km de rede rural trifásica CAA 336,4');
  });

  test('lista da importação mostra as duas versões, com categoria › subcategoria', () => {
    const conv = OPCOES_BIBLIOTECA.find(o => o.id === 'conv_caa4_1_0');
    const recon = OPCOES_BIBLIOTECA.find(o => o.id === 'recon_caa4_1_0');
    expect(conv.label).toBe('CAA 4 p/ 1/0 — Conversão Mono→Tri › Rural');
    expect(recon.label).toBe('CAA 4 p/ 1/0 — Recondutoramento › Rural');
    expect(OPCOES_BIBLIOTECA.filter(o => o.id.startsWith('deriv_') && /aéreo/.test(o.label))).toHaveLength(2);
  });

  test('migração: tipoSelecionado antigo (texto) vira id, usando a regra do texto original', () => {
    const migrado = migrarOrcamento({
      importacao: {
        itensDetectados: [
          { textoOriginal: 'Modificação de RDR para CAA 1/0. 2 km', tipoSelecionado: 'CAA 4 p/ 1/0' },
          { textoOriginal: 'Construção de RDR 3#170mm² 336MCM. 1 km', tipoSelecionado: 'Tri CAA 336,4' },
          { textoOriginal: 'Algo', tipoSelecionado: '1 Km de RDP 3ᴓ 50 a 150mm²', retiradaPendente: true },
          { textoOriginal: 'Algo', tipoSelecionado: '' },
          { textoOriginal: 'Algo', tipoSelecionado: 'recon_caa2_336' },
        ],
      },
    });
    expect(migrado.importacao.itensDetectados.map(i => i.tipoSelecionado)).toEqual([
      'recon_caa4_1_0', 'ext_rural_tri_caa336', 'rede_ret_rdp_3f_50_150', '', 'recon_caa2_336',
    ]);
  });
});
