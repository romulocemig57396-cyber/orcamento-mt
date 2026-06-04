import React from 'react';
import { formatarMoeda } from '../utils/calculos';

const S = {
  card:  { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  title: { fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 700, color: '#007A3D', borderBottom: '2px solid #E7F4EE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
  label: { display: 'block', fontFamily: "'Open Sans',sans-serif", fontSize: '12px', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
  input: { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '14px', color: '#333', outline: 'none', boxSizing: 'border-box', fontFamily: "'Open Sans',sans-serif", background: '#fff', transition: 'border-color 0.2s' },
};
const onFocus = e => { e.target.style.borderColor = '#00A859'; };
const onBlur  = e => { e.target.style.borderColor = '#E0E0E0'; };

function SectionCard({ title, borderColor, children }) {
  return (
    <div style={{ ...S.card, borderTop: `3px solid ${borderColor}` }}>
      <h2 style={S.title}>{title}</h2>
      {children}
    </div>
  );
}

function ItemRow({ descricao, valor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#FAFAFA', borderRadius: '6px', marginBottom: '6px' }}>
      <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#444' }}>{descricao}</span>
      <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 600, color: '#222', fontVariantNumeric: 'tabular-nums' }}>{formatarMoeda(valor)}</span>
    </div>
  );
}

function TotalBadge({ label, valor, bg, color }) {
  return (
    <div style={{ background: bg, borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
      <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 700, color }}>{label}</span>
      <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '16px', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{formatarMoeda(valor)}</span>
    </div>
  );
}

function LineItem({ label, valor, color = '#333', bold = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F5F5F5' }}>
      <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#555', fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{ fontFamily: bold ? "'Montserrat',sans-serif" : "'Open Sans',sans-serif", fontSize: bold ? '15px' : '13px', fontWeight: bold ? 800 : 600, color, fontVariantNumeric: 'tabular-nums' }}>{formatarMoeda(valor)}</span>
    </div>
  );
}

export default function RateioTecnico({ dados, setOrcamento }) {
  const itensCTI = dados.itensObra.filter(i => i.categoria === 'cti');
  const itensCTC = dados.itensObra.filter(i => i.categoria === 'ctc');
  const itensPP  = dados.itensObra.filter(i => i.categoria === 'pp');
  const itensReg = dados.itensObra.filter(i => i.categoria === 'parcela_reg');

  return (
    <div>
      {/* ── Entradas manuais ── */}
      <div style={S.card}>
        <h2 style={S.title}>Valores de Referência</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={S.label}>Diferença de Cabo (R$)</label>
            <input type="number" step="0.01" value={dados.diferencaCabo}
              onChange={e => setOrcamento(prev => ({ ...prev, diferencaCabo: parseFloat(e.target.value) || 0 }))}
              style={S.input} placeholder="0,00" onFocus={onFocus} onBlur={onBlur} />
            <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', color: '#AAA', margin: '4px 0 0 0' }}>Não entra no Total da Obra — apenas soma no CTC</p>
          </div>
          <div>
            <label style={S.label}>ERD — Parcela Regulatória (R$)</label>
            <input type="number" step="0.01" value={dados.erd}
              onChange={e => setOrcamento(prev => ({ ...prev, erd: parseFloat(e.target.value) || 0 }))}
              style={S.input} placeholder="0,00" onFocus={onFocus} onBlur={onBlur} />
            <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', color: '#AAA', margin: '4px 0 0 0' }}>Abate da Parcela Regulatória Total</p>
          </div>
        </div>
      </div>

      {/* ── CTC ── */}
      <SectionCard title="CTC — Condição Técnica CEMIG" borderColor="#FFD100">
        {itensCTC.length === 0
          ? <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#BBB' }}>Nenhum item CTC adicionado.</p>
          : itensCTC.map(i => <ItemRow key={i.id} descricao={i.descricao} valor={i.valor} />)}
        {dados.diferencaCabo > 0 && (
          <div style={{ ...S.card, margin: '6px 0 0 0', padding: '10px 12px', background: '#FFFBE6', border: '1px solid #FFE57A', boxShadow: 'none' }}>
            <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#8B6D00' }}>+ Diferença de Cabo: <strong>{formatarMoeda(dados.diferencaCabo)}</strong></span>
          </div>
        )}
        <TotalBadge label="Total CTC" valor={dados.ctcTotal} bg="#FFFBE6" color="#8B6D00" />
      </SectionCard>

      {/* ── PP ── */}
      <SectionCard title="PP — Proporcionalidade" borderColor="#00A859">
        {itensPP.length === 0
          ? <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#BBB' }}>Nenhum item PP adicionado.</p>
          : itensPP.map(i => {
              const cemig   = i.valor * (i.percentualCemig / 100);
              const parcela = i.valor * (1 - i.percentualCemig / 100);
              return (
                <div key={i.id} style={{ background: '#FAFAFA', borderRadius: '8px', padding: '12px', marginBottom: '8px', border: '1px solid #F0F0F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 600, color: '#222' }}>{i.descricao}</span>
                    <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7', padding: '2px 8px', borderRadius: '12px' }}>{i.percentualCemig}% CEMIG</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    {[['Total', i.valor, '#333'], ['CEMIG paga (PP)', cemig, '#2E7D32'], ['Parcela Reg.', parcela, '#6A1B9A']].map(([lbl, val, clr]) => (
                      <div key={lbl} style={{ background: '#fff', borderRadius: '6px', padding: '8px 10px', border: '1px solid #EEE' }}>
                        <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '10px', color: '#999', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lbl}</p>
                        <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 700, color: clr, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatarMoeda(val)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        <TotalBadge label="Total PP (CEMIG paga)" valor={dados.ppTotal} bg="#E8F5E9" color="#2E7D32" />
      </SectionCard>

      {/* ── Parcela Regulatória ── */}
      <SectionCard title="Parcela Regulatória" borderColor="#9C27B0">
        {itensReg.map(i => <ItemRow key={i.id} descricao={i.descricao} valor={i.valor} />)}
        {itensPP.length > 0 && (
          <>
            <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '12px 0 6px 0' }}>Parte cliente dos itens PP</p>
            {itensPP.map(i => {
              const parcela = i.valor * (1 - i.percentualCemig / 100);
              return <ItemRow key={i.id} descricao={`${i.descricao} (${100 - i.percentualCemig}%)`} valor={parcela} />;
            })}
          </>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '14px' }}>
          {[
            { lbl: 'Total Parcela Reg.', val: dados.parcelaRegTotal,     bg: '#F3E5F5', clr: '#6A1B9A' },
            { lbl: 'Coberto pelo ERD',   val: dados.parcelaRegCobertaERD, bg: '#E8F5E9', clr: '#2E7D32' },
            { lbl: 'Sobra (vai p/ PFC)', val: dados.sobraParcelaReg,      bg: '#FEE8E8', clr: '#c0392b' },
          ].map(({ lbl, val, bg, clr }) => (
            <div key={lbl} style={{ background: bg, borderRadius: '8px', padding: '12px 14px' }}>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', color: clr, opacity: 0.7, margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{lbl}</p>
              <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '16px', fontWeight: 800, color: clr, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatarMoeda(val)}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── CTI ── */}
      {itensCTI.length > 0 && (
        <SectionCard title="CTI — Condição Técnica do Interessado" borderColor="#2196F3">
          {itensCTI.map(i => <ItemRow key={i.id} descricao={i.descricao} valor={i.valor} />)}
          <TotalBadge label="Total CTI" valor={itensCTI.reduce((a, i) => a + i.valor, 0)} bg="#E3F2FD" color="#1565C0" />
        </SectionCard>
      )}

      {/* ── Resumo Final ── */}
      <div style={{ ...S.card, borderTop: '3px solid #007A3D' }}>
        <h2 style={S.title}>Resumo Final do Rateio</h2>
        <LineItem label="Total da Obra"           valor={dados.totalObra}           bold />
        <div style={{ height: '1px', background: '#E0E0E0', margin: '4px 0' }} />
        <LineItem label="CTC — Cond. Téc. CEMIG"  valor={dados.ctcTotal}            color="#8B6D00" />
        <LineItem label="PP — Proporcionalidade"   valor={dados.ppTotal}             color="#2E7D32" />
        <LineItem label="Parcela Reg. coberta (ERD)" valor={dados.parcelaRegCobertaERD} color="#6A1B9A" />
        <div style={{ height: '2px', background: '#E0E0E0', margin: '8px 0' }} />
        <LineItem label="PFC do Cliente"           valor={dados.pfcCliente}  color={dados.pfcCliente < 0 ? '#c0392b' : '#007A3D'} bold />
        <LineItem label="Parcela D (CTC + PP)"     valor={dados.parcelaD}            color="#1565C0" bold />

        {dados.pfcCliente < 0 && (
          <div style={{ marginTop: '14px', padding: '12px 14px', background: '#FEE8E8', borderRadius: '8px', border: '1px solid #F5B7B1' }}>
            <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#c0392b', margin: 0, fontWeight: 600 }}>
              Atenção: PFC do cliente está negativo. Verifique os valores.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
