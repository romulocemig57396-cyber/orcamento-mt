import React, { useMemo, useRef, useState } from 'react';
import { BIBLIOTECA, getCatalogoMateriais, getPrecosUS, getReferencia, chaveReferenciaAtual } from '../data/biblioteca';
import { lerArquivoPropostas, juntarPropostas, lerPropostas } from '../utils/propostas';
import { recalcularPropostaNaReferencia, aprovarProposta } from '../proorc/propostasAdmin';
import { baixarBiblioteca, serializarBiblioteca } from '../proorc/gerarBibliotecaJson';
import { hojeISO } from '../utils/datas';
import ComposicaoModal from './ComposicaoModal';

const F = "'Open Sans',sans-serif";
const S = {
  card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  title: { fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 700, color: '#007A3D', borderBottom: '2px solid #E7F4EE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
  label: { display: 'block', fontFamily: F, fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
  input: { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '13px', color: '#333', outline: 'none', boxSizing: 'border-box', fontFamily: F, background: '#fff' },
  btnVerde: { background: '#00A859', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: F },
  btnCinza: { background: '#fff', color: '#666', border: '1px solid #CCC', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: F },
  linha: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontFamily: F, fontSize: '13px', padding: '6px 0', borderBottom: '1px solid #F5F5F5' },
  mono: { fontVariantNumeric: 'tabular-nums' },
};

const reais = (n) => `R$ ${(parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mil = (n) => (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
const dataBR = (iso) => String(iso || '').split('-').reverse().join('/');

export default function PropostasAdmin({ anoReferencia = chaveReferenciaAtual() }) {
  const arquivoRef = useRef(null);
  const [propostas, setPropostas] = useState([]);
  const [decisoes, setDecisoes] = useState({});      // id → { decisao, motivo }
  const [motivos, setMotivos] = useState({});        // id → texto em edição
  const [biblioteca, setBiblioteca] = useState(BIBLIOTECA);
  const [mensagem, setMensagem] = useState(null);
  const [verComposicao, setVerComposicao] = useState(null);

  const referencia = getReferencia(anoReferencia);
  const catalogoMateriais = getCatalogoMateriais(anoReferencia);
  const precosUS = getPrecosUS(anoReferencia);

  const recalculos = useMemo(() => {
    const mapa = {};
    propostas.forEach(p => {
      mapa[p.id] = recalcularPropostaNaReferencia(p, { catalogoMateriais, precosUS, referencia: anoReferencia });
    });
    return mapa;
  }, [propostas, catalogoMateriais, precosUS, anoReferencia]);

  const importar = async (files) => {
    if (!files?.length) return;
    try {
      const lidas = [];
      for (const file of files) lidas.push(...lerArquivoPropostas(await file.text()));
      const juntas = juntarPropostas(propostas, lidas);
      setPropostas(juntas);
      setMensagem({ tipo: 'ok', texto: `${lidas.length} proposta(s) de ${files.length} arquivo(s); ${juntas.length} na lista.` });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message });
    }
  };

  const carregarDoNavegador = () => {
    const locais = lerPropostas();
    if (locais.length === 0) {
      setMensagem({ tipo: 'erro', texto: 'Não há propostas salvas neste navegador.' });
      return;
    }
    const juntas = juntarPropostas(propostas, locais);
    setPropostas(juntas);
    setMensagem({ tipo: 'ok', texto: `${locais.length} proposta(s) deste navegador; ${juntas.length} na lista.` });
  };

  const aprovar = (proposta) => {
    try {
      const nova = aprovarProposta({
        biblioteca, proposta, referencia: anoReferencia,
        recalculo: recalculos[proposta.id], aprovadoEm: hojeISO(),
      });
      setBiblioteca(nova);
      setDecisoes(prev => ({ ...prev, [proposta.id]: { decisao: 'aprovada' } }));
      setMensagem({ tipo: 'ok', texto: `${proposta.tipo} aprovada e incluída na biblioteca como oficial.` });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message });
    }
  };

  const recusar = (proposta) => {
    setDecisoes(prev => ({ ...prev, [proposta.id]: { decisao: 'recusada', motivo: (motivos[proposta.id] || '').trim() } }));
    setMensagem({ tipo: 'ok', texto: `${proposta.tipo} recusada. Avise o autor.` });
  };

  const aprovadas = Object.values(decisoes).filter(d => d.decisao === 'aprovada').length;
  const pendentes = propostas.filter(p => !decisoes[p.id]);

  return (
    <div style={{ maxWidth: '960px' }}>

      <div style={S.card}>
        <h2 style={S.title}>Propostas de itens</h2>
        <p style={{ fontFamily: F, fontSize: '13px', color: '#666', margin: '0 0 14px 0', lineHeight: 1.6 }}>
          Importe os arquivos que os analistas enviaram. Os preços são recalculados na referência
          <strong> {referencia?.rotulo || anoReferencia}</strong>, destacando o que mudou desde a criação da proposta.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button style={S.btnVerde} onClick={() => arquivoRef.current?.click()}>Importar arquivos de propostas</button>
          <button style={S.btnCinza} onClick={carregarDoNavegador}>Carregar as deste navegador</button>
          <input ref={arquivoRef} type="file" accept=".json" multiple style={{ display: 'none' }}
            onChange={e => { importar([...e.target.files]); e.target.value = ''; }} />
        </div>

        {mensagem && (
          <div style={{
            marginTop: '14px', borderRadius: '8px', padding: '10px 14px',
            background: mensagem.tipo === 'erro' ? '#FEE8E8' : '#E8F7EE',
            border: `1px solid ${mensagem.tipo === 'erro' ? '#F5B7B1' : '#B8E6CC'}`,
          }}>
            <p style={{ fontFamily: F, fontSize: '12px', margin: 0, fontWeight: 600, color: mensagem.tipo === 'erro' ? '#c0392b' : '#007A3D' }}>
              {mensagem.texto}
            </p>
          </div>
        )}

        {!precosUS.construcao && propostas.length > 0 && (
          <div style={{ marginTop: '14px', background: '#FFFBE6', border: '1px solid #FFE57A', borderRadius: '8px', padding: '10px 14px' }}>
            <p style={{ fontFamily: F, fontSize: '12px', color: '#8B6D00', margin: 0, lineHeight: 1.6 }}>
              {recalculos[propostas[0].id]?.motivoIndisponivel
                || 'Esta referência não registra o preço da US; confira os valores antes de aprovar.'}
            </p>
          </div>
        )}
      </div>

      {propostas.map(p => {
        const r = recalculos[p.id];
        const decisao = decisoes[p.id];
        return (
          <div key={p.id} style={{ ...S.card, borderTop: `3px solid ${decisao?.decisao === 'aprovada' ? '#00A859' : decisao ? '#e74c3c' : '#FFD100'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 800, color: '#222', margin: 0 }}>
                  {p.tipo}
                </h3>
                <p style={{ fontFamily: F, fontSize: '12px', color: '#888', margin: '4px 0 0 0' }}>
                  {p.categoria}{p.subcategoria ? ` › ${p.subcategoria}` : ''} · por {p.unidade} · <span style={S.mono}>{p.id}</span>
                </p>
                <p style={{ fontFamily: F, fontSize: '12px', color: '#555', margin: '4px 0 0 0' }}>
                  Proposta de <strong>{p.autor || 'autor não informado'}</strong> em {dataBR(p.criadoEm)},
                  com preços de {getReferencia(p.referenciaPrecos)?.rotulo || p.referenciaPrecos || '—'}
                </p>
              </div>
              {decisao && (
                <span style={{
                  padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, fontFamily: F, whiteSpace: 'nowrap',
                  background: decisao.decisao === 'aprovada' ? '#E8F5E9' : '#FEE8E8',
                  color: decisao.decisao === 'aprovada' ? '#2E7D32' : '#c0392b',
                  border: `1px solid ${decisao.decisao === 'aprovada' ? '#A5D6A7' : '#F5B7B1'}`,
                }}>
                  {decisao.decisao === 'aprovada' ? 'Aprovada' : 'Recusada'}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '14px' }}>
              {[
                ['Materiais', reais(r.totais.totalMateriais)],
                ['Mão de obra', reais(r.totais.totalServicos)],
                ['Total do projeto', reais(r.totais.totalProjetoGeral)],
                ['Unitário na criação', mil(r.original.unitario)],
                [`Unitário em ${anoReferencia}`, mil(r.custos.unitario)],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} style={{ background: '#F9F9F9', borderRadius: '8px', padding: '10px 12px' }}>
                  <p style={{ fontFamily: F, fontSize: '10px', color: '#999', margin: '0 0 3px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{rotulo}</p>
                  <p style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: '#333', margin: 0, ...S.mono }}>{valor}</p>
                </div>
              ))}
            </div>

            {r.mudouUnitario && (
              <div style={{ background: '#FFFBE6', border: '1px solid #FFE57A', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
                <p style={{ fontFamily: F, fontSize: '12px', color: '#8B6D00', margin: '0 0 6px 0', fontWeight: 700 }}>
                  O unitário mudou desde a criação da proposta.
                </p>
                {r.mudancas.map((m, i) => (
                  <p key={i} style={{ fontFamily: F, fontSize: '12px', color: '#8B6D00', margin: 0, lineHeight: 1.6 }}>{m}</p>
                ))}
              </div>
            )}

            {!r.mudouUnitario && r.mudancas.length > 0 && (
              <div style={{ background: '#F5F5F5', border: '1px solid #DDD', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
                {r.mudancas.map((m, i) => (
                  <p key={i} style={{ fontFamily: F, fontSize: '12px', color: '#666', margin: 0, lineHeight: 1.6 }}>{m}</p>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={S.btnCinza} onClick={() => setVerComposicao(p)}>Ver composição</button>
              {!decisao && (
                <>
                  <button style={S.btnVerde} onClick={() => aprovar(p)}>Aprovar</button>
                  <input
                    value={motivos[p.id] || ''}
                    onChange={e => setMotivos(prev => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="Motivo da recusa (opcional)"
                    style={{ ...S.input, maxWidth: '260px' }}
                  />
                  <button style={{ ...S.btnCinza, color: '#c0392b', borderColor: '#FFCDD2' }} onClick={() => recusar(p)}>Recusar</button>
                </>
              )}
              {decisao?.decisao === 'recusada' && decisao.motivo && (
                <span style={{ fontFamily: F, fontSize: '12px', color: '#c0392b' }}>Motivo: {decisao.motivo}</span>
              )}
            </div>
          </div>
        );
      })}

      {aprovadas > 0 && (
        <div style={{ ...S.card, borderTop: '3px solid #007A3D' }}>
          <h2 style={S.title}>Baixar a biblioteca</h2>
          <p style={{ fontFamily: F, fontSize: '13px', color: '#333', margin: '0 0 12px 0', lineHeight: 1.6 }}>
            {aprovadas} item(ns) aprovado(s) entraram na biblioteca, na referência {referencia?.rotulo || anoReferencia},
            mantendo o mesmo id da proposta. A biblioteca passa a ter {biblioteca.itens.length} itens
            ({(serializarBiblioteca(biblioteca).length / 1024).toFixed(0)} KB).
          </p>
          <button style={S.btnVerde} onClick={() => baixarBiblioteca(biblioteca)}>Baixar biblioteca.json</button>
          <p style={{ fontFamily: F, fontSize: '11px', color: '#666', margin: '10px 0 0 0', lineHeight: 1.6 }}>
            Substitua <strong>src/data/biblioteca.json</strong> pelo arquivo baixado, confira o diff, faça o commit e publique.
          </p>
        </div>
      )}

      {propostas.length > 0 && pendentes.length === 0 && aprovadas === 0 && (
        <div style={S.card}>
          <p style={{ fontFamily: F, fontSize: '13px', color: '#666', margin: 0 }}>
            Todas as propostas foram recusadas. Nada a incluir na biblioteca.
          </p>
        </div>
      )}

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
