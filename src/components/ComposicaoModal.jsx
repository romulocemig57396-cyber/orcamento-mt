import React, { useMemo, useState } from 'react';
import { explicarFormacao, CLASSE_ROTULO } from '../proorc/explicarFormacao';
import { ORIGENS } from '../proorc/formacao';
import { fonteDoMaterial, dataBRParaISO } from '../utils/catalogoMateriais';
import SeloFonte from './SeloFonte';

const F = "'Open Sans',sans-serif";
const S = {
  label: { display: 'block', fontFamily: F, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: '6px' },
  input: { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '13px', fontFamily: F, color: '#333', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  th: { padding: '8px 10px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', background: '#007A3D', textAlign: 'left', whiteSpace: 'nowrap', position: 'sticky', top: 0 },
  td: { padding: '6px 10px', fontSize: '12px', color: '#444', borderBottom: '1px solid #F0F0F0' },
  mono: { fontVariantNumeric: 'tabular-nums' },
  passo: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontFamily: F, fontSize: '13px', padding: '7px 0', borderBottom: '1px solid #F5F5F5' },
};

const reais = (n) => `R$ ${(parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numero = (n, casas = 2) => (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export default function ComposicaoModal({ item, referencia, onFechar, onAbrirItem }) {
  const [busca, setBusca] = useState('');
  const dados = useMemo(() => explicarFormacao(item, referencia), [item, referencia]);
  if (!dados) return null;

  const materiais = (dados.materiais || []).filter(m => {
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return m.codigo.includes(t) || m.descricao.toLowerCase().includes(t);
  });

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onFechar(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px' }}
    >
      <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '760px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: '16px', fontWeight: 800, color: '#007A3D', margin: 0 }}>
              {dados.tipo}
            </h2>
            <p style={{ fontFamily: F, fontSize: '12px', color: '#888', margin: '4px 0 0 0' }}>
              {ORIGENS[dados.origem]} · referência {dados.referencia} · por {dados.unidade}
            </p>
            {dados.projeto && (
              <p style={{ fontFamily: F, fontSize: '12px', color: '#555', margin: '4px 0 0 0' }}>
                Projeto <strong>{dados.projeto}</strong> — {dados.descricaoProjeto}
                {dados.dataReferencia ? ` · PROORC de ${dados.dataReferencia}` : ''}
              </p>
            )}
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: '22px', color: '#BBB', cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {dados.naoAtualizado && (
          <div style={{ background: '#F5F5F5', border: '1px solid #DDD', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
            <p style={{ fontFamily: F, fontSize: '12px', color: '#666', margin: 0 }}>
              {dados.origem === 'proorc'
                ? 'Nesta referência o valor foi copiado da anterior: o projeto-padrão não veio no relatório do PROORC.'
                : `Nesta referência o valor foi copiado da anterior: a origem deste item (${ORIGENS[dados.origem]}) não é atualizada pelo PROORC.`}
            </p>
          </div>
        )}

        {dados.verificacao && (
          <div style={{ background: '#FFFBE6', border: '1px solid #FFE57A', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
            <p style={{ fontFamily: F, fontSize: '12px', color: '#8B6D00', margin: 0, fontWeight: 600 }}>
              Em verificação pelo responsável: {dados.verificacao}
            </p>
          </div>
        )}

        {!dados.disponivel ? (
          <p style={{ fontFamily: F, fontSize: '13px', color: '#666', lineHeight: 1.6, margin: 0 }}>
            {dados.mensagem}
          </p>
        ) : (
          <>
            {/* ── A conta ── */}
            {dados.conta && (
              <div style={{ background: '#F9FFF9', border: '1px solid #D4ECD9', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                <p style={{ fontFamily: F, fontSize: '13px', color: '#222', margin: 0, lineHeight: 1.6, ...S.mono }}>
                  {dados.conta}
                </p>
                {(dados.termos || []).length > 0 && onAbrirItem && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                    {dados.termos.map(t => (
                      <button
                        key={t.id}
                        onClick={() => onAbrirItem(t.id)}
                        style={{ background: '#fff', border: '1px solid #B8E6CC', color: '#007A3D', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: F }}
                      >
                        ver {t.tipo}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Passos ── */}
            {(dados.passos || []).length > 0 && (
              <div style={{ marginBottom: '18px' }}>
                {dados.passos.map((p, i) => (
                  <div key={i} style={S.passo}>
                    <span style={{ color: p.destaque ? '#222' : '#666', fontWeight: p.destaque ? 700 : 400 }}>{p.rotulo}</span>
                    <span style={{ color: p.destaque ? '#007A3D' : '#333', fontWeight: p.destaque ? 800 : 600, ...S.mono }}>{p.valor}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Mão de obra do projeto ── */}
            {(dados.servicos || []).length > 0 && (
              <>
                <p style={S.label}>Mão de obra</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px' }}>
                  <tbody>
                    {dados.servicos.map((s, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={S.td}>
                          {s.grupo === 'projeto' ? 'US de projeto' : 'US de construção'}
                          <span style={{ color: '#AAA', fontSize: '11px', marginLeft: '6px' }}>{s.codigo}</span>
                        </td>
                        <td style={{ ...S.td, textAlign: 'right', ...S.mono }}>{numero(s.quantidadeUS, 4)} US</td>
                        <td style={{ ...S.td, textAlign: 'right', ...S.mono }}>× {reais(s.precoUS)}</td>
                        <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, ...S.mono }}>{reais(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* ── Materiais ── */}
            {(dados.materiais || []).length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <p style={{ ...S.label, marginBottom: 0 }}>
                    Materiais ({dados.materiais.length})
                  </p>
                  <input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar por código ou descrição"
                    style={{ ...S.input, maxWidth: '260px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                  {['patrimonial', 'cabo', 'consumo', ...(dados.subtotais?.naoInformada ? ['naoInformada'] : [])].map(classe => (
                    <div key={classe} style={{ background: '#F9F9F9', borderRadius: '8px', padding: '8px 12px' }}>
                      <p style={{ fontFamily: F, fontSize: '10px', color: '#999', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {CLASSE_ROTULO[classe]}
                      </p>
                      <p style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: '#333', margin: 0, ...S.mono }}>
                        {reais(dados.subtotais?.[classe])}
                      </p>
                    </div>
                  ))}
                </div>

                <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #EEE', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={S.th}>Código</th>
                        <th style={S.th}>Descrição</th>
                        <th style={S.th}>Un.</th>
                        <th style={S.th}>Classe</th>
                        <th style={S.th}>Fonte</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Qtd.</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Preço</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materiais.length === 0 ? (
                        <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center', color: '#999', padding: '20px' }}>Nenhum material encontrado.</td></tr>
                      ) : materiais.map((m, i) => (
                        <tr key={`${m.codigo}-${i}`} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ ...S.td, ...S.mono }}>{m.codigo}</td>
                          <td style={S.td}>{m.descricao}</td>
                          <td style={S.td}>{m.unidade}</td>
                          <td style={{ ...S.td, fontSize: '11px', color: '#888' }}>{CLASSE_ROTULO[m.classe]}</td>
                          <td style={S.td}>
                            <SeloFonte
                              fonte={fonteDoMaterial(m)}
                              data={m.dataFonte || (fonteDoMaterial(m) === 'proorc' ? dataBRParaISO(dados.dataReferencia) : null)}
                            />
                          </td>
                          <td style={{ ...S.td, textAlign: 'right', ...S.mono }}>{numero(m.quantidade)}</td>
                          <td style={{ ...S.td, textAlign: 'right', ...S.mono }}>{reais(m.precoUnitario)}</td>
                          <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, ...S.mono }}>{reais(m.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            onClick={onFechar}
            style={{ background: '#007A3D', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: F }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
