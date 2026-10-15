/* ─────────────────────────────────────────────────────────────────────────────
   orcamentos.js — handlers das rotas de orçamento

   Cada handler recebe `(req, deps)`. Quando o bootstrap (`src/api/app.js`) injeta
   `deps.persistencia` (cliente Cosmos — tarefa 8.2), os handlers executam a
   leitura/gravação/remoção reais, aplicando a atomicidade e a preservação do
   estado anterior já garantidas por `src/api/persistencia/cosmos.js` (R5.4).

   Compatibilidade/esqueleto: quando `deps.persistencia` NÃO é fornecido (ex.:
   `criarRoteador()` sem ganchos), os handlers preservam o comportamento de
   esqueleto e devolvem 501 — mantendo estável o contrato de borda e os testes do
   esqueleto (apiEsqueleto.test.js).
   ───────────────────────────────────────────────────────────────────────────── */

import { json, erro, naoImplementado } from '../http.js';

/** Mapeia códigos de erro do cliente de persistência para status HTTP. */
const STATUS_POR_ERRO = {
  NAO_ENCONTRADO: 404,
  ID_INVALIDO: 400,
  AMBIENTE_INVALIDO: 500,
  CONTAINER_INVALIDO: 500,
  FALHA_GRAVACAO: 502,
  FALHA_LEITURA: 502,
  FALHA_REMOCAO: 502,
};

/** Converte um resultado de erro do cliente de persistência em RespostaApi. */
const erroPersistencia = (r) =>
  erro(STATUS_POR_ERRO[r.codigo] ?? 502, r.codigo || 'falha_persistencia', r.mensagem || 'Falha na persistência.');

/** GET /api/orcamentos — lista orçamentos do escopo (R2). */
export async function listarOrcamentos(req, deps = {}) {
  const persistencia = deps.persistencia;
  if (!persistencia || typeof persistencia.listar !== 'function') {
    return naoImplementado('GET /api/orcamentos');
  }
  const r = await persistencia.listar({ proprietarioOid: req?.sessao?.oid ?? null });
  if (r && r.ok === false) return erroPersistencia(r);
  return json(200, r && 'valor' in r ? r.valor : r);
}

/** GET /api/orcamentos/{id} — recupera um orçamento (R5). */
export async function obterOrcamento(req, deps = {}) {
  const persistencia = deps.persistencia;
  if (!persistencia || typeof persistencia.obter !== 'function') {
    return naoImplementado('GET /api/orcamentos/{id}');
  }
  const id = req?.params?.id;
  const r = await persistencia.obter(id);
  if (r && r.ok === false) return erroPersistencia(r);
  return json(200, r && 'valor' in r ? r.valor : r);
}

/** PUT /api/orcamentos/{id} — cria/atualiza com gravação atômica (R5.4). */
export async function gravarOrcamento(req, deps = {}) {
  const persistencia = deps.persistencia;
  if (!persistencia || typeof persistencia.gravar !== 'function') {
    return naoImplementado('PUT /api/orcamentos/{id}');
  }
  const id = req?.params?.id;
  const corpo = req?.corpo;
  if (!corpo || typeof corpo !== 'object') {
    return erro(400, 'corpo_invalido', 'Corpo da requisição ausente ou inválido.');
  }
  // Aceita tanto o estado cru quanto o documento envelopado; o cliente de
  // persistência envelopa/preserva metadados a partir do `meta`.
  const orcamento = corpo.dados && typeof corpo.dados === 'object' ? corpo.dados : corpo;
  const meta = {
    id,
    proprietarioOid: req?.sessao?.oid ?? corpo.proprietarioOid ?? null,
    classificacao: corpo.classificacao,
    criadoEm: corpo.criadoEm,
  };
  const r = await persistencia.gravar(orcamento, meta);
  if (r && r.ok === false) return erroPersistencia(r);
  const valor = r && 'valor' in r ? r.valor : r;
  const criado = valor && valor.criado === true;
  return json(criado ? 201 : 200, valor && valor.documento ? valor.documento : valor);
}

/** DELETE /api/orcamentos/{id} — remove orçamento (R2). */
export async function removerOrcamento(req, deps = {}) {
  const persistencia = deps.persistencia;
  if (!persistencia || typeof persistencia.remover !== 'function') {
    return naoImplementado('DELETE /api/orcamentos/{id}');
  }
  const id = req?.params?.id;
  const r = await persistencia.remover(id);
  if (r && r.ok === false) return erroPersistencia(r);
  return json(200, r && 'valor' in r ? r.valor : r);
}
