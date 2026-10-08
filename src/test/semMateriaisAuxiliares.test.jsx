import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('xlsx', async (original) => {
  const real = await original();
  return { ...real, writeFile: vi.fn() };
});

import * as XLSX from 'xlsx';
import { exportarExcel } from '../utils/exportar';
import { migrarOrcamento } from '../utils/migracao';
import App from '../App';

const MATERIAL = { id: 7, grupo: 'CAA', tipo: 'CAA336', kgPorMetro: 0.689, metragem: 100, pesoTotal: 68.9, pesoComAcrescimo: 70.97 };

describe('R4 — aba Materiais Auxiliares removida', () => {
  beforeEach(() => localStorage.clear());

  test('o menu não tem mais a aba Materiais', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Itens de Obra' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Materiais' })).not.toBeInTheDocument();
  });

  test('orçamento salvo com materiaisAuxiliares abre sem erro e descarta o campo', () => {
    const migrado = migrarOrcamento({ cliente: 'X', materiaisAuxiliares: [MATERIAL] });
    expect(migrado.cliente).toBe('X');
    expect('materiaisAuxiliares' in migrado).toBe(false);

    localStorage.setItem('orcamento_mt_app', JSON.stringify({ cliente: 'SALVO ANTES', itensObra: [], materiaisAuxiliares: [MATERIAL] }));
    render(<App />);
    expect(screen.getByDisplayValue('SALVO ANTES')).toBeInTheDocument();
    // No próximo salvamento o campo já não existe
    expect(JSON.parse(localStorage.getItem('orcamento_mt_app'))).not.toHaveProperty('materiaisAuxiliares');
  });

  test('o Excel não tem a aba Materiais, mesmo com dados antigos no orçamento', () => {
    exportarExcel({ itensObra: [], materiaisAuxiliares: [MATERIAL], dataBase: '2026-01-01', dataValidade: '2026-05-01' });
    const workbook = XLSX.writeFile.mock.calls[0][0];
    expect(workbook.SheetNames).not.toContain('Materiais');
  });
});
