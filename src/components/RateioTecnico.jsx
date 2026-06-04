import React from 'react';
import { formatarMoeda } from '../utils/calculos';

export default function RateioTecnico({ dados, setOrcamento }) {
  // Filtrar itens por categoria
  const itensCTI = dados.itensObra.filter(item => item.categoria === 'cti');
  const itensCTC = dados.itensObra.filter(item => item.categoria === 'ctc');
  const itensPP = dados.itensObra.filter(item => item.categoria === 'pp');
  const itensParcelaReg = dados.itensObra.filter(item => item.categoria === 'parcela_reg');

  return (
    <div className="card">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">
        ⚖️ Rateio Técnico e Financeiro
      </h2>

      {/* CAMPOS SEPARADOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="border rounded-lg p-4 bg-orange-50">
          <label className="label font-bold text-orange-800">Diferença de Cabo (R$)</label>
          <input
            type="number"
            step="0.01"
            value={dados.diferencaCabo}
            onChange={(e) => setOrcamento(prev => ({ ...prev, diferencaCabo: parseFloat(e.target.value) || 0 }))}
            className="input-field"
            placeholder="0.00"
          />
          <p className="text-xs text-orange-600 mt-1">
            ⚠️ NÃO entra no Total da Obra, apenas soma no CTC
          </p>
        </div>

        <div className="border rounded-lg p-4 bg-purple-50">
          <label className="label font-bold text-purple-800">ERD - Parcela Regulatória (R$)</label>
          <input
            type="number"
            step="0.01"
            value={dados.erd}
            onChange={(e) => setOrcamento(prev => ({ ...prev, erd: parseFloat(e.target.value) || 0 }))}
            className="input-field"
            placeholder="0.00"
          />
          <p className="text-xs text-purple-600 mt-1">
            💡 Abate da Parcela Regulatória Total
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CONDIÇÃO TÉCNICA CEMIG (CTC) */}
        <div className="border rounded-lg p-4 bg-yellow-50">
          <h3 className="font-bold text-lg mb-3 text-yellow-800">CTC - Condição Técnica CEMIG</h3>
          
          {itensCTC.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum item CTC adicionado</p>
          ) : (
            <div className="space-y-2 mb-3">
              {itensCTC.map(item => (
                <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded">
                  <span className="text-sm">{item.descricao}</span>
                  <span className="font-semibold">{formatarMoeda(item.valor)}</span>
                </div>
              ))}
            </div>
          )}

          {dados.diferencaCabo > 0 && (
            <div className="flex justify-between items-center bg-orange-100 p-2 rounded mb-2">
              <span className="text-sm font-semibold">+ Diferença de Cabo</span>
              <span className="font-semibold">{formatarMoeda(dados.diferencaCabo)}</span>
            </div>
          )}

          <div className="mt-3 p-3 bg-yellow-100 rounded font-bold">
            TOTAL CTC: {formatarMoeda(dados.ctcTotal)}
          </div>
        </div>

        {/* PROPORCIONALIDADE (PP) */}
        <div className="border rounded-lg p-4 bg-green-50">
          <h3 className="font-bold text-lg mb-3 text-green-800">PP - Proporcionalidade</h3>
          
          {itensPP.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum item PP adicionado</p>
          ) : (
            <div className="space-y-2">
              {itensPP.map(item => {
                const valorCemig = item.valor * (item.percentualCemig / 100);
                const valorParcelaReg = item.valor * (1 - item.percentualCemig / 100);
                
                return (
                  <div key={item.id} className="bg-white p-2 rounded">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold">{item.descricao}</span>
                      <span className="text-xs bg-green-200 px-2 py-1 rounded">{item.percentualCemig}% CEMIG</span>
                    </div>
                    <div className="text-xs space-y-1 ml-2">
                      <div className="flex justify-between">
                        <span>Valor Total:</span>
                        <span>{formatarMoeda(item.valor)}</span>
                      </div>
                      <div className="flex justify-between text-green-700">
                        <span>CEMIG paga (PP):</span>
                        <span className="font-semibold">{formatarMoeda(valorCemig)}</span>
                      </div>
                      <div className="flex justify-between text-purple-600">
                        <span>→ Parcela Regulatória:</span>
                        <span>{formatarMoeda(valorParcelaReg)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 p-3 bg-green-100 rounded font-bold">
            TOTAL PP (CEMIG): {formatarMoeda(dados.ppTotal)}
          </div>
        </div>
      </div>

      {/* PARCELA REGULATÓRIA */}
      <div className="mt-6 border rounded-lg p-4 bg-purple-50">
        <h3 className="font-bold text-lg mb-3 text-purple-800">Parcela Regulatória (coberta pelo ERD)</h3>
        
        <div className="space-y-2 mb-3">
          {itensParcelaReg.length > 0 && (
            <>
              <p className="text-sm font-semibold text-purple-700">Itens diretos:</p>
              {itensParcelaReg.map(item => (
                <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded ml-2">
                  <span className="text-sm">{item.descricao}</span>
                  <span className="font-semibold">{formatarMoeda(item.valor)}</span>
                </div>
              ))}
            </>
          )}

          {itensPP.length > 0 && (
            <>
              <p className="text-sm font-semibold text-purple-700 mt-3">Parte cliente dos itens PP:</p>
              {itensPP.map(item => {
                const valorParcelaReg = item.valor * (1 - item.percentualCemig / 100);
                return (
                  <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded ml-2">
                    <span className="text-sm">{item.descricao} ({100 - item.percentualCemig}%)</span>
                    <span className="font-semibold">{formatarMoeda(valorParcelaReg)}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div className="p-3 bg-purple-100 rounded">
            <p className="text-xs text-purple-600">Parcela Reg Total</p>
            <p className="font-bold text-lg">{formatarMoeda(dados.parcelaRegTotal)}</p>
          </div>
          <div className="p-3 bg-green-100 rounded">
            <p className="text-xs text-green-600">Coberto pelo ERD</p>
            <p className="font-bold text-lg">{formatarMoeda(dados.parcelaRegCobertaERD)}</p>
          </div>
          <div className="p-3 bg-red-100 rounded">
            <p className="text-xs text-red-600">Sobra (vai p/ PFC)</p>
            <p className="font-bold text-lg">{formatarMoeda(dados.sobraParcelaReg)}</p>
          </div>
        </div>
      </div>

      {/* CTI - CONDIÇÃO TÉCNICA DO INTERESSADO */}
      {itensCTI.length > 0 && (
        <div className="mt-6 border rounded-lg p-4 bg-blue-50">
          <h3 className="font-bold text-lg mb-3 text-blue-800">CTI - Condição Técnica do Interessado</h3>
          <div className="space-y-2">
            {itensCTI.map(item => (
              <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded">
                <span className="text-sm">{item.descricao}</span>
                <span className="font-semibold">{formatarMoeda(item.valor)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 bg-blue-100 rounded font-bold">
            TOTAL CTI: {formatarMoeda(itensCTI.reduce((acc, item) => acc + item.valor, 0))}
          </div>
        </div>
      )}

      {/* RESUMO FINAL DO RATEIO */}
      <div className="mt-6 border-2 border-blue-500 rounded-lg p-6 bg-blue-50">
        <h3 className="font-bold text-xl mb-4 text-blue-800">📊 Resumo Final do Rateio</h3>
        
        <div className="space-y-2">
          <div className="flex justify-between text-lg">
            <span className="font-semibold">Total da Obra:</span>
            <span className="font-bold">{formatarMoeda(dados.totalObra)}</span>
          </div>
          <div className="border-t-2 my-3"></div>
          
          <div className="flex justify-between text-yellow-700">
            <span className="font-semibold">CTC (Cond. Téc. CEMIG):</span>
            <span>{formatarMoeda(dados.ctcTotal)}</span>
          </div>
          <div className="flex justify-between text-green-700">
            <span className="font-semibold">PP (Proporcionalidade):</span>
            <span>{formatarMoeda(dados.ppTotal)}</span>
          </div>
          <div className="flex justify-between text-purple-700">
            <span className="font-semibold">Parcela Reg coberta (ERD):</span>
            <span>{formatarMoeda(dados.parcelaRegCobertaERD)}</span>
          </div>
          
          <div className="border-t-2 border-blue-300 pt-3 mt-3"></div>
          
          <div className="flex justify-between font-bold text-lg text-red-600">
            <span>PFC do Cliente:</span>
            <span>{formatarMoeda(dados.pfcCliente)}</span>
          </div>
          <div className="flex justify-between font-bold text-blue-700">
            <span>Parcela D (CTC + PP):</span>
            <span>{formatarMoeda(dados.parcelaD)}</span>
          </div>
        </div>

        {dados.pfcCliente < 0 && (
          <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
            ⚠️ <strong>ATENÇÃO:</strong> PFC do cliente está negativo! Verifique os valores.
          </div>
        )}
      </div>

      <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
        <h4 className="font-semibold mb-2">📝 Fórmulas dos Cálculos:</h4>
        <ul className="text-sm text-gray-700 space-y-1">
          <li><strong>CTC:</strong> Soma itens CTC + Diferença de Cabo</li>
          <li><strong>PP:</strong> Soma (valor × % CEMIG) dos itens PP</li>
          <li><strong>Parcela Reg Total:</strong> Itens Parcela Reg + parte cliente dos itens PP</li>
          <li><strong>Coberto pelo ERD:</strong> Mínimo entre ERD e Parcela Reg Total</li>
          <li><strong>PFC Cliente:</strong> Itens CTI + Sobra da Parcela Reg</li>
          <li><strong>Parcela D:</strong> CTC + PP</li>
        </ul>
      </div>
    </div>
  );
}