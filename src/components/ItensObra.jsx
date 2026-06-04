import React, { useState } from 'react';
import { formatarMoeda } from '../utils/calculos';

export default function ItensObra({ itens, setOrcamento }) {
  const [novoItem, setNovoItem] = useState({
    descricao: '',
    categoria: 'cti',
    valor: '',
    percentualCemig: ''
  });

  const adicionarItem = () => {
    if (!novoItem.descricao || !novoItem.valor) {
      alert('Preencha descrição e valor');
      return;
    }

    // Se for PP, validar percentual CEMIG
    if (novoItem.categoria === 'pp' && (!novoItem.percentualCemig || novoItem.percentualCemig < 0 || novoItem.percentualCemig > 100)) {
      alert('Para itens PP, informe o % CEMIG (0-100)');
      return;
    }

    setOrcamento(prev => ({
      ...prev,
      itensObra: [...prev.itensObra, {
        id: Date.now(),
        descricao: novoItem.descricao,
        categoria: novoItem.categoria,
        valor: parseFloat(novoItem.valor),
        percentualCemig: novoItem.categoria === 'pp' ? parseFloat(novoItem.percentualCemig) : 0
      }]
    }));

    setNovoItem({ descricao: '', categoria: 'cti', valor: '', percentualCemig: '' });
  };

  const removerItem = (id) => {
    setOrcamento(prev => ({
      ...prev,
      itensObra: prev.itensObra.filter(item => item.id !== id)
    }));
  };

  const editarItem = (id, field, value) => {
    setOrcamento(prev => ({
      ...prev,
      itensObra: prev.itensObra.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    }));
  };

  const getCategoriaLabel = (cat) => {
    const labels = {
      'cti': 'CTI - Cond. Téc. Interessado',
      'ctc': 'CTC - Cond. Téc. CEMIG',
      'pp': 'PP - Proporcionalidade',
      'parcela_reg': 'Parcela Regulatória'
    };
    return labels[cat] || cat;
  };

  const getCategoriaColor = (cat) => {
    const colors = {
      'cti': 'bg-blue-100 text-blue-800',
      'ctc': 'bg-yellow-100 text-yellow-800',
      'pp': 'bg-green-100 text-green-800',
      'parcela_reg': 'bg-purple-100 text-purple-800'
    };
    return colors[cat] || 'bg-gray-100 text-gray-800';
  };

  const calcularDetalhesItem = (item) => {
    if (item.categoria === 'pp') {
      const valorCemig = item.valor * (item.percentualCemig / 100);
      const valorCliente = item.valor * (1 - item.percentualCemig / 100);
      return { valorCemig, valorCliente, mostrarDetalhes: true };
    }
    return { valorCemig: 0, valorCliente: item.valor, mostrarDetalhes: false };
  };

  return (
    <div className="card">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">
        💰 Itens de Obra
      </h2>

      {/* Formulário de Novo Item */}
      <div className="bg-gray-50 p-4 rounded-lg mb-4">
        <h3 className="font-semibold mb-3 text-gray-700">Adicionar Novo Item</h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <input
              type="text"
              value={novoItem.descricao}
              onChange={(e) => setNovoItem({ ...novoItem, descricao: e.target.value })}
              className="input-field"
              placeholder="Descrição do item"
            />
          </div>
          <div className="md:col-span-3">
            <select
              value={novoItem.categoria}
              onChange={(e) => setNovoItem({ ...novoItem, categoria: e.target.value, percentualCemig: '' })}
              className="input-field text-sm"
            >
              <option value="cti">CTI - Cond. Téc. Interessado</option>
              <option value="ctc">CTC - Cond. Téc. CEMIG</option>
              <option value="pp">PP - Proporcionalidade</option>
              <option value="parcela_reg">Parcela Regulatória</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <input
              type="number"
              step="0.01"
              value={novoItem.valor}
              onChange={(e) => setNovoItem({ ...novoItem, valor: e.target.value })}
              className="input-field"
              placeholder="Valor (R$)"
            />
          </div>
          {novoItem.categoria === 'pp' && (
            <div className="md:col-span-1">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={novoItem.percentualCemig}
                onChange={(e) => setNovoItem({ ...novoItem, percentualCemig: e.target.value })}
                className="input-field"
                placeholder="% CEMIG"
              />
            </div>
          )}
          <div className={novoItem.categoria === 'pp' ? 'md:col-span-1' : 'md:col-span-2'}>
            <button
              onClick={adicionarItem}
              className="btn-primary w-full h-full"
            >
              ➕
            </button>
          </div>
        </div>
        {novoItem.categoria === 'pp' && (
          <div className="mt-2 text-sm text-gray-600">
            💡 Para itens PP: informe o % que a CEMIG paga. O resto vai para Parcela Regulatória.
          </div>
        )}
      </div>

      {/* Tabela de Itens */}
      {itens.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Nenhum item adicionado ainda
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Descrição</th>
                <th className="px-3 py-2 text-center">Categoria</th>
                <th className="px-3 py-2 text-right">Valor Total</th>
                <th className="px-3 py-2 text-center">% CEMIG</th>
                <th className="px-3 py-2 text-right">Valor CEMIG (PP)</th>
                <th className="px-3 py-2 text-right">Parcela Reg</th>
                <th className="px-3 py-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, index) => {
                const { valorCemig, valorCliente, mostrarDetalhes } = calcularDetalhesItem(item);
                
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">{index + 1}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.descricao}
                        onChange={(e) => editarItem(item.id, 'descricao', e.target.value)}
                        className="input-field text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getCategoriaColor(item.categoria)}`}>
                        {getCategoriaLabel(item.categoria).split(' - ')[0]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={item.valor}
                        onChange={(e) => editarItem(item.id, 'valor', parseFloat(e.target.value) || 0)}
                        className="input-field text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {item.categoria === 'pp' ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={item.percentualCemig}
                          onChange={(e) => editarItem(item.id, 'percentualCemig', parseFloat(e.target.value) || 0)}
                          className="input-field text-sm text-center w-16"
                        />
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-green-600 font-semibold">
                      {mostrarDetalhes ? formatarMoeda(valorCemig) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-purple-600 font-semibold">
                      {mostrarDetalhes ? formatarMoeda(valorCliente) : 
                       item.categoria === 'parcela_reg' ? formatarMoeda(item.valor) : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => removerItem(item.id)}
                        className="text-red-600 hover:text-red-800 font-bold"
                        title="Remover item"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-100 font-bold">
              <tr>
                <td colSpan="3" className="px-3 py-3 text-right">TOTAL DA OBRA:</td>
                <td className="px-3 py-3 text-right text-lg text-blue-600">
                  {formatarMoeda(itens.reduce((acc, item) => acc + item.valor, 0))}
                </td>
                <td colSpan="4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="font-semibold text-blue-800 mb-2">ℹ️ Categorias:</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li><strong>CTI (Cond. Téc. Interessado):</strong> Valor pago integralmente pelo cliente</li>
          <li><strong>CTC (Cond. Téc. CEMIG):</strong> Valor pago pela concessionária</li>
          <li><strong>PP (Proporcionalidade):</strong> % CEMIG vai para PP, resto vai para Parcela Regulatória</li>
          <li><strong>Parcela Regulatória:</strong> Pode ser coberta pelo ERD (definido na aba Rateio)</li>
        </ul>
      </div>
    </div>
  );
}