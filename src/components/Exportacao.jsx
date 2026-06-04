import React from 'react';
import { exportarExcel, exportarPDF } from '../utils/exportar';

export default function Exportacao({ orcamento, resetOrcamento }) {
  const handleExportarExcel = () => {
    try {
      exportarExcel(orcamento);
      alert('✅ Arquivo Excel exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      alert('❌ Erro ao exportar Excel. Veja o console.');
    }
  };

  const handleExportarPDF = () => {
    try {
      exportarPDF(orcamento);
      alert('✅ Arquivo PDF exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      alert('❌ Erro ao exportar PDF. Veja o console.');
    }
  };

  const handleNovoOrcamento = () => {
    if (window.confirm('⚠️ Deseja criar um novo orçamento? Os dados atuais serão perdidos.')) {
      resetOrcamento();
      alert('✅ Novo orçamento iniciado!');
    }
  };

  return (
    <div className="card bg-gradient-to-r from-purple-50 to-pink-50">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">
        📤 Exportação e Ações
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={handleExportarExcel}
          className="btn-success flex items-center justify-center gap-2 py-4 text-lg"
        >
          📊 Exportar Excel
        </button>

        <button
          onClick={handleExportarPDF}
          className="btn-primary flex items-center justify-center gap-2 py-4 text-lg"
        >
          📄 Exportar PDF
        </button>

        <button
          onClick={handleNovoOrcamento}
          className="btn-secondary flex items-center justify-center gap-2 py-4 text-lg"
        >
          🆕 Novo Orçamento
        </button>
      </div>

      <div className="mt-6 p-4 bg-white rounded-lg border">
        <h3 className="font-semibold mb-2">💾 Salvamento Automático</h3>
        <p className="text-sm text-gray-600">
          Os dados são salvos automaticamente no navegador. Você pode fechar e reabrir a página sem perder informações.
        </p>
      </div>

      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-semibold mb-2 text-blue-800">ℹ️ Informações</h3>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>✅ Excel: contém todas as abas (Orçamento + Materiais)</li>
          <li>✅ PDF: documento completo formatado para impressão</li>
          <li>✅ Dados salvos localmente (não são enviados para servidor)</li>
        </ul>
      </div>
    </div>
  );
}