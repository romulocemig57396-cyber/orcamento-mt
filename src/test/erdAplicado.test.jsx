import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { calcularErdSimulado, criarErdAplicado, avisoErdDesatualizado, FATOR_K } from '../utils/calculos';
import DadosAtendimento from '../components/DadosAtendimento';
import RateioTecnico from '../components/RateioTecnico';

const K = FATOR_K[2026];

describe('A8 — ERD simulado', () => {
  test('MUSD positivo → MUSD × K', () => {
    expect(calcularErdSimulado(300, K)).toBeCloseTo(300 * 779.9937688857699, 6);
  });

  test('MUSD ≤ 0 → 0', () => {
    expect(calcularErdSimulado(-100, K)).toBe(0);
    expect(calcularErdSimulado(0, K)).toBe(0);
  });

  test('aplicar guarda { musd, fatorK, ano, valor }', () => {
    expect(criarErdAplicado(300, 2026)).toEqual({ musd: 300, fatorK: K, ano: 2026, valor: parseFloat((300 * K).toFixed(2)) });
  });
});

describe('A8 — aviso de ERD desatualizado', () => {
  const aplicado = criarErdAplicado(300, 2026);

  test('MUSD mudou e ERD continua o aplicado → aviso', () => {
    expect(avisoErdDesatualizado({ erd: aplicado.valor, erdAplicado: aplicado, musd: 500 }))
      .toEqual({ musdAplicado: 300, musdAtual: 500 });
  });

  test('MUSD igual → sem aviso', () => {
    expect(avisoErdDesatualizado({ erd: aplicado.valor, erdAplicado: aplicado, musd: 300 })).toBeNull();
  });

  test('ERD digitado à mão (diferente do aplicado) → sem aviso', () => {
    expect(avisoErdDesatualizado({ erd: 1234, erdAplicado: aplicado, musd: 500 })).toBeNull();
  });

  test('sem ERD aplicado → sem aviso', () => {
    expect(avisoErdDesatualizado({ erd: 1000, erdAplicado: null, musd: 500 })).toBeNull();
  });
});

describe('A8 — telas', () => {
  const base = {
    cliente: '', ns: '', tipoAtendimento: '', municipio: '', localUnidade: '', tensaoKv: '',
    cargaAtual: 0, demandaFutura: '', observacoes: '', itensObra: [], diferencaCabo: 0,
    temObrasVinculadas: false, dataObrasVinculadas: '',
  };

  test('MUSD negativo → ERD simulado R$ 0,00 e botão desabilitado', () => {
    render(<DadosAtendimento dados={{ ...base, musd: -50, erd: 0 }} updateField={() => {}} />);
    expect(screen.getByText('Aplicar no Rateio')).toBeDisabled();
  });

  test('Aplicar grava erd e erdAplicado', () => {
    const updateField = vi.fn();
    render(<DadosAtendimento dados={{ ...base, musd: 300, erd: 0 }} updateField={updateField} />);
    fireEvent.click(screen.getByText('Aplicar no Rateio'));
    const aplicado = criarErdAplicado(300, 2026);
    expect(updateField).toHaveBeenCalledWith('erd', aplicado.valor);
    expect(updateField).toHaveBeenCalledWith('erdAplicado', aplicado);
  });

  test('aviso com Reaplicar na aba Atendimento', () => {
    const aplicado = criarErdAplicado(300, 2026);
    const updateField = vi.fn();
    render(<DadosAtendimento dados={{ ...base, musd: 500, erd: aplicado.valor, erdAplicado: aplicado }} updateField={updateField} />);
    expect(screen.getByText(/O ERD foi calculado para MUSD de 300 kW; o MUSD atual é 500 kW/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reaplicar'));
    expect(updateField).toHaveBeenCalledWith('erd', criarErdAplicado(500, 2026).valor);
  });

  test('aviso também no Rateio', () => {
    const aplicado = criarErdAplicado(300, 2026);
    let estado = { ...base, musd: 500, erd: aplicado.valor, erdAplicado: aplicado };
    const setOrcamento = vi.fn(fn => { estado = fn(estado); });
    render(<RateioTecnico dados={estado} setOrcamento={setOrcamento} />);
    expect(screen.getByText(/O ERD foi calculado para MUSD de 300 kW; o MUSD atual é 500 kW/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reaplicar'));
    expect(estado.erd).toBe(criarErdAplicado(500, 2026).valor);
    expect(estado.erdAplicado.musd).toBe(500);
  });
});
