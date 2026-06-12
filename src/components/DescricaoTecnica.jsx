import React from 'react';
import { gerarMemorialDescritivo } from '../utils/gerarTexto';

const S = {
  card:  { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  title: { fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 700, color: '#007A3D', borderBottom: '2px solid #E7F4EE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
  label: { display: 'block', fontFamily: "'Open Sans',sans-serif", fontSize: '12px', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
};

export default function DescricaoTecnica({ dados, setOrcamento }) {
  return (
    <div style={S.card}>
      <h2 style={S.title}>Memorial Descritivo Técnico</h2>

      <div style={{ marginBottom: '16px' }}>
        <label style={S.label}>Texto Descritivo (editável)</label>
        <textarea
          value={dados.descricaoTecnica}
          onChange={e => setOrcamento(prev => ({ ...prev, descricaoTecnica: e.target.value }))}
          style={{
            width: '100%',
            height: '300px',
            padding: '14px',
            borderRadius: '8px',
            border: '1.5px solid #E0E0E0',
            fontSize: '13px',
            fontFamily: 'monospace, "Courier New", Courier',
            lineHeight: 1.6,
            color: '#333',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
            background: '#FAFAFA',
            transition: 'border-color 0.2s',
          }}
          onFocus={e => { e.target.style.borderColor = '#00A859'; e.target.style.background = '#fff'; }}
          onBlur={e  => { e.target.style.borderColor = '#E0E0E0'; e.target.style.background = '#FAFAFA'; }}
          placeholder="O memorial descritivo será gerado automaticamente com base nos dados do Atendimento..."
        />
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={() => {
            const textoGerado = gerarMemorialDescritivo(dados);
            setOrcamento(prev => ({ ...prev, descricaoTecnica: textoGerado }));
          }}
          style={{ background: '#00A859', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Open Sans',sans-serif", transition: 'background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#007A3D'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#00A859'; }}
        >
          Regerar Texto Automático
        </button>

        <button
          onClick={() => {
            navigator.clipboard.writeText(dados.descricaoTecnica);
            alert('Texto copiado para a área de transferência!');
          }}
          style={{ background: '#fff', color: '#555', border: '1px solid #ccc', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: "'Open Sans',sans-serif", transition: 'background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
        >
          Copiar Texto
        </button>
      </div>
    </div>
  );
}
