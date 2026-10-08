import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { calcularValidade, formatarData } from '../utils/calculos';
import { gerarTextoResumoFinanceiro } from '../utils/gerarTexto';
import { normalizarDataISO, somarDias, diasEntre } from '../utils/datas';
import { migrarOrcamento } from '../utils/migracao';
import ResumoFinanceiro from '../components/ResumoFinanceiro';

const tzOriginal = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/Sao_Paulo'; });
afterAll(() => { process.env.TZ = tzOriginal; });

describe('A9 — Data Base sem deslocamento de fuso (America/Sao_Paulo)', () => {
  test('o fuso do teste está ativo (UTC−3)', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(180);
  });

  test('Data Base "2026-01-01" → exibida "01/01/2026", validade "01/05/2026"', () => {
    const validade = calcularValidade('2026-01-01');
    expect(validade).toBe('2026-05-01');
    expect(formatarData('2026-01-01')).toBe('01/01/2026');
    expect(formatarData(validade)).toBe('01/05/2026');
  });

  test('resumo em texto usa as datas sem deslocamento', () => {
    const texto = gerarTextoResumoFinanceiro({ municipio: 'Uberaba', dataBase: '2026-01-01', dataValidade: '2026-05-01' });
    expect(texto).toContain('Validade do Orçamento: 01/05/2026');
    expect(texto).toContain('Emissão: Uberaba, 01/01/2026');
  });

  test('tela: campo Data Base mostra 2026-01-01 e validade 01/05/2026; edição grava AAAA-MM-DD', () => {
    let estado = { dataBase: '2026-01-01', dataValidade: '2026-05-01' };
    const setOrcamento = (fn) => { estado = fn(estado); };
    render(<ResumoFinanceiro dados={{ ...estado, setOrcamento, totalObra: 0, pfcCliente: 0, material: 0, servicos: 0, valorTotal: 0, administracao: 0 }} />);
    expect(screen.getByDisplayValue('2026-01-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('01/05/2026')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('2026-01-01'), { target: { value: '2026-03-15' } });
    expect(estado.dataBase).toBe('2026-03-15');
  });

  test('somarDias atravessa meses e anos', () => {
    expect(somarDias('2026-12-20', 15)).toBe('2027-01-04');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
  });

  test('diasEntre conta dias de calendário', () => {
    expect(diasEntre('2026-01-01', '2026-05-01')).toBe(120);
  });

  test('normalizarDataISO aceita AAAA-MM-DD, ISO completo antigo e Date', () => {
    expect(normalizarDataISO('2026-01-01')).toBe('2026-01-01');
    expect(normalizarDataISO('2026-01-01T00:00:00.000Z')).toBe('2026-01-01');
    expect(normalizarDataISO(new Date(2026, 0, 1, 23, 30))).toBe('2026-01-01');
  });

  test('migração: dataBase e dataValidade antigas (ISO completo) viram AAAA-MM-DD', () => {
    const o = migrarOrcamento({ dataBase: '2026-01-01T00:00:00.000Z', dataValidade: '2026-05-01T00:00:00.000Z' });
    expect(o.dataBase).toBe('2026-01-01');
    expect(o.dataValidade).toBe('2026-05-01');
  });
});
