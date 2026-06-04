import React, { useState, useMemo } from 'react';
import {
  TABELA_CUSTOS,
  ANOS_DISPONIVEIS,
  getCategorias,
  getSubcategorias,
  buscarItens,
  getValorPorAno,
  formatarValor,
} from '../data/tabelaCustos';

/* ── Estilos base ── */
const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1.5px solid #E0E0E0',
  fontSize: '14px',
  fontFamily: "'Open Sans', sans-serif",
  color: '#333',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
};

const onFocus = e => { e.target.style.borderColor = '#00A859'; };
const onBlur  = e => { e.target.style.borderColor = '#E0E0E0'; };

const labelStyle = {
  display: 'block',
  fontFamily: "'Open Sans', sans-serif",
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#666',
  marginBottom: '6px',
};

export default function BibliotecaCustos({ setOrcamento, anoReferencia, setAnoReferencia }) {
  const [textoBusca, setTextoBusca]             = useState('');
  const [categoriaFiltro, setCategoriaFiltro]   = useState('');
  const [subcategoriaFiltro, setSubcategoriaFiltro] = useState('');
  const [itemSelecionado, setItemSelecionado]   = useState(null);
  const [modalAberto, setModalAberto]           = useState(false);
  const [quantidade, setQuantidade]             = useState('');
  const [categoriaDestino, setCategoriaDestino] = useState('cti');
  const [percentualCemig, setPercentualCemig]   = useState('');
  const [distanciaKm, setDistanciaKm]           = useState('');
  const [hoveredRow, setHoveredRow]             = useState(null);

  const itensFiltrados = useMemo(() => {
    let itens = textoBusca ? buscarItens(textoBusca) : TABELA_CUSTOS;
    if (categoriaFiltro)    itens = itens.filter(i => i.categoria    === categoriaFiltro);
    if (subcategoriaFiltro) itens = itens.filter(i => i.subcategoria === subcategoriaFiltro);
    return itens;
  }, [textoBusca, categoriaFiltro, subcategoriaFiltro]);

  const categorias    = getCategorias();
  const subcategorias = categoriaFiltro ? getSubcategorias(categoriaFiltro) : [];

  const abrirModal = item => {
    setItemSelecionado(item);
    setModalAberto(true);
    setQuantidade('');
    setDistanciaKm('');
    setCategoriaDestino('cti');
    setPercentualCemig('');
  };

  const fecharModal = () => { setModalAberto(false); setItemSelecionado(null); };

  const adicionarAoOrcamento = () => {
    if (!itemSelecionado || !quantidade || parseFloat(quantidade) <= 0) {
      alert('Preencha a quantidade corretamente');
      return;
    }
    if (categoriaDestino === 'pp' && (!percentualCemig || percentualCemig < 0 || percentualCemig > 100)) {
      alert('Para categoria PP, informe o % CEMIG (0-100)');
      return;
    }
    const unitario   = getValorPorAno(itemSelecionado, anoReferencia, 'unitario');
    const valorTotal = unitario * parseFloat(quantidade) * 1000;
    setOrcamento(prev => ({
      ...prev,
      itensObra: [...prev.itensObra, {
        id: Date.now(),
        descricao: itemSelecionado.tipo,
        categoria: categoriaDestino,
        valor: valorTotal,
        percentualCemig: categoriaDestino === 'pp' ? parseFloat(percentualCemig) : 0,
        origem: 'biblioteca',
        itemOrigem: itemSelecionado.id,
        quantidade: parseFloat(quantidade),
        unidade: itemSelecionado.unidade,
        valorUnitario: unitario * 1000,
      }],
    }));
    alert(`Item adicionado ao orçamento: ${itemSelecionado.tipo}`);
    fecharModal();
  };

  const limparFiltros = () => {
    setTextoBusca('');
    setCategoriaFiltro('');
    setSubcategoriaFiltro('');
  };

  return (
    <div>

      {/* ── Cabeçalho ── */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{
          fontFamily: "'Montserrat', sans-serif",
          fontSize: '20px', fontWeight: 700,
          color: '#007A3D', margin: '0 0 4px 0',
        }}>
          Biblioteca de Custos
        </h2>
        <p style={{ fontFamily: "'Open Sans', sans-serif", fontSize: '13px', color: '#999', margin: 0 }}>
          Tabela oficial de custos unitários para orçamento de obras em MT
        </p>
      </div>

      {/* ── Ano de Referência ── */}
      <div style={{
        background: '#fff', borderRadius: '12px',
        border: '1px solid #E0E0E0', padding: '16px 20px',
        marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <p style={labelStyle}>Ano de Referência</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {ANOS_DISPONIVEIS.map(ano => (
            <button
              key={ano.ano}
              onClick={() => setAnoReferencia(ano.ano)}
              style={{
                padding: '6px 16px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 600,
                fontFamily: "'Open Sans', sans-serif",
                border: '1.5px solid #00A859',
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: anoReferencia === ano.ano ? '#007A3D' : '#fff',
                color:      anoReferencia === ano.ano ? '#fff'    : '#007A3D',
              }}
            >
              {ano.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filtros ── */}
      <div style={{
        background: '#fff', borderRadius: '12px',
        border: '1px solid #E0E0E0', padding: '16px 20px',
        marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Buscar</label>
            <input
              type="text"
              value={textoBusca}
              onChange={e => setTextoBusca(e.target.value)}
              style={inputStyle}
              placeholder="Buscar por nome..."
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>
          <div>
            <label style={labelStyle}>Categoria</label>
            <select
              value={categoriaFiltro}
              onChange={e => { setCategoriaFiltro(e.target.value); setSubcategoriaFiltro(''); }}
              style={selectStyle}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">Todas</option>
              {categorias.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Subcategoria</label>
            <select
              value={subcategoriaFiltro}
              onChange={e => setSubcategoriaFiltro(e.target.value)}
              style={{ ...selectStyle, opacity: !categoriaFiltro ? 0.5 : 1 }}
              disabled={!categoriaFiltro}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">Todas</option>
              {subcategorias.map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontFamily: "'Open Sans', sans-serif", fontSize: '13px', color: '#888', margin: 0 }}>
            <strong style={{ color: '#007A3D' }}>{itensFiltrados.length}</strong>{' '}
            {itensFiltrados.length === 1 ? 'item encontrado' : 'itens encontrados'}
          </p>
          <button
            onClick={limparFiltros}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              border: '1px solid #CCC', background: '#fff',
              color: '#555', fontSize: '13px',
              fontFamily: "'Open Sans', sans-serif",
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
          >
            Limpar filtros
          </button>
        </div>
      </div>

      {/* ── Tabela ── */}
      <div style={{
        background: '#fff', borderRadius: '12px',
        border: '1px solid #E0E0E0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Open Sans', sans-serif" }}>
            <thead>
              <tr style={{ background: '#007A3D' }}>
                {['Categoria', 'Tipo', 'Unid.', 'Material', 'Mão Obra', 'US Constr.', 'Total (R$ mil)', 'Ação'].map(col => (
                  <th key={col} style={{
                    padding: '10px 14px',
                    fontSize: '12px', fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#fff',
                    textAlign: ['Material', 'Mão Obra', 'US Constr.', 'Total (R$ mil)'].includes(col) ? 'right'
                            : col === 'Unid.' || col === 'Ação' ? 'center' : 'left',
                    whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itensFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
                    Nenhum item encontrado com os filtros aplicados
                  </td>
                </tr>
              ) : (
                itensFiltrados.map((item, idx) => {
                  const material = getValorPorAno(item, anoReferencia, 'material');
                  const maoObra  = getValorPorAno(item, anoReferencia, 'maoObra');
                  const usConstr = getValorPorAno(item, anoReferencia, 'usConstr');
                  const unitario = getValorPorAno(item, anoReferencia, 'unitario');
                  const isHovered = hoveredRow === item.id;
                  const rowBg = isHovered ? '#E7F4EE' : idx % 2 === 0 ? '#fff' : '#F9F9F9';

                  return (
                    <tr
                      key={item.id}
                      style={{ background: rowBg, transition: 'background 0.1s' }}
                      onMouseEnter={() => setHoveredRow(item.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      <td style={{ padding: '10px 14px', fontSize: '13px', borderBottom: '1px solid #F0F0F0' }}>
                        <div style={{ color: '#444', fontWeight: 500 }}>{item.categoria}</div>
                        {item.subcategoria && (
                          <div style={{ color: '#AAA', fontSize: '11px', marginTop: '1px' }}>{item.subcategoria}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 500, color: '#222', borderBottom: '1px solid #F0F0F0' }}>
                        {item.tipo}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'center', color: '#666', borderBottom: '1px solid #F0F0F0' }}>
                        {item.unidade}
                      </td>
                      {[material, maoObra, usConstr].map((val, i) => (
                        <td key={i} style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'right', color: '#555', borderBottom: '1px solid #F0F0F0', fontVariantNumeric: 'tabular-nums' }}>
                          {formatarValor(val)}
                        </td>
                      ))}
                      <td style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'right', fontWeight: 700, color: '#007A3D', borderBottom: '1px solid #F0F0F0', fontVariantNumeric: 'tabular-nums' }}>
                        {formatarValor(unitario)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', borderBottom: '1px solid #F0F0F0' }}>
                        <button
                          onClick={() => abrirModal(item)}
                          style={{
                            background: '#00A859', color: '#fff',
                            border: 'none', padding: '6px 14px',
                            borderRadius: '6px', fontSize: '12px',
                            fontWeight: 600, cursor: 'pointer',
                            fontFamily: "'Open Sans', sans-serif",
                            transition: 'background 0.15s',
                            whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#007A3D'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#00A859'; }}
                        >
                          + Adicionar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Dica de uso ── */}
      <div style={{
        marginTop: '16px', padding: '14px 16px',
        background: '#E7F4EE', borderRadius: '10px',
        border: '1px solid #B8E6CC',
      }}>
        <p style={{ fontFamily: "'Open Sans', sans-serif", fontSize: '12px', color: '#005C2E', margin: 0, lineHeight: 1.6 }}>
          <strong>Como usar:</strong> selecione o ano de referência → filtre o item desejado → clique em "+ Adicionar" → informe quantidade e categoria → o item é incluído automaticamente nos Itens de Obra.
        </p>
      </div>

      {/* ── Modal ── */}
      {modalAberto && itemSelecionado && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 999, padding: '16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) fecharModal(); }}
        >
          <div style={{
            background: '#fff', borderRadius: '14px',
            padding: '28px', width: '100%', maxWidth: '440px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <h3 style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: '16px', fontWeight: 800,
              color: '#007A3D', margin: '0 0 16px 0',
            }}>
              Adicionar ao Orçamento
            </h3>

            {/* Info do item */}
            <div style={{
              background: '#F5FBF8', borderRadius: '8px',
              padding: '12px 14px', marginBottom: '20px',
              border: '1px solid #C8E6D6',
            }}>
              <p style={{ fontFamily: "'Open Sans', sans-serif", fontWeight: 600, color: '#222', fontSize: '14px', margin: '0 0 2px 0' }}>
                {itemSelecionado.tipo}
              </p>
              <p style={{ fontFamily: "'Open Sans', sans-serif", fontSize: '12px', color: '#888', margin: '0 0 8px 0' }}>
                {itemSelecionado.categoria}{itemSelecionado.subcategoria ? ` › ${itemSelecionado.subcategoria}` : ''}
              </p>
              <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '18px', fontWeight: 800, color: '#007A3D', margin: 0 }}>
                R$ {formatarValor(getValorPorAno(itemSelecionado, anoReferencia, 'unitario'))} mil
                <span style={{ fontSize: '12px', fontWeight: 400, color: '#888', marginLeft: '4px' }}>/ {itemSelecionado.unidade}</span>
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* ── Campo de quantidade (condicional por unidade) ── */}
              {itemSelecionado.unidade === 'poste' ? (
                /* Conversor km → postes */
                <div style={{ background: '#F0F9F4', borderRadius: '10px', padding: '14px', border: '1px solid #C8E6D6' }}>
                  <p style={{ ...labelStyle, color: '#007A3D', marginBottom: '10px' }}>
                    Conversor de Distância — 1 poste = 40 m
                  </p>

                  {/* Input km */}
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ ...labelStyle, marginBottom: '4px' }}>Distância (km)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={distanciaKm}
                      onChange={e => {
                        const km = e.target.value;
                        setDistanciaKm(km);
                        const postes = km ? Math.round(parseFloat(km) * 1000 / 40) : '';
                        setQuantidade(postes !== '' ? String(postes) : '');
                      }}
                      style={{ ...inputStyle, borderColor: '#B8E6CC' }}
                      placeholder="Ex: 14.840"
                      autoFocus
                      onFocus={e => { e.target.style.borderColor = '#00A859'; }}
                      onBlur={e  => { e.target.style.borderColor = '#B8E6CC'; }}
                    />
                  </div>

                  {/* Resultado em postes */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...labelStyle, marginBottom: '4px' }}>Quantidade (postes)</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={quantidade}
                        onChange={e => {
                          const postes = e.target.value;
                          setQuantidade(postes);
                          const km = postes ? (parseFloat(postes) * 40 / 1000) : '';
                          setDistanciaKm(km !== '' ? km.toFixed(3) : '');
                        }}
                        style={{ ...inputStyle, borderColor: '#B8E6CC' }}
                        placeholder="0"
                        onFocus={e => { e.target.style.borderColor = '#00A859'; }}
                        onBlur={e  => { e.target.style.borderColor = '#B8E6CC'; }}
                      />
                    </div>
                    {quantidade && parseFloat(quantidade) > 0 && (
                      <div style={{ flexShrink: 0, paddingTop: '18px', textAlign: 'center' }}>
                        <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '22px', fontWeight: 800, color: '#007A3D', margin: 0, lineHeight: 1 }}>
                          {parseInt(quantidade, 10)}
                        </p>
                        <p style={{ fontFamily: "'Open Sans', sans-serif", fontSize: '11px', color: '#888', margin: '2px 0 0 0' }}>postes</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Input normal para km, ponto, un, etc. */
                <div>
                  <label style={labelStyle}>Quantidade ({itemSelecionado.unidade})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quantidade}
                    onChange={e => setQuantidade(e.target.value)}
                    style={inputStyle}
                    placeholder="Ex: 14.84"
                    autoFocus
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              )}

              <div>
                <label style={labelStyle}>Categoria de Destino</label>
                <select
                  value={categoriaDestino}
                  onChange={e => setCategoriaDestino(e.target.value)}
                  style={selectStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                >
                  <option value="cti">CTI — Cond. Téc. Interessado</option>
                  <option value="ctc">CTC — Cond. Téc. CEMIG</option>
                  <option value="pp">PP — Proporcionalidade</option>
                  <option value="parcela_reg">Parcela Regulatória</option>
                </select>
              </div>

              {categoriaDestino === 'pp' && (
                <div>
                  <label style={labelStyle}>% CEMIG (Proporcionalidade)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={percentualCemig}
                    onChange={e => setPercentualCemig(e.target.value)}
                    style={inputStyle}
                    placeholder="Ex: 29"
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                  <p style={{ fontFamily: "'Open Sans', sans-serif", fontSize: '11px', color: '#999', margin: '4px 0 0 0' }}>
                    % que a CEMIG paga. O restante vai para Parcela Regulatória.
                  </p>
                </div>
              )}

              {quantidade && parseFloat(quantidade) > 0 && (
                <div style={{
                  padding: '12px 14px', background: '#E7F4EE',
                  borderRadius: '8px', border: '1px solid #B8E6CC',
                }}>
                  <p style={{ fontFamily: "'Open Sans', sans-serif", fontSize: '12px', color: '#666', margin: '0 0 2px 0' }}>Valor Total</p>
                  <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '22px', fontWeight: 800, color: '#007A3D', margin: 0 }}>
                    R$ {formatarValor(getValorPorAno(itemSelecionado, anoReferencia, 'unitario') * parseFloat(quantidade))} mil
                  </p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button
                onClick={fecharModal}
                style={{
                  flex: 1, padding: '11px', borderRadius: '100px',
                  border: '1.5px solid #DDD', background: '#fff',
                  color: '#555', fontSize: '13px', fontWeight: 600,
                  fontFamily: "'Open Sans', sans-serif", cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
              >
                Cancelar
              </button>
              <button
                onClick={adicionarAoOrcamento}
                style={{
                  flex: 1, padding: '11px', borderRadius: '100px',
                  border: 'none', background: '#00A859',
                  color: '#fff', fontSize: '13px', fontWeight: 700,
                  fontFamily: "'Open Sans', sans-serif", cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,168,89,0.3)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#007A3D'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#00A859'; }}
              >
                Adicionar ao Orçamento
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
