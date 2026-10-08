import React, { useRef } from 'react';
import { getItemById, getValorPorAno } from '../data/tabelaCustos';
import { normalizarTipoAtendimento, rotuloTipoAtendimento, OBS_GERACAO_DISTRIBUIDA } from '../utils/tipoAtendimento';
import { RETIRADA_IDS, OPCOES_BIBLIOTECA, matchRegras } from '../utils/regrasImportacao';
import { kmParaPostes, postesParaKm } from '../utils/postes';

export { OPCOES_BIBLIOTECA };

const CAT_META = {
  ctc:         { label: 'CTC', bg: '#FFFBE6', color: '#8B6D00', bd: '#FFE57A' },
  cti:         { label: 'CTI', bg: '#E8F7EE', color: '#007A3D', bd: '#B8E6CC' },
  pp:          { label: 'PP',  bg: '#E8F5E9', color: '#2E7D32', bd: '#A5D6A7' },
  parcela_reg: { label: 'REG', bg: '#F3E5F5', color: '#6A1B9A', bd: '#CE93D8' },
};

// Itens de alta tensão / obras vinculadas — não entram na tabela de validação
const ALTA_TENSAO_RE = /138\s*kv|\bdli\b|ld\s*b\s*despacho|linha.*138|casa\s+de\s+controle|obras\s+de\s+alta\s+tens[ãa]o|conclus[ãa]o\s+estimada/i;

// Marcadores que encerram o bloco de obras — o texto a partir do primeiro que
// aparecer (o mais próximo do início do bloco) é descartado. Ponto de extensão:
// adicione aqui novos regex conforme surgirem variações nos textos da Cemig.
const MARCADORES_FIM_BLOCO = [
  /Custo\s+Estimado/i,
  /Observa[çc][õo]es/i,
  /Recomenda[çc][õo]es/i,
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function encontrarFimBloco(bloco) {
  let fimIndex = -1;
  for (const re of MARCADORES_FIM_BLOCO) {
    const m = bloco.match(re);
    if (m && (fimIndex === -1 || m.index < fimIndex)) fimIndex = m.index;
  }
  return fimIndex;
}

// Número no formato brasileiro: "1.200", "1.200,5", "112,5", "1500".
// Ponto seguido de exatamente 3 dígitos é milhar; ponto com outra quantidade de
// dígitos ("11.33") é tratado como decimal, para manter textos já existentes.
const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?(?!\d)|\d+(?:[.,]\d+)?`;

export function lerNumeroBR(texto) {
  const t = String(texto ?? '').trim();
  if (!/^\d[\d.,]*$/.test(t)) return NaN;
  if (t.includes(',')) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return parseFloat(t.replace(/\./g, ''));
  return parseFloat(t);
}

export function extrairQuantidade(texto) {
  const qtd = (sufixo) => texto.match(new RegExp(`(${NUM})\\s*${sufixo}`, 'i'));
  const kmM = qtd('km');
  if (kmM) return { quantidade: lerNumeroBR(kmM[1]), unidade: 'km' };
  for (const sufixo of ['banco', 'pe[çc]as?', 'conj', 'ponto']) {
    const m = qtd(sufixo);
    if (m) return { quantidade: lerNumeroBR(m[1]), unidade: 'ponto' };
  }
  return { quantidade: '', unidade: '' };
}

// ── Proporcionalidade ─────────────────────────────────────────────────────────
export const AVISO_PROPORCIONALIDADE = 'Confira o % da proporcionalidade';

const DONO_CLIENTE_RE = /cliente|interessado|consumidor/gi;
const DONO_CEMIG_RE = /cemig/gi;

// Palavra de dono mais próxima de um percentual: procura no trecho antes (até o
// % anterior) e no trecho depois (até o próximo %), e fica com a mais próxima.
function donoDoPercentual(antes, depois) {
  let melhor = null;
  const considerar = (dono, distancia) => {
    if (melhor === null || distancia < melhor.distancia) melhor = { dono, distancia };
  };
  for (const [dono, re] of [['cliente', DONO_CLIENTE_RE], ['cemig', DONO_CEMIG_RE]]) {
    for (const m of antes.matchAll(re)) considerar(dono, antes.length - (m.index + m[0].length));
    const m = depois.match(new RegExp(re.source, 'i'));
    if (m) considerar(dono, m.index);
  }
  return melhor?.dono || null;
}

// Lê o % da Cemig a partir do trecho "Proporcionalidade ...".
// Retorna null quando não há proporcionalidade com percentual no texto.
export function lerProporcionalidade(texto) {
  const inicio = texto.search(/Proporcionalidade/i);
  if (inicio === -1) return null;
  let trecho = texto.slice(inicio + 'Proporcionalidade'.length);
  const fim = trecho.search(/\.(\s|$)/);
  if (fim !== -1) trecho = trecho.slice(0, fim);

  const percentuais = [...trecho.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)];
  if (percentuais.length === 0) return null;

  let cliente = null;
  let cemig = null;
  percentuais.forEach((m, i) => {
    const iniAntes = i === 0 ? 0 : percentuais[i - 1].index + percentuais[i - 1][0].length;
    const fimDepois = i + 1 < percentuais.length ? percentuais[i + 1].index : trecho.length;
    const antes = trecho.slice(iniAntes, m.index);
    const depois = trecho.slice(m.index + m[0].length, fimDepois);
    const valor = lerNumeroBR(m[1]);
    const dono = donoDoPercentual(antes, depois);
    if (dono === 'cliente' && cliente === null) cliente = valor;
    if (dono === 'cemig' && cemig === null) cemig = valor;
  });

  if (cliente !== null && cemig !== null) {
    return { percentualCemig: cemig, aviso: Math.abs(cliente + cemig - 100) > 0.001 };
  }
  if (cemig !== null) return { percentualCemig: cemig, aviso: false };
  if (cliente !== null) return { percentualCemig: 100 - cliente, aviso: false };

  // Sem dono identificado: mantém o comportamento antigo (% do cliente), com aviso
  return { percentualCemig: 100 - lerNumeroBR(percentuais[0][1]), aviso: true };
}

// ── Análise do texto ─────────────────────────────────────────────────────────
export function analisarTexto(texto) {
  const cab = {
    ns: '', cliente: '', municipio: '', tensaoKv: '',
    cargaAtual: '', demandaFutura: '', tipoAtendimento: '', dataEstudo: '',
  };

  const m = re => texto.match(re);

  const nsM = m(/NS:\s*(\d+)/i);
  if (nsM) cab.ns = nsM[1].trim();

  const cliM = m(/Cliente:\s*(.+)/i);
  if (cliM) cab.cliente = cliM[1].trim();

  const muniM = m(/Munic[ií]pio:\s*(.+)/i);
  if (muniM) cab.municipio = muniM[1].trim();

  const tensM = m(/Tensão:\s*([\d,\.]+)\s*kV/i);
  if (tensM) cab.tensaoKv = tensM[1].replace(',', '.');

  const dataEstudoM = m(/Data\s+do\s+estudo:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (dataEstudoM) cab.dataEstudo = dataEstudoM[1];

  const paraM = m(new RegExp(`(${NUM})\\s*kW.*para\\s+(${NUM})\\s*kW`, 'i'));
  if (paraM) {
    const antes = lerNumeroBR(paraM[1]);
    const depois = lerNumeroBR(paraM[2]);
    cab.demandaFutura = depois;
    if (antes === 0) {
      cab.tipoAtendimento = 'LN';
      cab.cargaAtual = 0;
    } else {
      cab.tipoAtendimento = 'AC';
      cab.cargaAtual = antes;
    }
  } else {
    const kwM = m(new RegExp(`(${NUM})\\s*kW`, 'i'));
    if (kwM) {
      cab.demandaFutura = lerNumeroBR(kwM[1]);
      cab.tipoAtendimento = 'LN';
    }
  }

  // Geração distribuída não é tipo de atendimento: mantém LN/AC conforme a
  // demanda e acrescenta uma frase nas Observações ao preencher o Atendimento.
  cab.geracaoDistribuida = /gerador|solar|gera[çc][ãa]o\s+distribu[íi]da/i.test(texto);

  // Extrai bloco de obras
  let bloco = texto;
  const inicioM = bloco.match(/Obras\s+de\s+M[eé]dia\s+Tens[ãa]o/i);
  if (inicioM) bloco = bloco.slice(inicioM.index);
  const fimIndex = encontrarFimBloco(bloco);
  if (fimIndex !== -1) bloco = bloco.slice(0, fimIndex);

  const linhas = bloco.split(/\r?\n/);
  let secao = null;
  const rawItens = [];
  let cur = null;

  for (const linha of linhas) {
    const l = linha.trim();
    if (!l) continue;
    const ll = l.toLowerCase();

    if (
      ll.includes('obras com custo de responsabilidade da cemig') ||
      ll.includes('obras de responsabilidade da cemig - condição técnica') ||
      ll.includes('obras de responsabilidade da cemig - condicao tecnica') ||
      ll.includes('obras de alta tensão') ||
      ll.includes('obras de alta tensao')
    ) {
      if (cur) rawItens.push(cur);
      secao = 'cemig'; cur = null; continue;
    }
    if (
      ll.includes('obras de responsabilidade do interessado') ||
      ll.includes('obras de responsabilidade do cliente')
    ) {
      if (cur) rawItens.push(cur);
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

  // Separa itens de alta tensão / obras vinculadas dos demais
  const textosAltaTensao = rawItens
    .filter(raw => ALTA_TENSAO_RE.test(raw.texto))
    .map(raw => raw.texto);

  const itens = [];
  rawItens
    .filter(raw => !ALTA_TENSAO_RE.test(raw.texto))
    .forEach(raw => {
      const t = raw.texto;

      // Categoria — apenas as regras definidas (RN-Importação)
      let categoria;
      let percentualCemig = 0;
      let avisoProporcionalidade = false;
      if (raw.secao === 'cemig') {
        categoria = 'ctc';
      } else {
        const prop = lerProporcionalidade(t);
        if (prop) {
          categoria = 'pp';
          percentualCemig = prop.percentualCemig;
          avisoProporcionalidade = prop.aviso;
        } else {
          categoria = 'parcela_reg';
        }
      }

      const { quantidade, unidade } = extrairQuantidade(t);
      const quantidadeKmOriginal = unidade === 'km' ? quantidade : null;
      const specsMatch = matchRegras(t);

      // Camada de segurança: uma linha só vira item candidato se bater em alguma
      // regra de mapeamento OU tiver uma quantidade extraível. Frases de observação
      // livre (ex: notas gerais dentro do próprio bloco de obras) não têm nenhum dos
      // dois sinais e não devem poluir a lista de itens detectados.
      if (!specsMatch && unidade === '') return;

      const specs = specsMatch || [{ id: '' }];

      specs.forEach(spec => {
        const tabItem = spec.id ? getItemById(spec.id) : null;
        const converterParaPoste = quantidadeKmOriginal != null && tabItem?.unidade === 'poste';

        itens.push({
          textoOriginal: t,
          tipoSelecionado: spec.id || '',
          descricaoManual: t.slice(0, 200),
          quantidade: converterParaPoste ? kmParaPostes(quantidadeKmOriginal) : quantidade,
          unidade: converterParaPoste ? 'poste' : unidade,
          quantidadeKmOriginal,
          categoria,
          percentualCemig,
          avisoProporcionalidade,
          expandido: false,
          retiradaPendente: !!spec.retiradaPendente,
        });
      });
    });

  // Obras vinculadas / alta tensão — gravadas no orçamento só ao "Preencher Atendimento"
  cab.temObrasVinculadas = textosAltaTensao.length > 0;
  const conclusaoM = texto.match(/Conclus[ãa]o estimada:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  cab.dataObrasVinculadas = conclusaoM ? `${conclusaoM[3]}-${conclusaoM[2]}-${conclusaoM[1]}` : '';

  return { cab, itens, textosAltaTensao };
}

// ── Cabeçalho detectado → dados do Atendimento ("Preencher Atendimento") ──────
const CAMPOS_CABECALHO = ['ns', 'cliente', 'municipio', 'tensaoKv', 'cargaAtual', 'demandaFutura', 'tipoAtendimento', 'dataEstudo'];

export function aplicarCabecalho(prev, cab) {
  const novo = { ...prev };
  CAMPOS_CABECALHO.forEach(c => { if (cab[c] !== '' && cab[c] != null) novo[c] = cab[c]; });
  if (novo.tipoAtendimento) novo.tipoAtendimento = normalizarTipoAtendimento(novo.tipoAtendimento);

  // Obras vinculadas: marca e preenche a data; nunca desmarca o que foi marcado no Rateio
  if (cab.temObrasVinculadas) novo.temObrasVinculadas = true;
  if (cab.dataObrasVinculadas) novo.dataObrasVinculadas = cab.dataObrasVinculadas;

  if (cab.geracaoDistribuida) {
    const obs = (prev.observacoes || '').trim();
    if (!obs.includes(OBS_GERACAO_DISTRIBUIDA)) {
      novo.observacoes = obs ? `${obs}\n${OBS_GERACAO_DISTRIBUIDA}` : OBS_GERACAO_DISTRIBUIDA;
    }
  }
  return novo;
}

// ── Item detectado → item de obra ─────────────────────────────────────────────
export function criarItemObraImportado(item, id) {
  const tabItem = item.tipoSelecionado ? getItemById(item.tipoSelecionado) : null;
  const qtd = parseFloat(item.quantidade) || 0;
  const unitario = tabItem ? (getValorPorAno(tabItem, 2024, 'unitario') || 0) : 0;
  const valor = tabItem && qtd > 0 ? qtd * unitario * 1000 : 0;

  return {
    id,
    descricao: tabItem ? tabItem.tipo : (item.descricaoManual || item.textoOriginal.slice(0, 200)),
    categoria: item.categoria,
    valor,
    percentualCemig: item.categoria === 'pp' ? parseFloat(item.percentualCemig) || 0 : 0,
    quantidade: qtd || null,
    unidade: tabItem ? tabItem.unidade : (item.unidade || ''),
    ...(tabItem ? { origem: 'biblioteca', itemOrigem: tabItem.id, valorUnitario: unitario * 1000, anoReferencia: 2024 } : {}),
  };
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

function BadgeRetiradaPendente() {
  return (
    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, fontFamily: "'Open Sans',sans-serif", background: '#FFF8E1', color: '#8B6D00', border: '1px solid #FFE082', whiteSpace: 'nowrap' }}>
      ⚠️ Retirada pendente
    </span>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function Importacao({ setOrcamento, importacao, updateImportacao }) {
  const fileRef = useRef(null);

  const {
    textoOriginal: texto,
    cabecalhoDetectado: cabecalho,
    itensDetectados: itens,
    textosAltaTensao,
    textoAltaTensao,
    analisado,
  } = importacao;

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
    setOrcamento(prev => aplicarCabecalho(prev, cabecalho));
    alert('Dados preenchidos na aba Atendimento!');
  };

  const upd = (idx, campo, valor) =>
    updateImportacao({
      itensDetectados: itens.map((it, i) => {
        if (i !== idx) return it;
        if (campo === 'tipoSelecionado' && it.quantidadeKmOriginal != null) {
          // Reaplica a conversão km → postes a partir do km bruto extraído do texto,
          // evitando erro de arredondamento acumulado ao trocar o item da biblioteca.
          const tabItem = getItemById(valor);
          return tabItem?.unidade === 'poste'
            ? { ...it, tipoSelecionado: valor, quantidade: kmParaPostes(it.quantidadeKmOriginal), unidade: 'poste' }
            : { ...it, tipoSelecionado: valor, quantidade: it.quantidadeKmOriginal, unidade: 'km' };
        }
        // % editado pelo usuário: o aviso de conferência deixa de valer
        if (campo === 'percentualCemig') return { ...it, percentualCemig: valor, avisoProporcionalidade: false };
        return { ...it, [campo]: valor };
      }),
    });

  const adicionar = (idx) => {
    const novo = criarItemObraImportado(itens[idx], Date.now());
    setOrcamento(prev => ({ ...prev, itensObra: [...prev.itensObra, novo] }));
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
              ['Demanda Atual', cabecalho.cargaAtual || cabecalho.cargaAtual === 0 ? `${cabecalho.cargaAtual} kW` : ''],
              ['Demanda Futura', cabecalho.demandaFutura ? `${cabecalho.demandaFutura} kW` : ''],
              ['Tipo de Atendimento', rotuloTipoAtendimento(cabecalho.tipoAtendimento)],
              ...(cabecalho.geracaoDistribuida ? [['Geração Distribuída', 'Sim — será anotada nas Observações']] : []),
              ['Data do Estudo', cabecalho.dataEstudo],
              ...(cabecalho.temObrasVinculadas ? [['Obras Vinculadas', cabecalho.dataObrasVinculadas
                ? `Sim — conclusão ${cabecalho.dataObrasVinculadas.split('-').reverse().join('/')}`
                : 'Sim — sem data de conclusão']] : []),
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

      {/* ─── Obras Vinculadas / Alta Tensão ──────────────────────────────── */}
      {analisado && textosAltaTensao.length > 0 && (
        <div style={S.card}>
          <h2 style={{ ...S.title, color: '#1565C0', borderBottomColor: '#E3F2FD' }}>
            Obras Vinculadas / Alta Tensão
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
                          <option value="">— {item.retiradaPendente ? 'selecione a retirada' : 'sem correspondência'} —</option>
                          {(item.retiradaPendente
                            ? RETIRADA_IDS.map(id => ({ id, label: getItemById(id).tipo }))
                            : OPCOES_BIBLIOTECA
                          ).map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </select>
                        {!item.tipoSelecionado && !item.retiradaPendente && (
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
                        {item.unidade === 'poste' && item.quantidade !== '' && item.quantidade != null && (
                          <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '10px', color: '#00A859', margin: '4px 0 0 0' }}>
                            ≈ {postesParaKm(item.quantidade).toFixed(2)} km
                          </p>
                        )}
                      </td>

                      {/* % CEMIG */}
                      <td style={S.td}>
                        <input
                          type="number"
                          value={item.percentualCemig}
                          onChange={e => upd(idx, 'percentualCemig', e.target.value)}
                          placeholder="—"
                          min="0" max="100"
                          style={{ ...S.input, padding: '5px 8px', fontSize: '12px', width: '60px',
                            ...(item.avisoProporcionalidade ? { borderColor: '#E6BC00', background: '#FFFBE6' } : {}) }}
                        />
                        {item.avisoProporcionalidade && (
                          <p style={{ fontFamily: "'Open Sans',sans-serif", fontSize: '10px', fontWeight: 700, color: '#8B6D00', margin: '4px 0 0 0' }}>
                            ⚠️ {AVISO_PROPORCIONALIDADE}
                          </p>
                        )}
                      </td>

                      {/* Categoria */}
                      <td style={S.td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <Badge cat={item.categoria} />
                          {item.retiradaPendente && <BadgeRetiradaPendente />}
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
                            disabled={item.retiradaPendente && !item.tipoSelecionado}
                            style={{
                              ...S.btnVerde, padding: '6px 14px', fontSize: '12px',
                              ...(item.retiradaPendente && !item.tipoSelecionado
                                ? { background: '#CCC', cursor: 'not-allowed' }
                                : {}),
                            }}
                            onMouseEnter={e => { if (!(item.retiradaPendente && !item.tipoSelecionado)) e.currentTarget.style.background = '#007A3D'; }}
                            onMouseLeave={e => { if (!(item.retiradaPendente && !item.tipoSelecionado)) e.currentTarget.style.background = '#00A859'; }}>
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
