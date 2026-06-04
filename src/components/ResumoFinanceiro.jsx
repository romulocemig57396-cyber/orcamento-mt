import React from 'react';
import { formatarMoeda, formatarData } from '../utils/calculos';

const S = {
  card:  { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  title: { fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 700, color: '#007A3D', borderBottom: '2px solid #E7F4EE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
  label: { display: 'block', fontFamily: "'Open Sans',sans-serif", fontSize: '12px', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
  input: { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '14px', color: '#333', outline: 'none', boxSizing: 'border-box', fontFamily: "'Open Sans',sans-serif", background: '#fff', transition: 'border-color 0.2s' },
};
const onFocus = e => { e.target.style.borderColor = '#00A859'; };
const onBlur  = e => { e.target.style.borderColor = '#E0E0E0'; };

function StatCard({ label, value, color, borderColor }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: `4px solid ${borderColor}` }}>
      <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', margin: '0 0 6px 0' }}>{label}</p>
      <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '20px', fontWeight: 800, color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  );
}

function LineRow({ label, value, color = '#333', bold = false, indent = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F5F5F5', paddingLeft: indent ? '12px' : 0 }}>
      <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#555', fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{ fontFamily: bold ? "'Montserrat',sans-serif" : "'Open Sans',sans-serif", fontSize: bold ? '15px' : '13px', fontWeight: bold ? 800 : 600, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export default function ResumoFinanceiro({ dados }) {
  const pfcNeg = dados.pfcCliente < 0;

  return (
    <div>
      {/* ── Stat cards 2×2 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
        <StatCard label="Total da Obra"    value={formatarMoeda(dados.totalObra)}   color="#007A3D" borderColor="#00A859" />
        <StatCard label="PFC do Cliente"   value={formatarMoeda(dados.pfcCliente)}  color={pfcNeg ? '#c0392b' : '#007A3D'} borderColor={pfcNeg ? '#e74c3c' : '#00A859'} />
        <StatCard label="Material (60%)"   value={formatarMoeda(dados.material)}    color="#333"    borderColor="#FFD100" />
        <StatCard label="Valor Total Final" value={formatarMoeda(dados.valorTotal)} color="#007A3D" borderColor="#00A859" />
      </div>

      {/* ── Duas colunas ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* Composição do Custo */}
        <div style={S.card}>
          <h2 style={S.title}>Composição do Custo</h2>
          <LineRow label="Material Requisitado (60%)" value={formatarMoeda(dados.material)}  color="#007A3D" />
          <LineRow label="Serviços Contratados (40%)" value={formatarMoeda(dados.servicos)} color="#007A3D" />

          <div style={{ marginTop: '16px' }}>
            <label style={S.label}>Administração / MOP (opcional)</label>
            <input type="number" value={dados.administracao}
              onChange={e => dados.setOrcamento(prev => ({ ...prev, administracao: parseFloat(e.target.value) || 0 }))}
              style={S.input} placeholder="0,00" onFocus={onFocus} onBlur={onBlur} />
          </div>

          <div style={{ marginTop: '16px', background: '#007A3D', borderRadius: '8px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 700, color: '#fff' }}>Valor Total</span>
            <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '20px', fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{formatarMoeda(dados.valorTotal)}</span>
          </div>
        </div>

        {/* Rateio Detalhado */}
        <div style={S.card}>
          <h2 style={S.title}>Rateio Detalhado</h2>
          <LineRow label="Total da Obra"               value={formatarMoeda(dados.totalObra)}           bold />
          {dados.diferencaCabo > 0 && <LineRow label="+ Diferença de Cabo (CTC)" value={formatarMoeda(dados.diferencaCabo)} color="#8B6D00" indent />}
          <div style={{ height: '1px', background: '#E0E0E0', margin: '4px 0' }} />
          <LineRow label="CTC — Cond. Téc. CEMIG"      value={formatarMoeda(dados.ctcTotal)}            color="#8B6D00" />
          <LineRow label="PP — Proporcionalidade"       value={formatarMoeda(dados.ppTotal)}             color="#2E7D32" />
          <LineRow label="Parcela Reg. coberta (ERD)"   value={formatarMoeda(dados.parcelaRegCobertaERD)} color="#6A1B9A" />
          <div style={{ height: '2px', background: '#E0E0E0', margin: '8px 0' }} />
          <LineRow label="PFC do Cliente"               value={formatarMoeda(dados.pfcCliente)}         color={pfcNeg ? '#c0392b' : '#007A3D'} bold />
          <LineRow label="Parcela D (CTC + PP)"         value={formatarMoeda(dados.parcelaD)}           color="#1565C0" bold />

          {pfcNeg && (
            <div style={{ marginTop: '12px', padding: '10px 14px', background: '#FEE8E8', borderRadius: '8px', border: '1px solid #F5B7B1' }}>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#c0392b', margin: 0, fontWeight: 600 }}>
                PFC negativo — verifique os valores.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Validação ── */}
      <div style={S.card}>
        <h2 style={S.title}>Validação do Cálculo</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
          {[
            { lbl: 'Total Obra',                      val: formatarMoeda(dados.totalObra) },
            { lbl: 'CTC',                             val: formatarMoeda(dados.ctcTotal) },
            { lbl: 'PP',                              val: formatarMoeda(dados.ppTotal) },
            { lbl: 'ERD Coberto',                     val: formatarMoeda(dados.parcelaRegCobertaERD) },
            { lbl: 'PFC = Total − CTC − PP − ERD',   val: formatarMoeda(dados.totalObra - dados.ctcTotal - dados.ppTotal - dados.parcelaRegCobertaERD) },
          ].map(({ lbl, val }) => (
            <div key={lbl} style={{ background: '#F9F9F9', borderRadius: '8px', padding: '12px 14px' }}>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', color: '#AAA', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{lbl}</p>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '14px', fontWeight: 700, color: '#333', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Validade ── */}
      <div style={S.card}>
        <h2 style={S.title}>Validade do Orçamento</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={S.label}>Data Base</label>
            <input type="date" value={dados.dataBase.toISOString().split('T')[0]}
              onChange={e => dados.setOrcamento(prev => ({ ...prev, dataBase: new Date(e.target.value) }))}
              style={S.input} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <label style={S.label}>Data de Validade (+ 120 dias)</label>
            <input type="text" value={formatarData(dados.dataValidade)} disabled
              style={{ ...S.input, background: '#F5F5F5', color: '#AAA', cursor: 'not-allowed' }} />
          </div>
        </div>
        <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#AAA', margin: '10px 0 0 0' }}>
          A validade é calculada automaticamente como 120 dias após a data base.
        </p>
      </div>
    </div>
  );
}
