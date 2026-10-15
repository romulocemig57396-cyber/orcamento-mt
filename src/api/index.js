/* ─────────────────────────────────────────────────────────────────────────────
   api/index.js — ponto de entrada da camada de API serverless

   Reexporta o contrato, o roteador e as primitivas HTTP. Um adaptador de runtime
   (Azure App Service / Functions) importa `criarRoteador`, injeta as
   dependências (auth, RBAC, persistência, segredos, logger) à medida que as
   tarefas seguintes as implementam, e converte requisição/resposta nativas de e
   para `RequisicaoApi`/`RespostaApi`.
   ───────────────────────────────────────────────────────────────────────────── */

export { CONTRATO } from './contrato.js';
export { criarRoteador, casarRota } from './roteador.js';
export { json, erro, naoImplementado } from './http.js';
export {
  criarApi,
  criarApiDoAmbiente,
  criarResolvedorSessao,
  criarPersistenciaApi,
} from './app.js';
export {
  criarValidadorToken,
  validarTokenNucleo,
  decodificarToken,
  extrairBearer,
  comTimeout,
  MOTIVO,
  TIMEOUT_AUTENTICACAO_MS,
} from './auth/validarToken.js';

