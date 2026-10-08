import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/* jsPDF de mentira: guarda todos os textos escritos e as tabelas montadas. */
const docs = [];
vi.mock('jspdf', () => {
  class DocFalso {
    constructor() { this.textos = []; this.tabelas = []; this.paginas = 1; this.lastAutoTable = { finalY: 50 }; docs.push(this); }
    text(t) { this.textos.push(Array.isArray(t) ? t.join(' ') : String(t)); }
    autoTable(cfg) { this.tabelas.push(cfg); }
    addPage() { this.paginas += 1; }
    get internal() { return { getNumberOfPages: () => this.paginas }; }
    splitTextToSize(t) { return [t]; }
    setFont() {} setFontSize() {} setTextColor() {} setPage() {} save() {}
  }
  return { default: DocFalso };
});
vi.mock('jspdf-autotable', () => ({}));
vi.mock('xlsx', async (original) => ({ ...(await original()), writeFile: vi.fn() }));

import * as XLSX from 'xlsx';
import { exportarPDF, exportarRateio, exportarExcel } from '../utils/exportar';
import ResumoFinanceiro from '../components/ResumoFinanceiro';

const ORCAMENTO = {
  cliente: 'CLIENTE TESTE', ns: '123', municipio: 'Uberaba', tipoAtendimento: 'LN',
  dataBase: '2026-01-01', dataValidade: '2026-05-01',
  itensObra: [], totalObra: 0, ctcTotal: 0, ppTotal: 0, parcelaRegTotal: 0, parcelaRegCobertaERD: 0,
  sobraParcelaReg: 0, erdNaoUtilizado: 0, pfcCliente: 0, parcelaD: 0, material: 0, servicos: 0,
  valorTotal: 0, administracao: 0, erd: 0, cargaAtual: 0, demandaFutura: 300, musd: 300,
  temObrasVinculadas: false, dataObrasVinculadas: '', diasObrasVinculadas: null,
};

const textoDo = (doc) => doc.textos.join('\n');

describe('R5 — a Data Base é a data de emissão', () => {
  beforeEach(() => {
    docs.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 8, 10, 0, 0)); // hoje = 08/10/2026
  });
  afterEach(() => vi.useRealTimers());

  test('PDF do orçamento: cabeçalho e rodapé usam a Data Base, não a data de hoje', () => {
    exportarPDF(ORCAMENTO);
    const t = textoDo(docs[0]);
    expect(t).toContain('Emissão: 01/01/2026');
    expect(t).toContain('Emissão: 01/01/2026  |  Validade: 01/05/2026');
    expect(t).not.toContain('08/10/2026');
  });

  test('a validade é sempre Data Base + 120 dias, mesmo se o campo gravado estiver desatualizado', () => {
    exportarPDF({ ...ORCAMENTO, dataValidade: '2025-01-01' });
    expect(textoDo(docs[0])).toContain('Validade: 01/05/2026');
  });

  test('PDF do rateio: mesmo critério', () => {
    exportarRateio(ORCAMENTO);
    const t = textoDo(docs[0]);
    expect(t).toContain('Emissão: 01/01/2026  |  Validade: 01/05/2026');
    expect(t).not.toContain('08/10/2026');
  });

  test('Excel: emissão e validade pela Data Base', () => {
    exportarExcel(ORCAMENTO);
    const workbook = XLSX.writeFile.mock.calls.at(-1)[0];
    const linhas = XLSX.utils.sheet_to_json(workbook.Sheets['Orçamento'], { header: 1 });
    const linha = (rotulo) => linhas.find(l => l[0] === rotulo);
    expect(linha('Emissão (Data Base)')[2]).toBe('01/01/2026');
    expect(linha('Validade')[2]).toBe('01/05/2026');
  });

  test('tela: rótulo "Data Base (emissão)" e a dica da validade', () => {
    render(<ResumoFinanceiro dados={{ ...ORCAMENTO, setOrcamento: () => {} }} />);
    expect(screen.getByText('Data Base (emissão)')).toBeInTheDocument();
    expect(screen.getByText(/validade \(120 dias\) conta a partir da Data Base/)).toBeInTheDocument();
  });
});
