import React, { useMemo, useState } from 'react';
import { BIBLIOTECA, chaveReferenciaAtual, getReferencia } from '../data/biblioteca';
import {
  calcularEdicao, aplicarEdicao, validarEdicao, parametrosAtuais, fonteTodAtual, ITENS_EDITAVEIS,
} from '../proorc/editarReferencia';
import { baixarBiblioteca, serializarBiblioteca } from '../proorc/gerarBibliotecaJson';
import { ORIGENS } from '../proorc/formacao';
import SeloPendente from './SeloPendente';
import { hojeISO } from '../utils/datas';

const F = "'Open Sans',sans-serif";
const S = {
  card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  title: { fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 700, color: '#007A3D', borderBottom: '2px solid #E7F4EE', paddingBottom: '12px', marginBottom: '16px', marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
  step: { display: 'inline-block', fontFamily: "'Montserrat',sans-serif", fontSize: '10px', fontWeight: 800, color: '#00A859', textTransform: 'uppercase', letterSpacing: '0.12em', background: '#E8F7EE', padding: '3px 10px', borderRadius: '20px', marginBottom: '10px' },
  input: { padding: '7px 10px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '13px', color: '#333', outline: 'none', boxSizing: 'border-box', fontFamily: F, background: '#fff', width: '100%' },
  label: { display: 'block', fontFamily: F, fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
  texto: { fontFamily: F, fontSize: '13px', color: '#666', margin: '0 0 14px 0', lineHeight: 1.6 },
  btnVerde: { background: '#00A859', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: F },
  th: { padding: '9px 10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', background: '#007A3D', whiteSpace: 'nowrap', textAlign: 'left' },
  td: { padding: '7px 10px', fontSize: '12px', color: '#444', borderBottom: '1px solid #F0F0F0', verticalAlign: 'middle' },
  mono: { fontVariantNumeric: 'tabular-nums' },
};

const fmt = (n, casas = 5) => (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: casas });
const v = (x) => parseFloat(x) || 0;

/* Parâmetros como aparecem na tela: o religador em R$ mil e o percentual em %,
   como na biblioteca; a formação guarda o religador em R$ e o % em fração.  */
const PARAMETROS_TELA = [
  { nome: 'fatorExistente', rotulo: 'Fator da rede existente', passo: '0.01', paraTela: x => x, deTela: x => x },
  { nome: 'fatorMaoObra', rotulo: 'Fator de mão de obra do recondutoramento urbano', passo: '0.01', paraTela: x => x, deTela: x => x },
  { nome: 'religadorAdicional', rotulo: 'Religador adicional dos PT (R$ mil)', passo: '0.0001', paraTela: x => x / 1000, deTela: x => x * 1000 },
  { nome: 'percentualMaoObra', rotulo: 'Mão de obra dos PT (%)', passo: '1', paraTela: x => Math.round(x * 100 * 1e6) / 1e6, deTela: x => x / 100 },
];

function Variacao({ valor }) {
  if (valor === null) return <span style={{ color: '#8B6D00', fontWeight: 600 }}>novo</span>;
  if (Math.abs(valor) < 0.0005) return <span style={{ color: '#AAA' }}>—</span>;
  const cor = valor > 0 ? '#c0392b' : '#2E7D32';
  return <span style={{ color: cor, fontWeight: 700, ...S.mono }}>{valor > 0 ? '+' : ''}{fmt(valor, 2)}%</span>;
}

function Marcador({ marcado, onClick, children }) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1.5px solid #E0E0E0', borderRadius: '8px', padding: '12px 16px', cursor: 'pointer', background: marcado ? '#E7F4EE' : '#F5F5F5' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${marcado ? '#00A859' : '#CCC'}`, background: marcado ? '#00A859' : 'transparent', color: '#fff', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
        {marcado ? '✓' : ''}
      </span>
      <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 600, color: '#333' }}>{children}</span>
    </div>
  );
}

/* `base` (opcional): referência em preparação vinda do PROORC, ainda não
   gravada — { biblioteca, chave, rotulo, fonte }. Sem ela, a edição parte de
   uma referência instalada.                                                 */
export default function EditarValores({ base }) {
  const emPreparacao = !!base;
  const [chaveInstalada, setChaveInstalada] = useState(chaveReferenciaAtual);
  const bibliotecaBase = emPreparacao ? base.biblioteca : BIBLIOTECA;
  const chaveBase = emPreparacao ? base.chave : chaveInstalada;
  const rotuloBase = emPreparacao ? base.rotulo : (getReferencia(chaveInstalada)?.rotulo || chaveInstalada);

  const atuais = useMemo(() => parametrosAtuais(bibliotecaBase), [bibliotecaBase]);
  const [edicoes, setEdicoes] = useState({});
  const [parametrosTela, setParametrosTela] = useState({});
  const [fonteTod, setFonteTod] = useState(() => fonteTodAtual(bibliotecaBase));
  const [chave, setChave] = useState(emPreparacao ? base.chave : hojeISO().slice(0, 7));
  const [rotulo, setRotulo] = useState(emPreparacao ? `${base.rotulo} + edições` : '');
  const [viraAtual, setViraAtual] = useState(true);
  const [gerada, setGerada] = useState(null);
  const [erro, setErro] = useState('');

  // Parâmetros em unidades internas; vazio = não alterado
  const parametros = useMemo(() => {
    const p = {};
    PARAMETROS_TELA.forEach(d => {
      const t = parametrosTela[d.nome];
      if (t !== undefined && t !== '' && !Number.isNaN(parseFloat(t))) p[d.nome] = d.deTela(parseFloat(t));
    });
    return p;
  }, [parametrosTela]);

  const resultado = useMemo(
    () => calcularEdicao({ biblioteca: bibliotecaBase, chaveBase, edicoes, parametros, fonteTod }),
    [bibliotecaBase, chaveBase, edicoes, parametros, fonteTod],
  );
  const { erros } = validarEdicao({ edicoes, parametros });
  const alteradas = resultado.previa.filter(l => l.alterado);
  const fonteTodMudou = fonteTod.trim() !== fonteTodAtual(bibliotecaBase);

  const editaveis = ITENS_EDITAVEIS(bibliotecaBase);
  const tod = editaveis.filter(i => i.formacao.origem === 'tod');
  const manuaisEFixos = editaveis.filter(i => i.formacao.origem !== 'tod');
  const custoBase = (item) => item.custos?.[chaveBase] || {};

  const valorCampo = (item, campo) => edicoes[item.id]?.[campo] ?? String(v(custoBase(item)[campo]));
  const alterarCampo = (id, campo, valor) => {
    setEdicoes(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
    setGerada(null);
  };
  const recomecar = () => { setEdicoes({}); setParametrosTela({}); setFonteTod(fonteTodAtual(bibliotecaBase)); setGerada(null); setErro(''); };

  const gerar = () => {
    try {
      const fonte = emPreparacao
        ? `${base.fonte || base.rotulo} + edições administrativas`
        : `Edição administrativa sobre ${rotuloBase}${fonteTodMudou ? ` (${fonteTod.trim()})` : ''}`;
      const nova = aplicarEdicao({
        biblioteca: BIBLIOTECA, resultado, chave, rotulo, fonte, atual: viraAtual, parametros, fonteTod: fonteTod.trim(),
      });
      setGerada(nova);
      setErro('');
    } catch (e) {
      setErro(e.message);
    }
  };

  const podeGerar = erros.length === 0 && !!chave.trim() && (alteradas.length > 0 || fonteTodMudou || emPreparacao);

  const campoNumero = (item, campo, rotuloCampo, desabilitado = false, valorFixo) => (
    <input
      type="number" step="any" min="0"
      aria-label={`${item.tipo} — ${rotuloCampo}`}
      value={valorFixo !== undefined ? valorFixo : valorCampo(item, campo)}
      disabled={desabilitado}
      onChange={e => alterarCampo(item.id, campo, e.target.value)}
      style={{ ...S.input, ...S.mono, textAlign: 'right', ...(desabilitado ? { background: '#F5F5F5', color: '#888' } : {}) }}
    />
  );

  return (
    <div style={{ maxWidth: '960px' }}>

      {/* ── Base ── */}
      <div style={S.card}>
        <div style={S.step}>Passo 1</div>
        <h2 style={S.title}>Referência em preparação</h2>
        <p style={S.texto}>
          A edição nunca altera uma referência existente: ela monta uma referência nova a partir da base.
          Itens do PROORC, de fórmula e de mão de obra não são editados aqui — vêm da importação ou do cálculo, e as fórmulas são recalculadas ao vivo.
        </p>
        {emPreparacao ? (
          <p style={{ ...S.texto, margin: 0, color: '#8B6D00', fontWeight: 600 }}>
            Base: referência em preparação {base.chave} — {base.rotulo} (montada pelo PROORC, ainda não gravada).
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <p style={{ ...S.texto, margin: 0, fontWeight: 600, color: '#333' }}>Base: {rotuloBase}</p>
            <select
              aria-label="Referência base"
              value={chaveInstalada}
              onChange={e => { setChaveInstalada(e.target.value); setEdicoes({}); setParametrosTela({}); setGerada(null); }}
              style={{ ...S.input, width: 'auto' }}
            >
              {BIBLIOTECA.referencias.map(r => <option key={r.chave} value={r.chave}>{r.rotulo}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── TOD ── */}
      <div style={S.card}>
        <div style={S.step}>Passo 2</div>
        <h2 style={S.title}>Itens da TOD ({tod.length})</h2>
        <p style={S.texto}>
          Material e mão de obra por km, em R$ mil. A mão de obra da TOD já inclui mão de obra própria, serviços de terceiros e taxa de administração; o unitário é a soma.
        </p>
        <div style={{ maxWidth: '320px', marginBottom: '14px' }}>
          <label htmlFor="fonte-tod" style={S.label}>Fonte/versão da TOD</label>
          <input id="fonte-tod" value={fonteTod} onChange={e => { setFonteTod(e.target.value); setGerada(null); }} style={S.input} placeholder="TOD dez/2024" />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th}>Item</th>
              <th style={{ ...S.th, width: '150px' }}>Material</th>
              <th style={{ ...S.th, width: '150px' }}>Mão de obra</th>
              <th style={{ ...S.th, width: '120px', textAlign: 'right' }}>Unitário</th>
            </tr>
          </thead>
          <tbody>
            {tod.map((item, idx) => (
              <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                <td style={S.td}>
                  <p style={{ margin: 0, fontWeight: 600, color: '#222' }}>{item.tipo}</p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#AAA' }}>{item.formacao.descricaoTod}</p>
                </td>
                <td style={S.td}>{campoNumero(item, 'material', 'material')}</td>
                <td style={S.td}>{campoNumero(item, 'maoObra', 'mão de obra')}</td>
                <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmt(resultado.custos[item.id]?.unitario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Manuais e fixos ── */}
      <div style={S.card}>
        <h2 style={S.title}>Itens manuais e fixos ({manuaisEFixos.length})</h2>
        <p style={S.texto}>
          Valores em R$ mil por unidade do item. Quando material e mão de obra são maiores que zero, o unitário é a soma dos dois; senão, digite o unitário.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th}>Item</th>
              <th style={{ ...S.th, width: '130px' }}>Material</th>
              <th style={{ ...S.th, width: '130px' }}>Mão de obra</th>
              <th style={{ ...S.th, width: '130px' }}>Unitário</th>
            </tr>
          </thead>
          <tbody>
            {manuaisEFixos.map((item, idx) => {
              const calculado = resultado.custos[item.id] || {};
              const soma = v(calculado.material) > 0 && v(calculado.maoObra) > 0;
              return (
                <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                  <td style={S.td}>
                    <p style={{ margin: 0, fontWeight: 600, color: '#222' }}>{item.tipo}</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#AAA' }}>
                      {ORIGENS[item.formacao.origem]} · {item.categoria}{item.subcategoria ? ` › ${item.subcategoria}` : ''} · {item.unidade}
                    </p>
                  </td>
                  <td style={S.td}>{campoNumero(item, 'material', 'material')}</td>
                  <td style={S.td}>{campoNumero(item, 'maoObra', 'mão de obra')}</td>
                  <td style={S.td}>{soma
                    ? campoNumero(item, 'unitario', 'unitário', true, String(calculado.unitario))
                    : campoNumero(item, 'unitario', 'unitário')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Parâmetros ── */}
      <div style={S.card}>
        <h2 style={S.title}>Parâmetros das fórmulas</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          {PARAMETROS_TELA.map(d => (
            <div key={d.nome}>
              <label htmlFor={`param-${d.nome}`} style={S.label}>{d.rotulo}</label>
              <input
                id={`param-${d.nome}`} type="number" step={d.passo} min="0"
                value={parametrosTela[d.nome] ?? String(d.paraTela(atuais[d.nome]))}
                onChange={e => { setParametrosTela(prev => ({ ...prev, [d.nome]: e.target.value })); setGerada(null); }}
                style={{ ...S.input, ...S.mono }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Prévia ── */}
      <div style={S.card}>
        <div style={S.step}>Passo 3</div>
        <h2 style={S.title}>Prévia em cascata</h2>

        {erros.length > 0 && (
          <div role="alert" style={{ background: '#FEE8E8', border: '1px solid #F5B7B1', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
            {erros.map(e => <p key={e} style={{ fontFamily: F, fontSize: '12px', color: '#c0392b', margin: 0, fontWeight: 600 }}>{e}</p>)}
          </div>
        )}
        {(resultado.resumo.avisosVariacao > 0 || resultado.resumo.novosPendentes.length > 0) && (
          <div style={{ background: '#FFFBE6', border: '1px solid #FFE57A', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
            {resultado.resumo.avisosVariacao > 0 && (
              <p style={{ fontFamily: F, fontSize: '12px', color: '#8B6D00', margin: 0, fontWeight: 600 }}>
                {resultado.resumo.avisosVariacao} {resultado.resumo.avisosVariacao === 1 ? 'item varia' : 'itens variam'} mais de 30%. Confira antes de gerar.
              </p>
            )}
            {resultado.resumo.novosPendentes.length > 0 && (
              <p style={{ fontFamily: F, fontSize: '12px', color: '#8B6D00', margin: 0, fontWeight: 600 }}>
                {resultado.resumo.novosPendentes.length} {resultado.resumo.novosPendentes.length === 1 ? 'item ficará' : 'itens ficarão'} sem custo (pendente).
              </p>
            )}
          </div>
        )}

        {alteradas.length === 0 ? (
          <p style={{ ...S.texto, margin: 0 }}>Nenhuma alteração ainda.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="previa-edicao" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
              <thead>
                <tr>
                  <th style={S.th}>Item</th>
                  <th style={S.th}>Origem</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Atual</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Novo</th>
                  <th style={{ ...S.th, textAlign: 'right', width: '90px' }}>Variação</th>
                  <th style={S.th}>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {alteradas.map((l, idx) => (
                  <tr key={l.id} style={{ background: l.avisoVariacao || l.ficaPendente ? '#FFFDF5' : idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={S.td}>
                      <p style={{ margin: 0, fontWeight: 600, color: '#222' }}>{l.tipo}</p>
                      <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#AAA' }}>{l.categoria}{l.subcategoria ? ` › ${l.subcategoria}` : ''} · {l.unidade}</p>
                      {l.ficaPendente && <SeloPendente style={{ display: 'inline-block', margin: '4px 0 0 0' }} />}
                    </td>
                    <td style={{ ...S.td, fontSize: '11px', color: '#666' }}>{ORIGENS[l.origem]}</td>
                    <td style={{ ...S.td, textAlign: 'right', ...S.mono }}>{fmt(l.anterior.unitario)}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#222', ...S.mono }}>{fmt(l.efetivo.unitario)}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}><Variacao valor={l.variacao} /></td>
                    <td style={{ ...S.td, fontSize: '11px', color: '#666' }}>
                      <span>{l.motivo}</span>
                      {l.avisoVariacao && <p style={{ margin: '4px 0 0 0', color: '#8B6D00', fontWeight: 600 }}>⚠️ Variação acima de 30%</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(alteradas.length > 0 || Object.keys(edicoes).length > 0 || Object.keys(parametrosTela).length > 0) && (
          <button onClick={recomecar} style={{ marginTop: '12px', background: '#fff', color: '#888', border: '1px solid #CCC', padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
            Descartar edições
          </button>
        )}
      </div>

      {/* ── Gerar ── */}
      <div style={S.card}>
        <div style={S.step}>Passo 4</div>
        <h2 style={S.title}>Gerar referência</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label htmlFor="edicao-chave" style={S.label}>Chave</label>
            <input id="edicao-chave" value={chave} onChange={e => { setChave(e.target.value); setGerada(null); }} style={S.input} placeholder="2026-10" />
          </div>
          <div>
            <label htmlFor="edicao-rotulo" style={S.label}>Rótulo</label>
            <input id="edicao-rotulo" value={rotulo} onChange={e => { setRotulo(e.target.value); setGerada(null); }} style={S.input} placeholder="2026 — TOD dez/2024 + edições" />
          </div>
        </div>
        <Marcador marcado={viraAtual} onClick={() => { setViraAtual(x => !x); setGerada(null); }}>
          Passa a ser a referência atual, usada por padrão nos novos orçamentos
        </Marcador>

        <div style={{ display: 'flex', gap: '10px', marginTop: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            style={{ ...S.btnVerde, ...(podeGerar ? {} : { background: '#CCC', cursor: 'not-allowed' }) }}
            disabled={!podeGerar}
            onClick={gerar}
          >
            Gerar referência
          </button>
          {erros.length > 0 && <span style={{ fontFamily: F, fontSize: '12px', color: '#c0392b' }}>Corrija os valores negativos antes de gerar.</span>}
        </div>

        {erro && (
          <div role="alert" style={{ marginTop: '14px', background: '#FEE8E8', border: '1px solid #F5B7B1', borderRadius: '8px', padding: '10px 14px' }}>
            <p style={{ fontFamily: F, fontSize: '13px', color: '#c0392b', margin: 0, fontWeight: 600 }}>{erro}</p>
          </div>
        )}

        {gerada && (
          <div style={{ marginTop: '18px', background: '#E8F7EE', border: '1px solid #B8E6CC', borderRadius: '8px', padding: '16px' }}>
            <p style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: '#007A3D', margin: '0 0 8px 0' }}>
              Referência {chave.trim()} criada em memória
            </p>
            <ul style={{ margin: '0 0 12px 0', paddingLeft: '18px' }}>
              {[
                `${resultado.resumo.editados} ${resultado.resumo.editados === 1 ? 'item editado' : 'itens editados'}`,
                `${alteradas.length} ${alteradas.length === 1 ? 'item com valor novo' : 'itens com valor novo'} (incluindo o recálculo das fórmulas)`,
                `${resultado.previa.length - alteradas.length} itens copiados de ${rotuloBase}`,
                `${(serializarBiblioteca(gerada).length / 1024).toFixed(0)} KB de arquivo`,
              ].map(t => <li key={t} style={{ fontFamily: F, fontSize: '12px', color: '#333', lineHeight: 1.6 }}>{t}</li>)}
            </ul>
            <button style={S.btnVerde} onClick={() => baixarBiblioteca(gerada)}>Baixar biblioteca.json</button>
            <p style={{ fontFamily: F, fontSize: '11px', color: '#666', margin: '10px 0 0 0', lineHeight: 1.6 }}>
              Substitua <strong>src/data/biblioteca.json</strong> no repositório pelo arquivo baixado, confira o diff, faça o commit e publique. As referências antigas continuam intactas no arquivo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
