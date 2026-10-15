import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from '../auth/AuthContext.jsx';
import RequireAuth from '../auth/RequireAuth.jsx';

const Protegido = () => <div>conteúdo protegido</div>;

/**
 * Wrapper falso compatível com o contrato consumido por AuthProvider (7.1):
 * inicializar / obterConta / estaAutenticado / login / logout / adquirirToken.
 */
function criarWrapperFalso({ conta = null, falhaLogin = null } = {}) {
  let contaAtual = conta;
  return {
    inicializar: vi.fn(async () => {}),
    obterConta: () => contaAtual,
    estaAutenticado: () => Boolean(contaAtual),
    login: vi.fn(async () => {
      if (falhaLogin) throw falhaLogin;
      contaAtual = { username: 'teste@cemig.com', oid: 'oid-1' };
    }),
    logout: vi.fn(async () => {
      contaAtual = null;
    }),
    adquirirToken: vi.fn(async () => 'tok'),
  };
}

/**
 * Wrapper falso cujo `login`/`inicializar` só concluem quando o teste resolve
 * manualmente — permite observar estados intermediários (carregando/redirecionando).
 */
function criarWrapperControlavel({ conta = null } = {}) {
  let contaAtual = conta;
  const pendencias = { inicializar: null, login: null };
  return {
    inicializar: vi.fn(
      () =>
        new Promise((resolve) => {
          pendencias.inicializar = () => {
            resolve();
          };
        }),
    ),
    obterConta: () => contaAtual,
    estaAutenticado: () => Boolean(contaAtual),
    login: vi.fn(
      () =>
        new Promise((resolve, reject) => {
          pendencias.login = {
            sucesso: () => {
              contaAtual = { username: 'teste@cemig.com', oid: 'oid-1' };
              resolve();
            },
            falha: (e) => reject(e),
          };
        }),
    ),
    logout: vi.fn(async () => {
      contaAtual = null;
    }),
    adquirirToken: vi.fn(async () => 'tok'),
    _pendencias: pendencias,
  };
}

function montar(wrapper, props = {}) {
  return render(
    <AuthProvider wrapper={wrapper}>
      <RequireAuth {...props}>
        <Protegido />
      </RequireAuth>
    </AuthProvider>,
  );
}

describe('RequireAuth — guard de acesso', () => {
  test('autenticado renderiza o conteúdo protegido', async () => {
    const wrapper = criarWrapperFalso({ conta: { username: 'u', oid: 'o' } });
    montar(wrapper, { redirecionamentoAutomatico: false });
    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeInTheDocument());
  });

  test('não autenticado exibe a tela de login e esconde o conteúdo (R1.1)', async () => {
    const wrapper = criarWrapperFalso({ conta: null });
    montar(wrapper, { redirecionamentoAutomatico: false });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Entrar com Entra ID/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
  });

  test('clicar em entrar dispara login e revela o conteúdo (R1.1)', async () => {
    const wrapper = criarWrapperFalso({ conta: null });
    montar(wrapper, { redirecionamentoAutomatico: false });

    const botao = await screen.findByRole('button', { name: /Entrar com Entra ID/i });
    fireEvent.click(botao);

    expect(wrapper.login).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeInTheDocument());
  });

  test('redirecionamento automático dispara login() ao montar (R1.1)', async () => {
    const wrapper = criarWrapperFalso({ conta: null });
    montar(wrapper, { redirecionamentoAutomatico: true });
    await waitFor(() => expect(wrapper.login).toHaveBeenCalled());
  });

  test('falha de login exibe indicação e botão de nova tentativa (R1.7)', async () => {
    const wrapper = criarWrapperFalso({ conta: null, falhaLogin: new Error('timeout do Entra ID') });
    montar(wrapper, { redirecionamentoAutomatico: false });

    const botao = await screen.findByRole('button', { name: /Entrar com Entra ID/i });
    fireEvent.click(botao);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Falha na autenticação/i));
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeInTheDocument();
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
  });

  test('autenticado porém não autorizado exibe bloqueio (R1.6)', async () => {
    const wrapper = criarWrapperFalso({ conta: { username: 'u', oid: 'o' } });
    montar(wrapper, { redirecionamentoAutomatico: false, naoAutorizado: true });
    await waitFor(() => expect(screen.getByText('Acesso não autorizado')).toBeInTheDocument());
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
  });

  test('botão sair da tela de não autorizado chama logout', async () => {
    const wrapper = criarWrapperFalso({ conta: { username: 'u', oid: 'o' } });
    montar(wrapper, { redirecionamentoAutomatico: false, naoAutorizado: true });
    const sair = await screen.findByRole('button', { name: /Sair/i });
    fireEvent.click(sair);
    expect(wrapper.logout).toHaveBeenCalled();
  });
});

describe('RequireAuth — casos de borda não cobertos', () => {
  test('exibe indicação de carregamento enquanto a sessão é resolvida', async () => {
    // inicializar() fica pendente: o guard deve mostrar "verificando sessão" (R1.1).
    const wrapper = criarWrapperControlavel({ conta: null });
    montar(wrapper, { redirecionamentoAutomatico: false });

    const carregando = await screen.findByRole('status');
    expect(carregando).toHaveAttribute('aria-busy', 'true');
    expect(carregando).toHaveTextContent(/Verificando sua sessão/i);
    expect(screen.queryByRole('button', { name: /Entrar com Entra ID/i })).not.toBeInTheDocument();

    // Ao concluir a inicialização sem conta, cai na tela de login.
    await act(async () => {
      wrapper._pendencias.inicializar();
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Entrar com Entra ID/i })).toBeInTheDocument(),
    );
  });

  test('botão mostra "Redirecionando…" e fica desabilitado durante o login (R1.1)', async () => {
    const wrapper = criarWrapperControlavel({ conta: null });
    montar(wrapper, { redirecionamentoAutomatico: false });

    // Conclui a inicialização para chegar à tela de login.
    await act(async () => {
      wrapper._pendencias.inicializar();
    });
    const botao = await screen.findByRole('button', { name: /Entrar com Entra ID/i });

    // Dispara login — que fica pendente — e observa o estado "redirecionando".
    fireEvent.click(botao);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Redirecionando…/i })).toBeDisabled(),
    );

    // Conclui o login com sucesso: o conteúdo protegido aparece.
    await act(async () => {
      wrapper._pendencias.login.sucesso();
    });
    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeInTheDocument());
  });

  test('logout após login retorna à tela de login e esconde o conteúdo (R1.1)', async () => {
    // Começa autenticado e protege uma UI que oferece botão de sair.
    const wrapper = criarWrapperFalso({ conta: { username: 'u', oid: 'o' } });
    function AppProtegido() {
      const auth = useAuth();
      return (
        <div>
          <span>conteúdo protegido</span>
          <button type="button" onClick={() => auth.logout()}>
            Encerrar sessão
          </button>
        </div>
      );
    }
    render(
      <AuthProvider wrapper={wrapper}>
        <RequireAuth redirecionamentoAutomatico={false}>
          <AppProtegido />
        </RequireAuth>
      </AuthProvider>,
    );

    const sair = await screen.findByRole('button', { name: /Encerrar sessão/i });
    fireEvent.click(sair);

    await waitFor(() => expect(wrapper.logout).toHaveBeenCalled());
    // Sem sessão, o guard volta a exigir login e esconde o conteúdo (R1.1).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Entrar com Entra ID/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
  });

  test('nova tentativa após falha: segundo login bem-sucedido revela o conteúdo (R1.7)', async () => {
    // 1ª tentativa falha; 2ª sucede — o botão "Tentar novamente" realmente retenta.
    let contaAtual = null;
    let primeiraTentativa = true;
    const wrapper = {
      inicializar: vi.fn(async () => {}),
      obterConta: () => contaAtual,
      estaAutenticado: () => Boolean(contaAtual),
      login: vi.fn(async () => {
        if (primeiraTentativa) {
          primeiraTentativa = false;
          throw new Error('timeout do Entra ID');
        }
        contaAtual = { username: 'u', oid: 'o' };
      }),
      logout: vi.fn(async () => {
        contaAtual = null;
      }),
      adquirirToken: vi.fn(async () => 'tok'),
    };
    montar(wrapper, { redirecionamentoAutomatico: false });

    fireEvent.click(await screen.findByRole('button', { name: /Entrar com Entra ID/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Falha na autenticação/i));

    // Retenta: a indicação de falha some e o conteúdo protegido aparece.
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(wrapper.login).toHaveBeenCalledTimes(2);
  });

  test('botão de nova tentativa não reentra enquanto o login está em andamento (R1.7)', async () => {
    // Login pendente: cliques repetidos no botão desabilitado não disparam novos logins.
    const wrapper = criarWrapperControlavel({ conta: null });
    montar(wrapper, { redirecionamentoAutomatico: false });
    await act(async () => {
      wrapper._pendencias.inicializar();
    });

    const botao = await screen.findByRole('button', { name: /Entrar com Entra ID/i });
    fireEvent.click(botao);

    const emAndamento = await screen.findByRole('button', { name: /Redirecionando…/i });
    expect(emAndamento).toBeDisabled();
    // Tentativas de reentrância enquanto desabilitado.
    fireEvent.click(emAndamento);
    fireEvent.click(emAndamento);

    await act(async () => {
      wrapper._pendencias.login.sucesso();
    });
    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeInTheDocument());
    expect(wrapper.login).toHaveBeenCalledTimes(1);
  });
});
