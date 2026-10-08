import { describe, test, expect } from 'vitest';
import antes from './fixtures/tabelaCustos-antes-do-json.json';
import {
  TABELA_CUSTOS, BIBLIOTECA, CAMPOS_CUSTO, REFERENCIAS,
  getItemById, getValorPorAno, getItensPorCategoria, getItensPorSubcategoria,
  buscarItens, formatarValor, getCategorias, getSubcategorias,
} from '../data/biblioteca';
import * as compat from '../data/tabelaCustos';

/* O retrato `tabelaCustos-antes-do-json.json` é a tabela como estava antes de
   virar JSON. Nada nos custos pode ter mudado na migração.                   */

const CAMPOS_PLANOS = ['2024', '2022', '2021'].flatMap(ref => CAMPOS_CUSTO.map(c => c + ref));
const IDENTIDADE = ['id', 'categoria', 'subcategoria', 'tipo', 'unidade'];

/* Mudanças de valor decididas pelo responsável depois da migração. Cada uma é
   uma exceção documentada: o teste confere que o item tem exatamente o valor
   decidido, e todos os demais valores continuam iguais ao retrato antigo.   */
const EXCECOES_DOCUMENTADAS = {
  'rede_ret_rdp_3f_50_150.unitario2024': {
    valor: 28.906259280000004,
    motivo: 'Rodada 3 (R1): o unitário 12 estava errado; passa a ser a mão de obra, 10,236 US × 2,82398.',
  },
};

describe('Etapa 1 — biblioteca.json é idêntica à tabela antiga', () => {
  test('os 70 itens, na mesma ordem', () => {
    expect(antes).toHaveLength(70);
    expect(TABELA_CUSTOS).toHaveLength(70);
    expect(TABELA_CUSTOS.map(i => i.id)).toEqual(antes.map(i => i.id));
  });

  test('identificação de cada item não mudou', () => {
    TABELA_CUSTOS.forEach((item, i) => {
      IDENTIDADE.forEach(campo => expect(item[campo], `${item.id}.${campo}`).toBe(antes[i][campo]));
    });
  });

  test('os 12 valores de custo de cada item são exatamente os mesmos, salvo as exceções documentadas', () => {
    TABELA_CUSTOS.forEach((item, i) => {
      CAMPOS_PLANOS.forEach(campo => {
        const excecao = EXCECOES_DOCUMENTADAS[`${item.id}.${campo}`];
        expect(item[campo], `${item.id}.${campo}`).toBe(excecao ? excecao.valor : antes[i][campo]);
      });
    });
  });

  test('toda exceção documentada tem motivo, aponta para um valor que existe e de fato muda o retrato', () => {
    Object.entries(EXCECOES_DOCUMENTADAS).forEach(([chave, { valor, motivo }]) => {
      const [id, campo] = chave.split('.');
      const original = antes.find(i => i.id === id);
      expect(original, chave).toBeDefined();
      expect(CAMPOS_PLANOS, chave).toContain(campo);
      expect(motivo, chave).toBeTruthy();
      expect(original[campo], chave).not.toBe(valor);
    });
  });

  test('os campos planos espelham o bloco custos', () => {
    TABELA_CUSTOS.forEach(item => {
      ['2024', '2022', '2021'].forEach(ref => {
        CAMPOS_CUSTO.forEach(campo => {
          expect(item[campo + ref], `${item.id}.${campo}${ref}`).toBe(item.custos[ref][campo]);
        });
      });
    });
  });

  test('nenhum item perdeu ou ganhou campo de custo', () => {
    const doJson = new Set(Object.keys(BIBLIOTECA.itens[0].custos));
    expect([...doJson].sort()).toEqual(['2021', '2022', '2024']);
    expect(REFERENCIAS.map(r => r.chave)).toEqual(['2024', '2022', '2021']);
    expect(REFERENCIAS.filter(r => r.atual).map(r => r.chave)).toEqual(['2024']);
  });
});

describe('Etapa 1 — estrutura do JSON', () => {
  test('todo item tem id único, status e formação com origem conhecida', () => {
    const ids = BIBLIOTECA.itens.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    BIBLIOTECA.itens.forEach(i => {
      expect(i.status, i.id).toBe('oficial');
      expect(['proorc', 'formula', 'maoDeObra', 'fixo'], i.id).toContain(i.formacao.origem);
      expect(i.composicoes, i.id).toEqual({});
    });
  });

  test('as 4 origens cobrem os 70 itens na contagem esperada', () => {
    const porOrigem = {};
    BIBLIOTECA.itens.forEach(i => { porOrigem[i.formacao.origem] = (porOrigem[i.formacao.origem] || 0) + 1; });
    expect(porOrigem).toEqual({ proorc: 25, formula: 20, maoDeObra: 8, fixo: 17 });
  });

  test('itens de fórmula apontam para bases que existem', () => {
    BIBLIOTECA.itens.filter(i => i.formacao.origem === 'formula').forEach(i => {
      const bases = [i.formacao.baseExistente, i.formacao.baseNova, i.formacao.baseExtensao].filter(Boolean);
      expect(bases.length, i.id).toBeGreaterThan(0);
      bases.forEach(b => expect(getItemById(b), `${i.id} → ${b}`).toBeDefined());
    });
  });

  test('o mapeamento do PROORC aponta para itens que existem e não repete item', () => {
    const entradas = Object.entries(BIBLIOTECA.mapeamentoProorc);
    expect(entradas).toHaveLength(19);
    const itensMapeados = entradas.map(([, m]) => m.item);
    expect(new Set(itensMapeados).size).toBe(itensMapeados.length);
    entradas.forEach(([projeto, m]) => {
      expect(getItemById(m.item), projeto).toBeDefined();
      expect(m.unidadesPorProjeto, projeto).toBeGreaterThan(0);
    });
  });

  test('o projeto gravado no item casa com o mapeamento', () => {
    Object.entries(BIBLIOTECA.mapeamentoProorc).forEach(([projeto, m]) => {
      const item = getItemById(m.item);
      expect(item.formacao.projeto, m.item).toBe(projeto);
      expect(item.formacao.unidadesPorProjeto, m.item).toBe(m.unidadesPorProjeto);
    });
  });

  test('os itens em verificação estão marcados', () => {
    const marcados = BIBLIOTECA.itens.filter(i => i.verificacao).map(i => i.id);
    expect(marcados.sort()).toEqual([
      'equip_brt_167_urbano', 'equip_relig_tri_36kv', 'recon_urb_4_0_ca',
      'recon_urb_rdi185', 'recon_urb_rdi50', 'sub_13_8kv',
    ]);
  });

  test('o preço da US de 2024 fica em branco, porque a planilha usou dois valores', () => {
    expect(BIBLIOTECA.precosUS['2024']).toEqual({ construcao: null, projeto: null });
  });
});

describe('Etapa 1 — a API antiga continua igual', () => {
  test('tabelaCustos reexporta as mesmas funções', () => {
    ['TABELA_CUSTOS', 'ANOS_DISPONIVEIS', 'getValorPorAno', 'getItemById', 'getItensPorCategoria',
      'getItensPorSubcategoria', 'buscarItens', 'formatarValor', 'getCategorias', 'getSubcategorias']
      .forEach(nome => expect(compat[nome], nome).toBeDefined());
    expect(compat.TABELA_CUSTOS).toBe(TABELA_CUSTOS);
  });

  test('getValorPorAno aceita o ano como número, como antes', () => {
    const item = getItemById('ext_urbano_rdp150_dupla');
    expect(getValorPorAno(item, 2024, 'unitario')).toBe(10.02861);
    expect(getValorPorAno(item, 2024, 'material')).toBe(6.90163);
    expect(getValorPorAno(getItemById('ext_rural_tri_caa336'), 2021, 'unitario')).toBe(115.63557);
  });

  test('filtros e busca devolvem o mesmo que a tabela antiga', () => {
    expect(getItensPorCategoria('Extensão').map(i => i.id))
      .toEqual(antes.filter(i => i.categoria === 'Extensão').map(i => i.id));
    expect(getItensPorSubcategoria('Extensão', 'Urbano').map(i => i.id))
      .toEqual(antes.filter(i => i.categoria === 'Extensão' && i.subcategoria === 'Urbano').map(i => i.id));
    expect(buscarItens('religador').map(i => i.id))
      .toEqual(antes.filter(i => i.tipo.toLowerCase().includes('religador')).map(i => i.id));
    expect(getCategorias()).toEqual([...new Set(antes.map(i => i.categoria))]);
    expect(getSubcategorias('Equipamentos')).toEqual(
      [...new Set(antes.filter(i => i.categoria === 'Equipamentos').map(i => i.subcategoria))]);
  });

  test('formatarValor não mudou', () => {
    expect(formatarValor(10.02861)).toBe('10,03');
    expect(formatarValor(null)).toBe('0,00');
  });
});
