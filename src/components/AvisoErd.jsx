import React from 'react';
import { avisoErdDesatualizado } from '../utils/calculos';

const fmtKw = (v) => (parseFloat(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// Aviso de ERD aplicado com MUSD diferente do atual (abas Atendimento e Rateio)
export default function AvisoErd({ dados, onReaplicar }) {
  const aviso = avisoErdDesatualizado(dados);
  if (!aviso) return null;
  const podeReaplicar = (parseFloat(aviso.musdAtual) || 0) > 0;

  return (
    <div style={{ background: '#FFFBE6', border: '1px solid #FFE57A', borderRadius: '8px', padding: '10px 14px', margin: '12px 0', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#8B6D00', margin: 0, flex: 1, fontWeight: 600 }}>
        ⚠️ O ERD foi calculado para MUSD de {fmtKw(aviso.musdAplicado)} kW; o MUSD atual é {fmtKw(aviso.musdAtual)} kW.
      </p>
      <button onClick={onReaplicar} disabled={!podeReaplicar}
        style={{ background: '#fff', border: '1px solid #E6BC00', color: '#8B6D00', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: podeReaplicar ? 'pointer' : 'not-allowed', opacity: podeReaplicar ? 1 : 0.5 }}>
        Reaplicar
      </button>
    </div>
  );
}
