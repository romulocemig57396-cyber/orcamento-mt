import React, { useState } from 'react';

export default function MateriaisAuxiliares({ materiais, setOrcamento, quantidadePostes }) {
  const [novoMaterial, setNovoMaterial] = useState({
    grupo: 'CA',
    tipo: '',
    kgPorMetro: '',
    metragem: ''
  });

  const adicionarMaterial = () => {
    if (!novoMaterial.tipo || !novoMaterial.kgPorMetro || !novoMaterial.metragem) {
      alert('Preencha todos os campos');
      return;
    }

    const kgPorMetro = parseFloat(novoMaterial.kgPorMetro);
    const metragem = parseFloat(novoMaterial.metragem);
    const pesoTotal = kgPorMetro * metragem;
    const percentual = novoMaterial.grupo === 'CA' ? 1.05 : 1.03;
    const pesoComAcrescimo = pesoTotal * percentual;

    setOrcamento(prev => ({
      ...prev,
      materiaisAuxiliares: [...prev.materiaisAuxiliares, {
        id: Date.now(),
        grupo: novoMaterial.grupo,
        tipo: novoMaterial.tipo,
        kgPorMetro,
        metragem,
        pesoTotal,
        pesoComAcrescimo
      }]
    }));

    setNovoMaterial({ grupo: 'CA', tipo: '', kgPorMetro: '', metragem: '' });
  };

  const removerMaterial = (id) => {
    setOrcamento(prev => ({
      ...prev,
      materiaisAuxiliares: prev.materiaisAuxiliares.filter(m => m.id !== id)
    }));
  };

  const materiaisCA = materiais.filter(m => m.grupo === 'CA');
  const materiaisCAA = materiais.filter(m => m.grupo === 'CAA');

  return (
    <div className="card">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">
        🔌 Materiais Auxiliares
      </h2>

      {/* Formulário de Novo Material */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="font-semibold mb-3 text-gray-700">Adicionar Material</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={novoMaterial.grupo}
            onChange={(e) => setNovoMaterial({ ...novoMaterial, grupo: e.target.value })}
            className="input-field"
          >
            <option value="CA">CA (Cabo de Alumínio)</option>
            <option value="CAA">CAA (Cabo de Alumínio com Alma de Aço)</option>
          </select>

          <input
            type="text"
            value={novoMaterial.tipo}
            onChange={(e) => setNovoMaterial({ ...novoMaterial, tipo: e.target.value })}
            className="input-field"
            placeholder="Tipo (ex: CA4, CAA336)"
          />

          <input
            type="number"
            step="0.001"
            value={novoMaterial.kgPorMetro}
            onChange={(e) => setNovoMaterial({ ...novoMaterial, kgPorMetro: e.target.value })}
            className="input-field"
            placeholder="kg/m"
          />

          <input
            type="number"
            value={novoMaterial.metragem}
            onChange={(e) => setNovoMaterial({ ...novoMaterial, metragem: e.target.value })}
            className="input-field"
            placeholder="Metragem (m)"
          />

          <button onClick={adicionarMaterial} className="btn-primary">
            ➕ Adicionar
          </button>
        </div>
      </div>

      {/* Tabela de Cabos CA */}
      <div className="mb-6">
        <h3 className="font-bold text-lg mb-3 text-gray-700">Cabos CA (Acréscimo 5%)</h3>
        {materiaisCA.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum cabo CA adicionado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-right">kg/m</th>
                  <th className="px-3 py-2 text-right">Metragem (m)</th>
                  <th className="px-3 py-2 text-right">Peso Total (kg)</th>
                  <th className="px-3 py-2 text-right">Peso c/ 5% (kg)</th>
                  <th className="px-3 py-2 text-center">Ação</th>
                </tr>
              </thead>
              <tbody>
                {materiaisCA.map(m => (
                  <tr key={m.id} className="border-b">
                    <td className="px-3 py-2">{m.tipo}</td>
                    <td className="px-3 py-2 text-right">{m.kgPorMetro.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right">{m.metragem.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{m.pesoTotal.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-bold">{m.pesoComAcrescimo.toFixed(2)}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => removerMaterial(m.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tabela de Cabos CAA */}
      <div className="mb-6">
        <h3 className="font-bold text-lg mb-3 text-gray-700">Cabos CAA (Acréscimo 3%)</h3>
        {materiaisCAA.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum cabo CAA adicionado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-right">kg/m</th>
                  <th className="px-3 py-2 text-right">Metragem (m)</th>
                  <th className="px-3 py-2 text-right">Peso Total (kg)</th>
                  <th className="px-3 py-2 text-right">Peso c/ 3% (kg)</th>
                  <th className="px-3 py-2 text-center">Ação</th>
                </tr>
              </thead>
              <tbody>
                {materiaisCAA.map(m => (
                  <tr key={m.id} className="border-b">
                    <td className="px-3 py-2">{m.tipo}</td>
                    <td className="px-3 py-2 text-right">{m.kgPorMetro.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right">{m.metragem.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{m.pesoTotal.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-bold">{m.pesoComAcrescimo.toFixed(2)}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => removerMaterial(m.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cálculo de Postes */}
      <div className="border rounded-lg p-4 bg-blue-50">
        <h3 className="font-bold text-lg mb-2 text-blue-800">📏 Cálculo de Postes</h3>
        <p className="text-sm text-gray-600 mb-2">
          Regra: 1 poste a cada 40 metros
        </p>
        <div className="text-2xl font-bold text-blue-600">
          {quantidadePostes.toFixed(2)} postes
        </div>
      </div>
    </div>
  );
}