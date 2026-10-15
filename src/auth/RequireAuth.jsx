/* ─────────────────────────────────────────────────────────────────────────────
   RequireAuth.jsx — guard de acesso do front-end (R1.1/1.6/1.7)

   Como o app usa navegação por estado/abas (não há react-router), o "guard" é um
   componente que envolve as funcionalidades protegidas. Ele consome o contexto
   de autenticação da tarefa 7.1 (`useAuth` de AuthContext.jsx) e decide o que
   renderizar conforme o estado da sessão:

     - carregando        → indicação de verificação de sessão (enquanto inicializa)
     - não autenticado   → redireciona ao login no Entra ID (R1.1): dispara login()
                           (OIDC + PKCE via MSAL). Se o login falhar/expirar, exibe
                           indicação de falha e permite nova tentativa (R1.7).
     - não autorizado    → indicação de ACESSO NÃO AUTORIZADO (R1.6): a aplicação
                           sinaliza este estado quando a API responde 403 a um
                           usuário autenticado (ver clienteApi/ErroAutenticacao).
     - autenticado       → renderiza as funcionalidades protegidas (children)

   `App` continua compilando com ou sem o guard; a tela de login/bloqueio é
   intencionalmente simples para não acoplar à árvore principal de UI.
   ───────────────────────────────────────────────────────────────────────────── */

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

/** Tela de redirecionamento ao login (R1.1). Dispara o fluxo OIDC + PKCE. */
function TelaLogin({ login, erro, redirecionamentoAutomatico }) {
  const [entrando, setEntrando] = useState(false);
  const [falhaLocal, setFalhaLocal] = useState(null);
  const jaDisparou = useRef(false);

  const iniciar = async () => {
    setEntrando(true);
    setFalhaLocal(null);
    try {
      await login();
    } catch (e) {
      // Falha ao iniciar/concluir o login (R1.7): mantém a tela com nova tentativa.
      setFalhaLocal(e?.message || 'Não foi possível iniciar a autenticação.');
    } finally {
      setEntrando(false);
    }
  };

  // Redireciona automaticamente ao login na montagem, quando habilitado (R1.1).
  useEffect(() => {
    if (redirecionamentoAutomatico && !jaDisparou.current) {
      jaDisparou.current = true;
      iniciar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirecionamentoAutomatico]);

  // Mensagem de falha: a do contexto (vinda do wrapper MSAL) ou a local.
  const mensagemFalha = falhaLocal || (erro && erro.message) || null;

  return (
    <div role="status" className="auth-login" style={painel}>
      <h2 style={titulo}>Autenticação necessária</h2>
      <p style={texto}>
        É preciso entrar com a identidade corporativa (Microsoft Entra ID) para acessar o
        Orçamento MT.
      </p>
      {mensagemFalha && (
        <p role="alert" style={textoErro}>
          Falha na autenticação: {mensagemFalha}
        </p>
      )}
      <button type="button" onClick={iniciar} disabled={entrando} style={botao}>
        {entrando ? 'Redirecionando…' : mensagemFalha ? 'Tentar novamente' : 'Entrar com Entra ID'}
      </button>
    </div>
  );
}

/** Tela de acesso não autorizado (R1.6): autenticado, porém sem autorização. */
function TelaNaoAutorizado({ logout, mensagem }) {
  return (
    <div role="alert" className="auth-nao-autorizado" style={painel}>
      <h2 style={titulo}>Acesso não autorizado</h2>
      <p style={texto}>
        {mensagem ||
          'Sua identidade foi autenticada, mas você não possui autorização de acesso ao Orçamento MT. Procure o administrador da solução para solicitar permissão.'}
      </p>
      <button type="button" onClick={() => logout()} style={botaoSecundario}>
        Sair
      </button>
    </div>
  );
}

/** Indicação de carregamento enquanto o estado de sessão é resolvido. */
function TelaCarregando() {
  return (
    <div role="status" aria-busy="true" className="auth-carregando" style={painel}>
      <p style={texto}>Verificando sua sessão…</p>
    </div>
  );
}

/**
 * Guard que protege funcionalidades. Renderiza `children` apenas quando a sessão
 * está autenticada; caso contrário, exibe login (R1.1), bloqueio (R1.6) ou
 * carregamento, consumindo o contexto de autenticação da tarefa 7.1.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children                 Conteúdo protegido.
 * @param {boolean} [props.redirecionamentoAutomatico=true] Dispara login ao montar (R1.1).
 * @param {boolean} [props.naoAutorizado=false]            Força a tela de acesso
 *        não autorizado (R1.6); a aplicação liga este sinal ao receber 403 da API.
 * @param {string} [props.mensagemNaoAutorizado]           Mensagem opcional de bloqueio.
 */
export default function RequireAuth({
  children,
  redirecionamentoAutomatico = true,
  naoAutorizado = false,
  mensagemNaoAutorizado,
}) {
  const { carregando, autenticado, login, logout, erro } = useAuth();

  if (carregando) {
    return <TelaCarregando />;
  }
  // Acesso não autorizado (R1.6): autenticado, porém sem permissão na aplicação.
  if (autenticado && naoAutorizado) {
    return <TelaNaoAutorizado logout={logout} mensagem={mensagemNaoAutorizado} />;
  }
  if (autenticado) {
    return <>{children}</>;
  }
  // Não autenticado: exige login no Entra ID (R1.1), com nova tentativa (R1.7).
  return (
    <TelaLogin
      login={login}
      erro={erro}
      redirecionamentoAutomatico={redirecionamentoAutomatico}
    />
  );
}

/* ── Estilos inline mínimos (sem acoplar a UI principal) ── */
const painel = {
  maxWidth: '420px',
  margin: '48px auto',
  padding: '28px',
  background: '#fff',
  borderRadius: '10px',
  border: '1px solid #E8E8E8',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  textAlign: 'center',
  fontFamily: "'Open Sans', sans-serif",
};
const titulo = { fontSize: '18px', fontWeight: 700, color: '#007A3D', margin: '0 0 10px' };
const texto = { fontSize: '14px', color: '#555', margin: '0 0 16px', lineHeight: 1.5 };
const textoErro = { fontSize: '13px', color: '#B00020', margin: '0 0 14px', fontWeight: 600 };
const botao = {
  background: '#007A3D',
  color: '#fff',
  border: 'none',
  borderRadius: '7px',
  padding: '10px 18px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
};
const botaoSecundario = {
  background: '#fff',
  color: '#8B6D00',
  border: '1px solid #E6BC00',
  borderRadius: '7px',
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};
