import React from 'react';
import { exportarExcel, exportarPDF } from '../utils/exportar';

const S = {
  card:  { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  title: { fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 700, color: '#007A3D', borderBottom: '2px solid #E7F4EE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
};

function ExportRow({ iconBg, iconColor, iconText, title, desc, onExport }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '10px', border: '1.5px solid #E0E0E0', background: '#fff', marginBottom: '10px', transition: 'border-color 0.2s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#00A859'; e.currentTarget.style.background = '#F5FBF8'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E0E0E0'; e.currentTarget.style.background = '#fff'; }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '12px', fontWeight: 900, color: iconColor }}>{iconText}</span>
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: '14px', color: '#222', margin: '0 0 2px 0' }}>{title}</p>
        <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#999', margin: 0 }}>{desc}</p>
      </div>
      <button onClick={onExport}
        style={{ background: '#00A859', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Open Sans',sans-serif", flexShrink: 0, transition: 'background 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#007A3D'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#00A859'; }}>
        Exportar
      </button>
    </div>
  );
}

export default function Exportacao({ orcamento, resetOrcamento }) {
  const handleExcel = () => {
    try { exportarExcel(orcamento); alert('Arquivo Excel exportado com sucesso!'); }
    catch (err) { console.error(err); alert('Erro ao exportar Excel. Veja o console.'); }
  };

  const handlePDF = () => {
    try { exportarPDF(orcamento); alert('Arquivo PDF exportado com sucesso!'); }
    catch (err) { console.error(err); alert('Erro ao exportar PDF. Veja o console.'); }
  };

  const handleNovo = () => {
    if (window.confirm('Deseja criar um novo orçamento? Os dados atuais serão perdidos.')) {
      resetOrcamento();
      alert('Novo orçamento iniciado.');
    }
  };

  return (
    <div style={{ maxWidth: '640px' }}>

      {/* ── Exportar ── */}
      <div style={S.card}>
        <h2 style={S.title}>Exportar Orçamento</h2>
        {/* Excel — desabilitado temporariamente */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '10px', border: '1.5px solid #E0E0E0', background: '#FAFAFA', marginBottom: '10px', opacity: 0.5 }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#E8F7EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '12px', fontWeight: 900, color: '#007A3D' }}>XLS</span>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: '14px', color: '#222', margin: '0 0 2px 0' }}>Exportar Excel</p>
            <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#999', margin: 0 }}>Planilha completa com todas as abas do orçamento</p>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <button disabled onClick={handleExcel}
              style={{ background: '#00A859', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'not-allowed', fontFamily: "'Open Sans',sans-serif" }}>
              Exportar
            </button>
            <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', color: '#AAA', margin: '4px 0 0 0' }}>Em desenvolvimento</p>
          </div>
        </div>
        <ExportRow
          iconBg="#FEE8E8" iconColor="#c0392b" iconText="PDF"
          title="Exportar PDF"
          desc="Documento formatado e pronto para impressão"
          onExport={handlePDF}
        />
      </div>

      {/* ── Informações ── */}
      <div style={S.card}>
        <h2 style={S.title}>Informações</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            'Os dados são salvos automaticamente no navegador a cada alteração.',
            'Você pode fechar e reabrir a página sem perder o orçamento.',
            'Nenhum dado é enviado para servidores externos — tudo fica local.',
          ].map((txt, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', background: '#F9FFF9', borderRadius: '8px', border: '1px solid #D4ECD9' }}>
              <span style={{ color: '#00A859', fontWeight: 700, fontSize: '15px', lineHeight: 1, marginTop: '1px', flexShrink: 0 }}>✓</span>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#444', margin: 0, lineHeight: 1.5 }}>{txt}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Zona de Perigo ── */}
      <div style={{ ...S.card, borderTop: '3px solid #e74c3c' }}>
        <h2 style={{ ...S.title, color: '#c0392b', borderBottom: '2px solid #FDEDEC' }}>Zona de Perigo</h2>
        <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#777', marginBottom: '16px', marginTop: 0 }}>
          Reinicia todos os campos do orçamento atual. Esta ação não pode ser desfeita.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={handleNovo}
            style={{ background: '#e74c3c', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Open Sans',sans-serif", transition: 'background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#c0392b'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#e74c3c'; }}>
            Novo Orçamento
          </button>

          <button
            onClick={() => {
              if (window.confirm('Limpar todos os dados salvos no navegador e recarregar a página?')) {
                localStorage.removeItem('orcamento_mt_app');
                window.location.reload();
              }
            }}
            style={{ background: '#fff', color: '#888', border: '1px solid #DDD', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Open Sans',sans-serif", transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#BBB'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#DDD'; }}>
            Limpar dados do navegador
          </button>
        </div>
      </div>

    </div>
  );
}
