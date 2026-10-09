import React from 'react';
import { rotuloFonte } from '../utils/catalogoMateriais';

const CORES = {
  proorc: { background: '#E7F4EE', color: '#007A3D', border: '1px solid #B8E6CC' },
  tod: { background: '#E8F0FB', color: '#1F5FA8', border: '1px solid #BCD3F0' },
};

// Selo da fonte do preço de um material: "PROORC dd/mm/aaaa" ou "TOD mmm/aaaa"
export default function SeloFonte({ fonte, data }) {
  const f = fonte === 'tod' ? 'tod' : 'proorc';
  return (
    <span style={{
      ...CORES[f], display: 'inline-block', borderRadius: '10px', padding: '1px 7px',
      fontFamily: "'Open Sans',sans-serif", fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {rotuloFonte(f, data)}
    </span>
  );
}
