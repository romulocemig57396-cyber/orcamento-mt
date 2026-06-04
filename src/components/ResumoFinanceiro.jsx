import React from 'react';
import { formatarMoeda, formatarData } from '../utils/calculos';

export default function ResumoFinanceiro({ dados }) {
  return (
    <div className="card">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">
        💰 Resumo Financeiro
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Composição do Custo */}
        <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
          <h3 className="font-bold text-lg mb-4 text-blue-800">Composição do Custo</h3>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-white rounded">
              <span className="font-semibold">Material Requisitado (60%)</span>
              <span className="text-lg text-blue-600 font-bold">{formatarMoeda(dados.material)}</span>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-white rounded">
              <span className="font-semibold">Serviços Contratados (40%)</span>
              <span className="text-lg text-blue-600 font-bold">{formatarMoeda(dados.servicos)}</span>
            </div>

            <div className="mt-4 pt-4 border-t-2">
              <label className="label text-sm">Administração/MOP (opcional)</label>
              <input
                type="number"
                value={dados.administracao}
                onChange={(e) => dados.setOrcamento(prev => ({ 
                  ...prev, 
                  administracao: parseFloat(e.target.value) || 0 
                }))}
                className="input-field"
                placeholder="0.00"
              />
            </div>

            <div className="mt-4 p-4 bg-blue-600 text-white rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold">VALOR TOTAL</span>
                <span className="text-2xl font-bold">{formatarMoeda(dados.valorTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rateio Detalhado */}
        <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
          <h3 className="font-bold text-lg mb-4 text-green-800">Rateio Detalhado</h3>
          
          <div className="space-y-2">
            <div className="flex justify-between p-2 bg-white rounded">
              <span>Total da Obra</span>
              <span className="font-bold">{formatarMoeda(dados.totalObra)}</span>
            </div>
            
            <div className="flex justify-between p-2 bg-orange-50 rounded text-sm">
              <span>+ Diferença de Cabo (só p/ CTC)</span>
              <span className="font-bold text-orange-700">{formatarMoeda(dados.diferencaCabo)}</span>
            </div>
            
            <div className="border-t my-2"></div>
            
            <div className="flex justify-between p-2 bg-yellow-50 rounded">
              <span>Condição Técnica CEMIG (CTC)</span>
              <span className="font-bold text-yellow-700">{formatarMoeda(dados.ctcTotal)}</span>
            </div>
            
            <div className="flex justify-between p-2 bg-green-50 rounded">
              <span>Proporcionalidade (PP)</span>
              <span className="font-bold text-green-700">{formatarMoeda(dados.ppTotal)}</span>
            </div>
            
            <div className="flex justify-between p-2 bg-purple-50 rounded">
              <span>Parcela Reg coberta (ERD)</span>
              <span className="font-bold text-purple-700">{formatarMoeda(dados.parcelaRegCobertaERD)}</span>
            </div>
            
            <div className="border-t-2 my-2"></div>
            
            <div className="flex justify-between p-3 bg-red-50 rounded">
              <span className="font-bold">PFC do Cliente</span>
              <span className={`font-bold text-lg ${dados.pfcCliente < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatarMoeda(dados.pfcCliente)}
              </span>
            </div>
            
            <div className="flex justify-between p-3 bg-blue-50 rounded">
              <span className="font-bold">Parcela D (CTC + PP)</span>
              <span className="font-bold text-blue-700">{formatarMoeda(dados.parcelaD)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Validação PFC */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
        <h3 className="font-semibold mb-2">🔍 Validação do Cálculo:</h3>
        <div className="text-sm space-y-1">
          <p><strong>Total Obra:</strong> {formatarMoeda(dados.totalObra)} (só itens da tabela)</p>
          <p><strong>CTC:</strong> {formatarMoeda(dados.ctcTotal)} (itens CTC + Dif Cabo {formatarMoeda(dados.diferencaCabo)})</p>
          <p><strong>PP:</strong> {formatarMoeda(dados.ppTotal)}</p>
          <p><strong>ERD coberto:</strong> {formatarMoeda(dados.parcelaRegCobertaERD)}</p>
          <p className="font-bold text-green-700">
            <strong>PFC = Total - CTC - PP - ERD = </strong>
            {formatarMoeda(dados.totalObra - dados.ctcTotal - dados.ppTotal - dados.parcelaRegCobertaERD)}
          </p>
        </div>
      </div>

      {/* Validade */}
      <div className="mt-6 border rounded-lg p-4 bg-gray-50">
        <h3 className="font-bold text-lg mb-3 text-gray-800">📅 Validade do Orçamento</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Data Base</label>
            <input
              type="date"
              value={dados.dataBase.toISOString().split('T')[0]}
              onChange={(e) => dados.setOrcamento(prev => ({ 
                ...prev, 
                dataBase: new Date(e.target.value) 
              }))}
              className="input-field"
            />
          </div>
          
          <div>
            <label className="label">Data de Validade (120 dias)</label>
            <input
              type="text"
              value={formatarData(dados.dataValidade)}
              disabled
              className="input-field bg-gray-100"
            />
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-100 rounded text-blue-800 text-sm">
          ℹ️ A validade é calculada automaticamente como 120 dias após a data base
        </div>
      </div>
    </div>
  );
}