/* ─────────────────────────────────────────────────────────────────────────────
   autorizacao.js — negação por padrão nas rotas (R1.6, R2.2, R2.3, R2.4)

   Gancho `deps.autorizar` do roteador (`src/api/roteador.js`). Dada a rota do
   CONTRATO (que nomeia a `permissao` RBAC exigida) e a sessão autenticada (com
   grupos/permissões concedidas por `autorizarSessao` — tarefa 5.6), decide se a
   operação é concedida ou negada.

   Regra central (Negação por padrão — R2.3): a operação só é concedida quando a
   permissão explicitamente exigida pela rota está na UNIÃO das permissões da
   sessão. Em qualquer outro caso, nega. O handler NÃO é invocado em caso de
   negação (o roteador só despacha o handler após `autorizar` retornar sem
   lançar), de modo que o estado dos dados permanece inalterado (R2.2).

   Diferenciação das negações (design — "Fluxo de autenticação" / "Error Handling"):

     - R1.6  Usuário autenticado SEM autorização à aplicação → recusa.
             Modelado como ausência de sessão (ou sessão sem identidade) numa
             rota protegida: nenhuma sessão foi estabelecida para a aplicação.
             Responde 403 e registra (oid se houver, data/hora).

     - R2.4  Sessão autenticada SEM papel mapeável → 403 "sem permissões".
             A sessão existe, mas nenhum grupo do Entra ID mapeou para um
             Papel_Aplicacao (não há papéis). Registra (oid, data/hora).

     - R2.2  Papel existe mas NÃO possui a permissão da operação → 403
             "acesso negado". Estado inalterado. Registra (oid, operação,
             data/hora).

   Logs: emitidos via logger estruturado injetável (`src/observabilidade/logger.js`),
   que aplica mascaramento (R10 / Property 7) sobre o contexto antes de gravar.
   O carimbo de data/hora é o próprio `timestamp` da entrada de log (UTC, ISO
   8601). O identificador do usuário é o `oid` do token (claim).

   Projetado para a Property 4: "para qualquer par (papel, operação) em que a
   operação não esteja explicitamente nas permissões do papel — incluindo o caso
   de sessão sem nenhum papel mapeável —, a operação é negada e o estado dos
   dados permanece inalterado". O property test em si é a tarefa 5.9.
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Códigos de decisão/negação padronizados deste módulo.
 * @readonly
 */
export const AUTORIZACAO = Object.freeze({
  CONCEDIDO: 'CONCEDIDO',
  SEM_AUTORIZACAO_APP: 'sem_autorizacao', // R1.6
  SEM_PERMISSOES: 'sem_permissoes', // R2.4
  ACESSO_NEGADO: 'acesso_negado', // R2.2
  CONTRATO_INVALIDO: 'contrato_invalido', // R2.3 (rota sem permissão explícita)
});

/**
 * Resposta de negação no formato `RespostaApi` reconhecido pelo roteador
 * (objeto com `status` numérico e `corpo`). Lançável a partir do gancho
 * `autorizar`; o `catch` do roteador a devolve intacta.
 *
 * @param {string} codigo    Código de erro padronizado (ver AUTORIZACAO).
 * @param {string} mensagem  Mensagem legível para o usuário.
 * @returns {{ status: 403, headers: Object<string,string>, corpo: object }}
 */
function negar403(codigo, mensagem) {
  return {
    status: 403,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    corpo: { erro: codigo, mensagem },
  };
}

/**
 * Extrai a lista de permissões concedidas à sessão, tolerante ao formato.
 * A sessão transporta `permissoes` (união calculada por `autorizarSessao`).
 * @param {object|null|undefined} sessao
 * @returns {string[]}
 */
function permissoesDaSessao(sessao) {
  const perms = sessao?.permissoes;
  return Array.isArray(perms) ? perms : [];
}

/**
 * Extrai a lista de papéis mapeados da sessão, tolerante ao formato.
 * @param {object|null|undefined} sessao
 * @returns {string[]}
 */
function papeisDaSessao(sessao) {
  const papeis = sessao?.papeis;
  return Array.isArray(papeis) ? papeis : [];
}

/**
 * Decide a autorização de uma requisição contra a rota do contrato, sem efeitos
 * colaterais (função pura de decisão). Separada de `criarAutorizador` para ser
 * testável isoladamente e reutilizável pela Property 4.
 *
 * @param {{ permissao?: string|null, metodo?: string, caminho?: string }} rota
 *   Rota do CONTRATO; `permissao` nomeia a permissão RBAC exigida.
 * @param {{ permissoes?: string[], papeis?: string[], oid?: string }|null} sessao
 *   Sessão autenticada com a união de permissões/papéis, ou null/ausente.
 * @returns {{
 *   concedido: boolean,
 *   codigo: string,
 *   permissaoExigida: string|null,
 * }}
 */
export function decidirAutorizacao(rota, sessao) {
  const permissaoExigida =
    rota && typeof rota.permissao === 'string' && rota.permissao.length > 0
      ? rota.permissao
      : null;

  // R2.3 — Negação por padrão: uma rota protegida DEVE declarar explicitamente a
  // permissão exigida. Sem permissão explícita, não há como conceder.
  if (permissaoExigida === null) {
    return {
      concedido: false,
      codigo: AUTORIZACAO.CONTRATO_INVALIDO,
      permissaoExigida: null,
    };
  }

  // R1.6 — Usuário autenticado sem autorização à aplicação: nenhuma sessão foi
  // estabelecida para a aplicação (sessão ausente/sem objeto). Recusa.
  if (!sessao || typeof sessao !== 'object') {
    return {
      concedido: false,
      codigo: AUTORIZACAO.SEM_AUTORIZACAO_APP,
      permissaoExigida,
    };
  }

  // R2.4 — Sessão sem nenhum papel mapeável: nega todas as funcionalidades
  // protegidas com indicação de ausência de permissões.
  const papeis = papeisDaSessao(sessao);
  if (papeis.length === 0) {
    return {
      concedido: false,
      codigo: AUTORIZACAO.SEM_PERMISSOES,
      permissaoExigida,
    };
  }

  // Negação por padrão (R2.3) + R2.2 — concede somente se a permissão exigida
  // estiver na UNIÃO das permissões da sessão; caso contrário, acesso negado.
  const permissoes = permissoesDaSessao(sessao);
  if (permissoes.includes(permissaoExigida)) {
    return {
      concedido: true,
      codigo: AUTORIZACAO.CONCEDIDO,
      permissaoExigida,
    };
  }

  return {
    concedido: false,
    codigo: AUTORIZACAO.ACESSO_NEGADO,
    permissaoExigida,
  };
}

/**
 * Cria o gancho de autorização (`deps.autorizar`) do roteador.
 *
 * Em caso de negação, registra o evento com o logger injetado (oid, operação
 * quando aplicável, e data/hora via `timestamp` da entrada) e LANÇA uma resposta
 * 403 — o roteador, por não despachar o handler, preserva o estado dos dados.
 *
 * Assinatura compatível com `roteador.js`: `(rota, sessao, req) => void`.
 *
 * @param {object} [deps]
 * @param {ReturnType<import('../../observabilidade/logger.js').criarLogger>} [deps.logger]
 *   Logger estruturado (com mascaramento). Opcional; na ausência, não registra.
 * @returns {(rota: object, sessao: object|null, req?: object) => void}
 */
export function criarAutorizador(deps = {}) {
  const logger = deps.logger ?? null;

  return function autorizar(rota, sessao, req) {
    const decisao = decidirAutorizacao(rota, sessao);
    if (decisao.concedido) return;

    const operacao =
      (rota && (rota.caminho || rota.metodo))
        ? `${rota.metodo ?? ''} ${rota.caminho ?? ''}`.trim()
        : (req ? `${req.metodo ?? ''} ${req.caminho ?? ''}`.trim() : '');
    const oid = sessao && typeof sessao === 'object' ? (sessao.oid ?? null) : null;

    switch (decisao.codigo) {
      // R1.6 — autenticado sem autorização à aplicação.
      case AUTORIZACAO.SEM_AUTORIZACAO_APP:
        // Registra oid (quando houver) e data/hora. Sem sessão estabelecida, o
        // oid normalmente é ausente — o timestamp do log provê a data/hora.
        logger?.warn('acesso recusado: usuário sem autorização à aplicação', {
          oid,
          operacao,
          requisito: 'R1.6',
        });
        throw negar403(
          AUTORIZACAO.SEM_AUTORIZACAO_APP,
          'Acesso não autorizado à aplicação.',
        );

      // R2.4 — sessão sem papel mapeável → "sem permissões" (oid, data/hora).
      case AUTORIZACAO.SEM_PERMISSOES:
        logger?.warn('acesso negado: sessão sem papel mapeável (sem permissões)', {
          oid,
          requisito: 'R2.4',
        });
        throw negar403(
          AUTORIZACAO.SEM_PERMISSOES,
          'Sem permissões: nenhum papel associado à sua conta.',
        );

      // R2.2 — papel sem a permissão da operação → "acesso negado"
      //         (oid, operação, data/hora); estado inalterado.
      case AUTORIZACAO.ACESSO_NEGADO:
        logger?.warn('acesso negado: operação não permitida ao papel', {
          oid,
          operacao,
          permissaoExigida: decisao.permissaoExigida,
          requisito: 'R2.2',
        });
        throw negar403(
          AUTORIZACAO.ACESSO_NEGADO,
          'Acesso negado: seu papel não possui permissão para esta operação.',
        );

      // R2.3 — rota protegida sem permissão explícita no contrato.
      case AUTORIZACAO.CONTRATO_INVALIDO:
      default:
        logger?.error('acesso negado: rota protegida sem permissão explícita', {
          oid,
          operacao,
          requisito: 'R2.3',
        });
        throw negar403(
          AUTORIZACAO.CONTRATO_INVALIDO,
          'Acesso negado por padrão: operação não autorizada.',
        );
    }
  };
}

export default criarAutorizador;
