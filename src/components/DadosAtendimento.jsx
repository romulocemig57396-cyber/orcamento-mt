import React from 'react';

export default function DadosAtendimento({ dados, updateField }) {
  const handleChange = (field, value) => {
    updateField(field, value);
  };

  return (
    <div className="card">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">
        📋 Dados do Atendimento
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Cliente *</label>
          <input
            type="text"
            required
            value={dados.cliente}
            onChange={(e) => handleChange('cliente', e.target.value)}
            className="input-field"
            placeholder="Nome do cliente"
          />
        </div>

        <div>
          <label className="label">Tipo de Atendimento *</label>
          <select
            value={dados.tipoAtendimento}
            onChange={(e) => handleChange('tipoAtendimento', e.target.value)}
            className="input-field"
          >
            <option value="">Selecione</option>
            <option value="LN">LN - Ligação Nova</option>
            <option value="AC">AC - Aumento de Carga</option>
            <option value="RF">RF - Reforma</option>
          </select>
        </div>

        <div>
          <label className="label">Tensão (kV) *</label>
          <input
            type="number"
            step="0.1"
            value={dados.tensaoKv}
            onChange={(e) => handleChange('tensaoKv', parseFloat(e.target.value) || '')}
            className="input-field"
            placeholder="13.8"
          />
        </div>

        <div>
          <label className="label">Carga Atual (kW)</label>
          <input
            type="number"
            value={dados.cargaAtual}
            onChange={(e) => handleChange('cargaAtual', parseFloat(e.target.value) || 0)}
            className="input-field"
            placeholder="0"
          />
        </div>

        <div>
          <label className="label">Carga Futura (kW) *</label>
          <input
            type="number"
            value={dados.cargaFutura}
            onChange={(e) => handleChange('cargaFutura', parseFloat(e.target.value) || '')}
            className="input-field"
            placeholder="290"
          />
        </div>

        <div>
          <label className="label">Município *</label>
          <input
            type="text"
            value={dados.municipio}
            onChange={(e) => handleChange('municipio', e.target.value)}
            className="input-field"
            placeholder="Santa Vitória"
          />
        </div>

        <div className="md:col-span-2">
          <label className="label">Local da Unidade/Fazenda *</label>
          <input
            type="text"
            value={dados.localUnidade}
            onChange={(e) => handleChange('localUnidade', e.target.value)}
            className="input-field"
            placeholder="FAZENDA MODELO"
          />
        </div>

        <div>
          <label className="label">Coordenada Inicial</label>
          <input
            type="text"
            value={dados.coordenadaInicial}
            onChange={(e) => handleChange('coordenadaInicial', e.target.value)}
            className="input-field"
            placeholder="Ex: -19.123456, -46.123456"
          />
        </div>

        <div>
          <label className="label">Coordenada Final</label>
          <input
            type="text"
            value={dados.coordenadaFinal}
            onChange={(e) => handleChange('coordenadaFinal', e.target.value)}
            className="input-field"
            placeholder="Ex: -19.123456, -46.123456"
          />
        </div>

        <div>
          <label className="label">Extensão de Rede (m)</label>
          <input
            type="number"
            value={dados.extensaoRede}
            onChange={(e) => handleChange('extensaoRede', parseFloat(e.target.value) || '')}
            className="input-field"
            placeholder="20"
          />
        </div>

        <div>
          <label className="label">Tipo de Rede</label>
          <select
            value={dados.tipoRede}
            onChange={(e) => handleChange('tipoRede', e.target.value)}
            className="input-field"
          >
            <option value="">Selecione</option>
            <option value="trifasica_convencional">Trifásica Convencional</option>
            <option value="trifasica_compacta">Trifásica Compacta</option>
            <option value="monofasica">Monofásica</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="label">Observações</label>
          <textarea
            value={dados.observacoes}
            onChange={(e) => handleChange('observacoes', e.target.value)}
            className="input-field"
            rows="3"
            placeholder="Observações técnicas adicionais..."
          />
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm font-semibold text-blue-800">
          📊 MUSD Calculado: {dados.musd ? dados.musd.toFixed(2) : '0.00'} kW
        </p>
        <p className="text-xs text-blue-600 mt-1">
          (Carga Futura - Carga Atual)
        </p>
      </div>
    </div>
  );
}