/* ─────────────────────────────────────────────────────────────────────────────
   cosmos.js — cliente de persistência de orçamentos (Cosmos DB) na API

   Responsabilidades (R5.2–R5.4, Property 5):
   - Gravação ATÔMICA do documento de orçamento: a gravação ocorre por completo
     ou não ocorre. Em caso de falha, o estado anterior é preservado SEM
     alteração parcial e um resultado de erro estruturado é retornado (R5.4).
   - Particionamento por `ambiente` (R5.3): a chave de partição é o `ambiente`
     ('dev' | 'hml' | 'prd'), de modo que dados de um ambiente não sejam legíveis
     a partir de outro. O isolamento forte adicional vem de contas/recursos
     distintos por ambiente (ver design.md, Data Models).

   Criptografia em repouso (R5.2):
   - O Cosmos DB cifra todos os dados em repouso NATIVAMENTE com AES-256,
     habilitado por padrão e não desligável. Este cliente não precisa (nem deve)
     cifrar manualmente o documento; a conformidade com R5.2 é garantida pela
     configuração do recurso Cosmos no IaC (`infra/`, tarefa 12.2:
     "criptografia em repouso ≥ AES-256"). Documentado aqui para rastreabilidade.

   Design — injeção de dependência (testabilidade sem Azure real):
   - O cliente NÃO importa o SDK `@azure/cosmos`. Em vez disso, recebe um
     `container` injetável que expõe o subconjunto do contrato do SDK que usamos:
         container.item(id, partitionKey).read()
         container.items.upsert(documento)   // ou container.item(...).replace()
         container.item(id, partitionKey).delete()
     No runtime, um adaptador fino injeta o `Container` real do SDK; nos testes,
     injeta-se um fake em memória que pode simular falhas em qualquer ponto.

   Atomicidade (Property 5):
   - A gravação de um documento no Cosmos é, por si, atômica no nível do item:
     um `upsert`/`replace` de um único documento é tudo-ou-nada no servidor. Este
     cliente adiciona a garantia de PRESERVAÇÃO DO ESTADO ANTERIOR na fronteira
     da API: lê o estado anterior antes de escrever e, se a escrita falhar,
     devolve erro sem ter produzido gravação parcial — o documento permanece no
     estado anterior (ou inexistente, se era criação).
   ───────────────────────────────────────────────────────────────────────────── */

import { AMBIENTES, criarDocumentoOrcamento } from '../../persistencia/modelo.js';

/**
 * Códigos de erro padronizados retornados por este módulo.
 * @readonly
 */
export const ERRO = Object.freeze({
  CONTAINER_INVALIDO: 'CONTAINER_INVALIDO',
  AMBIENTE_INVALIDO: 'AMBIENTE_INVALIDO',
  ID_INVALIDO: 'ID_INVALIDO',
  FALHA_GRAVACAO: 'FALHA_GRAVACAO',
  FALHA_LEITURA: 'FALHA_LEITURA',
  FALHA_REMOCAO: 'FALHA_REMOCAO',
  NAO_ENCONTRADO: 'NAO_ENCONTRADO',
});

/**
 * Resultado de sucesso.
 * @template T
 * @param {T} valor
 * @returns {{ ok: true, valor: T }}
 */
const ok = (valor) => ({ ok: true, valor });

/**
 * Resultado de erro estruturado (indicação de erro para o usuário/handler).
 * @param {string} codigo
 * @param {string} mensagem
 * @param {object} [detalhes]
 * @returns {{ ok: false, codigo: string, mensagem: string, detalhes?: object }}
 */
const erro = (codigo, mensagem, detalhes) =>
  detalhes === undefined
    ? { ok: false, codigo, mensagem }
    : { ok: false, codigo, mensagem, detalhes };

/** Verifica se o container injetado expõe o contrato mínimo que usamos. */
const containerValido = (container) =>
  !!container &&
  typeof container.item === 'function' &&
  !!container.items &&
  typeof container.items.upsert === 'function';

/** `ambiente` deve ser um dos ambientes isolados conhecidos (R5.3). */
const ambienteValido = (ambiente) => AMBIENTES.includes(ambiente);

/**
 * Reconhece o "não encontrado" do SDK Cosmos. O SDK lança/retorna code 404
 * (ou um erro com `.code === 404`) quando o item não existe. Normalizamos para
 * tratar leitura de item ausente como "estado anterior inexistente".
 */
const ehNaoEncontrado = (e) =>
  !!e && (e.code === 404 || e.statusCode === 404 || e.status === 404);

/**
 * Lê o estado anterior de um orçamento (ou null se não existir), capturando o
 * 404 do SDK como ausência. Qualquer outra falha é propagada como erro de
 * leitura, pois sem conhecer o estado anterior não podemos garantir a
 * preservação em falha (R5.4).
 *
 * @param {object} container  Container Cosmos injetado.
 * @param {string} id         Identificador do orçamento.
 * @param {string} ambiente   Chave de partição (R5.3).
 * @returns {Promise<{ anterior: object|null }>}
 */
const lerAnterior = async (container, id, ambiente) => {
  try {
    const resposta = await container.item(id, ambiente).read();
    const recurso = resposta?.resource ?? resposta ?? null;
    return { anterior: recurso || null };
  } catch (e) {
    if (ehNaoEncontrado(e)) return { anterior: null };
    throw e; // falha real de leitura — não mascarar
  }
};

/**
 * Grava (cria ou atualiza) um orçamento de forma ATÔMICA, particionando por
 * `ambiente` (R5.3) e preservando o estado anterior em caso de falha (R5.4,
 * Property 5).
 *
 * Fluxo:
 *  1. Valida container, ambiente e orçamento.
 *  2. Lê o estado anterior (para poder confirmar a preservação em falha).
 *  3. Monta o documento envelopado (modelo.js), fixando `ambiente` como partição
 *     e preservando `id`/`criadoEm` quando é atualização.
 *  4. Faz o upsert — operação atômica de item único no Cosmos.
 *  5. Em falha do upsert, NÃO há gravação parcial (upsert é tudo-ou-nada); o
 *     documento permanece no estado anterior. Retorna erro estruturado com o
 *     estado anterior em `detalhes` para o chamador reexibir/reter.
 *
 * @param {Object} args
 * @param {object} args.container        Container Cosmos injetado (DI).
 * @param {string} args.ambiente         Ambiente/partição ('dev'|'hml'|'prd').
 * @param {Object} args.orcamento        Estado de orçamento (formato do app).
 * @param {Object} [args.meta]           Metadados do envelope (id, proprietarioOid, classificacao, criadoEm...).
 * @returns {Promise<{ok:true, valor:{documento:object, criado:boolean}} | {ok:false, codigo:string, mensagem:string, detalhes?:object}>}
 */
export const gravarOrcamento = async ({ container, ambiente, orcamento, meta = {} } = {}) => {
  if (!containerValido(container)) {
    return erro(ERRO.CONTAINER_INVALIDO, 'Container de persistência inválido ou ausente.');
  }
  if (!ambienteValido(ambiente)) {
    return erro(
      ERRO.AMBIENTE_INVALIDO,
      `Ambiente inválido: esperado um de ${AMBIENTES.join(', ')}.`,
    );
  }
  if (!orcamento || typeof orcamento !== 'object') {
    return erro(ERRO.ID_INVALIDO, 'Orçamento ausente ou inválido.');
  }

  // 2. Estado anterior — necessário para garantir preservação em falha (R5.4).
  //    `meta.id` presente indica atualização; ausente indica criação.
  let anterior = null;
  if (meta.id) {
    try {
      ({ anterior } = await lerAnterior(container, meta.id, ambiente));
    } catch (e) {
      return erro(
        ERRO.FALHA_LEITURA,
        'Falha ao ler o estado anterior do orçamento; gravação abortada.',
        { causa: e?.message },
      );
    }
  }

  // 3. Documento envelopado. `ambiente` é fixado como chave de partição (R5.3).
  //    Em atualização, preservamos `criadoEm` do anterior (modelo cuida do resto).
  const criado = !anterior;
  const documento = criarDocumentoOrcamento(orcamento, {
    ...meta,
    ambiente,
    criadoEm: anterior?.criadoEm ?? meta.criadoEm,
  });

  // 4. Upsert atômico de item único (tudo-ou-nada no servidor).
  try {
    const resposta = await container.items.upsert(documento);
    const persistido = resposta?.resource ?? documento;
    return ok({ documento: persistido, criado });
  } catch (e) {
    // 5. Falha de gravação: upsert é atômico, logo NÃO houve gravação parcial.
    //    O estado anterior está preservado. Devolvemos erro estruturado e o
    //    estado anterior para o chamador reter/reexibir (R5.4, Property 5).
    return erro(
      ERRO.FALHA_GRAVACAO,
      'Falha ao gravar o orçamento; o estado anterior foi preservado sem alteração parcial.',
      { causa: e?.message, estadoAnterior: anterior },
    );
  }
};

/**
 * Recupera um orçamento por id dentro de um ambiente (partição) (R5.3).
 *
 * @param {Object} args
 * @param {object} args.container  Container Cosmos injetado.
 * @param {string} args.ambiente   Ambiente/partição.
 * @param {string} args.id         Identificador do orçamento.
 * @returns {Promise<{ok:true, valor:object} | {ok:false, codigo:string, mensagem:string}>}
 */
export const obterOrcamento = async ({ container, ambiente, id } = {}) => {
  if (!containerValido(container)) {
    return erro(ERRO.CONTAINER_INVALIDO, 'Container de persistência inválido ou ausente.');
  }
  if (!ambienteValido(ambiente)) {
    return erro(ERRO.AMBIENTE_INVALIDO, `Ambiente inválido: esperado um de ${AMBIENTES.join(', ')}.`);
  }
  if (!id || typeof id !== 'string') {
    return erro(ERRO.ID_INVALIDO, 'Identificador de orçamento ausente ou inválido.');
  }

  try {
    const { anterior } = await lerAnterior(container, id, ambiente);
    if (!anterior) {
      return erro(ERRO.NAO_ENCONTRADO, 'Orçamento não encontrado no ambiente informado.');
    }
    return ok(anterior);
  } catch (e) {
    return erro(ERRO.FALHA_LEITURA, 'Falha ao ler o orçamento.', { causa: e?.message });
  }
};

/**
 * Remove um orçamento por id dentro de um ambiente (partição) (R5.3).
 * Em falha, o estado anterior é preservado (a remoção de item único é atômica:
 * ou remove por completo, ou não remove).
 *
 * @param {Object} args
 * @param {object} args.container  Container Cosmos injetado.
 * @param {string} args.ambiente   Ambiente/partição.
 * @param {string} args.id         Identificador do orçamento.
 * @returns {Promise<{ok:true, valor:{removido:boolean}} | {ok:false, codigo:string, mensagem:string}>}
 */
export const removerOrcamento = async ({ container, ambiente, id } = {}) => {
  if (!containerValido(container)) {
    return erro(ERRO.CONTAINER_INVALIDO, 'Container de persistência inválido ou ausente.');
  }
  if (!ambienteValido(ambiente)) {
    return erro(ERRO.AMBIENTE_INVALIDO, `Ambiente inválido: esperado um de ${AMBIENTES.join(', ')}.`);
  }
  if (!id || typeof id !== 'string') {
    return erro(ERRO.ID_INVALIDO, 'Identificador de orçamento ausente ou inválido.');
  }

  try {
    await container.item(id, ambiente).delete();
    return ok({ removido: true });
  } catch (e) {
    if (ehNaoEncontrado(e)) {
      return erro(ERRO.NAO_ENCONTRADO, 'Orçamento não encontrado no ambiente informado.');
    }
    return erro(ERRO.FALHA_REMOCAO, 'Falha ao remover o orçamento; estado preservado.', {
      causa: e?.message,
    });
  }
};

/**
 * Cria um cliente de persistência com o `container` e o `ambiente` fixados,
 * expondo as operações com assinaturas enxutas. Conveniência para os handlers
 * da API, que resolvem o ambiente a partir da configuração do runtime.
 *
 * @param {Object} cfg
 * @param {object} cfg.container  Container Cosmos injetado (DI).
 * @param {string} cfg.ambiente  Ambiente/partição ('dev'|'hml'|'prd').
 * @returns {{
 *   gravar: (orcamento: object, meta?: object) => Promise<object>,
 *   obter: (id: string) => Promise<object>,
 *   remover: (id: string) => Promise<object>,
 * }}
 */
export const criarClientePersistencia = ({ container, ambiente } = {}) => ({
  gravar: (orcamento, meta = {}) => gravarOrcamento({ container, ambiente, orcamento, meta }),
  obter: (id) => obterOrcamento({ container, ambiente, id }),
  remover: (id) => removerOrcamento({ container, ambiente, id }),
});
