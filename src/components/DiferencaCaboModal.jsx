import React, { useState, useMemo } from 'react';
import { getItemById, getValorPorAno, formatarValor } from '../data/tabelaCustos';
import { getCabosCompativeis, calcularDiferencaCabo, ANO_PADRAO } from '../utils/diferencaCabo';
import { formatarMoeda } from '../utils/calculos';

const F = "'Open Sans',sans-serif";
const label = { display: 'block', fontFamily: F, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: '6px' };
const input = { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '14px', fontFamily: F, color: '#333', background: '#fff', outline: 'none', boxSizing: 'border-box' };
const linha = { display: 'flex', justifyContent: 'space-between', fontFamily: F, fontSize: '13px', padding: '4px 0' };

export default function DiferencaCaboModal({ item, onAplicar, onRemover, onFechar }) {
  const ano = item.anoReferencia || ANO_PADRAO;
  const superior = getItemById(item.itemOrigem);
  const compativeis = useMemo(() => getCabosCompativeis(item.itemOrigem, ano), [item.itemOrigem, ano]);
  const [necessarioId, setNecessarioId] = useState(item.caboNecessarioId || '');

  const unitSup = getValorPorAno(superior, ano, 'unitario') || 0;
  const necessario = getItemById(necessarioId);
  const unitNec = necessario ? getValorPorAno(necessario, ano, 'unitario') || 0 : 0;
  const diferenca = necessarioId ? calcularDiferencaCabo(item.itemOrigem, necessarioId, item.quantidade, ano) : 0;
  const valorNecessario = (parseFloat(item.valor) || 0) - diferenca;

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFechar(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px' }}>
      <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '16px', fontWeight: 800, color: '#007A3D', margin: '0 0 16px 0' }}>
          Diferença de Cabo
        </h3>

        <div style={{ background: '#F5FBF8', borderRadius: '8px', padding: '12px 14px', marginBottom: '18px', border: '1px solid #C8E6D6' }}>
          <p style={{ ...label, marginBottom: '4px' }}>Cabo superior (obra Cemig)</p>
          <p style={{ fontFamily: F, fontSize: '14px', fontWeight: 700, color: '#222', margin: '0 0 4px 0' }}>{superior?.tipo}</p>
          <p style={{ fontFamily: F, fontSize: '12px', color: '#666', margin: 0 }}>
            {superior?.categoria} › {superior?.subcategoria} · {item.quantidade} {item.unidade} · R$ {formatarValor(unitSup)} mil/{superior?.unidade} · ano {ano}
          </p>
        </div>

        {compativeis.length === 0 ? (
          <p style={{ fontFamily: F, fontSize: '13px', color: '#8B6D00', background: '#FFFBE6', border: '1px solid #FFE57A', borderRadius: '8px', padding: '10px 14px' }}>
            Não há cabo inferior compatível na biblioteca para este item.
          </p>
        ) : (
          <div style={{ marginBottom: '16px' }}>
            <label style={label}>Cabo necessário para atender o cliente</label>
            <select value={necessarioId} onChange={e => setNecessarioId(e.target.value)} style={{ ...input, appearance: 'none' }} autoFocus>
              <option value="">Selecione...</option>
              {compativeis.map(({ item: c, unitario }) => (
                <option key={c.id} value={c.id}>{c.tipo} — R$ {formatarValor(unitario)} mil/{c.unidade}</option>
              ))}
            </select>
          </div>
        )}

        {necessario && (
          <div style={{ borderTop: '1px solid #EEE', paddingTop: '12px', marginBottom: '8px' }}>
            <div style={linha}><span>Valor com cabo superior</span><strong>{formatarMoeda(item.valor)}</strong></div>
            <div style={linha}><span>Valor com cabo necessário</span><strong>{formatarMoeda(valorNecessario)}</strong></div>
            <div style={{ ...linha, color: '#8B6D00' }}>
              <span>Diferença de cabo (vai para CTC)</span><strong>{formatarMoeda(diferenca)}</strong>
            </div>
            <p style={{ fontFamily: F, fontSize: '11px', color: '#999', margin: '6px 0 0 0' }}>
              (R$ {formatarValor(unitSup)} − R$ {formatarValor(unitNec)} mil) × {item.quantidade} {item.unidade}. O rateio com o cliente usa o valor com cabo necessário.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          {item.caboNecessarioId && (
            <button onClick={onRemover}
              style={{ flex: 1, padding: '11px', borderRadius: '100px', border: '1.5px solid #F5C6C0', background: '#fff', color: '#c0392b', fontSize: '13px', fontWeight: 600, fontFamily: F, cursor: 'pointer' }}>
              Remover diferença
            </button>
          )}
          <button onClick={onFechar}
            style={{ flex: 1, padding: '11px', borderRadius: '100px', border: '1.5px solid #DDD', background: '#fff', color: '#555', fontSize: '13px', fontWeight: 600, fontFamily: F, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button disabled={!necessario} onClick={() => onAplicar({ caboNecessarioId: necessario.id, caboNecessarioTipo: necessario.tipo, diferencaCabo: diferenca })}
            style={{ flex: 1, padding: '11px', borderRadius: '100px', border: 'none', background: necessario ? '#00A859' : '#CCC', color: '#fff', fontSize: '13px', fontWeight: 700, fontFamily: F, cursor: necessario ? 'pointer' : 'not-allowed' }}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
