/* ─────────────────────────────────────────────────────────────────────────────
   titular.js — POST /api/titular/solicitacoes

   Registra uma solicitação de direito do titular (LGPD): acesso, correção,
   exclusão ou portabilidade (R11.4). A lógica de domínio (validação, cálculo do
   prazo de 15 dias corridos e transições de estado) vive em
   `src/lgpd/direitosTitular.js`; este handler faz a borda HTTP e a persistência.

   Injeção de dependência (DI):
   - `deps.persistenciaTitular` expõe `registrar(solicitacao)` para gravar a
     solicitação. Quando ausente, o handler ainda registra a solicitação em
     memória e a devolve (o esqueleto permanece funcional e testável sem Azure).
   - RBAC (`titular:registrar`, papel `editor`) já é aplicado pelo roteador antes
     do handler; aqui tratamos apenas do recurso de negócio.
   ───────────────────────────────────────────────────────────────────────────── */

import { json, erro } from '../http.js';
import { registrarSolicitacao, ERRO } from '../../lgpd/direitosTitular.js';

/** Mapeia códigos de erro de domínio para status HTTP. */
const STATUS_POR_ERRO = {
  [ERRO.TIPO_INVALIDO]: 400,
  [ERRO.TITULAR_INVALIDO]: 400,
};

/**
 * POST /api/titular/solicitacoes — registra solicitação de direito do titular (R11.4).
 *
 * Corpo esperado: `{ tipo, titularRef }`.
 *   - tipo: 'acesso' | 'correcao' | 'exclusao' | 'portabilidade'
 *   - titularRef: referência NÃO reidentificável do titular.
 *
 * @param {import('../http.js').RequisicaoApi} req
 * @param {Object} [deps]
 * @param {{ registrar?: (s: object) => Promise<object>|object }} [deps.persistenciaTitular]
 * @returns {Promise<import('../http.js').RespostaApi>}
 */
export async function registrarSolicitacaoTitular(req, deps = {}) {
  const corpo = req?.corpo;
  if (!corpo || typeof corpo !== 'object') {
    return erro(400, 'corpo_invalido', 'Corpo da requisição ausente ou inválido.');
  }

  const resultado = registrarSolicitacao({
    tipo: corpo.tipo,
    titularRef: corpo.titularRef,
  });

  if (!resultado.ok) {
    const status = STATUS_POR_ERRO[resultado.codigo] ?? 400;
    return erro(status, resultado.codigo, resultado.mensagem);
  }

  const solicitacao = resultado.valor;

  // Persistência opcional via DI. Falha de gravação não deve produzir estado
  // parcial: devolvemos erro estruturado preservando a semântica do stub quando
  // a dependência não estiver presente.
  const persistencia = deps.persistenciaTitular;
  if (persistencia && typeof persistencia.registrar === 'function') {
    try {
      const persistido = await persistencia.registrar(solicitacao);
      if (persistido && persistido.ok === false) {
        return erro(
          502,
          persistido.codigo || 'falha_persistencia',
          persistido.mensagem || 'Falha ao registrar a solicitação.',
        );
      }
      const valor = persistido && persistido.valor ? persistido.valor : solicitacao;
      return json(201, valor);
    } catch (e) {
      return erro(502, 'falha_persistencia', 'Falha ao registrar a solicitação do titular.');
    }
  }

  return json(201, solicitacao);
}
