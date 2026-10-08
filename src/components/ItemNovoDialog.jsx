import React, { useMemo, useState } from 'react';
import { BIBLIOTECA, getCategorias, getSubcategorias } from '../data/biblioteca';
import {
  sugerirItemNovo, validarItemNovo, gerarIdItem, projetoSemServicos, UNIDADES_ITEM_NOVO,
} from '../proorc/itensNovos';
import { calcularPorProorc } from '../proorc/formacao';

const F = "'Open Sans',sans-serif";
const S = {
  label: { display: 'block', fontFamily: F, fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
  input: { padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '13px', color: '#333', outline: 'none', boxSizing: 'border-box', fontFamily: F, background: '#fff', width: '100%' },
  texto: { fontFamily: F, fontSize: '12px', color: '#666', margin: 0, lineHeight: 1.6 },
};
const reais = (n) => `R$ ${(parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mil = (n) => (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

/* Diálogo "Criar item novo" a partir de um projeto do relatório do PROORC.
   `onCriar(definicao)` recebe o que o administrador confirmou.             */
export default function ItemNovoDialog({ projeto, itensNovos = [], precoUSConstrucao, onCriar, onCancelar }) {
  const [d, setD] = useState(() => sugerirItemNovo(projeto));
  const semServicos = projetoSemServicos(projeto);
  const set = (campo, valor) => setD(prev => ({ ...prev, [campo]: valor }));
  const setMaoObra = (campo, valor) => setD(prev => ({ ...prev, maoObra: { ...prev.maoObra, [campo]: valor } }));

  const erros = validarItemNovo(d, { biblioteca: BIBLIOTECA, itensNovos, projeto });
  const idPrevisto = d.tipo.trim() && d.categoria.trim()
    ? gerarIdItem(d.tipo.trim(), d.categoria.trim(), [...BIBLIOTECA.itens, ...itensNovos].map(i => i.id))
    : '—';

  // Estimativa do custo com a mesma regra do cálculo da referência
  const estimativa = useMemo(() => {
    if (erros.length) return null;
    const formacao = { origem: 'proorc', unidadesPorProjeto: parseFloat(d.unidadesPorProjeto) || 1 };
    if (semServicos && d.maoObra?.modo === 'percentual') Object.assign(formacao, { regra: 'maoObraPercentual', percentualMaoObra: (parseFloat(d.maoObra.percentual) || 0) / 100 });
    if (semServicos && d.maoObra?.modo === 'us') Object.assign(formacao, { regra: 'maoObraPorUS', usConstrucao: parseFloat(d.maoObra.usConstrucao) || 0 });
    return calcularPorProorc(formacao, projeto, { precoUSConstrucao });
  }, [d, erros.length, projeto, precoUSConstrucao, semServicos]);

  const categorias = getCategorias();
  const subcategorias = getSubcategorias(d.categoria);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancelar(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px' }}
    >
      <div role="dialog" aria-label="Criar item novo" style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '16px', fontWeight: 800, color: '#007A3D', margin: '0 0 4px 0' }}>Criar item novo</h2>
        <p style={{ ...S.texto, marginBottom: '16px' }}>
          Projeto <strong>{projeto.chave}</strong> — {projeto.descricao} · materiais {reais(projeto.materiais)} · serviços {reais(projeto.servicos)}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="novo-tipo" style={S.label}>Nome (tipo)</label>
            <input id="novo-tipo" value={d.tipo} onChange={e => set('tipo', e.target.value)} style={S.input} />
          </div>
          <div>
            <label htmlFor="novo-categoria" style={S.label}>Categoria</label>
            <input id="novo-categoria" list="novo-categorias" value={d.categoria} onChange={e => set('categoria', e.target.value)} style={S.input} />
            <datalist id="novo-categorias">{categorias.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label htmlFor="novo-subcategoria" style={S.label}>Subcategoria</label>
            <input id="novo-subcategoria" list="novo-subcategorias" value={d.subcategoria} onChange={e => set('subcategoria', e.target.value)} style={S.input} />
            <datalist id="novo-subcategorias">{subcategorias.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label htmlFor="novo-unidade" style={S.label}>Unidade</label>
            <select id="novo-unidade" value={d.unidade} onChange={e => set('unidade', e.target.value)} style={S.input}>
              {UNIDADES_ITEM_NOVO.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="novo-unidades" style={S.label}>Unidades por projeto</label>
            <input id="novo-unidades" type="number" min="1" step="1" value={d.unidadesPorProjeto} onChange={e => set('unidadesPorProjeto', e.target.value)} style={S.input} />
          </div>
        </div>

        {semServicos && (
          <div style={{ marginTop: '16px', background: '#FFFBE6', border: '1px solid #FFE57A', borderRadius: '8px', padding: '12px 14px' }}>
            <p style={{ ...S.texto, color: '#8B6D00', fontWeight: 700, marginBottom: '8px' }}>
              Este projeto não tem serviços contratados. Como calcular a mão de obra?
            </p>
            <label style={{ ...S.texto, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <input type="radio" name="modo-mao-obra" checked={d.maoObra?.modo === 'percentual'}
                onChange={() => set('maoObra', { modo: 'percentual', percentual: d.maoObra?.percentual ?? 20 })} />
              Percentual sobre o material (como nos PT)
            </label>
            {d.maoObra?.modo === 'percentual' && (
              <div style={{ maxWidth: '180px', margin: '0 0 8px 26px' }}>
                <label htmlFor="novo-percentual" style={S.label}>Mão de obra (%)</label>
                <input id="novo-percentual" type="number" min="0" step="any" value={d.maoObra.percentual} onChange={e => setMaoObra('percentual', e.target.value)} style={S.input} />
              </div>
            )}
            <label style={{ ...S.texto, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="radio" name="modo-mao-obra" checked={d.maoObra?.modo === 'us'}
                onChange={() => set('maoObra', { modo: 'us', usConstrucao: d.maoObra?.usConstrucao ?? '' })} />
              US de construção informadas × preço da US do relatório ({reais(precoUSConstrucao)})
            </label>
            {d.maoObra?.modo === 'us' && (
              <div style={{ maxWidth: '180px', margin: '6px 0 0 26px' }}>
                <label htmlFor="novo-us" style={S.label}>US de construção</label>
                <input id="novo-us" type="number" min="0" step="any" value={d.maoObra.usConstrucao} onChange={e => setMaoObra('usConstrucao', e.target.value)} style={S.input} />
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: '16px', background: '#F9FFF9', border: '1px solid #D4ECD9', borderRadius: '8px', padding: '10px 14px' }}>
          <p style={S.texto}>Id: <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{idPrevisto}</strong></p>
          {estimativa && (
            <p style={{ ...S.texto, fontVariantNumeric: 'tabular-nums' }}>
              Por {d.unidade}: material {mil(estimativa.material)} + mão de obra {mil(estimativa.maoObra)} = <strong>{mil(estimativa.unitario)}</strong> (R$ mil)
            </p>
          )}
          <p style={{ ...S.texto, fontSize: '11px', color: '#888' }}>
            O item entra como oficial, ligado ao projeto, só na referência nova; nas anteriores fica "não disponível".
          </p>
        </div>

        {erros.length > 0 && (
          <div role="alert" style={{ marginTop: '12px' }}>
            {erros.map(e => <p key={e} style={{ ...S.texto, color: '#c0392b', fontWeight: 600 }}>{e}</p>)}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
          <button onClick={onCancelar} style={{ background: '#fff', color: '#888', border: '1px solid #CCC', padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
            Cancelar
          </button>
          <button
            disabled={erros.length > 0}
            onClick={() => onCriar(d)}
            style={{ background: erros.length ? '#CCC' : '#00A859', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: erros.length ? 'not-allowed' : 'pointer', fontFamily: F }}
          >
            Criar item
          </button>
        </div>
      </div>
    </div>
  );
}
