import { tipoParaId } from './regrasImportacao';

/* ─────────────────────────────────────────────────────────────────────────────
   migracao.js — converte orçamentos salvos em formatos antigos no localStorage
   ───────────────────────────────────────────────────────────────────────────── */

// A1: itens detectados guardavam o `tipo` da biblioteca; agora guardam o `id`.
const migrarImportacao = (importacao) => {
  if (!importacao || !Array.isArray(importacao.itensDetectados)) return importacao;
  return {
    ...importacao,
    itensDetectados: importacao.itensDetectados.map(it => ({
      ...it,
      tipoSelecionado: tipoParaId(it.tipoSelecionado, it.textoOriginal),
    })),
  };
};

export const migrarOrcamento = (salvo) => {
  const o = { ...salvo };
  if (o.importacao) o.importacao = migrarImportacao(o.importacao);
  return o;
};
