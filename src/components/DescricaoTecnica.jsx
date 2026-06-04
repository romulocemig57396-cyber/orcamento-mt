import React, { useEffect } from 'react';
import { gerarMemorialDescritivo } from '../utils/gerarTexto';

export default function DescricaoTecnica({ dados, setOrcamento }) {
  useEffect(() => {
    // Gerar automaticamente quando dados mudarem
    const textoGerado = gerarMemorialDescritivo(dados);
    setOrcamento(prev => ({ ...prev, descricaoTecnica: textoGerado }));
  }, [
    dados.cliente,
    dados.tipoAtendimento,
    dados.cargaFutura,
    dados.tensaoKv,
    dados.municipio,
    dados.localUnidade,
    dados.extensaoRede,
    dados.tipoRede
  ]);

  return (
    <div className="card">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">
        📄 Memorial Descritivo Técnico
      </h2>

      <div className="mb-4">
        <label className="label">
          Texto Descritivo (editável)
        </label>
        <textarea
          value={dados.descricaoTecnica}
          onChange={(e) => setOrcamento(prev => ({ ...prev, descricaoTecnica: e.target.value }))}
          className="input-field font-mono text-sm"
          rows="15"
          placeholder="O memorial descritivo será gerado automaticamente..."
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => {
            const textoGerado = gerarMemorialDescritivo(dados);
            setOrcamento(prev => ({ ...prev, descricaoTecnica: textoGerado }));
          }}
          className="btn-secondary"
        >
          🔄 Regerar Texto Automático
        </button>
        
        <button
          onClick={() => {
            navigator.clipboard.writeText(dados.descricaoTecnica);
            alert('Texto copiado para a área de transferência!');
          }}
          className="btn-primary"
        >
          📋 Copiar Texto
        </button>
      </div>
    </div>
  );
}