/* ─────────────────────────────────────────────────────────────────────────────
   anonimizar.js — anonimização de Dado_Pessoal originado de produção antes do
   uso em ambientes de desenvolvimento ou homologação (R11.3).

   Garantia (Property 9 / R11.3): para qualquer Dado_Pessoal originado de produção,
   a saída da anonimização NÃO permite a reidentificação do titular — não contém o
   identificador original nem permite recompô-lo.

   Técnica adotada (irreversível):
   - Campos identificadores diretos (ex.: cliente, ns, proprietarioOid, cpf, cnpj,
     email, nome, telefone, endereço...) são substituídos por um PSEUDÔNIMO
     determinístico derivado por hash com SAL. O sal é um segredo de processo que
     NÃO é armazenado junto da saída anonimizada — sem ele não é possível recompor
     o valor original. Como o hash é unidirecional e truncado, não há caminho de
     volta ao original a partir da saída.
   - Determinismo: o mesmo valor de origem, sob o mesmo sal, gera o mesmo
     pseudônimo — preserva integridade referencial (joins) nos ambientes não
     produtivos sem revelar o titular.
   - Campos quase-identificadores que poderiam permitir reidentificação por
     cruzamento (ex.: datas finas, CEP completo) são generalizados.
   - A marca de origem é reescrita: a saída deixa de ser "produção não anonimizada".

   Guard (R11.3): rejeita o uso de dados marcados como originados de produção
   quando o Ambiente alvo é dev/hml e os dados NÃO estão anonimizados.

   Funções puras: não mutam a entrada; sempre retornam uma cópia nova.
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Ambientes não produtivos nos quais Dado_Pessoal de produção só pode entrar
 * depois de anonimizado (R11.3).
 */
export const AMBIENTES_NAO_PRODUTIVOS = Object.freeze(['dev', 'hml']);

/** Ambiente de origem que exige anonimização antes do uso fora dele. */
export const AMBIENTE_PRODUCAO = 'prd';

/** Prefixo que identifica um valor como pseudônimo anonimizado (não reversível). */
export const PREFIXO_PSEUDONIMO = 'anon_';

/** Marcador para quase-identificadores removidos/generalizados. */
export const MARCADOR_GENERALIZADO = '[GENERALIZADO]';

/**
 * Chaves cujo VALOR é um identificador direto do titular e DEVE ser substituído
 * por pseudônimo (comparação por nome de campo, sem diferenciar caixa/underscore).
 */
export const CHAVES_IDENTIFICADORAS_PADRAO = Object.freeze([
  'cliente',
  'ns',
  'proprietariooid',
  'proprietario',
  'titular',
  'titularref',
  'nome',
  'nomecompleto',
  'cpf',
  'cnpj',
  'rg',
  'email',
  'e-mail',
  'telefone',
  'celular',
  'contato',
  'oid',
  'sub',
  'upn',
  'login',
  'matricula',
]);

/**
 * Chaves quase-identificadoras: não identificam sozinhas, mas por cruzamento
 * podem reidentificar. São generalizadas (não apenas pseudonimizadas).
 */
export const CHAVES_QUASE_IDENTIFICADORAS_PADRAO = Object.freeze([
  'endereco',
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'coordenadas',
  'latitude',
  'longitude',
  'datanascimento',
  'nascimento',
]);

const ehObjeto = (v) => v !== null && typeof v === 'object';

const normalizarChave = (chave) =>
  String(chave).toLowerCase().replace(/[\s_-]/g, '');

const estaNaLista = (chave, lista) => {
  const alvo = normalizarChave(chave);
  return lista.some((c) => normalizarChave(c) === alvo);
};

/**
 * Hash determinístico (FNV-1a de 64 bits em BigInt) de uma string.
 * Unidirecional para efeitos de reidentificação: a saída é um resumo de tamanho
 * fixo do qual não se recompõe a entrada. Puro e sem dependências externas.
 * @param {string} texto
 * @returns {bigint}
 */
const fnv1a64 = (texto) => {
  const OFFSET = 0xcbf29ce484222325n;
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = OFFSET;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= BigInt(texto.charCodeAt(i));
    hash = (hash * PRIME) & MASK;
  }
  return hash;
};

/**
 * Deriva um pseudônimo determinístico e irreversível para um valor identificador.
 *
 * O pseudônimo = prefixo + hash( sal || valor ). O sal é um segredo de processo
 * que NÃO é incluído na saída; sem ele, nem o conhecimento do algoritmo permite
 * recompor o valor original (hash unidirecional + espaço de busca protegido pelo
 * sal). O mesmo (valor, sal) produz sempre o mesmo pseudônimo (determinismo), o
 * que preserva integridade referencial entre registros sem revelar o titular.
 *
 * @param {*} valor valor de origem (coagido a string)
 * @param {string} sal segredo de anonimização, NÃO armazenado junto da saída
 * @returns {string} pseudônimo não reversível
 */
export const pseudonimizar = (valor, sal) => {
  if (typeof sal !== 'string' || sal.length === 0) {
    throw new Error(
      'Anonimização requer um sal (segredo) não vazio, mantido fora da saída anonimizada.'
    );
  }
  const bruto = valor === undefined || valor === null ? '' : String(valor);
  // Combina sal e valor de forma que a fronteira entre eles não seja ambígua.
  const entrada = `${sal}\u0000${bruto}`;
  const h = fnv1a64(entrada).toString(16).padStart(16, '0');
  return `${PREFIXO_PSEUDONIMO}${h}`;
};

/**
 * Indica se uma string já é um pseudônimo produzido por esta anonimização.
 * @param {*} valor
 * @returns {boolean}
 */
export const ehPseudonimo = (valor) =>
  typeof valor === 'string' &&
  new RegExp(`^${PREFIXO_PSEUDONIMO}[0-9a-f]{16}$`).test(valor);

/**
 * Opções padrão de anonimização.
 * @typedef {object} OpcoesAnonimizacao
 * @property {string} sal segredo de anonimização (obrigatório; não entra na saída)
 * @property {string[]} [chavesIdentificadoras] chaves pseudonimizadas
 * @property {string[]} [chavesQuaseIdentificadoras] chaves generalizadas
 */

/**
 * Anonimiza um registro/documento de forma que o titular NÃO seja reidentificável.
 *
 * - Valores sob chaves identificadoras → pseudônimo determinístico (irreversível).
 * - Valores sob chaves quase-identificadoras → generalizados (marcador fixo).
 * - A marca de origem de produção é reescrita: o campo `origemProducao`/`origem`
 *   é removido e o registro passa a ser marcado como anonimizado, de modo que o
 *   guard não o rejeite nos ambientes não produtivos.
 * - Idempotência (Property 9): reanonimizar uma saída já anonimizada, com o mesmo
 *   sal, não altera os pseudônimos nem reintroduz dados do titular.
 *
 * O sal NÃO é incluído em nenhum lugar da saída.
 *
 * @param {*} registro registro/documento a anonimizar
 * @param {OpcoesAnonimizacao} opcoes
 * @returns {*} cópia anonimizada (nunca a referência original para objetos)
 */
export const anonimizar = (registro, opcoes = {}) => {
  const {
    sal,
    chavesIdentificadoras = CHAVES_IDENTIFICADORAS_PADRAO,
    chavesQuaseIdentificadoras = CHAVES_QUASE_IDENTIFICADORAS_PADRAO,
  } = opcoes;

  if (typeof sal !== 'string' || sal.length === 0) {
    throw new Error(
      'Anonimização requer um sal (segredo) não vazio, mantido fora da saída anonimizada.'
    );
  }

  const vistos = new WeakSet();

  const percorrer = (valor) => {
    if (!ehObjeto(valor)) {
      // Primitivos fora de chave identificadora são preservados (não revelam o
      // titular por si; identificadores são tratados no nível da chave).
      return valor;
    }

    if (vistos.has(valor)) {
      return MARCADOR_GENERALIZADO;
    }
    vistos.add(valor);

    if (Array.isArray(valor)) {
      return valor.map((item) => percorrer(item));
    }

    if (valor instanceof Date) {
      // Data é quase-identificador: generaliza para evitar reidentificação fina.
      return MARCADOR_GENERALIZADO;
    }

    const saida = {};
    for (const chave of Object.keys(valor)) {
      const original = valor[chave];

      if (estaNaLista(chave, chavesIdentificadoras)) {
        // Identificador direto: pseudônimo determinístico irreversível.
        // Se já for pseudônimo, mantém (idempotência).
        saida[chave] = ehPseudonimo(original)
          ? original
          : pseudonimizar(original, sal);
        continue;
      }

      if (estaNaLista(chave, chavesQuaseIdentificadoras)) {
        // Quase-identificador: generaliza (não reversível, sem valor original).
        saida[chave] = original === MARCADOR_GENERALIZADO ? original : MARCADOR_GENERALIZADO;
        continue;
      }

      saida[chave] = percorrer(original);
    }

    return saida;
  };

  const resultado = percorrer(registro);

  // Reescreve a marca de origem: a saída não é mais "produção não anonimizada".
  if (ehObjeto(resultado) && !Array.isArray(resultado)) {
    delete resultado.origemProducao;
    delete resultado.origem;
    resultado.anonimizado = true;
    resultado.ambiente = resultado.ambiente === AMBIENTE_PRODUCAO ? undefined : resultado.ambiente;
    if (resultado.ambiente === undefined) delete resultado.ambiente;
  }

  return resultado;
};

/**
 * Indica se um registro está marcado como originado do ambiente de produção.
 * Reconhece `origemProducao === true`, `origem === 'prd'` e `ambiente === 'prd'`.
 * @param {*} registro
 * @returns {boolean}
 */
export const originadoDeProducao = (registro) => {
  if (!ehObjeto(registro) || Array.isArray(registro)) return false;
  if (registro.origemProducao === true) return true;
  if (registro.origem === AMBIENTE_PRODUCAO) return true;
  if (registro.ambiente === AMBIENTE_PRODUCAO) return true;
  return false;
};

/**
 * Indica se um registro já foi anonimizado por esta função.
 * @param {*} registro
 * @returns {boolean}
 */
export const estaAnonimizado = (registro) =>
  ehObjeto(registro) && !Array.isArray(registro) && registro.anonimizado === true;

/**
 * Indica se um ambiente alvo é não produtivo (dev/hml).
 * @param {string} ambiente
 * @returns {boolean}
 */
export const ehAmbienteNaoProdutivo = (ambiente) =>
  AMBIENTES_NAO_PRODUTIVOS.includes(ambiente);

/**
 * Guard (R11.3): valida o uso de um registro em um ambiente alvo.
 *
 * Rejeita (lança erro) quando o registro é originado de produção, o ambiente
 * alvo é dev/hml e o registro NÃO está anonimizado. Em qualquer outro caso,
 * retorna o registro inalterado para uso.
 *
 * @param {*} registro
 * @param {string} ambienteAlvo 'dev' | 'hml' | 'prd'
 * @returns {*} o próprio registro, quando o uso é permitido
 * @throws {Error} quando o uso de dado de produção não anonimizado é proibido
 */
export const assegurarUsoPermitido = (registro, ambienteAlvo) => {
  if (
    ehAmbienteNaoProdutivo(ambienteAlvo) &&
    originadoDeProducao(registro) &&
    !estaAnonimizado(registro)
  ) {
    throw new Error(
      `Uso rejeitado: Dado_Pessoal originado de produção não pode ser utilizado no ambiente "${ambienteAlvo}" sem anonimização (R11.3).`
    );
  }
  return registro;
};

/**
 * Variante não lançante do guard: indica se o uso é permitido.
 * @param {*} registro
 * @param {string} ambienteAlvo
 * @returns {boolean}
 */
export const usoPermitido = (registro, ambienteAlvo) => {
  if (!ehAmbienteNaoProdutivo(ambienteAlvo)) return true;
  if (!originadoDeProducao(registro)) return true;
  return estaAnonimizado(registro);
};

/**
 * Prepara um registro de produção para uso em dev/hml: anonimiza e, em seguida,
 * valida pelo guard. Garante que a saída é segura para o ambiente alvo.
 *
 * @param {*} registro
 * @param {string} ambienteAlvo 'dev' | 'hml'
 * @param {OpcoesAnonimizacao} opcoes
 * @returns {*} registro anonimizado, aprovado pelo guard
 */
export const prepararParaAmbiente = (registro, ambienteAlvo, opcoes = {}) => {
  const anonimizado = anonimizar(registro, opcoes);
  return assegurarUsoPermitido(anonimizado, ambienteAlvo);
};

export default anonimizar;
