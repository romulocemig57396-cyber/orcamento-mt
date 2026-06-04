import React, { useState } from 'react';
import { formatarMoeda } from '../utils/calculos';

const S = {
  card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  title: { fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 700, color: '#007A3D', borderBottom: '2px solid #E7F4EE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
  label: { display: 'block', fontFamily: "'Open Sans',sans-serif", fontSize: '12px', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
  input: { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '14px', color: '#333', outline: 'none', boxSizing: 'border-box', fontFamily: "'Open Sans',sans-serif", background: '#fff', transition: 'border-color 0.2s' },
};

const onFocus = e => { e.target.style.borderColor = '#00A859'; e.target.style.boxShadow = '0 0 0 3px rgba(0,168,89,0.1)'; };
const onBlur  = e => { e.target.style.borderColor = '#E0E0E0'; e.target.style.boxShadow = 'none'; };

const CATEGORIA_META = {
  cti:         { label: 'CTI', style: { background: '#E8F7EE', color: '#007A3D', border: '1px solid #B8E6CC' } },
  ctc:         { label: 'CTC', style: { background: '#FFFBE6', color: '#8B6D00', border: '1px solid #FFE57A' } },
  pp:          { label: 'PP',  style: { background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7' } },
  parcela_reg: { label: 'REG', style: { background: '#F3E5F5', color: '#6A1B9A', border: '1px solid #CE93D8' } },
};

const BADGE_BASE = { padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, fontFamily: "'Open Sans',sans-serif", display: 'inline-flex', alignItems: 'center' };

export default function ItensObra({ itens, setOrcamento }) {
  const [novo, setNovo] = useState({ descricao: '', categoria: 'cti', valor: '', percentualCemig: '', quantidade: '', unidade: 'km', distanciaKm: '' });
  const [hoveredRow, setHoveredRow] = useState(null);

  const adicionar = () => {
    if (!novo.descricao || !novo.valor) { alert('Preencha descrição e valor'); return; }
    if (novo.categoria === 'pp' && (!novo.percentualCemig || novo.percentualCemig < 0 || novo.percentualCemig > 100)) {
      alert('Para itens PP, informe o % CEMIG (0-100)'); return;
    }
    setOrcamento(prev => ({
      ...prev,
      itensObra: [...prev.itensObra, {
        id: Date.now(),
        descricao: novo.descricao,
        categoria: novo.categoria,
        valor: parseFloat(novo.valor),
        percentualCemig: novo.categoria === 'pp' ? parseFloat(novo.percentualCemig) : 0,
        quantidade: novo.quantidade ? parseFloat(novo.quantidade) : null,
        unidade: novo.unidade || '',
      }],
    }));
    setNovo({ descricao: '', categoria: 'cti', valor: '', percentualCemig: '', quantidade: '', unidade: 'km', distanciaKm: '' });
  };

  const remover  = id => setOrcamento(prev => ({ ...prev, itensObra: prev.itensObra.filter(i => i.id !== id) }));
  const editar   = (id, field, value) => setOrcamento(prev => ({ ...prev, itensObra: prev.itensObra.map(i => i.id === id ? { ...i, [field]: value } : i) }));

  const detalhe  = item => item.categoria === 'pp'
    ? { cemig: item.valor * (item.percentualCemig / 100), cliente: item.valor * (1 - item.percentualCemig / 100), show: true }
    : { cemig: 0, cliente: item.valor, show: false };

  const th = (txt, align = 'left') => ({
    padding: '10px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: '#fff', background: '#007A3D', textAlign: align, whiteSpace: 'nowrap',
  });

  return (
    <div>
      {/* ── Adicionar Item ── */}
      <div style={S.card}>
        <h2 style={S.title}>Adicionar Item</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '4fr 2.5fr 1fr 1.5fr 1.5fr auto', gap: '12px', alignItems: 'end' }}>
          <div>
            <label style={S.label}>Descrição</label>
            <input type="text" value={novo.descricao} onChange={e => setNovo({ ...novo, descricao: e.target.value })}
              placeholder="Descrição do item" style={S.input} onFocus={onFocus} onBlur={onBlur}
              onKeyDown={e => e.key === 'Enter' && adicionar()} />
          </div>
          <div>
            <label style={S.label}>Categoria</label>
            <select value={novo.categoria} onChange={e => setNovo({ ...novo, categoria: e.target.value, percentualCemig: '' })}
              style={{ ...S.input, appearance: 'none' }} onFocus={onFocus} onBlur={onBlur}>
              <option value="cti">CTI — Cond. Téc. Interessado</option>
              <option value="ctc">CTC — Cond. Téc. CEMIG</option>
              <option value="pp">PP — Proporcionalidade</option>
              <option value="parcela_reg">Parcela Regulatória</option>
            </select>
          </div>
          <div>
            <label style={S.label}>
              {novo.unidade === 'poste' ? 'Qtd. (postes)' : 'Qtd.'}
            </label>
            <input type="number" step="1" min="0" value={novo.quantidade}
              onChange={e => {
                const postes = e.target.value;
                const km = postes ? (parseFloat(postes) * 40 / 1000) : '';
                setNovo({ ...novo, quantidade: postes, distanciaKm: km ? km.toFixed(3) : '' });
              }}
              placeholder="0" style={S.input} onFocus={onFocus} onBlur={onBlur} />
            {novo.unidade === 'poste' && novo.quantidade && (
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', color: '#00A859', margin: '4px 0 0 0', fontWeight: 600 }}>
                ≈ {(parseFloat(novo.quantidade) * 40 / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km
              </p>
            )}
          </div>
          <div>
            <label style={S.label}>Unidade</label>
            <select value={novo.unidade}
              onChange={e => setNovo({ ...novo, unidade: e.target.value, quantidade: '', distanciaKm: '' })}
              style={{ ...S.input, appearance: 'none' }} onFocus={onFocus} onBlur={onBlur}>
              <option value="km">km</option>
              <option value="poste">poste</option>
              <option value="ponto">ponto</option>
              <option value="un">un</option>
              <option value="m">m</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Valor (R$ mil)</label>
            <input type="number" step="0.01" value={novo.valor} onChange={e => setNovo({ ...novo, valor: e.target.value })}
              placeholder="0,00" style={S.input} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div style={{ paddingTop: '18px' }}>
            <button onClick={adicionar}
              style={{ background: '#00A859', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Open Sans',sans-serif", whiteSpace: 'nowrap', height: '42px' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#007A3D'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#00A859'; }}>
              + Adicionar
            </button>
          </div>
        </div>

        {/* ── Conversor km ↔ postes ── */}
        {novo.unidade === 'poste' && (
          <div style={{ marginTop: '12px', background: '#F0F9F4', borderRadius: '8px', padding: '12px 14px', border: '1px solid #C8E6D6' }}>
            <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', fontWeight: 700, color: '#007A3D', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px 0' }}>
              Conversor: 1 poste = 40 m
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '180px' }}>
                <label style={{ ...S.label, color: '#007A3D', marginBottom: '4px' }}>Distância (km)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={novo.distanciaKm}
                  onChange={e => {
                    const km = e.target.value;
                    const postes = km ? Math.round(parseFloat(km) * 1000 / 40) : '';
                    setNovo({ ...novo, distanciaKm: km, quantidade: postes !== '' ? String(postes) : '' });
                  }}
                  placeholder="Ex: 14.84"
                  style={{ ...S.input, borderColor: '#B8E6CC' }}
                  onFocus={e => { e.target.style.borderColor = '#00A859'; }}
                  onBlur={e  => { e.target.style.borderColor = '#B8E6CC'; }}
                />
              </div>
              <div style={{ paddingTop: '18px', color: '#007A3D', fontSize: '18px', fontWeight: 700 }}>→</div>
              <div>
                <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', color: '#666', margin: '0 0 4px 0' }}>Postes calculados</p>
                <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '20px', fontWeight: 800, color: '#007A3D', margin: 0 }}>
                  {novo.quantidade || '—'}
                  {novo.quantidade && <span style={{ fontSize: '12px', fontWeight: 400, color: '#999', marginLeft: '4px' }}>postes</span>}
                </p>
              </div>
            </div>
          </div>
        )}

        {novo.categoria === 'pp' && (
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '160px' }}>
              <label style={S.label}>% CEMIG</label>
              <input type="number" step="1" min="0" max="100" value={novo.percentualCemig}
                onChange={e => setNovo({ ...novo, percentualCemig: e.target.value })}
                placeholder="%" style={S.input} onFocus={onFocus} onBlur={onBlur} />
            </div>
            <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#888', marginTop: '18px' }}>
              % que a CEMIG paga. O restante vai para Parcela Regulatória.
            </p>
          </div>
        )}
      </div>

      {/* ── Lista de Itens ── */}
      <div style={S.card}>
        <h2 style={S.title}>
          Itens Cadastrados
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#AAA', marginLeft: '8px', textTransform: 'none', letterSpacing: 0 }}>
            ({itens.length} {itens.length === 1 ? 'item' : 'itens'})
          </span>
        </h2>

        {itens.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#BBB' }}>
            <p style={{ fontSize: '32px', marginBottom: '8px' }}>—</p>
            <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '14px' }}>Nenhum item adicionado ainda</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', margin: '0 -24px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Open Sans',sans-serif" }}>
              <thead>
                <tr>
                  <th style={th('#'        )}>Nº</th>
                  <th style={th('Descrição')}>Descrição</th>
                  <th style={th('Categoria', 'center')}>Categoria</th>
                  <th style={th('Valor Total', 'right')}>Valor Total</th>
                  <th style={th('% CEMIG',    'center')}>% CEMIG</th>
                  <th style={th('Valor PP',   'right')}>Valor PP</th>
                  <th style={th('Parcela Reg','right')}>Parcela Reg.</th>
                  <th style={th('',           'center')}></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item, idx) => {
                  const d   = detalhe(item);
                  const meta = CATEGORIA_META[item.categoria] || CATEGORIA_META.cti;
                  const bg  = hoveredRow === item.id ? '#F5FBF8' : idx % 2 === 0 ? '#fff' : '#FAFAFA';
                  return (
                    <tr key={item.id} style={{ background: bg, transition: 'background 0.1s' }}
                      onMouseEnter={() => setHoveredRow(item.id)} onMouseLeave={() => setHoveredRow(null)}>
                      <td style={{ padding: '8px 14px', fontSize: '12px', color: '#AAA', borderBottom: '1px solid #F0F0F0' }}>{idx + 1}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid #F0F0F0' }}>
                        <input type="text" value={item.descricao} onChange={e => editar(item.id, 'descricao', e.target.value)}
                          style={{ ...S.input, padding: '6px 10px', fontSize: '13px' }} onFocus={onFocus} onBlur={onBlur} />
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'center', borderBottom: '1px solid #F0F0F0' }}>
                        <span style={{ ...BADGE_BASE, ...meta.style }}>{meta.label}</span>
                      </td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid #F0F0F0' }}>
                        <input type="number" step="0.01" value={item.valor} onChange={e => editar(item.id, 'valor', parseFloat(e.target.value) || 0)}
                          style={{ ...S.input, padding: '6px 10px', fontSize: '13px', textAlign: 'right' }} onFocus={onFocus} onBlur={onBlur} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #F0F0F0' }}>
                        {item.categoria === 'pp' ? (
                          <input type="number" step="1" min="0" max="100" value={item.percentualCemig}
                            onChange={e => editar(item.id, 'percentualCemig', parseFloat(e.target.value) || 0)}
                            style={{ ...S.input, padding: '6px 10px', fontSize: '13px', textAlign: 'center', width: '72px' }}
                            onFocus={onFocus} onBlur={onBlur} />
                        ) : <span style={{ color: '#CCC' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: '13px', color: '#2E7D32', fontWeight: 600, borderBottom: '1px solid #F0F0F0', fontVariantNumeric: 'tabular-nums' }}>
                        {d.show ? formatarMoeda(d.cemig) : <span style={{ color: '#CCC' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: '13px', color: '#6A1B9A', fontWeight: 600, borderBottom: '1px solid #F0F0F0', fontVariantNumeric: 'tabular-nums' }}>
                        {d.show ? formatarMoeda(d.cliente) : item.categoria === 'parcela_reg' ? formatarMoeda(item.valor) : <span style={{ color: '#CCC' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'center', borderBottom: '1px solid #F0F0F0' }}>
                        <button onClick={() => remover(item.id)}
                          style={{ background: 'none', border: 'none', color: '#CCC', fontSize: '13px', cursor: 'pointer', fontFamily: "'Open Sans',sans-serif", padding: '4px 8px', borderRadius: '4px' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#c0392b'; e.currentTarget.style.background = '#FFF0EE'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#CCC';    e.currentTarget.style.background = 'none'; }}>
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F9F9F9', borderTop: '2px solid #E0E0E0' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontFamily: "'Open Sans',sans-serif", fontSize: '12px', fontWeight: 700, color: '#555', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total da Obra
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 800, color: '#007A3D', fontVariantNumeric: 'tabular-nums' }}>
                    {formatarMoeda(itens.reduce((a, i) => a + i.valor, 0))}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Legenda ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
        {Object.entries(CATEGORIA_META).map(([, m]) => (
          <div key={m.label} style={{ ...S.card, marginBottom: 0, padding: '14px 16px' }}>
            <span style={{ ...BADGE_BASE, ...m.style, marginBottom: '6px', display: 'inline-flex' }}>{m.label}</span>
            <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', color: '#777', margin: 0, lineHeight: 1.4 }}>
              {m.label === 'CTI' ? 'Cond. Téc. Interessado' : m.label === 'CTC' ? 'Cond. Téc. CEMIG' : m.label === 'PP' ? 'Proporcionalidade' : 'Parcela Regulatória'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
