import React, { useState } from 'react';
import { useOrcamento } from './hooks/useOrcamento';
import DadosAtendimento from './components/DadosAtendimento';
import ItensObra from './components/ItensObra';
import RateioTecnico from './components/RateioTecnico';
import MateriaisAuxiliares from './components/MateriaisAuxiliares';
import DescricaoTecnica from './components/DescricaoTecnica';
import ResumoFinanceiro from './components/ResumoFinanceiro';
import Exportacao from './components/Exportacao';
import BibliotecaCustos from './components/BibliotecaCustos';

function App() {
  const { orcamento, updateField, resetOrcamento, setOrcamento } = useOrcamento();
  const [abaAtiva, setAbaAtiva] = useState('atendimento');
  const [anoReferencia, setAnoReferencia] = useState(2024);

  const abas = [
    { id: 'atendimento', nome: '📋 Atendimento' },
    { id: 'biblioteca', nome: '📚 Biblioteca Custos' },
    { id: 'itens', nome: '💰 Itens de Obra' },
    { id: 'rateio', nome: '⚖️ Rateio' },
    { id: 'materiais', nome: '🔌 Materiais' },
    { id: 'descricao', nome: '📄 Descrição' },
    { id: 'resumo', nome: '💰 Resumo' },
    { id: 'exportacao', nome: '📤 Exportar' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">⚡ Sistema de Orçamento MT</h1>
          <p className="text-blue-100 mt-1">Orçamento de Obras em Média Tensão</p>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white shadow-md sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex overflow-x-auto">
            {abas.map(aba => (
              <button
                key={aba.id}
                onClick={() => setAbaAtiva(aba.id)}
                className={`px-6 py-4 font-semibold whitespace-nowrap transition-colors border-b-4 ${
                  abaAtiva === aba.id
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                {aba.nome}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        {abaAtiva === 'atendimento' && (
          <DadosAtendimento dados={orcamento} updateField={updateField} />
        )}

        {abaAtiva === 'biblioteca' && (
          <BibliotecaCustos 
            setOrcamento={setOrcamento} 
            anoReferencia={anoReferencia}
            setAnoReferencia={setAnoReferencia}
          />
        )}

        {abaAtiva === 'itens' && (
          <ItensObra itens={orcamento.itensObra} setOrcamento={setOrcamento} />
        )}

        {abaAtiva === 'rateio' && (
          <RateioTecnico dados={orcamento} setOrcamento={setOrcamento} />
        )}

        {abaAtiva === 'materiais' && (
          <MateriaisAuxiliares
            materiais={orcamento.materiaisAuxiliares}
            setOrcamento={setOrcamento}
            quantidadePostes={orcamento.quantidadePostes}
          />
        )}

        {abaAtiva === 'descricao' && (
          <DescricaoTecnica dados={orcamento} setOrcamento={setOrcamento} />
        )}

        {abaAtiva === 'resumo' && (
          <ResumoFinanceiro dados={{ ...orcamento, setOrcamento }} />
        )}

        {abaAtiva === 'exportacao' && (
          <Exportacao orcamento={orcamento} resetOrcamento={resetOrcamento} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-4 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm">
            Sistema de Orçamento MT | Desenvolvido com React.js
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;