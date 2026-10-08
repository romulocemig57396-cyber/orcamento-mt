import { describe, test, expect } from 'vitest';
import { BIBLIOTECA, getItemById, custosDaReferencia } from '../data/biblioteca';
import { calcularNovaReferencia } from '../proorc/calcularReferencia';
import { explicarFormacao } from '../proorc/explicarFormacao';
import { ORIGENS } from '../proorc/formacao';

const SECAO = '11. Expansão de Rede de Distribuição Rural Primária';

// Tabela da TOD dez/2024, seção 11, em R$/km (a biblioteca está em R$ mil)
const TOD = [
  ['ext_rural_mono_caa2', 'Rede rural monofásica cabo 2 AWG CAA em poste duplo T', 23389.40, 26967.41],
  ['ext_rural_tri_caa2', 'Rede rural trifásica cabo 2 AWG CAA em poste duplo T', 33001.66, 38319.81],
  ['ext_rural_tri_caa1_0', 'Rede rural trifásica cabo 1/0 AWG CAA em poste duplo T', 41667.09, 38319.81],
  ['ext_rural_tri_caa4_0', 'Rede rural trifásica cabo 4/0 AWG CAA em poste duplo T', 77825.10, 49418.05],
  ['ext_rural_tri_caa336', 'Rede rural trifásica cabo 336 AWG CAA em poste duplo T', 99005.56, 49418.05],
];

describe('R6 — extensões rurais da TOD dez/2024', () => {
  test.each(TOD)('%s bate com a TOD (tolerância 0,00001 R$ mil)', (id, descricao, material, maoObra) => {
    const c = custosDaReferencia(getItemById(id), '2024');
    expect(Math.abs(c.material - material / 1000)).toBeLessThan(0.00001);
    expect(Math.abs(c.maoObra - maoObra / 1000)).toBeLessThan(0.00001);
    expect(Math.abs(c.unitario - (material + maoObra) / 1000)).toBeLessThan(0.00001);
  });

  test.each(TOD)('%s tem origem tod com a descrição da tabela', (id, descricao) => {
    expect(getItemById(id).formacao).toEqual({
      origem: 'tod', fonte: 'TOD dez/2024', secao: SECAO, descricaoTod: descricao, unidadeTod: 'R$/km',
    });
  });
});

describe('R6 — itens calculados manualmente e fixos', () => {
  test('Mono CAA 4 e Tri CAA 4: manuais, base de fórmulas', () => {
    ['ext_rural_mono_caa4', 'ext_rural_tri_caa4'].forEach(id => {
      expect(getItemById(id).formacao, id).toEqual({
        origem: 'manual',
        motivo: 'Calculado manualmente; não consta da TOD. Base de 6 itens de fórmula (conversões e recondutoramentos CAA 4 p/…).',
      });
    });
  });

  test('as 3 derivações: manuais', () => {
    ['deriv_rdu_ramal_sub', 'deriv_rdu_ramal_aereo', 'deriv_rdr_ramal_aereo'].forEach(id => {
      expect(getItemById(id).formacao, id).toEqual({ origem: 'manual', motivo: 'Calculado manualmente.' });
    });
  });

  test('relocação (5) e Seção 22,0 kV continuam fixos, com a fonte em verificação', () => {
    ['equip_reloc_brt_1_0', 'equip_reloc_brt_4_0_336', 'equip_reloc_brt_4_0_sem_anc',
      'equip_reloc_relig_tri', 'equip_reloc_relig_mono', 'sub_22kv'].forEach(id => {
      expect(getItemById(id).formacao, id).toEqual({ origem: 'fixo', motivo: 'Fonte em verificação pelo responsável' });
    });
  });

  test('contagem por origem', () => {
    const porOrigem = {};
    BIBLIOTECA.itens.forEach(i => { porOrigem[i.formacao.origem] = (porOrigem[i.formacao.origem] || 0) + 1; });
    expect(porOrigem).toEqual({ proorc: 20, tod: 5, manual: 5, formula: 20, maoDeObra: 8, fixo: 12 });
  });

  test('as novas origens têm rótulo', () => {
    expect(ORIGENS.tod).toBe('TOD — Tabela de Orçamento da Distribuição');
    expect(ORIGENS.manual).toBe('Calculado manualmente');
  });
});

describe('R6 — nova referência pelo PROORC copia tod e manual', () => {
  const consolidado = { projetos: [], precosUS: { construcao: 2823.98, projeto: 82.73 }, catalogoMateriais: {}, dataReferencia: '07/10/2026' };
  const r = calcularNovaReferencia({ biblioteca: BIBLIOTECA, consolidado, chaveAnterior: '2024' });
  const linha = (id) => r.previa.find(l => l.id === id);

  test('itens tod e manual são copiados, nunca procurados no PROORC', () => {
    BIBLIOTECA.itens.filter(i => ['tod', 'manual'].includes(i.formacao.origem)).forEach(i => {
      expect(r.custos[i.id], i.id).toEqual(custosDaReferencia(i, '2024'));
      expect(linha(i.id).naoAtualizado, i.id).toBe(true);
      expect(linha(i.id).motivo, i.id).not.toMatch(/exportado|Projeto-padrão/);
    });
    expect(linha('ext_rural_tri_caa336').motivo).toBe('TOD dez/2024 — não vem do PROORC; mantém o valor da referência anterior');
    expect(linha('deriv_rdu_ramal_sub').motivo).toBe('Calculado manualmente — mantém o valor da referência anterior');
  });

  test('todas as fórmulas resolvem, porque as bases tod e manual existem', () => {
    expect(r.previa).toHaveLength(70);
    r.previa.filter(l => l.origem === 'formula').forEach(l => {
      expect(l.motivo, l.id).not.toMatch(/Não foi possível recalcular/);
    });
    expect(r.custos.recon_caa4_1_0.unitario).toBeCloseTo(102.7272, 4);
  });
});

describe('R6 — composição', () => {
  test('tod: fonte, seção, descrição e a divisão material + mão de obra', () => {
    const d = explicarFormacao(getItemById('ext_rural_tri_caa1_0'), '2024');
    expect(d.disponivel).toBe(true);
    expect(d.conta).toBe(
      'TOD dez/2024 — seção 11 — Rede rural trifásica cabo 1/0 AWG CAA em poste duplo T: '
      + 'material R$ 41.667,09 + mão de obra R$ 38.319,81 '
      + '(inclui mão de obra própria, serviços de terceiros e taxa de administração)');
    expect(d.mensagem).toBeUndefined();
  });

  test('manual: "Calculado manualmente" e o motivo', () => {
    const d = explicarFormacao(getItemById('deriv_rdu_ramal_sub'), '2024');
    expect(d.disponivel).toBe(false);
    expect(d.mensagem).toBe('Calculado manualmente.');
    const tri4 = explicarFormacao(getItemById('ext_rural_tri_caa4'), '2024');
    expect(tri4.mensagem).toBe('Calculado manualmente; não consta da TOD. Base de 6 itens de fórmula (conversões e recondutoramentos CAA 4 p/…).');
    // motivo que não começa por "Calculado manualmente" ganha o prefixo
    const outro = { ...getItemById('deriv_rdu_ramal_sub'), formacao: { origem: 'manual', motivo: 'Planilha do responsável.' } };
    expect(explicarFormacao(outro, '2024').mensagem).toBe('Calculado manualmente. Planilha do responsável.');
  });

  test('nenhuma extensão rural fala em projeto não exportado do PROORC', () => {
    BIBLIOTECA.itens.filter(i => i.categoria === 'Extensão' && i.subcategoria === 'Rural').forEach(i => {
      expect(JSON.stringify(i.formacao), i.id).not.toMatch(/PROORC/);
      expect(JSON.stringify(explicarFormacao(getItemById(i.id), '2024')), i.id).not.toMatch(/exportado do PROORC/);
    });
  });
});
