import React, { useState } from 'react';

const S = {
  card:  { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  title: { fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 700, color: '#007A3D', borderBottom: '2px solid #E7F4EE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
  label: { display: 'block', fontFamily: "'Open Sans',sans-serif", fontSize: '12px', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
  input: { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '14px', color: '#333', outline: 'none', boxSizing: 'border-box', fontFamily: "'Open Sans',sans-serif", background: '#fff', transition: 'border-color 0.2s' },
};
const onFocus = e => { e.target.style.borderColor = '#00A859'; };
const onBlur  = e => { e.target.style.borderColor = '#E0E0E0'; };

const thStyle = (align = 'left') => ({
  padding: '10px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#fff', background: '#007A3D', textAlign: align, whiteSpace: 'nowrap',
});
const tdStyle = (align = 'left', bold = false) => ({
  padding: '10px 14px', fontSize: '13px', color: bold ? '#222' : '#555',
  fontWeight: bold ? 700 : 400, textAlign: align, borderBottom: '1px solid #F0F0F0',
  fontFamily: "'Open Sans',sans-serif", fontVariantNumeric: 'tabular-nums',
});

function TabelaCabos({ itens, acrescimo, remover }) {
  const [hovered, setHovered] = useState(null);
  if (itens.length === 0)
    return <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#BBB', padding: '16px 0' }}>Nenhum cabo adicionado.</p>;
  return (
    <div style={{ overflowX: 'auto', margin: '0 -24px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle()}>Tipo</th>
            <th style={thStyle('right')}>kg/m</th>
            <th style={thStyle('right')}>Metragem (m)</th>
            <th style={thStyle('right')}>Peso Total (kg)</th>
            <th style={thStyle('right')}>Peso c/ {acrescimo}% (kg)</th>
            <th style={thStyle('center')}></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((m, idx) => {
            const bg = hovered === m.id ? '#F5FBF8' : idx % 2 === 0 ? '#fff' : '#FAFAFA';
            return (
              <tr key={m.id} style={{ background: bg, transition: 'background 0.1s' }}
                onMouseEnter={() => setHovered(m.id)} onMouseLeave={() => setHovered(null)}>
                <td style={tdStyle()}>{m.tipo}</td>
                <td style={tdStyle('right')}>{m.kgPorMetro.toFixed(3)}</td>
                <td style={tdStyle('right')}>{m.metragem.toFixed(2)}</td>
                <td style={tdStyle('right')}>{m.pesoTotal.toFixed(2)}</td>
                <td style={tdStyle('right', true)}>{m.pesoComAcrescimo.toFixed(2)}</td>
                <td style={{ ...tdStyle('center'), borderBottom: '1px solid #F0F0F0' }}>
                  <button onClick={() => remover(m.id)}
                    style={{ background: 'none', border: 'none', color: '#CCC', fontSize: '13px', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontFamily: "'Open Sans',sans-serif" }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#c0392b'; e.currentTarget.style.background = '#FFF0EE'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#CCC';    e.currentTarget.style.background = 'none'; }}>
                    Remover
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function MateriaisAuxiliares({ materiais, setOrcamento }) {
  const [novo, setNovo] = useState({ grupo: 'CA', tipo: '', kgPorMetro: '', metragem: '' });

  const adicionar = () => {
    if (!novo.tipo || !novo.kgPorMetro || !novo.metragem) { alert('Preencha todos os campos'); return; }
    const kgPorMetro       = parseFloat(novo.kgPorMetro);
    const metragem         = parseFloat(novo.metragem);
    const pesoTotal        = kgPorMetro * metragem;
    const pesoComAcrescimo = pesoTotal * (novo.grupo === 'CA' ? 1.05 : 1.03);
    setOrcamento(prev => ({
      ...prev,
      materiaisAuxiliares: [...prev.materiaisAuxiliares, { id: Date.now(), grupo: novo.grupo, tipo: novo.tipo, kgPorMetro, metragem, pesoTotal, pesoComAcrescimo }],
    }));
    setNovo({ grupo: 'CA', tipo: '', kgPorMetro: '', metragem: '' });
  };

  const remover = id => setOrcamento(prev => ({ ...prev, materiaisAuxiliares: prev.materiaisAuxiliares.filter(m => m.id !== id) }));

  const cabosCA  = materiais.filter(m => m.grupo === 'CA');
  const cabosCAA = materiais.filter(m => m.grupo === 'CAA');

  return (
    <div>
      {/* ── Formulário ── */}
      <div style={S.card}>
        <h2 style={S.title}>Materiais Auxiliares</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 2fr auto', gap: '12px', alignItems: 'end' }}>
          <div>
            <label style={S.label}>Grupo</label>
            <select value={novo.grupo} onChange={e => setNovo({ ...novo, grupo: e.target.value })}
              style={{ ...S.input, appearance: 'none' }} onFocus={onFocus} onBlur={onBlur}>
              <option value="CA">CA — Cabo de Alumínio</option>
              <option value="CAA">CAA — Cabo de Alumínio c/ Alma de Aço</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Tipo</label>
            <input type="text" value={novo.tipo} onChange={e => setNovo({ ...novo, tipo: e.target.value })}
              placeholder="Ex: CA4, CAA336" style={S.input} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <label style={S.label}>kg/m</label>
            <input type="number" step="0.001" value={novo.kgPorMetro} onChange={e => setNovo({ ...novo, kgPorMetro: e.target.value })}
              placeholder="0.000" style={S.input} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <label style={S.label}>Metragem (m)</label>
            <input type="number" value={novo.metragem} onChange={e => setNovo({ ...novo, metragem: e.target.value })}
              placeholder="0" style={S.input} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div style={{ paddingTop: '18px' }}>
            <button onClick={adicionar}
              style={{ background: '#00A859', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Open Sans',sans-serif", height: '42px', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#007A3D'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#00A859'; }}>
              + Adicionar
            </button>
          </div>
        </div>
      </div>

      {/* ── Cabos CA ── */}
      <div style={S.card}>
        <h2 style={S.title}>Cabos CA <span style={{ fontSize: '12px', fontWeight: 400, color: '#AAA', textTransform: 'none', letterSpacing: 0 }}>(Acréscimo 5%)</span></h2>
        <TabelaCabos itens={cabosCA} acrescimo={5} remover={remover} />
      </div>

      {/* ── Cabos CAA ── */}
      <div style={S.card}>
        <h2 style={S.title}>Cabos CAA <span style={{ fontSize: '12px', fontWeight: 400, color: '#AAA', textTransform: 'none', letterSpacing: 0 }}>(Acréscimo 3%)</span></h2>
        <TabelaCabos itens={cabosCAA} acrescimo={3} remover={remover} />
      </div>
    </div>
  );
}
