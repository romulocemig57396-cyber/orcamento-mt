import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  TABELA_CUSTOS, getCategorias, getSubcategorias, getCatalogoMateriais,
  getPrecosUS, getReferencia, chaveReferenciaAtual,
} from '../data/biblioteca';
import {
  lerPropostas, salvarPropostas, montarProposta, calcularProposta,
  validarProposta, baixarPropostas, juntarPropostas,
} from '../utils/propostas';
import { CLASSE_ROTULO } from '../proorc/explicarFormacao';
import { MATERIAIS_TOD, TOD } from '../data/catalogoTod';
import {
  montarCatalogoCombinado, dataDaReferenciaProorc, linhaDaComposicao, rotuloFonte,
  buscarMateriais, unidadesDoCatalogo, LIMITE_RESULTADOS, fonteDoMaterial, FONTES_MATERIAL,
} from '../utils/catalogoMateriais';
import ComposicaoModal from './ComposicaoModal';
import SeloFonte from './SeloFonte';

const F = "'Open Sans',sans-serif";
const S = {
  card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  title: { fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 700, color: '#007A3D', borderBottom: '2px solid #E7F4EE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
  label: { display: 'block', fontFamily: F, fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
  input: { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '13px', color: '#333', outline: 'none', boxSizing: 'border-box', fontFamily: F, background: '#fff' },
  btnVerde: { background: '#00A859', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: F },
  btnCinza: { background: '#fff', color: '#666', border: '1px solid #CCC', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: F },
  th: { padding: '8px 10px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', background: '#007A3D', textAlign: 'left', whiteSpace: 'nowrap' },
  td: { padding: '6px 10px', fontSize: '12px', color: '#444', borderBottom: '1px solid #F0F0F0' },
  mono: { fontVariantNumeric: 'tabular-nums' },
};

const reais = (n) => `R$ ${(parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mil = (n) => (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

// Atraso entre a digitação e a busca no catálogo (ms)
export const ATRASO_BUSCA = 250;

const VAZIO = {
  tipo: '', categoria: '', categoriaNova: '', subcategoria: '', subcategoriaNova: '',
  unidade: 'poste', unidadesPorProjeto: 25, usConstrucao: '', usProjeto: '', tipoUS: 'USRDA', autor: '',
};

export default function CriarItem({ anoReferencia = chaveReferenciaAtual() }) {
  const arquivoRef = useRef(null);
  const [form, setForm] = useState(VAZIO);
  const [materiais, setMateriais] = useState([]);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState('');
  const [filtroFonte, setFiltroFonte] = useState('');
  const [propostas, setPropostas] = useState(lerPropostas);
  const [editandoId, setEditandoId] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [verComposicao, setVerComposicao] = useState(null);

  const referencia = getReferencia(anoReferencia);
  const precosUS = getPrecosUS(anoReferencia);
  const dataProorc = dataDaReferenciaProorc(referencia);
  const catalogoLista = useMemo(() => montarCatalogoCombinado({
    catalogoProorc: getCatalogoMateriais(anoReferencia),
    dataProorc,
    materiaisTod: MATERIAIS_TOD,
    dataTod: TOD.dataBase,
  }), [anoReferencia, dataProorc]);
  const porCodigo = useMemo(() => new Map(catalogoLista.map(m => [m.codigo, m])), [catalogoLista]);
  const qtdProorc = catalogoLista.filter(m => m.fontes.proorc).length;
  const qtdTod = catalogoLista.filter(m => m.fontes.tod).length;

  const categoria = form.categoria === '__nova__' ? form.categoriaNova : form.categoria;
  const subcategoria = form.subcategoria === '__nova__' ? form.subcategoriaNova : form.subcategoria;

  const set = (campo, valor) => { setForm(prev => ({ ...prev, [campo]: valor })); setMensagem(null); };

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), ATRASO_BUSCA);
    return () => clearTimeout(t);
  }, [busca]);

  const unidadesCatalogo = useMemo(() => unidadesDoCatalogo(catalogoLista), [catalogoLista]);
  const resultadoBusca = useMemo(
    () => buscarMateriais(catalogoLista, { texto: buscaAplicada, unidade: filtroUnidade, fonte: filtroFonte }),
    [catalogoLista, buscaAplicada, filtroUnidade, filtroFonte],
  );
  const encontrados = resultadoBusca.resultados;

  const calculo = useMemo(() => calcularProposta({
    materiais, usConstrucao: form.usConstrucao, usProjeto: form.usProjeto,
    precosUS, unidadesPorProjeto: form.unidadesPorProjeto,
  }), [materiais, form.usConstrucao, form.usProjeto, form.unidadesPorProjeto, precosUS]);

  const validacao = validarProposta(
    { ...form, categoria, materiais, autor: form.autor },
    { itensExistentes: [...TABELA_CUSTOS, ...propostas], subcategoria },
  );

  const adicionarMaterial = (m) => {
    setMateriais(prev => prev.some(x => x.codigo === m.codigo)
      ? prev
      : [...prev, linhaDaComposicao(m)]);
    setBusca('');
    setBuscaAplicada('');
    setMensagem(null);
  };

  const alterarQuantidade = (codigo, quantidade) =>
    setMateriais(prev => prev.map(m => (m.codigo === codigo ? { ...m, quantidade } : m)));

  // Linha com preço divergente: quem monta o item escolhe a fonte
  const trocarFonte = (codigo, fonte) => setMateriais(prev => prev.map(m => {
    const doCatalogo = porCodigo.get(codigo);
    return m.codigo === codigo && doCatalogo ? linhaDaComposicao(doCatalogo, fonte, m.quantidade) : m;
  }));

  const removerMaterial = (codigo) => setMateriais(prev => prev.filter(m => m.codigo !== codigo));

  const limpar = () => { setForm(VAZIO); setMateriais([]); setEditandoId(null); setBusca(''); setBuscaAplicada(''); };

  const guardar = (lista) => {
    setPropostas(lista);
    if (!salvarPropostas(lista)) {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível salvar no navegador. Exporte as propostas para não perder o trabalho.' });
      return false;
    }
    return true;
  };

  const salvar = () => {
    if (!validacao.valido) { setMensagem({ tipo: 'erro', texto: validacao.erros.join(' ') }); return; }
    const proposta = montarProposta({
      id: editandoId,
      tipo: form.tipo, categoria, subcategoria, unidade: form.unidade,
      unidadesPorProjeto: form.unidadesPorProjeto,
      materiais, usConstrucao: form.usConstrucao, usProjeto: form.usProjeto, tipoUS: form.tipoUS,
      precosUS, referencia: anoReferencia, autor: form.autor,
      criadoEm: editandoId ? propostas.find(p => p.id === editandoId)?.criadoEm : undefined,
    }, propostas);

    const lista = editandoId
      ? propostas.map(p => (p.id === editandoId ? proposta : p))
      : [...propostas, proposta];

    if (guardar(lista)) {
      setMensagem({ tipo: 'ok', texto: `Proposta ${editandoId ? 'atualizada' : 'salva'}: ${proposta.tipo} (${proposta.id}).` });
      limpar();
    }
  };

  const editar = (p) => {
    const e = p.entrada || {};
    setForm({
      tipo: p.tipo,
      categoria: getCategorias().includes(p.categoria) ? p.categoria : '__nova__',
      categoriaNova: getCategorias().includes(p.categoria) ? '' : p.categoria,
      subcategoria: p.subcategoria || '',
      subcategoriaNova: '',
      unidade: p.unidade,
      unidadesPorProjeto: p.formacao?.unidadesPorProjeto ?? 1,
      usConstrucao: e.usConstrucao ?? '',
      usProjeto: e.usProjeto ?? '',
      tipoUS: e.tipoUS || 'USRDA',
      autor: p.autor || '',
    });
    setMateriais(e.materiais || p.composicoes?.[p.referenciaPrecos]?.materiais || []);
    setEditandoId(p.id);
    setMensagem(null);
  };

  const excluir = (p) => {
    if (!window.confirm(`Excluir a proposta '${p.tipo}'?`)) return;
    guardar(propostas.filter(x => x.id !== p.id));
    if (editandoId === p.id) limpar();
  };

  const importar = async (file) => {
    if (!file) return;
    try {
      const { lerArquivoPropostas } = await import('../utils/propostas');
      const lidas = lerArquivoPropostas(await file.text());
      const juntas = juntarPropostas(propostas, lidas);
      if (guardar(juntas)) {
        setMensagem({ tipo: 'ok', texto: `${lidas.length} proposta(s) lidas do arquivo; ${juntas.length} no total.` });
      }
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message });
    }
  };

  return (
    <div style={{ maxWidth: '960px' }}>

      {/* ── Materiais ── */}
      <div style={S.card}>
        <h2 style={S.title}>Materiais do item</h2>
        <p style={{ fontFamily: F, fontSize: '12px', color: '#888', margin: '0 0 14px 0' }}>
          Catálogo de materiais: {qtdProorc > 0
            ? `${rotuloFonte('proorc', dataProorc)} (referência ${referencia?.rotulo || anoReferencia}, ${qtdProorc} materiais)`
            : `a referência ${referencia?.rotulo || anoReferencia} não tem catálogo do PROORC`}
          {' + '}{rotuloFonte('tod', TOD.dataBase)} ({qtdTod} materiais) · {catalogoLista.length} códigos
        </p>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar material por código ou descrição"
            style={{ ...S.input, flex: '1 1 260px', width: 'auto' }}
          />
          <select aria-label="Filtrar por unidade" value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)}
            style={{ ...S.input, width: '150px' }}>
            <option value="">Todas as unidades</option>
            {unidadesCatalogo.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select aria-label="Filtrar por fonte" value={filtroFonte} onChange={e => setFiltroFonte(e.target.value)}
            style={{ ...S.input, width: '150px' }}>
            <option value="">Todas as fontes</option>
            <option value="proorc">PROORC</option>
            <option value="tod">TOD</option>
          </select>
        </div>
        {buscaAplicada.trim() && resultadoBusca.total === 0 && (
          <p style={{ fontFamily: F, fontSize: '12px', color: '#999', margin: '0 0 12px 0' }}>Nenhum material encontrado.</p>
        )}
        {resultadoBusca.truncado && (
          <p role="status" style={{ fontFamily: F, fontSize: '12px', color: '#8B6D00', margin: '0 0 8px 0' }}>
            {resultadoBusca.total} materiais encontrados; mostrando os primeiros {LIMITE_RESULTADOS}. Refine a busca.
          </p>
        )}
        {encontrados.length > 0 && (
          <div style={{ border: '1px solid #EEE', borderRadius: '8px', maxHeight: '260px', overflowY: 'auto', marginBottom: '14px' }}>
            {encontrados.map(m => (
              <div key={m.codigo} data-testid={`resultado-${m.codigo}`}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderBottom: '1px solid #F5F5F5' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: F, fontSize: '12px', color: '#222', margin: 0 }}>
                    <span style={S.mono}>{m.codigo}</span> — {m.descricao}
                  </p>
                  <p style={{ fontFamily: F, fontSize: '11px', color: '#999', margin: '3px 0 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                    <span>{m.unidade} · {CLASSE_ROTULO[m.classe]}</span>
                    {m.fontes.proorc && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <SeloFonte fonte="proorc" data={m.fontes.proorc.data} />
                        <span style={S.mono}>{reais(m.fontes.proorc.precoUnitario)}</span>
                      </span>
                    )}
                    {m.fontes.tod && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <SeloFonte fonte="tod" data={m.fontes.tod.data} />
                        <span style={S.mono}>{reais(m.fontes.tod.precoUnitario)}</span>
                      </span>
                    )}
                  </p>
                  {m.diverge && (
                    <p style={{ fontFamily: F, fontSize: '11px', color: '#B35C00', fontWeight: 700, margin: '3px 0 0 0' }}>
                      ⚠ preço diverge entre PROORC e TOD
                    </p>
                  )}
                </div>
                <button style={S.btnCinza} onClick={() => adicionarMaterial(m)}>Incluir</button>
              </div>
            ))}
          </div>
        )}

        {materiais.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={S.th}>Código</th>
                <th style={S.th}>Descrição</th>
                <th style={S.th}>Un.</th>
                <th style={S.th}>Fonte</th>
                <th style={{ ...S.th, width: '110px' }}>Quantidade</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Preço</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Total</th>
                <th style={{ ...S.th, width: '40px' }} />
              </tr>
            </thead>
            <tbody>
              {materiais.map((m, i) => (
                <tr key={m.codigo} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                  <td style={{ ...S.td, ...S.mono }}>{m.codigo}</td>
                  <td style={S.td}>
                    {m.descricao}
                    {porCodigo.get(m.codigo)?.diverge && (
                      <p style={{ fontSize: '11px', color: '#B35C00', fontWeight: 700, margin: '2px 0 0 0' }}>
                        ⚠ preço diverge entre PROORC e TOD
                      </p>
                    )}
                  </td>
                  <td style={S.td}>{m.unidade}</td>
                  <td style={S.td}>
                    {porCodigo.get(m.codigo)?.diverge ? (
                      <select
                        aria-label={`Fonte do preço de ${m.codigo}`}
                        value={fonteDoMaterial(m)}
                        onChange={e => trocarFonte(m.codigo, e.target.value)}
                        style={{ ...S.input, padding: '4px 6px', fontSize: '11px', width: 'auto' }}
                      >
                        {FONTES_MATERIAL.map(f => {
                          const preco = porCodigo.get(m.codigo).fontes[f];
                          return <option key={f} value={f}>{rotuloFonte(f, preco.data)} · {reais(preco.precoUnitario)}</option>;
                        })}
                      </select>
                    ) : (
                      <SeloFonte fonte={fonteDoMaterial(m)} data={m.dataFonte} />
                    )}
                  </td>
                  <td style={S.td}>
                    <input
                      type="number" min="0" step="0.001" value={m.quantidade}
                      onChange={e => alterarQuantidade(m.codigo, e.target.value)}
                      style={{ ...S.input, padding: '5px 8px', fontSize: '12px' }}
                      aria-label={`Quantidade de ${m.codigo}`}
                    />
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', ...S.mono }}>{reais(m.precoUnitario)}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, ...S.mono }}>
                    {reais((parseFloat(m.quantidade) || 0) * m.precoUnitario)}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <button onClick={() => removerMaterial(m.codigo)}
                      title={`Remover ${m.codigo}`}
                      style={{ background: 'none', border: 'none', color: '#CCC', fontSize: '16px', cursor: 'pointer', padding: '2px 6px' }}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Mão de obra ── */}
      <div style={S.card}>
        <h2 style={S.title}>Mão de obra</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label style={S.label}>US de construção</label>
            <input type="number" min="0" step="0.001" value={form.usConstrucao}
              onChange={e => set('usConstrucao', e.target.value)} placeholder="0" style={S.input} />
            <p style={{ fontFamily: F, fontSize: '11px', color: '#AAA', margin: '4px 0 0 0' }}>
              × {precosUS.construcao ? reais(precosUS.construcao) : 'preço não registrado'}
            </p>
          </div>
          <div>
            <label style={S.label}>Tipo da US</label>
            <select value={form.tipoUS} onChange={e => set('tipoUS', e.target.value)} style={S.input}>
              <option value="USRDA">USRDA — urbano</option>
              <option value="USRDR">USRDR — rural</option>
            </select>
            <p style={{ fontFamily: F, fontSize: '11px', color: '#AAA', margin: '4px 0 0 0' }}>
              Só para registro: o preço é o mesmo.
            </p>
          </div>
          <div>
            <label style={S.label}>US de projeto</label>
            <input type="number" min="0" step="0.001" value={form.usProjeto}
              onChange={e => set('usProjeto', e.target.value)} placeholder="0" style={S.input} />
            <p style={{ fontFamily: F, fontSize: '11px', color: '#AAA', margin: '4px 0 0 0' }}>
              × {precosUS.projeto ? reais(precosUS.projeto) : 'preço não registrado'}
            </p>
          </div>
        </div>
        {!precosUS.construcao && (
          <p style={{ fontFamily: F, fontSize: '12px', color: '#8B6D00', margin: '12px 0 0 0' }}>
            Esta referência não registra o preço da US, então a mão de obra sai zerada. Use uma referência gerada pelo PROORC.
          </p>
        )}
      </div>

      {/* ── Dados do item ── */}
      <div style={S.card}>
        <h2 style={S.title}>Dados do item</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={S.label}>Nome do item</label>
            <input value={form.tipo} onChange={e => set('tipo', e.target.value)}
              placeholder="Ex: RDP 185 Dupla Camada" style={S.input} />
          </div>

          <div>
            <label style={S.label}>Categoria</label>
            <select value={form.categoria} onChange={e => set('categoria', e.target.value)} style={S.input}>
              <option value="">Selecione…</option>
              {getCategorias().map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__nova__">+ nova categoria</option>
            </select>
            {form.categoria === '__nova__' && (
              <input value={form.categoriaNova} onChange={e => set('categoriaNova', e.target.value)}
                placeholder="Nome da nova categoria" style={{ ...S.input, marginTop: '8px' }} />
            )}
          </div>

          <div>
            <label style={S.label}>Subcategoria</label>
            <select value={form.subcategoria} onChange={e => set('subcategoria', e.target.value)} style={S.input}>
              <option value="">— sem subcategoria —</option>
              {(form.categoria && form.categoria !== '__nova__' ? getSubcategorias(form.categoria) : []).map(sc => (
                <option key={sc} value={sc}>{sc}</option>
              ))}
              <option value="__nova__">+ nova subcategoria</option>
            </select>
            {form.subcategoria === '__nova__' && (
              <input value={form.subcategoriaNova} onChange={e => set('subcategoriaNova', e.target.value)}
                placeholder="Nome da nova subcategoria" style={{ ...S.input, marginTop: '8px' }} />
            )}
          </div>

          <div>
            <label style={S.label}>Unidade</label>
            <select value={form.unidade} onChange={e => set('unidade', e.target.value)} style={S.input}>
              <option value="km">km</option>
              <option value="poste">poste</option>
              <option value="ponto">ponto</option>
              <option value="un">un</option>
            </select>
          </div>

          <div>
            <label style={S.label}>Unidades por projeto</label>
            <input type="number" min="1" step="1" value={form.unidadesPorProjeto}
              onChange={e => set('unidadesPorProjeto', e.target.value)} style={S.input} />
            <p style={{ fontFamily: F, fontSize: '11px', color: '#AAA', margin: '4px 0 0 0' }}>
              Monta 1 km com 25 postes? Informe 25.
            </p>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={S.label}>Seu nome</label>
            <input value={form.autor} onChange={e => set('autor', e.target.value)}
              placeholder="Quem está propondo o item" style={{ ...S.input, maxWidth: '320px' }} />
          </div>
        </div>
      </div>

      {/* ── Prévia ── */}
      <div style={{ ...S.card, borderTop: '3px solid #00A859' }}>
        <h2 style={S.title}>Prévia do custo</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          {[
            ['Materiais', reais(calculo.totalMateriais)],
            ['Mão de obra', reais(calculo.totalServicos)],
            ['Total do projeto', reais(calculo.totalProjetoGeral)],
            [`Material por ${form.unidade} (R$ mil)`, mil(calculo.custos.material)],
            [`Mão de obra por ${form.unidade} (R$ mil)`, mil(calculo.custos.maoObra)],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} style={{ background: '#F9F9F9', borderRadius: '8px', padding: '10px 14px' }}>
              <p style={{ fontFamily: F, fontSize: '10px', color: '#999', margin: '0 0 3px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{rotulo}</p>
              <p style={{ fontFamily: F, fontSize: '14px', fontWeight: 700, color: '#333', margin: 0, ...S.mono }}>{valor}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '14px', background: '#007A3D', borderRadius: '8px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: '#fff' }}>
            Unitário por {form.unidade} (R$ mil)
          </span>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '20px', fontWeight: 800, color: '#fff', ...S.mono }}>
            {mil(calculo.custos.unitario)}
          </span>
        </div>

        {validacao.avisos.length > 0 && (
          <div style={{ marginTop: '12px', background: '#FFFBE6', border: '1px solid #FFE57A', borderRadius: '8px', padding: '10px 14px' }}>
            {validacao.avisos.map(a => (
              <p key={a} style={{ fontFamily: F, fontSize: '12px', color: '#8B6D00', margin: 0 }}>{a}</p>
            ))}
          </div>
        )}

        {mensagem && (
          <div style={{
            marginTop: '12px', borderRadius: '8px', padding: '10px 14px',
            background: mensagem.tipo === 'erro' ? '#FEE8E8' : '#E8F7EE',
            border: `1px solid ${mensagem.tipo === 'erro' ? '#F5B7B1' : '#B8E6CC'}`,
          }}>
            <p style={{ fontFamily: F, fontSize: '12px', margin: 0, fontWeight: 600, color: mensagem.tipo === 'erro' ? '#c0392b' : '#007A3D' }}>
              {mensagem.texto}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={salvar}
            style={{ ...S.btnVerde, ...(validacao.valido ? {} : { background: '#CCC', cursor: 'not-allowed' }) }}
            disabled={!validacao.valido}
          >
            {editandoId ? 'Salvar alterações' : 'Salvar como proposta'}
          </button>
          {editandoId && <button style={S.btnCinza} onClick={limpar}>Cancelar edição</button>}
          <span style={{ fontFamily: F, fontSize: '11px', color: '#AAA' }}>
            A proposta fica só no seu navegador até o responsável aprovar.
          </span>
        </div>
      </div>

      {/* ── Minhas propostas ── */}
      <div style={S.card}>
        <h2 style={S.title}>Minhas propostas ({propostas.length})</h2>

        {propostas.length === 0 ? (
          <p style={{ fontFamily: F, fontSize: '13px', color: '#BBB', margin: 0 }}>
            Nenhuma proposta salva ainda.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={S.th}>Item</th>
                <th style={S.th}>Autor</th>
                <th style={S.th}>Criada em</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Unitário (R$ mil)</th>
                <th style={{ ...S.th, width: '230px', textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {propostas.map((p, i) => (
                <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                  <td style={S.td}>
                    <p style={{ margin: 0, fontWeight: 600, color: '#222' }}>{p.tipo}</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#AAA' }}>
                      {p.categoria}{p.subcategoria ? ` › ${p.subcategoria}` : ''} · {p.unidade} · <span style={S.mono}>{p.id}</span>
                    </p>
                  </td>
                  <td style={S.td}>{p.autor}</td>
                  <td style={{ ...S.td, ...S.mono }}>{(p.criadoEm || '').split('-').reverse().join('/')}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, ...S.mono }}>
                    {mil(p.custos?.[p.referenciaPrecos]?.unitario)}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button style={S.btnCinza} onClick={() => setVerComposicao(p)}>Composição</button>
                    <button style={{ ...S.btnCinza, marginLeft: '6px' }} onClick={() => editar(p)}>Editar</button>
                    <button style={{ ...S.btnCinza, marginLeft: '6px', color: '#c0392b', borderColor: '#FFCDD2' }} onClick={() => excluir(p)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
          <button
            style={{ ...S.btnVerde, ...(propostas.length ? {} : { background: '#CCC', cursor: 'not-allowed' }) }}
            disabled={!propostas.length}
            onClick={() => baixarPropostas(propostas)}
          >
            Exportar propostas
          </button>
          <button style={S.btnCinza} onClick={() => arquivoRef.current?.click()}>Importar propostas</button>
          <input ref={arquivoRef} type="file" accept=".json" style={{ display: 'none' }}
            onChange={e => { importar(e.target.files[0]); e.target.value = ''; }} />
        </div>
        <p style={{ fontFamily: F, fontSize: '11px', color: '#AAA', margin: '10px 0 0 0', lineHeight: 1.6 }}>
          Exporte o arquivo e envie ao responsável para ele aprovar as propostas e incluí-las na biblioteca oficial.
        </p>
      </div>

      {verComposicao && (
        <ComposicaoModal
          item={verComposicao}
          referencia={verComposicao.referenciaPrecos || anoReferencia}
          onFechar={() => setVerComposicao(null)}
        />
      )}
    </div>
  );
}
