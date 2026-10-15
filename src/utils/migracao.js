import { tipoParaId } from './regrasImportacao';
import { normalizarTipoAtendimento } from './tipoAtendimento';
import { normalizarDataISO } from './datas';
import { normalizarChaveReferencia } from '../data/biblioteca';

/* ─────────────────────────────────────────────────────────────────────────────
   migracao.js — converte orçamentos salvos em formatos antigos no localStorage
   ───────────────────────────────────────────────────────────────────────────── */

// Versão atual do schema de dados do orçamento. É incrementada sempre que
// `migrarOrcamento` ganha uma nova etapa de conversão de formato antigo.
// Etapas acumuladas até aqui: A1/A3 (importação), A6 (obrasVinculadas),
// Etapa 4 (anoReferencia), R4 (materiaisAuxiliares) e A9 (datas/tipoAtendimento).
// Este número é a fonte única de `versaoSchema` do documento persistido
// (ver src/persistencia/modelo.js), garantindo que a migração existente e o
// envelope corporativo compartilhem a mesma noção de versão.
export const VERSAO_SCHEMA = 3;

// A1: itens detectados guardavam o `tipo` da biblioteca; agora guardam o `id`.
// A3: tipo de atendimento gravado por extenso ("Ligação Nova") → código (LN).
const migrarImportacao = (importacao) => {
  if (!importacao) return importacao;
  const novo = { ...importacao };
  if (Array.isArray(novo.itensDetectados)) {
    novo.itensDetectados = novo.itensDetectados.map(it => ({
      ...it,
      tipoSelecionado: tipoParaId(it.tipoSelecionado, it.textoOriginal),
    }));
  }
  if (novo.cabecalhoDetectado?.tipoAtendimento) {
    novo.cabecalhoDetectado = {
      ...novo.cabecalhoDetectado,
      tipoAtendimento: normalizarTipoAtendimento(novo.cabecalhoDetectado.tipoAtendimento),
    };
  }
  return novo;
};

export const migrarOrcamento = (salvo) => {
  const o = { ...salvo };
  if (o.importacao) o.importacao = migrarImportacao(o.importacao);
  // A6: obras vinculadas tinham dois estados; fica só o da raiz.
  if ('obrasVinculadas' in o) {
    if (o.obrasVinculadas?.temObrasVinculadas && !o.temObrasVinculadas) o.temObrasVinculadas = true;
    delete o.obrasVinculadas;
  }
  // Etapa 4: a referência de custos dos itens virou texto ('2024'), porque as
  // referências novas têm chave como '2026-10'. Orçamentos antigos gravaram o
  // ano como número.
  if (Array.isArray(o.itensObra)) {
    o.itensObra = o.itensObra.map(item => (
      item && item.anoReferencia !== undefined && item.anoReferencia !== null && item.anoReferencia !== ''
        ? { ...item, anoReferencia: normalizarChaveReferencia(item.anoReferencia) }
        : item
    ));
  }

  // R4: a aba Materiais Auxiliares foi removida; o campo é descartado
  delete o.materiaisAuxiliares;

  // A9: datas gravadas como ISO completo (Date) → AAAA-MM-DD
  if ('dataBase' in o) o.dataBase = normalizarDataISO(o.dataBase);
  if ('dataValidade' in o) o.dataValidade = normalizarDataISO(o.dataValidade);
  if (o.tipoAtendimento) o.tipoAtendimento = normalizarTipoAtendimento(o.tipoAtendimento);
  return o;
};
