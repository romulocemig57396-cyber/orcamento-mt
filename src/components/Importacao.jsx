import React, { useRef, useEffect } from 'react';
import { TABELA_CUSTOS, getValorPorAno } from '../data/tabelaCustos';

// ── Regras de matching biblioteca ──────────────────────────────────────────
const REGRAS = [
  [/modificação.*rdu.*rdp.*150/i,              'p/ RDP 150',                        'pp'],
  [/modificação.*rdu.*rdp.*50mm/i,             'p/ RDP 50',                         'pp'],
  [/modificação.*rdu.*rdp.*240/i,              'p/ RDP 240',                        'pp'],
  [/construção.*rdp.*150/i,                    'RDP 150',                           'pp'],
  [/construção.*rdp.*50/i,                     'RDP 50',                            'pp'],
  [/construção.*rdp.*240/i,                    'RDP 240',                           'pp'],
  [/modificação.*rdr.*336/i,                   'CAA 2 p/ 336',                      'pp'],
  [/modificação.*rdr.*4\/0/i,                  'CAA 2 p/ 4\/0',                     'pp'],
  [/modificação.*rdr.*1\/0/i,                  'CAA 4 p\/ 1\/0',                    'pp'],
  [/construção.*rdr.*336/i,                    'Tri CAA 336,4',                     'pp'],
  [/construção.*rdr.*4\/0/i,                   'Tri CAA 4\/0',                      'pp'],
  [/construção.*rdr.*1\/0/i,                   'Tri CAA 1\/0',                      'pp'],
  [/construção.*rdr.*caa.*2/i,                 'Tri CAA 2',                         'pp'],
  [/construção.*rdr.*caa.*4/i,                 'Tri CAA 4',                         'pp'],
  [/brt.*167.*rural/i,                         'BRT trif 167 kVA - Rural',          'pp'],
  [/brt.*167.*urbano/i,                        'BRT trif 167 kVA - Urbano',         'pp'],
  [/brt.*167/i,                                'BRT trif 167 kVA - Rural',          'pp'],
  [/brt.*250.*rural/i,                         'BRT trif 250 KVA - Rural',          'pp'],
  [/brt.*250.*urbano/i,                        'BRT trif 250 KVA - Urbano',         'pp'],
  [/brt.*76/i,                                 'BRT trif 76,2 kVA',                 'pp'],
  [/relocação.*religador|relocar.*religador/i, 'Religador trifásico',               'parcela_reg'],
  [/relocação.*banco.*rt|relocar.*banco/i,     'Banco RT trifásico até 1\/0',       'parcela_reg'],
  [/religador.*trifásico.*36/i,                'Religador trifásico 36KV',          'pp'],
  [/religador.*trifásico.*24/i,                'Religador trifásico 24KV Rural',    'pp'],
  [/religador.*monofásico/i,                   'Religador monofásico 15KV',         'pp'],
  [/abertura.*chave|fecha.*chave/i,            'Abert\/Fecha. De Chave',            'ctc'],
  [/remoção.*(trafo|transformador).*(1ᴓ|monofásico)/i, 'Remoção de 01 trafo 1ᴓ',  'parcela_reg'],
  [/remoção.*(trafo|transformador).*(3ᴓ|trifásico)/i,  'Remoção de 01 trafo 3ᴓ',  'parcela_reg'],
  [/derivação.*aére/i,                         'Troca poste + ramal aéreo',         'parcela_reg'],
  [/derivação.*sub/i,                          'Troca poste + ramal sub',           'parcela_reg'],
  [/banco.*cap.*300.*fix/i,                    'Banco de Cap. 300 kVAr fixo',       'pp'],
  [/banco.*cap.*600.*fix/i,                    'Banco de Cap. 600 kVAr fixo',       'pp'],
  [/banco.*cap.*300.*aut/i,                    'Banco de Cap. 300 kVAr automático', 'pp'],
  [/banco.*cap.*600.*aut/i,                    'Banco de Cap. 600 kVAr automático', 'pp'],
];

const TIPOS_BIBLIOTECA = [...new Set(TABELA_CUSTOS.map(t => t.tipo))];

const CAT_META = {
  ctc:         { label: 'CTC', bg: '#FFFBE6', color: '#8B6D00', bd: '#FFE57A' },
  cti:         { label: 'CTI', bg: '#E8F7EE', color: '#007A3D', bd: '#B8E6CC' },
  pp:          { label: 'PP',  bg: '#E8F5E9', color: '#2E7D32', bd: '#A5D6A7' },
  parcela_reg: { label: 'REG', bg: '#F3E5F5', color: '#6A1B9A', bd: '#CE93D8' },
};

const TIPO_LABELS = { LN: 'Ligação Nova', AC: 'Aumento de Carga', RF: 'Reforma' };

// Itens de alta tensão / responsabilidade direta CEMIG — não entram na tabela de validação
const ALTA_TENSAO_RE = /138\s*kv|linha.*138|\bdli\b|casa\s+de\s+controle|subestaç[ãa]o|\bld\b/i;

// ── Helpers ─────────────────────────────────────────────────────────────────
function matchRegras(texto) {
  for (const [re, tipo, cat] of REGRAS) {
    if (re.test(texto)) return { tipo, cat };
  }
  return null;
}

function extrairQuantidade(texto) {
  const kmM = texto.match(/(\d+[.,]\d+|\d+)\s*km/i);
  if (kmM) return { quantidade: parseFloat(kmM[1].replace(',', '.')), unidade: 'km' };
  const bancoM = texto.match(/(\d+)\s*banco/i);
  if (bancoM) return { quantidade: parseInt(bancoM[1]), unidade: 'ponto' };
  const pontM = texto.match(/(\d+)\s*(conj|ponto|un)/i);
  if (pontM) return { quantidade: parseInt(pontM[1]), unidade: 'ponto' };
  return { quantidade: '', unidade: 'km' };
}

// ── Análise do texto ─────────────────────────────────────────────────────────
function analisarTexto(texto) {
  const cab = {
    ns: '', cliente: '', municipio: '', tensaoKv: '',
    cargaAtual: '', demandaFutura: '', tipoAtendimento: '',
  };

  const m = re => texto.match(re);

  const nsM = m(/(?:NS|N\.S\.)[:\s]+([A-Z0-9\-\/]+)/i);
  if (nsM) cab.ns = nsM[1].trim();

  const cliM = m(/(?:Cliente|Solicitante|Interessado)[:\s]+([^\n\r]+)/i);
  if (cliM) cab.cliente = cliM[1].trim();

  const muniM = m(/(?:Município|Municipio|Localidade|Cidade)[:\s]+([^\n\r,\/]+)/i);
  if (muniM) cab.municipio = muniM[1].trim();

  const tensM = m(/tensão\s+de\s+(\d+[.,]\d+|\d+)\s*kV/i) || m(/(\d+[.,]\d+)\s*kV/i);
  if (tensM) cab.tensaoKv = tensM[1].replace(',', '.');

  const daM = m(/demanda\s+atual\s+de\s+(\d+[.,]?\d*)\s*kW/i) ||
              m(/carga\s+atual[:\s]+(\d+[.,]?\d*)/i);
  if (daM) cab.cargaAtual = parseFloat(daM[1].replace(',', '.'));

  const dfM = m(/demanda\s+futura\s+de\s+(\d+[.,]?\d*)\s*kW/i) ||
              m(/demanda\s+de\s+(\d+[.,]?\d*)\s*kW/i);
  if (dfM) cab.demandaFutura = parseFloat(dfM[1].replace(',', '.'));

  const tl = texto.toLowerCase();
  if (tl.includes('aumento de demanda') || tl.includes('ampliação') || tl.includes('aumento de carga')) {
    cab.tipoAtendimento = 'AC';
  } else if (tl.includes('ligação nova') || tl.includes('nova ligação')) {
    cab.tipoAtendimento = 'LN';
  }

  // Extrai bloco de obras
  let bloco = texto;
  const inicioM = bloco.match(/Obras\s+de\s+M[eé]dia\s+Tens[ãa]o/i);
  if (inicioM) bloco = bloco.slice(inicioM.index);
  const fimM = bloco.match(/Custo\s+Estimado/i);
  if (fimM) bloco = bloco.slice(0, fimM.index);

  const linhas = bloco.split(/\r?\n/);
  let secao = 'cemig';
  const rawItens = [];
  let cur = null;

  for (const linha of linhas) {
    const l = linha.trim();
    if (!l) continue;
    const ll = l.toLowerCase();

    if (ll.includes('responsabilidade da cemig') || ll.includes('custo cemig')) {
      secao = 'cemig'; cur = null; continue;
    }
    if (ll.includes('responsabilidade do interessado') || ll.includes('responsabilidade do cliente')) {
      secao = 'interessado'; cur = null; continue;
    }

    if (l.startsWith('-')) {
      if (cur) rawItens.push(cur);
      cur = { texto: l.slice(1).trim(), secao };
    } else if (cur) {
      if (!/^(obras|total|custo|resumo|seção)/i.test(ll)) {
        cur.texto += ' ' + l;
      } else {
        rawItens.push(cur); cur = null;
      }
    }
  }
  if (cur) rawItens.push(cur);

  // Separa itens de alta tensão (responsabilidade direta CEMIG) dos demais
  const textosAltaTensao = rawItens
    .filter(raw => ALTA_TENSAO_RE.test(raw.texto))
    .map(raw => raw.texto);

  const itens = rawItens.filter(raw => !ALTA_TENSAO_RE.test(raw.texto)).map(raw => {
    const t = raw.texto;
    let categoria = raw.secao === 'cemig' ? 'ctc' : 'parcela_reg';
    let percentualCemig = 0;

    if (raw.secao === 'interessado') {
      const propM = t.match(/Proporcionalidade\s+(\d+)%\s+cliente/i) ||
                   t.match(/(\d+)%\s+(?:de\s+)?(?:responsabilidade\s+do\s+)?cliente/i);
      if (propM) {
        categoria = 'pp';
        percentualCemig = 100 - parseInt(propM[1]);
      } else if (/exclusivo\s+(?:do\s+)?cliente/i.test(t)) {
        categoria = 'cti';
      }
    }

    const match = matchRegras(t);
    if (match) categoria = match.cat;
    const tipoSugerido = match ? (match.tipo || '') : '';

    const { quantidade, unidade } = extrairQuantidade(t);

    return { textoOriginal: t, tipoSelecionado: tipoSugerido, descricaoManual: t.slice(0, 200), quantidade, unidade, categoria, percentualCemig, expandido: false };
  });

  return { cab, itens, textosAltaTensao };
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const S = {
  card:     { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  title:    { fontFamily: "'Montserrat',sans-serif", fontSize: '15px', fontWeight: 700, color: '#007A3D', borderBottom: '2px solid #E7F4EE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
  step:     { display: 'inline-block', fontFamily: "'Montserrat',sans-serif", fontSize: '10px', fontWeight: 800, color: '#00A859', textTransform: 'uppercase', letterSpacing: '0.12em', background: '#E8F7EE', padding: '3px 10px', borderRadius: '20px', marginBottom: '10px' },
  input:    { padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #E0E0E0', fontSize: '13px', color: '#333', outline: 'none', boxSizing: 'border-box', fontFamily: "'Open Sans',sans-serif", background: '#fff', width: '100%' },
  btnVerde: { background: '#00A859', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Open Sans',sans-serif", transition: 'background 0.15s' },
  btnCinza: { background: '#fff', color: '#888', border: '1px solid #CCC', padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Open Sans',sans-serif" },
  labelMuted: { display: 'block', fontFamily: "'Open Sans',sans-serif", fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
  th:       { padding: '10px 12px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', background: '#007A3D', whiteSpace: 'nowrap', textAlign: 'left' },
  td:       { padding: '8px 10px', fontSize: '12px', color: '#444', borderBottom: '1px solid #F0F0F0', verticalAlign: 'middle' },
};

function Badge({ cat }) {
  const meta = CAT_META[cat] || { label: cat, bg: '#EEE', color: '#666', bd: '#DDD' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, fontFamily: "'Open Sans',sans-serif", background: meta.bg, color: meta.color, border: `1px solid ${meta.bd}`, whiteSpace: 'nowrap' }}>
      {meta.label}
    </span>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function Importacao({ updateField, setOrcamento, importacao, updateImportacao, obrasVinculadas, updateObrasVinculadas }) {
  const fileRef = useRef(null);

  const {
    textoOriginal: texto,
    cabecalhoDetectado: cabecalho,
    itensDetectados: itens,
    textosAltaTensao,
    textoAltaTensao,
    analisado,
  } = importacao;

  useEffect(() => {
    const temObrasVinculadas = textosAltaTensao.length > 0;
    if (
      obrasVinculadas.temObrasVinculadas !== temObrasVinculadas ||
      obrasVinculadas.descricao !== textoAltaTensao
    ) {
      updateObrasVinculadas({ temObrasVinculadas, descricao: textoAltaTensao });
    }
  }, [textosAltaTensao, textoAltaTensao]);

  const handleDataConclusaoChange = (valor) => {
    let diasRestantes = null;
    if (valor) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const dataConclusao = new Date(valor + 'T00:00:00');
      diasRestantes = Math.ceil((dataConclusao - hoje) / (1000 * 60 * 60 * 24));
    }
    updateObrasVinculadas({ dataConclusao: valor, diasRestantes });
  };

  const handleArquivo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => updateImportacao({ textoOriginal: ev.target.result });
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleAnalisar = () => {
    if (!texto.trim()) { alert('Cole ou carregue um texto para analisar.'); return; }
    const { cab, itens: found, textosAltaTensao: at } = analisarTexto(texto);
    updateImportacao({
      cabecalhoDetectado: cab,
      itensDetectados: found,
      textosAltaTensao: at,
      textoAltaTensao: at.join('\n\n'),
      analisado: true,
    });
  };

  const handleLimpar = () => {
    updateImportacao({
      textoOriginal: '',
      cabecalhoDetectado: null,
      itensDetectados: [],
      textosAltaTensao: [],
      textoAltaTensao: '',
      analisado: false,
    });
  };

  const preencherAtendimento = () => {
    if (!cabecalho) return;
    ['ns','cliente','municipio','tensaoKv','cargaAtual','demandaFutura','tipoAtendimento']
      .forEach(c => { if (cabecalho[c] !== '' && cabecalho[c] != null) updateField(c, cabecalho[c]); });
    alert('Dados preenchidos na aba Atendimento!');
  };

  const upd = (idx, campo, valor) =>
    updateImportacao({ itensDetectados: itens.map((it, i) => i === idx ? { ...it, [campo]: valor } : it) });

  const adicionar = (idx) => {
    const item = itens[idx];
    const tabItem = TABELA_CUSTOS.find(t => t.tipo === item.tipoSelecionado);
    const qtd = parseFloat(item.quantidade) || 0;
    const unitario = tabItem ? (getValorPorAno(tabItem, 2024, 'unitario') || 0) : 0;
    const valor = tabItem && qtd > 0 ? qtd * unitario * 1000 : 0;

    setOrcamento(prev => ({
      ...prev,
      itensObra: [...prev.itensObra, {
        id: Date.now(),
        descricao: tabItem ? tabItem.tipo : (item.descricaoManual || item.textoOriginal.slice(0, 200)),
        categoria: item.categoria,
        valor,
        percentualCemig: item.categoria === 'pp' ? parseFloat(item.percentualCemig) || 0 : 0,
        quantidade: qtd || null,
        unidade: tabItem ? tabItem.unidade : (item.unidade || ''),
        ...(tabItem ? { origem: 'biblioteca', itemOrigem: tabItem.id, valorUnitario: unitario * 1000 } : {}),
      }],
    }));
    updateImportacao({ itensDetectados: itens.filter((_, i) => i !== idx) });
  };

  const ignorar = (idx) => updateImportacao({ itensDetectados: itens.filter((_, i) => i !== idx) });

  const copiarParaDescricao = () => {
    if (!textoAltaTensao.trim()) return;
    setOrcamento(prev => ({
      ...prev,
      descricaoTecnica: prev.descricaoTecnica
        ? prev.descricaoTecnica + '\n\n' + textoAltaTensao.trim()
        : textoAltaTensao.trim(),
    }));
    alert('Texto adicionado à Descrição Técnica!');
  };

  return (
    <div style={{ maxWidth: '960px' }}>

      {/* ─── Passo 1 — Inserir texto ─────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.step}>Passo 1</div>
        <h2 style={S.title}>Inserir Texto</h2>

        <textarea
          value={texto}
          onChange={e => updateImportacao({ textoOriginal: e.target.value })}
          placeholder="Cole aqui o texto do despacho ou parecer técnico CEMIG..."
          style={{ ...S.input, height: '200px', resize: 'vertical', lineHeight: 1.6 }}
        />

        <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={S.btnVerde} onClick={handleAnalisar}
            onMouseEnter={e => e.currentTarget.style.background = '#007A3D'}
            onMouseLeave={e => e.currentTarget.style.background = '#00A859'}>
            Analisar Texto
          </button>
          <button style={S.btnCinza} onClick={() => fileRef.current.click()}>
            Carregar .txt
          </button>
          {texto && (
            <button onClick={handleLimpar}
              style={{ ...S.btnCinza, color: '#e74c3c', borderColor: '#FFCDD2' }}>
              Limpar
            </button>
          )}
          <input ref={fileRef} type="file" accept=".txt" style={{ display: 'none' }} onChange={handleArquivo} />
        </div>
      </div>

      {/* ─── Passo 2 — Dados detectados ──────────────────────────────────── */}
      {analisado && cabecalho && (
        <div style={S.card}>
          <div style={S.step}>Passo 2</div>
          <h2 style={S.title}>Dados do Cabeçalho Detectados</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              ['NS', cabecalho.ns],
              ['Cliente', cabecalho.cliente],
              ['Município', cabecalho.municipio],
              ['Tensão', cabecalho.tensaoKv ? `${cabecalho.tensaoKv} kV` : ''],
              ['Demanda Atual', cabecalho.cargaAtual ? `${cabecalho.cargaAtual} kW` : ''],
              ['Demanda Futura', cabecalho.demandaFutura ? `${cabecalho.demandaFutura} kW` : ''],
              ['Tipo de Atendimento', TIPO_LABELS[cabecalho.tipoAtendimento] || cabecalho.tipoAtendimento],
            ].map(([label, valor]) => (
              <div key={label} style={{ padding: '12px 14px', background: '#F9FFF9', borderRadius: '8px', border: '1px solid #D4ECD9' }}>
                <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', margin: '0 0 4px 0' }}>{label}</p>
                <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 600, color: valor ? '#222' : '#BBB', margin: 0, wordBreak: 'break-word' }}>
                  {valor || '—'}
                </p>
              </div>
            ))}
          </div>

          <button style={S.btnVerde} onClick={preencherAtendimento}
            onMouseEnter={e => e.currentTarget.style.background = '#007A3D'}
            onMouseLeave={e => e.currentTarget.style.background = '#00A859'}>
            Preencher Atendimento
          </button>
        </div>
      )}

      {/* ─── Obras de Alta Tensão / Responsabilidade CEMIG ───────────────── */}
      {analisado && textosAltaTensao.length > 0 && (
        <div style={S.card}>
          <h2 style={{ ...S.title, color: '#1565C0', borderBottomColor: '#E3F2FD' }}>
            Obras de Alta Tensão / Responsabilidade CEMIG
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {textosAltaTensao.map((txt, i) => (
              <div key={i} style={{ padding: '10px 14px', background: '#F0F7FF', border: '1px solid #BBDEFB', borderRadius: '8px' }}>
                <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '12px', color: '#444', margin: 0, lineHeight: 1.6, wordBreak: 'break-word' }}>
                  {txt}
                </p>
              </div>
            ))}
          </div>

          <label style={S.labelMuted}>Texto para a Descrição Técnica (editável)</label>
          <textarea
            value={textoAltaTensao}
            onChange={e => updateImportacao({ textoAltaTensao: e.target.value })}
            style={{ ...S.input, height: '120px', resize: 'vertical', lineHeight: 1.6, marginBottom: '14px' }}
          />

          <button style={{ ...S.btnVerde, background: '#1565C0' }} onClick={copiarParaDescricao}
            onMouseEnter={e => e.currentTarget.style.background = '#0D47A1'}
            onMouseLeave={e => e.currentTarget.style.background = '#1565C0'}>
            Copiar para Descrição Técnica
          </button>

          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #E3F2FD' }}>
            <label style={S.labelMuted}>Data de Conclusão Estimada das Obras Vinculadas</label>
            <input
              type="date"
              value={obrasVinculadas.dataConclusao}
              onChange={e => handleDataConclusaoChange(e.target.value)}
              style={{ ...S.input, maxWidth: '220px' }}
            />
            {obrasVinculadas.dataConclusao && obrasVinculadas.diasRestantes !== null && (
              <p style={{
                fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 700, margin: '10px 0 0 0',
                color: obrasVinculadas.diasRestantes < 0
                  ? '#e74c3c'
                  : obrasVinculadas.diasRestantes < 180
                    ? '#E67E22'
                    : '#00A859',
              }}>
                {obrasVinculadas.diasRestantes < 0
                  ? `Prazo já vencido (${obrasVinculadas.diasRestantes} dias)`
                  : `Faltam ${obrasVinculadas.diasRestantes} dias para a conclusão`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── Passo 3 — Itens detectados ──────────────────────────────────── */}
      {analisado && (
        <div style={S.card}>
          <div style={S.step}>Passo 3</div>
          <h2 style={S.title}>
            Itens Detectados
            {itens.length > 0 && (
              <span style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', fontWeight: 400, color: '#888', marginLeft: '10px', textTransform: 'none', letterSpacing: 0 }}>
                {itens.length} restante{itens.length !== 1 ? 's' : ''}
              </span>
            )}
          </h2>

          {itens.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '14px', color: '#00A859', fontWeight: 700, margin: '0 0 8px 0' }}>
                {analisado ? 'Todos os itens foram processados!' : 'Nenhum item detectado no bloco de obras.'}
              </p>
              <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '13px', color: '#888', margin: 0 }}>
                Acesse <strong>Itens de Obra</strong> para revisar os itens adicionados.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '880px' }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, minWidth: '200px' }}>Texto Original</th>
                    <th style={{ ...S.th, minWidth: '180px' }}>Item Biblioteca</th>
                    <th style={{ ...S.th, width: '72px' }}>Qtd</th>
                    <th style={{ ...S.th, width: '72px' }}>% CEMIG</th>
                    <th style={{ ...S.th, width: '110px' }}>Categoria</th>
                    <th style={{ ...S.th, width: '140px', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>

                      {/* Texto original */}
                      <td style={S.td}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#555', lineHeight: 1.5, wordBreak: 'break-word' }}>
                          {item.expandido ? item.textoOriginal : item.textoOriginal.slice(0, 120)}
                          {item.textoOriginal.length > 120 && (
                            <button onClick={() => upd(idx, 'expandido', !item.expandido)}
                              style={{ marginLeft: '4px', background: 'none', border: 'none', color: '#00A859', fontSize: '11px', cursor: 'pointer', fontWeight: 700, padding: 0 }}>
                              {item.expandido ? ' ▲ menos' : '... ▼ mais'}
                            </button>
                          )}
                        </p>
                      </td>

                      {/* Dropdown biblioteca */}
                      <td style={S.td}>
                        <select
                          value={item.tipoSelecionado}
                          onChange={e => upd(idx, 'tipoSelecionado', e.target.value)}
                          style={{ ...S.input, padding: '5px 8px', fontSize: '11px' }}>
                          <option value="">— sem correspondência —</option>
                          {TIPOS_BIBLIOTECA.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        {!item.tipoSelecionado && (
                          <input
                            type="text"
                            value={item.descricaoManual}
                            onChange={e => upd(idx, 'descricaoManual', e.target.value)}
                            placeholder="Descrição manual do item"
                            style={{ ...S.input, padding: '5px 8px', fontSize: '11px', marginTop: '6px' }}
                          />
                        )}
                      </td>

                      {/* Quantidade */}
                      <td style={S.td}>
                        <input
                          type="number"
                          value={item.quantidade}
                          onChange={e => upd(idx, 'quantidade', e.target.value)}
                          placeholder="—"
                          min="0" step="0.01"
                          style={{ ...S.input, padding: '5px 8px', fontSize: '12px', width: '62px' }}
                        />
                      </td>

                      {/* % CEMIG */}
                      <td style={S.td}>
                        <input
                          type="number"
                          value={item.percentualCemig}
                          onChange={e => upd(idx, 'percentualCemig', e.target.value)}
                          placeholder="—"
                          min="0" max="100"
                          style={{ ...S.input, padding: '5px 8px', fontSize: '12px', width: '60px' }}
                        />
                      </td>

                      {/* Categoria */}
                      <td style={S.td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <Badge cat={item.categoria} />
                          <select
                            value={item.categoria}
                            onChange={e => upd(idx, 'categoria', e.target.value)}
                            style={{ ...S.input, padding: '4px 6px', fontSize: '11px' }}>
                            <option value="ctc">ctc</option>
                            <option value="cti">cti</option>
                            <option value="pp">pp</option>
                            <option value="parcela_reg">parcela_reg</option>
                          </select>
                        </div>
                      </td>

                      {/* Ações */}
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button onClick={() => adicionar(idx)}
                            style={{ ...S.btnVerde, padding: '6px 14px', fontSize: '12px' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#007A3D'}
                            onMouseLeave={e => e.currentTarget.style.background = '#00A859'}>
                            Adicionar
                          </button>
                          <button onClick={() => ignorar(idx)}
                            style={{ ...S.btnCinza, padding: '6px 10px', fontSize: '12px' }}>
                            Ignorar
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
