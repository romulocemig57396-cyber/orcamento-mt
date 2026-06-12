import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatarMoeda, formatarData } from './calculos';

/* ─────────────────────────────────────────────────────────────────────────────
   PRAZO ESTIMADO — auxiliar local
   ───────────────────────────────────────────────────────────────────────────── */
function calcularPrazoExport(orcamento) {
  const kmTotal = (orcamento.itensObra || []).reduce((acc, item) => {
    if (item.unidade === 'km') return acc + (parseFloat(item.quantidade) || 0);
    if (item.unidade === 'poste') return acc + ((parseFloat(item.quantidade) || 0) * 40 / 1000);
    return acc;
  }, 0);
  const prazoRede = kmTotal <= 1 ? 120 : 365;
  const prazoVinculadas = orcamento.temObrasVinculadas && orcamento.diasObrasVinculadas > 0
    ? orcamento.diasObrasVinculadas : null;
  const prazoFinal = prazoVinculadas ? Math.max(prazoRede, prazoVinculadas) : prazoRede;
  const dataFinal = new Date();
  dataFinal.setDate(dataFinal.getDate() + prazoFinal);
  return { prazoRede, prazoVinculadas, prazoFinal, dataFinal, kmTotal };
}

/* ─────────────────────────────────────────────────────────────────────────────
   EXCEL
   ───────────────────────────────────────────────────────────────────────────── */
export const exportarExcel = (orcamento) => {
  const workbook = XLSX.utils.book_new();
  const v = (x) => parseFloat(x) || 0;

  const itensCTC = orcamento.itensObra.filter(i => i.categoria === 'ctc');
  const itensPP  = orcamento.itensObra.filter(i => i.categoria === 'pp');
  const itensCTI = orcamento.itensObra.filter(i => i.categoria === 'cti');
  const itensReg = orcamento.itensObra.filter(i => i.categoria === 'parcela_reg');

  const prazo = calcularPrazoExport(orcamento);

  // ── Aba Orçamento ──────────────────────────────────────────────────────────
  const dados = [
    ['ORÇAMENTO DE OBRAS MT'],
    [],

    // DADOS DO ATENDIMENTO
    ['DADOS DO ATENDIMENTO'],
    ['NS', orcamento.ns || ''],
    ['Cliente', orcamento.cliente || ''],
    ['Tipo de Atendimento', orcamento.tipoAtendimento || ''],
    ['Município', orcamento.municipio || ''],
    ['Local / Fazenda', orcamento.localUnidade || ''],
    ['Tensão (kV)', orcamento.tensaoKv || ''],
    ['Carga Atual (kW)', orcamento.cargaAtual || 0],
    ['Demanda Futura (kW)', orcamento.demandaFutura || 0],
    ['MUSD (kW)', orcamento.musd || 0],
    ...(orcamento.dataEstudo ? [['Data do Estudo', orcamento.dataEstudo]] : []),
    [],

    // PRAZO ESTIMADO
    ['PRAZO ESTIMADO'],
    ['Extensão total de rede (km)', prazo.kmTotal.toFixed(2)],
    ['Prazo base (rede)', `${prazo.prazoRede} dias`],
    ['Obras vinculadas', prazo.prazoVinculadas ? `${prazo.prazoVinculadas} dias` : 'Não informado'],
    ['PRAZO TOTAL ESTIMADO', `${prazo.prazoFinal} dias`],
    ['Previsão de conclusão', formatarData(prazo.dataFinal)],
    [],

    // CUSTOS DE OBRA
    ['CUSTOS DE OBRA'],
    ['#', 'Descrição', 'Categoria', 'Qtd', 'Unidade', 'Valor'],
    ...orcamento.itensObra.map((item, i) => [
      i + 1, item.descricao, item.categoria,
      item.quantidade || '', item.unidade || '', item.valor
    ]),
    ['', '', '', '', 'TOTAL DA OBRA', orcamento.totalObra],
    [],

    // RATEIO
    ['RATEIO TÉCNICO'],
    ['Total da Obra', '', orcamento.totalObra],
    [],

    ['CTC — CONDIÇÃO TÉCNICA CEMIG'],
    ...itensCTC.map(item => [item.descricao, '', item.valor]),
    ['Diferença de Cabo', '', orcamento.diferencaCabo || 0],
    ['TOTAL CTC', '', orcamento.ctcTotal],
    [],

    ['PP — PROPORCIONALIDADE'],
    ...itensPP.map(item => [item.descricao, `${item.percentualCemig}% CEMIG`, item.valor]),
    ['TOTAL PP', '', orcamento.ppTotal],
    [],

    ...(itensCTI.length > 0 ? [
      ['CTI — CONDIÇÃO TÉCNICA DO INTERESSADO'],
      ...itensCTI.map(item => [item.descricao, '', item.valor]),
      ['TOTAL CTI', '', itensCTI.reduce((acc, item) => acc + v(item.valor), 0)],
      [],
    ] : []),

    ...(itensReg.length > 0 ? [
      ['PARCELA REGULATÓRIA'],
      ...itensReg.map(item => [item.descricao, '', item.valor]),
      [],
    ] : []),

    ['CTC — Cond. Téc. CEMIG (c/ dif. cabo)', '', orcamento.ctcTotal],
    ['PP — Proporcionalidade', '', orcamento.ppTotal],
    ['Parcela Regulatória Total', '', orcamento.parcelaRegTotal],
    ['ERD disponível', '', orcamento.erd || 0],
    ['Parcela Reg. coberta ERD', '', orcamento.parcelaRegCobertaERD],
    ['Sobra Parcela Reg.', '', orcamento.sobraParcelaReg],
    ['PFC do Cliente', '', orcamento.pfcCliente],
    ['Parcela D (CTC + PP)', '', orcamento.parcelaD],
    [],

    // Descrição Técnica
    ['MEMORIAL DESCRITIVO'],
    [orcamento.descricaoTecnica || ''],
    [],

    // Resumo Financeiro
    ['RESUMO FINANCEIRO'],
    ['Material Requisitado (60%)', '', orcamento.material],
    ['Serviços Contratados (40%)', '', orcamento.servicos],
    ...(orcamento.administracao > 0 ? [['Administração/MOP', '', orcamento.administracao]] : []),
    ['VALOR TOTAL', '', orcamento.valorTotal],
    [],

    // Validade e emissão
    ['Validade', '', formatarData(orcamento.dataValidade)],
    ['Data Base', '', formatarData(orcamento.dataBase)],
    [`${orcamento.municipio || ''}`, '', formatarData(orcamento.dataBase)],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(dados);
  XLSX.utils.book_append_sheet(workbook, ws1, 'Orçamento');

  // ── Aba Materiais ──────────────────────────────────────────────────────────
  if (orcamento.materiaisAuxiliares && orcamento.materiaisAuxiliares.length > 0) {
    const dadosMat = [
      ['MATERIAIS AUXILIARES'],
      [],
      ['CABOS CA'],
      ['Tipo', 'kg/m', 'Metragem (m)', 'Peso Total (kg)', 'Peso c/ Acréscimo (kg)'],
      ...orcamento.materiaisAuxiliares
        .filter(m => m.grupo === 'CA')
        .map(m => [m.tipo, m.kgPorMetro, m.metragem, m.pesoTotal, m.pesoComAcrescimo]),
      [],
      ['CABOS CAA'],
      ['Tipo', 'kg/m', 'Metragem (m)', 'Peso Total (kg)', 'Peso c/ Acréscimo (kg)'],
      ...orcamento.materiaisAuxiliares
        .filter(m => m.grupo === 'CAA')
        .map(m => [m.tipo, m.kgPorMetro, m.metragem, m.pesoTotal, m.pesoComAcrescimo]),
    ];

    const ws2 = XLSX.utils.aoa_to_sheet(dadosMat);
    XLSX.utils.book_append_sheet(workbook, ws2, 'Materiais');
  }

  const nomeArquivo = `Orcamento_${(orcamento.cliente || 'sem-nome').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, nomeArquivo);
};

/* ─────────────────────────────────────────────────────────────────────────────
   PDF
   ───────────────────────────────────────────────────────────────────────────── */
export const exportarPDF = (orcamento) => {
  const doc = new jsPDF();
  let y = 20;

  const verde = [0, 122, 61]; // #007A3D
  const v = (x) => parseFloat(x) || 0;

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...verde);
  doc.text('ORÇAMENTO DE OBRAS MT', 105, y, { align: 'center' });
  doc.setTextColor(0);
  y += 8;

  if (orcamento.ns) {
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`NS: ${orcamento.ns}`, 105, y, { align: 'center' });
    y += 7;
  }

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Emissão: ${formatarData(new Date())}`, 190, y, { align: 'right' });
  doc.setTextColor(0);
  y += 8;

  // ── Dados do Atendimento ───────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...verde);
  doc.text('DADOS DO ATENDIMENTO', 20, y);
  doc.setTextColor(0);
  y += 4;

  doc.autoTable({
    startY: y,
    body: [
      ['NS — Número de Serviço', orcamento.ns || '—'],
      ['Cliente', orcamento.cliente || '—'],
      ['Tipo de Atendimento', orcamento.tipoAtendimento || '—'],
      ['Município', orcamento.municipio || '—'],
      ['Local / Fazenda', orcamento.localUnidade || '—'],
      ['Tensão', `${orcamento.tensaoKv || '—'} kV`],
      ['Carga Atual', `${orcamento.cargaAtual || 0} kW`],
      ['Demanda Futura', `${orcamento.demandaFutura || '—'} kW`],
      ['MUSD', `${orcamento.musd || 0} kW`],
      ...(orcamento.dataEstudo ? [['Data do Estudo', orcamento.dataEstudo]] : []),
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Prazo Estimado ─────────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 20; }

  const prazo = calcularPrazoExport(orcamento);

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...verde);
  doc.text('PRAZO ESTIMADO', 20, y);
  doc.setTextColor(0);
  y += 4;

  const linhasPrazo = [
    ['Extensão total de rede', `${prazo.kmTotal.toFixed(2)} km`],
    ['Prazo base (rede)', `${prazo.prazoRede} dias`],
    ['Obras vinculadas', prazo.prazoVinculadas ? `${prazo.prazoVinculadas} dias` : 'Não informado'],
  ];
  if (orcamento.temObrasVinculadas && orcamento.dataObrasVinculadas) {
    linhasPrazo.push(['Data de conclusão (obras vinculadas)', formatarData(orcamento.dataObrasVinculadas + 'T00:00:00')]);
    if (orcamento.diasObrasVinculadas !== null && orcamento.diasObrasVinculadas !== undefined) {
      linhasPrazo.push(['Dias restantes (obras vinculadas)', `${orcamento.diasObrasVinculadas} dias`]);
    }
  }
  linhasPrazo.push(['PRAZO TOTAL ESTIMADO', `${prazo.prazoFinal} dias`]);
  linhasPrazo.push(['Previsão de conclusão', formatarData(prazo.dataFinal)]);

  doc.autoTable({
    startY: y,
    body: linhasPrazo,
    theme: 'plain',
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 100 }, 1: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Itens de Obra ──────────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 20; }

  doc.autoTable({
    startY: y,
    head: [['#', 'Descrição', 'Categoria', 'Qtd', 'Un.', 'Valor']],
    body: orcamento.itensObra.map((item, i) => [
      i + 1,
      item.descricao,
      item.categoria.toUpperCase(),
      item.quantidade || '',
      item.unidade || '',
      formatarMoeda(item.valor),
    ]),
    foot: [['', '', '', '', 'TOTAL DA OBRA', formatarMoeda(orcamento.totalObra)]],
    theme: 'striped',
    headStyles: { fillColor: verde, fontSize: 9, fontStyle: 'bold' },
    footStyles: { fillColor: [230, 247, 238], textColor: verde, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 5: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Rateio Técnico ─────────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 20; }

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...verde);
  doc.text('RATEIO TÉCNICO', 20, y);
  doc.setTextColor(0);
  y += 4;

  doc.autoTable({
    startY: y,
    body: [
      ['Total da Obra', formatarMoeda(orcamento.totalObra)],
      ['CTC — Cond. Téc. CEMIG (c/ dif. cabo)', formatarMoeda(orcamento.ctcTotal)],
      ['PP — Proporcionalidade', formatarMoeda(orcamento.ppTotal)],
      ['Parcela Regulatória', formatarMoeda(orcamento.parcelaRegTotal)],
      ['ERD disponível', formatarMoeda(v(orcamento.erd))],
      ['Parcela Reg. coberta ERD', formatarMoeda(orcamento.parcelaRegCobertaERD)],
      ['Sobra Parcela Reg.', formatarMoeda(orcamento.sobraParcelaReg)],
      ['PFC do Cliente', formatarMoeda(orcamento.pfcCliente)],
      ['Parcela D (CTC + PP)', formatarMoeda(orcamento.parcelaD)],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 100 }, 1: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Resumo Financeiro ──────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 20; }

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...verde);
  doc.text('RESUMO FINANCEIRO', 20, y);
  doc.setTextColor(0);
  y += 4;

  doc.autoTable({
    startY: y,
    body: [
      ['Material Requisitado (60%)', formatarMoeda(orcamento.material)],
      ['Serviços Contratados (40%)', formatarMoeda(orcamento.servicos)],
      orcamento.administracao > 0
        ? ['Administração/MOP', formatarMoeda(orcamento.administracao)]
        : null,
      ['VALOR TOTAL', formatarMoeda(orcamento.valorTotal)],
    ].filter(Boolean),
    theme: 'plain',
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 100 }, 1: { halign: 'right', fontStyle: 'bold' } },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Memorial Descritivo ────────────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 20; }

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...verde);
  doc.text('MEMORIAL DESCRITIVO', 20, y);
  doc.setTextColor(0);
  y += 7;

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  if (orcamento.descricaoTecnica) {
    const linhas = doc.splitTextToSize(orcamento.descricaoTecnica, 170);
    doc.text(linhas, 20, y);
  }

  // ── Rodapé em todas as páginas ─────────────────────────────────────────────
  const totalPags = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPags; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `Validade: ${formatarData(orcamento.dataValidade)}  |  Data Base: ${formatarData(orcamento.dataBase)}`,
      20, 290
    );
    if (orcamento.dataEstudo) {
      doc.text(`Data do Estudo: ${orcamento.dataEstudo}`, 105, 290, { align: 'center' });
    }
    doc.text(`Página ${p} de ${totalPags}`, 190, 290, { align: 'right' });
    doc.setTextColor(0);
  }

  const nomeArquivo = `Orcamento_${(orcamento.cliente || 'sem-nome').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(nomeArquivo);
};

/* ─────────────────────────────────────────────────────────────────────────────
   RATEIO
   ───────────────────────────────────────────────────────────────────────────── */
export const exportarRateio = (orcamento) => {
  const doc = new jsPDF();
  const v = (x) => parseFloat(x) || 0;
  const verde = [0, 122, 61];
  const azul  = [21, 101, 192];
  let y = 20;

  const secao = (titulo, cor = verde) => {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...cor);
    doc.text(titulo, 20, y);
    doc.setTextColor(0);
    y += 4;
  };

  const itensCTC = orcamento.itensObra.filter(i => i.categoria === 'ctc');
  const itensPP  = orcamento.itensObra.filter(i => i.categoria === 'pp');
  const itensCTI = orcamento.itensObra.filter(i => i.categoria === 'cti');
  const itensReg = orcamento.itensObra.filter(i => i.categoria === 'parcela_reg');
  const totalCTI = itensCTI.reduce((acc, item) => acc + v(item.valor), 0);

  // Cabeçalho
  doc.setFontSize(15);
  doc.setFont(undefined, 'bold');
  doc.text('RATEIO TÉCNICO', 105, y, { align: 'center' });
  y += 8;
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(100);
  doc.text(`NS: ${orcamento.ns || '—'}   |   Cliente: ${orcamento.cliente || '—'}   |   Data: ${formatarData(orcamento.dataBase)}`, 105, y, { align: 'center' });
  doc.setTextColor(0);
  y += 10;

  // CTC
  secao('CTC — CONDIÇÃO TÉCNICA CEMIG');
  doc.autoTable({
    startY: y,
    head: [['Descrição', 'Valor']],
    body: [
      ...itensCTC.map(item => [item.descricao, formatarMoeda(v(item.valor))]),
      ['Diferença de Cabo', formatarMoeda(v(orcamento.diferencaCabo))],
    ],
    foot: [['Total CTC', formatarMoeda(orcamento.ctcTotal)]],
    theme: 'striped',
    headStyles: { fillColor: verde, fontSize: 8, fontStyle: 'bold' },
    footStyles: { fillColor: [230, 247, 238], textColor: verde, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // PP
  secao('PP — PROPORCIONALIDADE');
  doc.autoTable({
    startY: y,
    head: [['Descrição', 'Valor Total', '% CEMIG', 'Valor PP (CEMIG)', 'Valor Cliente']],
    body: itensPP.map(item => {
      const vt  = v(item.valor);
      const pct = parseFloat(item.percentualCemig) || 0;
      return [item.descricao, formatarMoeda(vt), `${pct}%`, formatarMoeda(vt * pct / 100), formatarMoeda(vt * (1 - pct / 100))];
    }),
    foot: [['Total PP CEMIG', '', '', formatarMoeda(orcamento.ppTotal), '']],
    theme: 'striped',
    headStyles: { fillColor: verde, fontSize: 8, fontStyle: 'bold' },
    footStyles: { fillColor: [230, 247, 238], textColor: verde, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // Parcela Regulatória
  if (y > 220) { doc.addPage(); y = 20; }
  secao('PARCELA REGULATÓRIA');
  doc.autoTable({
    startY: y,
    head: [['Descrição', 'Valor']],
    body: [
      ...itensReg.map(item => [item.descricao, formatarMoeda(v(item.valor))]),
      ['Total Parcela Reg',          formatarMoeda(orcamento.parcelaRegTotal)],
      ['ERD disponível',             formatarMoeda(v(orcamento.erd))],
      ['Parcela Reg coberta pelo ERD', formatarMoeda(orcamento.parcelaRegCobertaERD)],
      ['Sobra da Parcela Reg',       formatarMoeda(orcamento.sobraParcelaReg)],
    ],
    theme: 'striped',
    headStyles: { fillColor: verde, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // CTI
  if (y > 220) { doc.addPage(); y = 20; }
  secao('CTI — CONDIÇÃO TÉCNICA DO INTERESSADO');
  doc.autoTable({
    startY: y,
    head: [['Descrição', 'Valor']],
    body: itensCTI.map(item => [item.descricao, formatarMoeda(v(item.valor))]),
    foot: [['Total CTI', formatarMoeda(totalCTI)]],
    theme: 'striped',
    headStyles: { fillColor: verde, fontSize: 8, fontStyle: 'bold' },
    footStyles: { fillColor: [230, 247, 238], textColor: verde, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // Resumo Final
  if (y > 220) { doc.addPage(); y = 20; }
  secao('RESUMO FINAL', azul);
  doc.autoTable({
    startY: y,
    body: [
      ['Total da Obra',            formatarMoeda(orcamento.totalObra)],
      ['CT CEMIG (com dif. cabo)', formatarMoeda(orcamento.ctcTotal)],
      ['PP CEMIG',                 formatarMoeda(orcamento.ppTotal)],
      ['ERD',                      formatarMoeda(v(orcamento.erd))],
      ['PFC do Cliente',           formatarMoeda(orcamento.pfcCliente)],
      ['Parcela D',                formatarMoeda(orcamento.parcelaD)],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 100 }, 1: { halign: 'right', fontStyle: 'bold' } },
  });

  // Rodapé
  const totalPags = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPags; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `Emissão: ${orcamento.municipio || ''}, ${formatarData(orcamento.dataBase)}`,
      105, 285, { align: 'center' }
    );
    doc.text(`Página ${p} de ${totalPags}`, 105, 290, { align: 'center' });
    doc.setTextColor(0);
  }

  const nomeArquivo = `Rateio_${(orcamento.cliente || 'sem-nome').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(nomeArquivo);
};
