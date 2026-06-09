import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatarMoeda, formatarData } from './calculos';

/* ─────────────────────────────────────────────────────────────────────────────
   EXCEL
   ───────────────────────────────────────────────────────────────────────────── */
export const exportarExcel = (orcamento) => {
  const workbook = XLSX.utils.book_new();

  // Filtros por categoria financeira
  const itensCTC = orcamento.itensObra.filter(i => i.categoria === 'ctc');
  const itensPP  = orcamento.itensObra.filter(i => i.categoria === 'pp');
  const itensCTI = orcamento.itensObra.filter(i => i.categoria === 'cti');
  const itensReg = orcamento.itensObra.filter(i => i.categoria === 'parcela_reg');

  const totalCTC = orcamento.ctcTotal;
  const totalPP  = orcamento.ppTotal;

  // ── Aba Orçamento ──────────────────────────────────────────────────────────
  const dados = [
    ['NS — Número de Serviço:', orcamento.ns || ''],
    ['Cliente:', orcamento.cliente || ''],
    [],
    // Cabeçalho da tabela de itens
    ['', 'DESCRIÇÃO', 'CUSTOS DE OBRA', '', 'CONDIÇÃO TÉCNICA (CT)', '', 'PROPORCIONALIDADE (PP)', '', 'ATENDIMENTO', '', '', '', 'PFC'],
  ];

  // Itens CEMIG (CTC)
  itensCTC.forEach((item, i) => {
    dados.push([i + 1, item.descricao, item.valor]);
  });

  // Itens PP
  itensPP.forEach((item, i) => {
    const valorCemig   = item.valor * (item.percentualCemig / 100);
    const valorCliente = item.valor * (1 - item.percentualCemig / 100);
    dados.push([itensCTC.length + i + 1, item.descricao, item.valor, '', valorCemig, '', valorCliente]);
  });

  // Total CEMIG
  dados.push(['', 'Total', '', '', totalCTC, '', totalPP]);
  dados.push([]);

  // Itens Cliente (CTI)
  itensCTI.forEach((item, i) => {
    dados.push([i + 1, item.descricao, item.valor]);
  });

  // Itens Parcela Regulatória
  if (itensReg.length > 0) {
    dados.push([]);
    dados.push(['PARCELA REGULATÓRIA']);
    itensReg.forEach((item, i) => {
      dados.push([i + 1, item.descricao, item.valor]);
    });
  }

  dados.push([]);

  // Diferença de Cabo
  if (orcamento.diferencaCabo > 0) {
    dados.push(['DIFERENÇA DE CABO', '', '']);
    dados.push([1, 'Diferença de cabo', orcamento.diferencaCabo]);
    dados.push([]);
  }

  // Total Geral
  dados.push(['', 'Total', orcamento.totalObra]);
  dados.push([]);

  // Bloco lateral de resumo
  dados.push(['OBRAS',                            orcamento.totalObra]);
  dados.push(['CARGA ATUAL (kW)',                 orcamento.cargaAtual || 0]);
  dados.push(['CARGA FUTURA (kW)',                orcamento.demandaFutura || 0]);
  dados.push(['MUSD (kW)',                        orcamento.musd || 0]);
  dados.push(['ERD',                              orcamento.erd || 0]);
  dados.push(['PFC',                              orcamento.pfcCliente]);
  dados.push(['CT',                               orcamento.ctcTotal]);
  dados.push(['PP',                               orcamento.ppTotal]);
  dados.push(['Parc Demanda Regulada Técnica D:', orcamento.parcelaD]);
  dados.push([]);

  // Descrição Técnica
  dados.push(['DESCRIÇÃO DE OBRA']);
  dados.push([orcamento.descricaoTecnica || '']);
  dados.push([]);

  // Resumo Financeiro
  dados.push(['Administração',          '', orcamento.administracao || 0]);
  dados.push(['Material requisitado',   '', orcamento.material]);
  dados.push(['Serviços contratados',   '', orcamento.servicos]);
  dados.push(['Valor total da obra',    '', orcamento.valorTotal]);
  dados.push([]);

  // Validade e emissão
  dados.push(['Validade:',             '', formatarData(orcamento.dataValidade)]);
  dados.push([`${orcamento.municipio || ''},`, '', formatarData(orcamento.dataBase)]);

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

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('ORÇAMENTO DE OBRA MT', 105, y, { align: 'center' });
  y += 10;

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(100);
  doc.text('Sistema de Orçamento — Média Tensão', 105, y, { align: 'center' });
  doc.setTextColor(0);
  y += 12;

  // ── Dados do Atendimento ───────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('DADOS DO ATENDIMENTO', 20, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  const atendimento = [
    ['NS:', orcamento.ns || '—'],
    ['Cliente:', orcamento.cliente || '—'],
    ['Município:', orcamento.municipio || '—'],
    ['Tipo de Atendimento:', orcamento.tipoAtendimento || '—'],
    ['Tensão:', `${orcamento.tensaoKv || '—'} kV`],
    ['Demanda Futura:', `${orcamento.demandaFutura || '—'} kW`],
    ['MUSD:', `${orcamento.musd || 0} kW`],
  ];
  atendimento.forEach(([label, val]) => {
    doc.setFont(undefined, 'bold');
    doc.text(label, 20, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(val), 65, y);
    y += 5;
  });
  y += 5;

  // ── Itens de Obra ──────────────────────────────────────────────────────────
  doc.autoTable({
    startY: y,
    head: [['#', 'Descrição', 'Categoria', 'Valor']],
    body: orcamento.itensObra.map((item, i) => [
      i + 1,
      item.descricao,
      item.categoria.toUpperCase(),
      formatarMoeda(item.valor),
    ]),
    foot: [['', '', 'TOTAL', formatarMoeda(orcamento.totalObra)]],
    theme: 'striped',
    headStyles: { fillColor: verde, fontSize: 9, fontStyle: 'bold' },
    footStyles: { fillColor: [230, 247, 238], textColor: [0, 122, 61], fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 3: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Rateio Técnico ─────────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 20; }

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('RATEIO TÉCNICO', 20, y);
  y += 4;

  doc.autoTable({
    startY: y,
    body: [
      ['Obras',                              formatarMoeda(orcamento.totalObra)],
      ['Condição Técnica (CTC)',             formatarMoeda(orcamento.ctcTotal)],
      ['Proporcionalidade (PP)',             formatarMoeda(orcamento.ppTotal)],
      ['ERD',                               formatarMoeda(orcamento.erd || 0)],
      ['PFC do Cliente',                    formatarMoeda(orcamento.pfcCliente)],
      ['Parcela Demanda Regulada Técnica D', formatarMoeda(orcamento.parcelaD)],
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
  doc.text('RESUMO FINANCEIRO', 20, y);
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
  doc.text('MEMORIAL DESCRITIVO', 20, y);
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
      `Validade: ${formatarData(orcamento.dataValidade)}  |  Emissão: ${orcamento.municipio || ''}, ${formatarData(orcamento.dataBase)}`,
      105, 285, { align: 'center' }
    );
    doc.text(`Página ${p} de ${totalPags}`, 105, 290, { align: 'center' });
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
