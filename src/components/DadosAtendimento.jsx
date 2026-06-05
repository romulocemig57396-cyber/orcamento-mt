import React from 'react';

const S = {
  card: {
    background: '#fff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    marginBottom: '20px',
  },
  cardTitle: {
    fontFamily: "'Montserrat', 'Open Sans', sans-serif",
    fontSize: '15px',
    fontWeight: 700,
    color: '#007A3D',
    borderBottom: '2px solid #E7F4EE',
    paddingBottom: '12px',
    marginBottom: '20px',
    marginTop: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  label: {
    display: 'block',
    fontFamily: "'Open Sans', sans-serif",
    fontSize: '12px',
    fontWeight: 600,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1.5px solid #E0E0E0',
    fontSize: '14px',
    fontFamily: "'Open Sans', sans-serif",
    color: '#333',
    background: '#fff',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  grid3: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '16px',
  },
};

const onFocus = e => {
  e.target.style.borderColor = '#00A859';
  e.target.style.boxShadow = '0 0 0 3px rgba(0,168,89,0.12)';
};
const onBlur = e => {
  e.target.style.borderColor = '#E0E0E0';
  e.target.style.boxShadow = 'none';
};

function Field({ label, children, fullWidth = false }) {
  return (
    <div style={fullWidth ? { gridColumn: '1 / -1' } : {}}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

export default function DadosAtendimento({ dados, updateField }) {
  const set = (field, value) => updateField(field, value);

  return (
    <div>

      {/* ── Card: Identificação ── */}
      <div style={S.card}>
        <h2 style={S.cardTitle}>Identificação do Atendimento</h2>

        <div style={S.grid2}>
          <Field label="Cliente">
            <input
              type="text"
              value={dados.cliente}
              onChange={e => set('cliente', e.target.value)}
              placeholder="Nome do cliente"
              style={S.input}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </Field>

          <Field label="NS — Número de Serviço">
            <input
              type="text"
              value={dados.ns || ''}
              onChange={e => set('ns', e.target.value)}
              placeholder="Ex: 12345678"
              style={S.input}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </Field>

          <Field label="Tipo de Atendimento">
            <select
              value={dados.tipoAtendimento}
              onChange={e => set('tipoAtendimento', e.target.value)}
              style={S.input}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">Selecione...</option>
              <option value="LN">LN — Ligação Nova</option>
              <option value="AC">AC — Aumento de Carga</option>
              <option value="RF">RF — Reforma</option>
            </select>
          </Field>

          <Field label="Município">
            <input
              type="text"
              value={dados.municipio}
              onChange={e => set('municipio', e.target.value)}
              placeholder="Santa Vitória"
              style={S.input}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </Field>

          <Field label="Local da Unidade / Fazenda" fullWidth>
            <input
              type="text"
              value={dados.localUnidade}
              onChange={e => set('localUnidade', e.target.value)}
              placeholder="FAZENDA MODELO"
              style={S.input}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </Field>
        </div>
      </div>

      {/* ── Card: Dados Técnicos ── */}
      <div style={S.card}>
        <h2 style={S.cardTitle}>Dados Técnicos</h2>

        <div style={S.grid3}>
          <Field label="Tensão (kV)">
            <input
              type="number"
              step="0.1"
              value={dados.tensaoKv}
              onChange={e => set('tensaoKv', parseFloat(e.target.value) || '')}
              placeholder="13.8"
              style={S.input}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </Field>

          <Field label="Carga Atual (kW)">
            <input
              type="number"
              value={dados.cargaAtual}
              onChange={e => set('cargaAtual', parseFloat(e.target.value) || 0)}
              placeholder="0"
              style={S.input}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </Field>

          <Field label="Demanda Futura (kW)">
            <input
              type="number"
              value={dados.demandaFutura}
              onChange={e => set('demandaFutura', parseFloat(e.target.value) || '')}
              placeholder="290"
              style={S.input}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </Field>

          <Field label="Observações" fullWidth>
            <textarea
              value={dados.observacoes}
              onChange={e => set('observacoes', e.target.value)}
              placeholder="Observações técnicas adicionais..."
              rows={3}
              style={{ ...S.input, resize: 'vertical', lineHeight: '1.5' }}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </Field>
        </div>
      </div>

      {/* ── Stat cards: MUSD + ERD Simulado ── */}
      {(() => {
        const K_2026 = 779.9937688857699;
        const K_2025 = 747.8218066178199;
        const musd   = dados.musd || 0;
        const erd2026 = musd * K_2026;
        const erd2025 = musd * K_2025;

        const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>

            {/* MUSD */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: '4px solid #00A859' }}>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', margin: '0 0 6px 0' }}>
                MUSD Calculado
              </p>
              <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '26px', fontWeight: 800, color: '#007A3D', margin: 0, lineHeight: 1 }}>
                {musd.toFixed(2)}
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#AAA', marginLeft: '5px' }}>kW</span>
              </p>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', color: '#AAA', margin: '6px 0 0 0' }}>
                Carga Futura − Carga Atual
              </p>
            </div>

            {/* ERD Simulado 2026 */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: '4px solid #FFD100' }}>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', margin: '0 0 6px 0' }}>
                ERD Simulado 2026
              </p>
              <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '18px', fontWeight: 800, color: '#007A3D', margin: 0, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                {fmtBRL(erd2026)}
              </p>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '10px', color: '#AAA', margin: '4px 0 8px 0' }}>
                MUSD × K = {K_2026.toFixed(4)}
              </p>
              <button
                onClick={() => set('erd', parseFloat(erd2026.toFixed(2)))}
                style={{ background: '#007A3D', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Open Sans',sans-serif", transition: 'background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#005C2E'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#007A3D'; }}
              >
                Aplicar no Rateio
              </button>
            </div>

            {/* ERD Simulado 2025 */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: '4px solid #E0E0E0' }}>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', margin: '0 0 6px 0' }}>
                ERD Simulado 2025
              </p>
              <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '18px', fontWeight: 800, color: '#555', margin: 0, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                {fmtBRL(erd2025)}
              </p>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '10px', color: '#AAA', margin: '4px 0 0 0' }}>
                MUSD × K = {K_2025.toFixed(4)}
              </p>
            </div>

          </div>
        );
      })()}

      {/* Dica CAOR */}
      <div style={{ background: '#FFFBE6', border: '1px solid #FFE57A', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <span style={{ color: '#8B6D00', fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>💡</span>
        <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#8B6D00', margin: 0, lineHeight: 1.5 }}>
          <strong>Verifique o valor da CAOR</strong> antes de aplicar o ERD simulado no rateio. O valor real pode diferir do simulado conforme a resolução vigente da ANEEL.
        </p>
      </div>

    </div>
  );
}
