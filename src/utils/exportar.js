import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatarMoeda, formatarData } from './calculos';

// Exportar para Excel
export const exportarExcel = (orcamento) => {
  const workbook = XLSX.utils.book_new();
  
  // ABA PRINCIPAL - Orçamento
  const dadosPrincipais = [
    ['ORÇAMENTO DE OBRA MT'],
    [''],
    ['DADOS DO ATENDIMENTO'],
    ['Cliente', orcamento.cliente],
    ['Tipo de Atendimento', orcamento.tipoAtendimento],
    ['Tensão (kV)', orcamento.tensaoKv],
    ['Carga Atual (kW)', orcamento.cargaAtual || 0],
    ['Carga Futura (kW)', orcamento.cargaFutura],
    ['MUSD (kW)', orcamento.musd],
    ['Município', orcamento.municipio],
    ['Local', orcamento.localUnidade],
    ['Extensão de Rede (m)', orcamento.extensaoRede || 0],
    ['Tipo de Rede', orcamento.tipoRede],
    [''],
    ['CUSTOS DE OBRA'],
    ['Item', 'Descrição', 'Categoria', 'Valor'],
    ...orcamento.itensObra.map((item, i) => [
      i + 1,
      item.descricao,
      item.categoria,
      item.valor
    ]),
    [''],
    ['TOTAL DA OBRA', '', '', orcamento.totalObra],
    [''],
    ['CONDIÇÃO TÉCNICA (CT)'],
    ...orcamento.itensCT.map(item => [item.descricao, item.valor]),
    ['Diferença de Cabo', orcamento.diferencaCabo || 0],
    ['TOTAL CT', orcamento.ctTotal],
    [''],
    ['PROPORCIONALIDADE (PP)'],
    ...orcamento.itensPP.map(item => [item.descricao, item.valor]),
    ['TOTAL PP', orcamento.ppTotal],
    [''],
    ['RATEIO FINAL'],
    ['Obras', orcamento.totalObra],
    ['CT', orcamento.ctTotal],
    ['PP', orcamento.ppTotal],
    ['ERD', orcamento.erd || 0],
    ['PFC Cliente', orcamento.pfcCliente],
    ['Parcela D', orcamento.parcelaD],
    [''],
    ['RESUMO FINANCEIRO'],
    ['Material Requisitado (60%)', orcamento.material],
    ['Serviços Contratados (40%)', orcamento.servicos],
    ['VALOR TOTAL', orcamento.valorTotal],
    [''],
    ['Validade', formatarData(orcamento.dataValidade)],
    ['Emissão', formatarData(orcamento.dataBase)],
  ];
  
  const ws1 = XLSX.utils.aoa_to_sheet(dadosPrincipais);
  XLSX.utils.book_append_sheet(workbook, ws1, 'Orçamento');
  
  // ABA AUXILIAR - Materiais
  if (orcamento.materiaisAuxiliares && orcamento.materiaisAuxiliares.length > 0) {
    const dadosAuxiliares = [
      ['MATERIAIS AUXILIARES'],
      [''],
      ['CABOS CA'],
      ['Tipo', 'kg/m', 'Metragem (m)', 'Peso Total (kg)', 'Peso c/ Acréscimo (kg)'],
      ...orcamento.materiaisAuxiliares
        .filter(m => m.grupo === 'CA')
        .map(m => [m.tipo, m.kgPorMetro, m.metragem, m.pesoTotal, m.pesoComAcrescimo]),
      [''],
      ['CABOS CAA'],
      ['Tipo', 'kg/m', 'Metragem (m)', 'Peso Total (kg)', 'Peso c/ Acréscimo (kg)'],
      ...orcamento.materiaisAuxiliares
        .filter(m => m.grupo === 'CAA')
        .map(m => [m.tipo, m.kgPorMetro, m.metragem, m.pesoTotal, m.pesoComAcrescimo]),
      [''],
      ['POSTES'],
      ['Metragem (m)', 'Quantidade de Postes'],
      [orcamento.extensaoRede || 0, orcamento.quantidadePostes || 0],
    ];
    
    const ws2 = XLSX.utils.aoa_to_sheet(dadosAuxiliares);
    XLSX.utils.book_append_sheet(workbook, ws2, 'Materiais');
  }
  
  // Salvar arquivo
  const nomeArquivo = `Orcamento_${orcamento.cliente.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, nomeArquivo);
};

// Exportar para PDF
export const exportarPDF = (orcamento) => {
  const doc = new jsPDF();
  let yPosition = 20;
  
  // Cabeçalho
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('ORÇAMENTO DE OBRA MT', 105, yPosition, { align: 'center' });
  yPosition += 15;
  
  // Dados do Atendimento
  doc.setFontSize(14);
  doc.text('DADOS DO ATENDIMENTO', 20, yPosition);
  yPosition += 10;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const dadosAtendimento = [
    `Cliente: ${orcamento.cliente}`,
    `Município: ${orcamento.municipio}`,
    `Tipo de Atendimento: ${orcamento.tipoAtendimento}`,
    `Tensão: ${orcamento.tensaoKv} kV`,
    `Carga Futura: ${orcamento.cargaFutura} kW`,
    `MUSD: ${orcamento.musd} kW`,
    `Extensão de Rede: ${orcamento.extensaoRede || 0} m`,
    `Tipo de Rede: ${orcamento.tipoRede}`,
  ];
  
  dadosAtendimento.forEach(linha => {
    doc.text(linha, 20, yPosition);
    yPosition += 6;
  });
  
  yPosition += 5;
  
  // Tabela de Itens de Obra
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('CUSTOS DE OBRA', 20, yPosition);
  yPosition += 5;
  
  doc.autoTable({
    startY: yPosition,
    head: [['#', 'Descrição', 'Categoria', 'Valor']],
    body: orcamento.itensObra.map((item, i) => [
      i + 1,
      item.descricao,
      item.categoria,
      formatarMoeda(item.valor)
    ]),
    foot: [['', '', 'TOTAL', formatarMoeda(orcamento.totalObra)]],
    theme: 'striped',
    headStyles: { fillColor: [66, 139, 202] },
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
  });
  
  yPosition = doc.lastAutoTable.finalY + 10;
  
  // Rateio Técnico
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('RATEIO TÉCNICO', 20, yPosition);
  yPosition += 5;
  
  doc.autoTable({
    startY: yPosition,
    body: [
      ['Obras', formatarMoeda(orcamento.totalObra)],
      ['Condição Técnica (CT)', formatarMoeda(orcamento.ctTotal)],
      ['Proporcionalidade (PP)', formatarMoeda(orcamento.ppTotal)],
      ['ERD', formatarMoeda(orcamento.erd || 0)],
      ['PFC do Cliente', formatarMoeda(orcamento.pfcCliente)],
      ['Parcela Demanda Regulada Técnica D', formatarMoeda(orcamento.parcelaD)],
    ],
    theme: 'plain',
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' }
    }
  });
  
  yPosition = doc.lastAutoTable.finalY + 10;
  
  // Resumo Financeiro
  if (yPosition > 250) {
    doc.addPage();
    yPosition = 20;
  }
  
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('RESUMO FINANCEIRO', 20, yPosition);
  yPosition += 5;
  
  doc.autoTable({
    startY: yPosition,
    body: [
      ['Material Requisitado (60%)', formatarMoeda(orcamento.material)],
      ['Serviços Contratados (40%)', formatarMoeda(orcamento.servicos)],
      ['VALOR TOTAL', formatarMoeda(orcamento.valorTotal)],
    ],
    theme: 'plain',
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right', fontStyle: 'bold' }
    }
  });
  
  yPosition = doc.lastAutoTable.finalY + 10;
  
  // Memorial Descritivo
  if (yPosition > 220) {
    doc.addPage();
    yPosition = 20;
  }
  
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('MEMORIAL DESCRITIVO', 20, yPosition);
  yPosition += 7;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const textoDescritivo = doc.splitTextToSize(orcamento.descricaoTecnica, 170);
  doc.text(textoDescritivo, 20, yPosition);
  
  // Rodapé
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Validade: ${formatarData(orcamento.dataValidade)} | Emissão: ${formatarData(orcamento.dataBase)}`,
      105,
      285,
      { align: 'center' }
    );
    doc.text(`Página ${i} de ${totalPages}`, 105, 290, { align: 'center' });
  }
  
  // Salvar PDF
  const nomeArquivo = `Orcamento_${orcamento.cliente.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(nomeArquivo);
};