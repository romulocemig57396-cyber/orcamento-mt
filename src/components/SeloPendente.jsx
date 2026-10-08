import React from 'react';
import { TEXTO_PENDENTE, AVISO_PENDENTE } from '../data/biblioteca';

// Item pendente: sem custo cadastrado na referência (unitário 0)
export const COR_PENDENTE = { fundo: '#FFF4E0', fundoHover: '#FDEBCB', texto: '#444', borda: '#F5C26B', selo: '#8A5300' };

export default function SeloPendente({ style }) {
  return (
    <span title="Sem custo cadastrado nesta referência: entra no orçamento com R$ 0,00."
      style={{ marginLeft: '8px', padding: '1px 7px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, fontFamily: "'Open Sans', sans-serif", background: '#FFE7BF', color: COR_PENDENTE.selo, border: `1px solid ${COR_PENDENTE.borda}`, whiteSpace: 'nowrap', ...style }}>
      {TEXTO_PENDENTE}
    </span>
  );
}

export function AvisoPendente({ style }) {
  return (
    <div role="alert" style={{ background: COR_PENDENTE.fundo, border: `1px solid ${COR_PENDENTE.borda}`, borderRadius: '8px', padding: '10px 14px', ...style }}>
      <p style={{ fontFamily: "'Open Sans', sans-serif", fontSize: '13px', fontWeight: 700, color: COR_PENDENTE.selo, margin: 0 }}>
        {AVISO_PENDENTE}
      </p>
    </div>
  );
}
