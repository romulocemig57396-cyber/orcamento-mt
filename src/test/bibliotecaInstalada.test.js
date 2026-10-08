import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import base from './fixtures/biblioteca-base.json';
import { disponivelNaReferencia } from '../data/biblioteca';
import { ORIGENS } from '../proorc/formacao';

/* ─────────────────────────────────────────────────────────────────────────────
   O biblioteca.json INSTALADO muda a cada atualização do responsável:
   referências novas, itens novos, outra referência atual. Os demais testes
   usam a biblioteca fixa (src/test/setup.js); este lê o arquivo do disco e
   confere só regras que valem para sempre — nada de contagens fixas.
   ───────────────────────────────────────────────────────────────────────────── */
const instalada = JSON.parse(readFileSync(resolve(__dirname, '../data/biblioteca.json'), 'utf8'));

const REFS_CONGELADAS = ['2024', '2022', '2021'];
const IDENTIDADE = ['id', 'categoria', 'subcategoria', 'tipo', 'unidade'];
const v = (x) => parseFloat(x) || 0;
const temRef = (item, ref) => Object.prototype.hasOwnProperty.call(item.custos || {}, ref);
const porId = new Map(instalada.itens.map(i => [i.id, i]));
const chaves = instalada.referencias.map(r => r.chave);
const atual = instalada.referencias.find(r => r.atual)?.chave;

describe('biblioteca instalada — as referências antigas não mudam', () => {
  test('2024, 2022 e 2021 continuam idênticas à biblioteca base (exceções R1/R2 já estão nela)', () => {
    REFS_CONGELADAS.forEach(ref => {
      expect(chaves, ref).toContain(ref);
      const refBase = base.referencias.find(r => r.chave === ref);
      const refInst = instalada.referencias.find(r => r.chave === ref);
      ['rotulo', 'fonte', 'observacao'].forEach(c => expect(refInst[c], `${ref}.${c}`).toEqual(refBase[c]));
      expect(instalada.precosUS[ref], `precosUS ${ref}`).toEqual(base.precosUS[ref]);
    });
    base.itens.forEach(itemBase => {
      const item = porId.get(itemBase.id);
      expect(item, itemBase.id).toBeDefined();
      IDENTIDADE.forEach(c => expect(item[c], `${itemBase.id}.${c}`).toBe(itemBase[c]));
      REFS_CONGELADAS.forEach(ref => {
        expect(item.custos[ref], `${itemBase.id} ${ref}`).toEqual(itemBase.custos[ref]);
      });
    });
  });

  test('itens criados depois não ganham custo nas referências antigas', () => {
    const idsBase = new Set(base.itens.map(i => i.id));
    instalada.itens.filter(i => !idsBase.has(i.id)).forEach(item => {
      REFS_CONGELADAS.forEach(ref => expect(temRef(item, ref), `${item.id} ${ref}`).toBe(false));
    });
  });
});

describe('biblioteca instalada — integridade', () => {
  test('ids únicos, status oficial e origem válida', () => {
    const ids = instalada.itens.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    instalada.itens.forEach(i => {
      expect(i.status, i.id).toBe('oficial');
      expect(Object.keys(ORIGENS), i.id).toContain(i.formacao?.origem);
    });
  });

  test('itens de fórmula apontam para bases que existem', () => {
    instalada.itens.filter(i => i.formacao.origem === 'formula').forEach(i => {
      [i.formacao.baseExistente, i.formacao.baseNova, i.formacao.baseExtensao].filter(Boolean)
        .forEach(b => expect(porId.has(b), `${i.id} → ${b}`).toBe(true));
    });
  });

  test('o mapeamento do PROORC aponta para itens proorc que existem, sem repetir item', () => {
    const entradas = Object.entries(instalada.mapeamentoProorc);
    const itens = entradas.map(([, m]) => m.item);
    expect(new Set(itens).size).toBe(itens.length);
    entradas.forEach(([projeto, m]) => {
      const item = porId.get(m.item);
      expect(item, projeto).toBeDefined();
      expect(item.formacao.origem, projeto).toBe('proorc');
      expect(v(m.unidadesPorProjeto), projeto).toBeGreaterThan(0);
    });
  });

  test('chaves de referência únicas e exatamente uma referência atual', () => {
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(instalada.referencias.filter(r => r.atual)).toHaveLength(1);
  });
});

describe('biblioteca instalada — disponibilidade dos itens', () => {
  test('todo item existe na referência atual, com custo ou pendente (unitário 0)', () => {
    instalada.itens.forEach(item => {
      expect(temRef(item, atual), `${item.id} na atual ${atual}`).toBe(true);
      expect(v(item.custos[atual].unitario), item.id).toBeGreaterThanOrEqual(0);
    });
  });

  test('um item só falta nas referências anteriores à sua criação', () => {
    // `referencias` vem da mais nova para a mais antiga: depois que o item
    // aparece numa referência, ele tem que existir em todas as mais novas.
    instalada.itens.forEach(item => {
      const presenca = chaves.map(r => temRef(item, r));
      const primeiraAusencia = presenca.indexOf(false);
      if (primeiraAusencia === -1) return;
      expect(presenca.slice(primeiraAusencia).every(p => !p), `${item.id}: ${chaves.map((r, i) => `${r}=${presenca[i]}`).join(' ')}`).toBe(true);
    });
  });
});

describe('biblioteca instalada — fórmulas consistentes com as bases, em cada referência', () => {
  /* O fator não é fixado (0,33 e 1,05 podem mudar pela tela "Editar valores"):
     ele é deduzido dos próprios valores e tem que ser o mesmo em todos os
     itens da regra naquela referência.                                       */
  const NAO_SEGUEM_FORMULA = { 2021: 'todos' }; // valores digitados, anteriores às fórmulas
  const EXCECOES = {
    'recon_urb_rdp150_dupla@2022': 'Sem unitário em 2022 na planilha de origem.',
  };

  const fatoresDaReferencia = (ref) => {
    const fatores = { redeExistenteMaisNova: [], extensaoComAcrescimoMaoObra: [] };
    instalada.itens.filter(i => i.formacao.origem === 'formula' && temRef(i, ref)).forEach(item => {
      if (EXCECOES[`${item.id}@${ref}`]) return;
      const f = item.formacao;
      const c = item.custos[ref];
      if (f.regra === 'redeExistenteMaisNova') {
        const e = porId.get(f.baseExistente).custos[ref];
        const n = porId.get(f.baseNova).custos[ref];
        if (!e || !n || !(v(e.unitario) > 0)) return;
        fatores.redeExistenteMaisNova.push({ id: item.id, fator: (v(c.unitario) - v(n.unitario)) / v(e.unitario) });
      } else {
        const b = porId.get(f.baseExtensao).custos[ref];
        if (!b || !(v(b.maoObra) > 0)) return;
        fatores.extensaoComAcrescimoMaoObra.push({ id: item.id, fator: (v(c.unitario) - v(b.material)) / v(b.maoObra) });
      }
    });
    return fatores;
  };

  test.each(chaves.filter(r => !NAO_SEGUEM_FORMULA[r]))('referência %s', (ref) => {
    Object.entries(fatoresDaReferencia(ref)).forEach(([regra, lista]) => {
      if (!lista.length) return;
      const fator = lista[0].fator;
      expect(fator, `${regra} em ${ref}`).toBeGreaterThan(0);
      lista.forEach(({ id, fator: f }) => expect(f, `${id} (${regra}) em ${ref}`).toBeCloseTo(fator, 5));
    });
  });
});

describe('biblioteca instalada — itens criados a partir do PROORC em 2026-10', () => {
  const NOVOS = [
    { id: 'equip_brt_200_kva_34_5_kv', projeto: '1255039294', unitario: 391.00852 },
    { id: 'equip_brt_400_kva_34_5_kv', projeto: '1254134998', unitario: 504.67648 },
  ];

  test.each(NOVOS)('$id: ligado ao projeto $projeto', ({ id, projeto }) => {
    const item = porId.get(id);
    expect(item.formacao).toMatchObject({ origem: 'proorc', projeto });
    expect(instalada.mapeamentoProorc[projeto]).toMatchObject({ item: id, unidadesPorProjeto: item.formacao.unidadesPorProjeto });
  });

  test.each(NOVOS)('$id: custo só a partir de 2026-10 ($unitario)', ({ id, unitario }) => {
    const item = porId.get(id);
    expect(item.custos['2026-10'].unitario).toBeCloseTo(unitario, 5);
    expect(v(item.custos['2026-10'].material) + v(item.custos['2026-10'].maoObra)).toBeCloseTo(unitario, 5);
    expect(item.composicoes['2026-10'].materiais.length).toBeGreaterThan(0);
    REFS_CONGELADAS.forEach(ref => expect(temRef(item, ref), ref).toBe(false));
  });

  test.each(NOVOS)('$id: "não disponível" nas referências antigas', ({ id }) => {
    const item = porId.get(id);
    expect(disponivelNaReferencia(item, '2026-10')).toBe(true);
    REFS_CONGELADAS.forEach(ref => expect(disponivelNaReferencia(item, ref), ref).toBe(false));
  });
});
