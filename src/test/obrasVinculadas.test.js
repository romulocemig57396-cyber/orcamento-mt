import { describe, test, expect } from 'vitest';
import { analisarTexto, aplicarCabecalho } from '../components/Importacao';
import { migrarOrcamento } from '../utils/migracao';

const TEXTO_2 = `NS: 1252831726
Cliente: ARCELORMITTAL BIOFLORESTAS LTDA
Município: Martinho Campos
Tensão: 13,8 kV
Aumento de demanda contratada fora de ponta de 200kW HFP para 1500kW HFP.

Obras de Média Tensão (MT):
Obras com custo de responsabilidade da Cemig
- DLI.22.2012.L04 - LD B DESPACHO 2-S GONÇALO PARÁ,138kV. Construção de aprox. 70 km de linha 138kV. Conclusão estimada: 31/05/2027.
- Abertura de chave. 1 conj coordenado pela Cemig.`;

const BASE = { temObrasVinculadas: false, dataObrasVinculadas: '', observacoes: '' };

describe('A6 — obras vinculadas da importação alimentam o prazo', () => {
  test('TEXTO_2: após "Preencher Atendimento" → temObrasVinculadas true e data 2027-05-31', () => {
    const o = aplicarCabecalho(BASE, analisarTexto(TEXTO_2).cab);
    expect(o.temObrasVinculadas).toBe(true);
    expect(o.dataObrasVinculadas).toBe('2027-05-31');
  });

  test('a análise sozinha não altera o orçamento (só o cabeçalho detectado)', () => {
    const { cab } = analisarTexto(TEXTO_2);
    expect(cab.temObrasVinculadas).toBe(true);
    expect(cab.dataObrasVinculadas).toBe('2027-05-31');
  });

  test('texto sem alta tensão não desmarca obras vinculadas já marcadas no Rateio', () => {
    const prev = { ...BASE, temObrasVinculadas: true, dataObrasVinculadas: '2028-01-10' };
    const o = aplicarCabecalho(prev, analisarTexto('Cliente: X\nDemanda de 100 kW').cab);
    expect(o.temObrasVinculadas).toBe(true);
    expect(o.dataObrasVinculadas).toBe('2028-01-10');
  });

  test('alta tensão sem data → marca, sem apagar a data já digitada', () => {
    const texto = 'Obras com custo de responsabilidade da Cemig\n- Construção de linha 138kV. 10 km.';
    const o = aplicarCabecalho({ ...BASE, dataObrasVinculadas: '2028-01-10' }, analisarTexto(texto).cab);
    expect(o.temObrasVinculadas).toBe(true);
    expect(o.dataObrasVinculadas).toBe('2028-01-10');
  });
});

describe('A6 — migração do estado antigo obrasVinculadas', () => {
  test('marcado no estado antigo e não na raiz → copia para a raiz', () => {
    const o = migrarOrcamento({ temObrasVinculadas: false, obrasVinculadas: { temObrasVinculadas: true, descricao: 'x' } });
    expect(o.temObrasVinculadas).toBe(true);
    expect(o.obrasVinculadas).toBeUndefined();
  });

  test('raiz já marcada → mantém a raiz', () => {
    const o = migrarOrcamento({ temObrasVinculadas: true, dataObrasVinculadas: '2027-01-01', obrasVinculadas: { temObrasVinculadas: false } });
    expect(o.temObrasVinculadas).toBe(true);
    expect(o.dataObrasVinculadas).toBe('2027-01-01');
  });
});
