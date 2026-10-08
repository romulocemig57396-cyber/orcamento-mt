import { describe, test, expect } from 'vitest';
import { analisarTexto, aplicarCabecalho } from '../components/Importacao';
import { gerarMemorialDescritivo } from '../utils/gerarTexto';
import { normalizarTipoAtendimento, rotuloTipoAtendimento, OBS_GERACAO_DISTRIBUIDA } from '../utils/tipoAtendimento';
import { migrarOrcamento } from '../utils/migracao';

const BASE = {
  cliente: 'EMPRESA TESTE', tensaoKv: '13.8', localUnidade: 'Fazenda Modelo',
  municipio: 'Belo Horizonte', observacoes: '', itensObra: [], cargaAtual: 0, demandaFutura: '',
};

const importar = (texto, prev = BASE) => aplicarCabecalho(prev, analisarTexto(texto).cab);

describe('A3 — tipo de atendimento importado em código', () => {
  test('"de 0 kW para 300 kW" → LN e memorial "de uma ligação nova, com demanda de 300 kW"', () => {
    const o = importar('Ligação de 0 kW para 300 kW.');
    expect(o.tipoAtendimento).toBe('LN');
    expect(gerarMemorialDescritivo(o)).toContain('de uma ligação nova, com demanda de 300 kW');
  });

  test('"200kW ... para 1500kW" → AC e memorial "de um aumento de carga, com demanda atual de 200 kW e demanda futura de 1.500 kW"', () => {
    const o = importar('Aumento de demanda contratada fora de ponta de 200kW HFP para 1500kW HFP.');
    expect(o.tipoAtendimento).toBe('AC');
    expect(gerarMemorialDescritivo(o))
      .toContain('de um aumento de carga, com demanda atual de 200 kW e demanda futura de 1.500 kW');
  });

  test('"de 1.200 kW para 2.500 kW" → AC', () => {
    expect(analisarTexto('de 1.200 kW para 2.500 kW').cab.tipoAtendimento).toBe('AC');
  });

  test('só uma demanda → LN', () => {
    expect(analisarTexto('Demanda de 112,5 kW').cab.tipoAtendimento).toBe('LN');
  });

  test('reforma → "de uma reforma"', () => {
    expect(gerarMemorialDescritivo({ ...BASE, tipoAtendimento: 'RF', demandaFutura: 100, cargaAtual: 100 }))
      .toContain('de uma reforma,');
  });

  test('memorial aceita os textos antigos', () => {
    expect(gerarMemorialDescritivo({ ...BASE, tipoAtendimento: 'Ligação Nova', demandaFutura: 300 }))
      .toContain('de uma ligação nova, com demanda de 300 kW');
    expect(gerarMemorialDescritivo({ ...BASE, tipoAtendimento: 'Ampliação de Carga', cargaAtual: 200, demandaFutura: 1500 }))
      .toContain('de um aumento de carga, com demanda atual de 200 kW');
  });
});

describe('A3 — geração distribuída', () => {
  const TEXTO_GD = 'Ligação de 0 kW para 300 kW. Atendimento a gerador solar (geração distribuída).';

  test('mantém LN conforme a demanda e marca geração distribuída', () => {
    const { cab } = analisarTexto(TEXTO_GD);
    expect(cab.tipoAtendimento).toBe('LN');
    expect(cab.geracaoDistribuida).toBe(true);
  });

  test('aumento de carga com GD continua AC', () => {
    const { cab } = analisarTexto('De 200 kW para 500 kW. Usina solar fotovoltaica.');
    expect(cab.tipoAtendimento).toBe('AC');
    expect(cab.geracaoDistribuida).toBe(true);
  });

  test('Preencher Atendimento acrescenta a frase nas Observações, sem duplicar', () => {
    const uma = importar(TEXTO_GD, { ...BASE, observacoes: 'Obs. existente.' });
    expect(uma.observacoes).toBe(`Obs. existente.\n${OBS_GERACAO_DISTRIBUIDA}`);
    const duas = aplicarCabecalho(uma, analisarTexto(TEXTO_GD).cab);
    expect(duas.observacoes).toBe(uma.observacoes);
    expect(OBS_GERACAO_DISTRIBUIDA).toBe('Atendimento com geração distribuída.');
  });

  test('sem GD não mexe nas Observações', () => {
    expect(importar('Ligação de 0 kW para 300 kW.', { ...BASE, observacoes: 'X' }).observacoes).toBe('X');
  });
});

describe('A3 — normalização e migração', () => {
  test.each([
    ['Ligação Nova', 'LN'], ['Ampliação de Carga', 'AC'], ['Aumento de Carga', 'AC'],
    ['Reforma', 'RF'], ['LN', 'LN'], ['AC', 'AC'], ['RF', 'RF'], ['', ''],
  ])('%s → %s', (antigo, codigo) => {
    expect(normalizarTipoAtendimento(antigo)).toBe(codigo);
  });

  test('rótulo legível', () => {
    expect(rotuloTipoAtendimento('LN')).toBe('LN — Ligação Nova');
    expect(rotuloTipoAtendimento('AC')).toBe('AC — Aumento de Carga');
    expect(rotuloTipoAtendimento('')).toBe('');
  });

  test('migração do localStorage', () => {
    expect(migrarOrcamento({ tipoAtendimento: 'Ampliação de Carga' }).tipoAtendimento).toBe('AC');
    expect(migrarOrcamento({ tipoAtendimento: 'Ligação Nova' }).tipoAtendimento).toBe('LN');
    expect(migrarOrcamento({ tipoAtendimento: 'Reforma' }).tipoAtendimento).toBe('RF');
    expect(migrarOrcamento({
      importacao: { itensDetectados: [], cabecalhoDetectado: { tipoAtendimento: 'Geração Distribuída' } },
    }).importacao.cabecalhoDetectado.tipoAtendimento).toBe('');
  });
});
