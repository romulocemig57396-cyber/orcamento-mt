/* ─────────────────────────────────────────────────────────────────────────────
   Raiz.jsx — raiz de composição da aplicação (wiring front, tarefa 16.1)

   Envolve a árvore React com a camada de autenticação APENAS quando o Microsoft
   Entra ID está configurado (variáveis `VITE_`). Caso contrário, renderiza a
   aplicação diretamente — preservando exatamente o comportamento local atual,
   sem exigir login (R1.1, degradação graciosa).

   - COM Entra configurado:
       <AuthProvider wrapper={wrapperApp()}>
         <RequireAuth>{children}</RequireAuth>
       </AuthProvider>
     O AuthProvider usa o MESMO wrapper compartilhado por `sessaoApp.js`, de modo
     que a sessão da SPA e o token usado pela persistência venham da mesma fonte.

   - SEM Entra configurado:
       {children}
     Nenhuma exigência de login; o app funciona como hoje.

   O guard condicional vive aqui para que `App` permaneça intacto e os testes
   existentes (que montam `App`/hooks sem Entra) continuem passando.
   ───────────────────────────────────────────────────────────────────────────── */

import React from 'react';
import { AuthProvider } from './AuthContext.jsx';
import RequireAuth from './RequireAuth.jsx';
import { entraConfigurado, wrapperApp } from './sessaoApp.js';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children  Conteúdo da aplicação (ex.: <App/>).
 * @param {boolean} [props.forcarAuth]  Força a camada de auth (uso em testes).
 */
export default function Raiz({ children, forcarAuth }) {
  const comAuth = forcarAuth ?? entraConfigurado();

  if (!comAuth) {
    // Ambiente local atual: sem Entra configurado, nenhuma exigência de login.
    return <>{children}</>;
  }

  // Entra configurado: exige login (OIDC + PKCE) antes de liberar a aplicação.
  return (
    <AuthProvider wrapper={wrapperApp()}>
      <RequireAuth>{children}</RequireAuth>
    </AuthProvider>
  );
}
