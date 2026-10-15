/* ─────────────────────────────────────────────────────────────────────────────
   AuthContext.jsx — provider/contexto React de autenticação (R1.1, R1.5)

   Expõe o estado de autenticação (carregando, autenticado, conta, erro) e as
   ações (login, logout, adquirirToken) para a árvore React, apoiado no wrapper
   injetável `criarAuthWrapper` (que encapsula o MSAL.js).

   Decisão: em vez de acoplar a `@azure/msal-react`, o provider usa diretamente o
   wrapper. Isso mantém uma única fronteira com o MSAL (o wrapper), evita uma
   dependência extra com restrição de peer e permite testar o contexto injetando
   um wrapper falso — sem navegador nem MSAL real.

   Comportamento (design "Fluxo de autenticação"):
   - No mount, inicializa o wrapper (conclui redirect pendente) e lê a conta.
   - `login()` redireciona o usuário não autenticado ao Entra ID (R1.1).
   - Nenhum cadastro/senha próprios — toda identidade vem do Entra ID (R1.5).
   - Guards de rota e anexo de token são a tarefa 7.2 (consomem este contexto).
   ───────────────────────────────────────────────────────────────────────────── */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { criarAuthWrapper } from './authWrapper.js';

/**
 * @typedef {Object} EstadoAuth
 * @property {boolean} carregando       Inicialização em andamento.
 * @property {boolean} autenticado      Há sessão/conta ativa.
 * @property {object|null} conta        Conta ativa do MSAL (ou null).
 * @property {Error|null} erro          Último erro de autenticação (ou null).
 * @property {(opcoes?: object) => Promise<void>} login
 * @property {(opcoes?: object) => Promise<void>} logout
 * @property {(opcoes?: object) => Promise<string>} adquirirToken
 * @property {() => void} limparErro
 */

/** @type {React.Context<EstadoAuth|null>} */
const AuthContext = createContext(null);

/**
 * Provider de autenticação.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {ReturnType<typeof criarAuthWrapper>} [props.wrapper]
 *   Wrapper já construído (injeção para testes). Quando ausente, é criado a
 *   partir de `deps`/`env`.
 * @param {Object} [props.deps]  Dependências repassadas a `criarAuthWrapper`.
 * @param {Record<string,string|undefined>} [props.env]
 */
export function AuthProvider({ children, wrapper, deps, env }) {
  // Mantém um wrapper estável por toda a vida do provider.
  const wrapperRef = useRef(
    wrapper || criarAuthWrapper({ ...(deps || {}), ...(env ? { env } : {}) })
  );
  const auth = wrapperRef.current;

  const [carregando, setCarregando] = useState(true);
  const [conta, setConta] = useState(null);
  const [erro, setErro] = useState(null);

  // Inicialização única: conclui redirect pendente e lê a conta corrente.
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        await auth.inicializar();
        if (ativo) setConta(auth.obterConta());
      } catch (e) {
        if (ativo) setErro(e);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [auth]);

  const acoes = useMemo(
    () => ({
      async login(opcoes) {
        setErro(null);
        try {
          await auth.login(opcoes);
          // No modo popup a conta já está disponível; no redirect a página navega.
          setConta(auth.obterConta());
        } catch (e) {
          setErro(e);
          throw e;
        }
      },
      async logout(opcoes) {
        setErro(null);
        try {
          await auth.logout(opcoes);
          setConta(auth.obterConta());
        } catch (e) {
          setErro(e);
          throw e;
        }
      },
      async adquirirToken(opcoes) {
        return auth.adquirirToken(opcoes);
      },
      limparErro() {
        setErro(null);
      },
    }),
    [auth]
  );

  const valor = useMemo(
    () => ({
      carregando,
      autenticado: Boolean(conta),
      conta,
      erro,
      ...acoes,
    }),
    [carregando, conta, erro, acoes]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

/**
 * Hook de acesso ao estado/ações de autenticação.
 * @returns {EstadoAuth}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  }
  return ctx;
}

export { AuthContext };
