import React, { useMemo, useRef, useState } from 'react';
import { BIBLIOTECA, TABELA_CUSTOS, chaveReferenciaAtual, getReferencia } from '../data/biblioteca';
import { lerSintetico } from '../proorc/lerSintetico';
import { lerAnalitico } from '../proorc/lerAnalitico';
import { lerServicos } from '../proorc/lerServicos';
import { consolidarProorc } from '../proorc/consolidar';
import { calcularNovaReferencia } from '../proorc/calcularReferencia';
import { aplicarNovaReferencia, baixarBiblioteca, serializarBiblioteca } from '../proorc/gerarBibliotecaJson';
import { ORIGENS } from '../proorc/formacao';
import EditarValores from './EditarValores';

const S = {
  card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  title: { fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 700, color: '#007A3D', borderBottom: '2px solid #E7F4EE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
  step: { display: 'inline-block', fontFamily: "'Montserrat',sans-serif", fontSize: '10px', fontWeight: 800, color: '#00A859', textTransform: 'uppercase', letterSpacing: '0.12em', background: '#E8F7EE', padding: '3px 10px', borderRadius: '20px', marginBottom: '10px' },
  input: { padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '13px', color: '#333', outline: 'none', boxSizing: 'border-box', fontFamily: "'Open Sans',sans-serif", background: '#fff', width: '100%' },
  label: { display: 'block', fontFamily: "'Open Sans',sans-serif", fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
  btnVerde: { background: '#00A859', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Open Sans',sans-serif" },
  btnCinza: { background: '#fff', color: '#888', border: '1px solid #CCC', padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Open Sans',sans-serif" },
  th: { padding: '9px 10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', background: '#007A3D', whiteSpace: 'nowrap', textAlign: 'left' },
  td: { padding: '7px 10px', fontSize: '12px', color: '#444', borderBottom: '1px solid #F0F0F0', verticalAlign: 'middle' },
  mono: { fontVariantNumeric: 'tabular-nums' },
};

const ARQUIVOS = [
  { campo: 'sintetico', nome: 'Orçamento sintético por projeto', arquivo: 'rptOrcamentoGeralSinteticoPorProjetoCemig.xlsx' },
  { campo: 'analitico', nome: 'Orçamento analítico (materiais)', arquivo: 'rptOrcamentoGeralAnalitico.xlsx' },
  { campo: 'servicos', nome: 'Serviços contratados (US)', arquivo: 'rptOrcamentoServicosContratados.xlsx' },
];

const fmt = (n, casas = 5) => (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: casas });
const fmtReais = (n) => `R$ ${(parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "07/10/2026" → { chave: '2026-10', rotulo: '2026 — PROORC 07/10/2026' }
const sugerirReferencia = (data) => {
  const m = String(data || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return { chave: '', rotulo: '' };
  return { chave: `${m[3]}-${m[2]}`, rotulo: `${m[3]} — PROORC ${data}` };
};

function Selo({ texto, cor, fundo, borda }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, fontFamily: "'Open Sans',sans-serif", background: fundo, color: cor, border: `1px solid ${borda}`, whiteSpace: 'nowrap' }}>
      {texto}
    </span>
  );
}
const SeloVerificacao = () => <Selo texto="Em verificação" cor="#8B6D00" fundo="#FFF8E1" borda="#FFE082" />;
const SeloNaoAtualizado = () => <Selo texto="Não atualizado" cor="#555" fundo="#F0F0F0" borda="#DDD" />;
const SeloSemCusto = () => <Selo texto="Sem custo" cor="#c0392b" fundo="#FEE8E8" borda="#F5B7B1" />;

function Variacao({ valor }) {
  if (valor === null) return <span style={{ color: '#8B6D00', fontWeight: 600 }}>novo</span>;
  if (Math.abs(valor) < 0.0005) return <span style={{ color: '#AAA' }}>—</span>;
  const cor = valor > 0 ? '#c0392b' : '#2E7D32';
  return <span style={{ color: cor, fontWeight: 700, ...S.mono }}>{valor > 0 ? '+' : ''}{fmt(valor, 2)}%</span>;
}

export default function AtualizarProorc() {
  const refs = useRef({});
  const [arquivos, setArquivos] = useState({});
  const [erro, setErro] = useState('');
  const [consolidado, setConsolidado] = useState(null);
  const [mapeamento, setMapeamento] = useState(BIBLIOTECA.mapeamentoProorc);
  const [escolhas, setEscolhas] = useState({});
  const [confirmouLigacoes, setConfirmouLigacoes] = useState(false);
  const [chave, setChave] = useState('');
  const [rotulo, setRotulo] = useState('');
  const [viraAtual, setViraAtual] = useState(true);
  const [filtro, setFiltro] = useState('todos');
  const [gerada, setGeradaEstado] = useState(null);
  const [editando, setEditando] = useState(false);
  // Qualquer mudança descarta a referência gerada e a edição sobre ela
  const setGerada = (valor) => { setGeradaEstado(valor); if (!valor) setEditando(false); };

  const chaveAnterior = chaveReferenciaAtual();
  const rotuloAnterior = getReferencia(chaveAnterior)?.rotulo || chaveAnterior;

  const resultado = useMemo(() => {
    if (!consolidado) return null;
    return calcularNovaReferencia({ biblioteca: BIBLIOTECA, consolidado, chaveAnterior, mapeamento, escolhas });
  }, [consolidado, mapeamento, escolhas, chaveAnterior]);

  const carregar = async (campo, file) => {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    setArquivos(prev => ({ ...prev, [campo]: { nome: file.name, buffer } }));
    setConsolidado(null);
    setGerada(null);
    setErro('');
  };

  const analisar = () => {
    setErro('');
    setGerada(null);
    try {
      const c = consolidarProorc({
        sintetico: lerSintetico(arquivos.sintetico.buffer),
        analitico: lerAnalitico(arquivos.analitico.buffer),
        servicos: lerServicos(arquivos.servicos.buffer),
      });
      setConsolidado(c);
      const s = sugerirReferencia(c.dataReferencia);
      setChave(s.chave);
      setRotulo(s.rotulo);
      setEscolhas({});
      setConfirmouLigacoes(false);
    } catch (e) {
      setErro(`Não foi possível ler os relatórios: ${e.message}`);
    }
  };

  const gerar = () => {
    try {
      const nova = aplicarNovaReferencia({
        biblioteca: BIBLIOTECA,
        resultado,
        chave,
        rotulo,
        fonte: `PROORC, relatórios de ${consolidado.dataReferencia}`,
        atual: viraAtual,
      });
      setGerada(nova);
      setErro('');
    } catch (e) {
      setErro(e.message);
    }
  };

  const todosCarregados = ARQUIVOS.every(a => arquivos[a.campo]);
  const linhasFiltradas = (resultado?.previa || []).filter(l => {
    if (filtro === 'mudaram') return Math.abs(l.efetivo.unitario - l.anterior.unitario) > 0.00001;
    if (filtro === 'naoAtualizados') return l.naoAtualizado;
    if (filtro === 'emVerificacao') return l.emVerificacao;
    return true;
  });

  // Linhas da tabela de ligação: projetos do relatório e ligações já cadastradas
  const linhasMapeamento = useMemo(() => {
    const doRelatorio = (consolidado?.projetos || []).map(p => ({ chave: p.chave, descricao: p.descricao, total: p.total, noRelatorio: true }));
    const cadastradas = Object.keys(mapeamento)
      .filter(k => !doRelatorio.some(p => p.chave === k))
      .map(k => ({ chave: k, descricao: mapeamento[k].descricao || '', total: null, noRelatorio: false }));
    return [...doRelatorio, ...cadastradas];
  }, [consolidado, mapeamento]);

  const alterarLigacao = (projeto, campo, valor) => {
    setMapeamento(prev => {
      const novo = { ...prev };
      if (campo === 'item' && !valor) { delete novo[projeto]; return novo; }
      const atual = novo[projeto] || { unidadesPorProjeto: 1, situacao: 'editado manualmente' };
      novo[projeto] = { ...atual, [campo]: campo === 'unidadesPorProjeto' ? (parseFloat(valor) || 1) : valor };
      return novo;
    });
    setGerada(null);
  };

  return (
    <div style={{ maxWidth: '960px' }}>

      {/* ── Passo 1 — arquivos ── */}
      <div style={S.card}>
        <div style={S.step}>Passo 1</div>
        <h2 style={S.title}>Carregar os relatórios do PROORC</h2>
        <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#666', margin: '0 0 16px 0', lineHeight: 1.6 }}>
          Exporte os três relatórios do PROORC em Excel. A importação usa só os .xlsx; os PDFs servem para você conferir.
        </p>

        {ARQUIVOS.map(a => (
          <div key={a.campo} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid #F5F5F5' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 600, color: '#333', margin: 0 }}>{a.nome}</p>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', color: '#AAA', margin: '2px 0 0 0' }}>{a.arquivo}</p>
            </div>
            {arquivos[a.campo] && (
              <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#00A859', fontWeight: 600, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ✓ {arquivos[a.campo].nome}
              </span>
            )}
            <button style={S.btnCinza} onClick={() => refs.current[a.campo]?.click()}>
              {arquivos[a.campo] ? 'Trocar' : 'Escolher'}
            </button>
            <input
              ref={el => { refs.current[a.campo] = el; }}
              type="file" accept=".xlsx" style={{ display: 'none' }}
              onChange={e => { carregar(a.campo, e.target.files[0]); e.target.value = ''; }}
            />
          </div>
        ))}

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', alignItems: 'center' }}>
          <button
            style={{ ...S.btnVerde, ...(todosCarregados ? {} : { background: '#CCC', cursor: 'not-allowed' }) }}
            disabled={!todosCarregados}
            onClick={analisar}
          >
            Analisar relatórios
          </button>
          {consolidado && (
            <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#666' }}>
              {consolidado.projetos.length} projetos · data de referência {consolidado.dataReferencia || '—'}
            </span>
          )}
        </div>

        {erro && (
          <div style={{ marginTop: '14px', background: '#FEE8E8', border: '1px solid #F5B7B1', borderRadius: '8px', padding: '10px 14px' }}>
            <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#c0392b', margin: 0, fontWeight: 600 }}>{erro}</p>
          </div>
        )}
      </div>

      {consolidado && (
        <>
          {/* ── Passo 2 — projetos, avisos e ligações ── */}
          <div style={S.card}>
            <div style={S.step}>Passo 2</div>
            <h2 style={S.title}>Projetos, avisos e ligações</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '18px' }}>
              {[
                ['Projetos', consolidado.projetos.length],
                ['Materiais no catálogo', Object.keys(consolidado.catalogoMateriais).length],
                ['US de construção', fmtReais(consolidado.precosUS.construcao)],
                ['US de projeto', fmtReais(consolidado.precosUS.projeto)],
                ['Total geral', fmtReais(consolidado.totais.geral)],
              ].map(([rotulo2, valor]) => (
                <div key={rotulo2} style={{ background: '#F9FFF9', border: '1px solid #D4ECD9', borderRadius: '8px', padding: '10px 14px' }}>
                  <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', margin: '0 0 4px 0' }}>{rotulo2}</p>
                  <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '14px', fontWeight: 700, color: '#222', margin: 0, ...S.mono }}>{valor}</p>
                </div>
              ))}
            </div>

            {consolidado.avisos.length > 0 && (
              <div style={{ background: '#FFFBE6', border: '1px solid #FFE57A', borderRadius: '8px', padding: '12px 16px', marginBottom: '18px' }}>
                <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', fontWeight: 700, color: '#8B6D00', margin: '0 0 8px 0' }}>
                  {consolidado.avisos.length} aviso{consolidado.avisos.length > 1 ? 's' : ''} na leitura
                </p>
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  {consolidado.avisos.map((a, i) => (
                    <li key={i} style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#8B6D00', lineHeight: 1.6 }}>{a.mensagem}</li>
                  ))}
                </ul>
              </div>
            )}

            <p style={{ ...S.label, marginBottom: '10px' }}>Ligação projeto do PROORC → item da biblioteca</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
                <thead>
                  <tr>
                    <th style={S.th}>Projeto</th>
                    <th style={S.th}>Item da biblioteca</th>
                    <th style={{ ...S.th, width: '110px' }}>Unidades</th>
                    <th style={{ ...S.th, width: '150px' }}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasMapeamento.map((p, idx) => {
                    const ligacao = mapeamento[p.chave];
                    const usado = p.noRelatorio && ligacao?.item;
                    return (
                      <tr key={p.chave} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={S.td}>
                          <p style={{ margin: 0, fontWeight: 700, color: '#222', ...S.mono }}>{p.chave}</p>
                          <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#888' }}>{p.descricao}</p>
                          {p.total != null && <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#00A859', ...S.mono }}>{fmtReais(p.total)}</p>}
                        </td>
                        <td style={S.td}>
                          <select
                            value={ligacao?.item || ''}
                            onChange={e => alterarLigacao(p.chave, 'item', e.target.value)}
                            style={{ ...S.input, padding: '5px 8px', fontSize: '11px' }}
                          >
                            <option value="">— sem ligação —</option>
                            {TABELA_CUSTOS.map(i => (
                              <option key={i.id} value={i.id}>{i.tipo} — {i.categoria}{i.subcategoria ? ` › ${i.subcategoria}` : ''}</option>
                            ))}
                          </select>
                        </td>
                        <td style={S.td}>
                          <input
                            type="number" min="1" step="1"
                            value={ligacao?.unidadesPorProjeto ?? ''}
                            disabled={!ligacao?.item}
                            onChange={e => alterarLigacao(p.chave, 'unidadesPorProjeto', e.target.value)}
                            style={{ ...S.input, padding: '5px 8px', fontSize: '12px', width: '80px' }}
                          />
                        </td>
                        <td style={S.td}>
                          {!ligacao?.item
                            ? <Selo texto="Não usado" cor="#888" fundo="#F0F0F0" borda="#DDD" />
                            : usado
                              ? <Selo texto="Vai atualizar" cor="#2E7D32" fundo="#E8F5E9" borda="#A5D6A7" />
                              : <Selo texto="Fora deste relatório" cor="#8B6D00" fundo="#FFF8E1" borda="#FFE082" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              onClick={() => setConfirmouLigacoes(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1.5px solid #E0E0E0', borderRadius: '8px', padding: '12px 16px', cursor: 'pointer', marginTop: '16px', background: confirmouLigacoes ? '#E7F4EE' : '#F5F5F5' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${confirmouLigacoes ? '#00A859' : '#CCC'}`, background: confirmouLigacoes ? '#00A859' : 'transparent', color: '#fff', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                {confirmouLigacoes ? '✓' : ''}
              </span>
              <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 600, color: '#333' }}>
                Revisei a tabela e confirmo as ligações
              </span>
            </div>
          </div>

          {/* ── Passo 3 — prévia ── */}
          <div style={S.card}>
            <div style={S.step}>Passo 3</div>
            <h2 style={S.title}>Prévia da nova referência</h2>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {[
                ['todos', `Todos (${resultado.resumo.total})`],
                ['mudaram', `Mudaram (${resultado.resumo.comMudanca})`],
                ['naoAtualizados', `Não atualizados (${resultado.resumo.naoAtualizados})`],
                ['emVerificacao', `Em verificação (${resultado.resumo.emVerificacao})`],
              ].map(([id, texto]) => (
                <button
                  key={id}
                  onClick={() => setFiltro(id)}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    fontFamily: "'Open Sans',sans-serif", border: '1.5px solid #00A859', cursor: 'pointer',
                    background: filtro === id ? '#007A3D' : '#fff', color: filtro === id ? '#fff' : '#007A3D',
                  }}
                >
                  {texto}
                </button>
              ))}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                <thead>
                  <tr>
                    <th style={S.th}>Item</th>
                    <th style={S.th}>Origem</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>{rotuloAnterior}</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Nova</th>
                    <th style={{ ...S.th, textAlign: 'right', width: '90px' }}>Variação</th>
                    <th style={S.th}>Motivo</th>
                    <th style={{ ...S.th, width: '150px' }}>Valor a usar</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map((l, idx) => (
                    <tr key={l.id} style={{ background: l.emVerificacao ? '#FFFDF5' : idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={S.td}>
                        <p style={{ margin: 0, fontWeight: 600, color: '#222' }}>{l.tipo}</p>
                        <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#AAA' }}>
                          {l.categoria}{l.subcategoria ? ` › ${l.subcategoria}` : ''} · {l.unidade}
                        </p>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                          {l.emVerificacao && <SeloVerificacao />}
                          {l.naoAtualizado && <SeloNaoAtualizado />}
                          {l.semCusto && <SeloSemCusto />}
                        </div>
                      </td>
                      <td style={{ ...S.td, fontSize: '11px', color: '#666' }}>{ORIGENS[l.origem]}</td>
                      <td style={{ ...S.td, textAlign: 'right', ...S.mono }}>{fmt(l.anterior.unitario)}</td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#222', ...S.mono }}>{fmt(l.efetivo.unitario)}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}><Variacao valor={l.variacao} /></td>
                      <td style={{ ...S.td, fontSize: '11px', color: '#666' }}>
                        {l.naoAtualizado
                          ? <>Não atualizado — mantém o valor de {rotuloAnterior}. <span style={{ color: '#AAA' }}>{l.motivo}</span></>
                          : l.motivo}
                        {l.emVerificacao && (
                          <p style={{ margin: '4px 0 0 0', color: '#8B6D00' }}>{l.verificacao}</p>
                        )}
                      </td>
                      <td style={S.td}>
                        <select
                          value={l.escolha}
                          disabled={l.naoAtualizado}
                          onChange={e => { setEscolhas(prev => ({ ...prev, [l.id]: e.target.value })); setGerada(null); }}
                          style={{ ...S.input, padding: '5px 8px', fontSize: '11px' }}
                        >
                          <option value="novo">Usar valor recalculado</option>
                          <option value="anterior">Manter {rotuloAnterior}</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {resultado.projetosNaoUsados.length > 0 && (
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#8B6D00', marginTop: '12px' }}>
                Projetos do relatório sem ligação, que não entraram no cálculo: {resultado.projetosNaoUsados.map(p => p.chave).join(', ')}.
              </p>
            )}
          </div>

          {/* ── Passo 4 — identificação e geração ── */}
          <div style={S.card}>
            <div style={S.step}>Passo 4</div>
            <h2 style={S.title}>Criar a referência</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={S.label}>Chave</label>
                <input value={chave} onChange={e => { setChave(e.target.value); setGerada(null); }} style={S.input} placeholder="2026-10" />
              </div>
              <div>
                <label style={S.label}>Rótulo</label>
                <input value={rotulo} onChange={e => { setRotulo(e.target.value); setGerada(null); }} style={S.input} placeholder="2026 — PROORC 07/10/2026" />
              </div>
            </div>

            <div
              onClick={() => { setViraAtual(v => !v); setGerada(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1.5px solid #E0E0E0', borderRadius: '8px', padding: '12px 16px', cursor: 'pointer', background: viraAtual ? '#E7F4EE' : '#F5F5F5' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${viraAtual ? '#00A859' : '#CCC'}`, background: viraAtual ? '#00A859' : 'transparent', color: '#fff', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                {viraAtual ? '✓' : ''}
              </span>
              <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 600, color: '#333' }}>
                Passa a ser a referência atual, usada por padrão nos novos orçamentos
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                style={{ ...S.btnVerde, ...(confirmouLigacoes && chave ? {} : { background: '#CCC', cursor: 'not-allowed' }) }}
                disabled={!confirmouLigacoes || !chave}
                onClick={gerar}
              >
                Gerar nova referência
              </button>
              {!confirmouLigacoes && (
                <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#8B6D00' }}>
                  Confirme as ligações no Passo 2 antes de gerar.
                </span>
              )}
            </div>

            {gerada && (
              <div style={{ marginTop: '18px', background: '#E8F7EE', border: '1px solid #B8E6CC', borderRadius: '8px', padding: '16px' }}>
                <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 700, color: '#007A3D', margin: '0 0 8px 0' }}>
                  Referência {chave} criada em memória
                </p>
                <ul style={{ margin: '0 0 12px 0', paddingLeft: '18px' }}>
                  {[
                    `${resultado.resumo.atualizados} itens calculados do PROORC ou das fórmulas`,
                    `${resultado.resumo.naoAtualizados} itens copiados de ${rotuloAnterior}`,
                    `${resultado.resumo.mantidos} itens que você escolheu manter`,
                    `${Object.keys(resultado.composicoes).length} composições gravadas`,
                    `${Object.keys(resultado.catalogoMateriais).length} materiais no catálogo`,
                    `${(serializarBiblioteca(gerada).length / 1024).toFixed(0)} KB de arquivo`,
                  ].map(t => (
                    <li key={t} style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#333', lineHeight: 1.6 }}>{t}</li>
                  ))}
                </ul>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button style={S.btnVerde} onClick={() => baixarBiblioteca(gerada)}>
                    Baixar biblioteca.json
                  </button>
                  {!editando && (
                    <button style={S.btnCinza} onClick={() => setEditando(true)}>
                      Continuar editando valores
                    </button>
                  )}
                </div>
                <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '11px', color: '#666', margin: '10px 0 0 0', lineHeight: 1.6 }}>
                  Substitua <strong>src/data/biblioteca.json</strong> no repositório pelo arquivo baixado, confira o diff, faça o commit e publique. As referências antigas continuam intactas no arquivo.
                  {' '}Para ajustar também a TOD, os itens manuais ou os parâmetros antes de gravar, use "Continuar editando valores": o arquivo final sai com uma única referência nova.
                </p>
              </div>
            )}
          </div>

          {gerada && editando && (
            <EditarValores
              base={{ biblioteca: gerada, chave: chave.trim(), rotulo, fonte: `PROORC, relatórios de ${consolidado.dataReferencia}` }}
            />
          )}
        </>
      )}
    </div>
  );
}
