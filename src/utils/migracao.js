import { tipoParaId } from './regrasImportacao';
import { normalizarTipoAtendimento } from './tipoAtendimento';
import { normalizarDataISO } from './datas';
import { normalizarChaveReferencia } from '../data/biblioteca';

/* ─────────────────────────────────────────────────────────────────────────────
   migracao.js — converte orçamentos salvos em formatos antigos no localStorage
   ───────────────────────────────────────────────────────────────────────────── */

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
