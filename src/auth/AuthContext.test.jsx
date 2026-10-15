import { describe, test, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext.jsx';

/* Testa o provider/contexto de autenticação com um wrapper injetado (fake),
   sem MSAL real. Cobre inicialização, estado autenticado/não autenticado,
   login e logout. */

/** Wrapper fake com o contrato de criarAuthWrapper. */
function wrapperFake(over = {}) {
  let conta = over.contaInicial ?? null;
  return {
    inicializar: vi.fn(async () => {
      if (over.erroInicializar) throw over.erroInicializar;
    }),
    obterConta: vi.fn(() => conta),
    estaAutenticado: vi.fn(() => Boolean(conta)),
    login: vi.fn(async () => {
      conta = over.contaAposLogin ?? { homeAccountId: 'conta-x' };
    }),
    logout: vi.fn(async () => {
      conta = null;
    }),
    adquirirToken: vi.fn(async () => 'tok'),
    instancia: () => null,
  };
}

/** Componente de sonda que expõe o contexto para asserção. */
function Sonda() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="carregando">{String(auth.carregando)}</span>
      <span data-testid="autenticado">{String(auth.autenticado)}</span>
      <button onClick={() => auth.login()}>login</button>
      <button onClick={() => auth.logout()}>logout</button>
    </div>
  );
}

describe('AuthProvider / useAuth', () => {
  test('inicializa e reflete sessão ausente (não autenticado)', async () => {
    const w = wrapperFake();
    render(
      <AuthProvider wrapper={w}>
        <Sonda />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId('carregando').textContent).toBe('false')
    );
    expect(w.inicializar).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('autenticado').textContent).toBe('false');
  });

  test('reflete sessão existente após inicialização', async () => {
    const w = wrapperFake({ contaInicial: { homeAccountId: 'c1' } });
    render(
      <AuthProvider wrapper={w}>
        <Sonda />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId('autenticado').textContent).toBe('true')
    );
  });

  test('login atualiza o estado para autenticado', async () => {
    const w = wrapperFake();
    render(
      <AuthProvider wrapper={w}>
        <Sonda />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId('carregando').textContent).toBe('false')
    );
    await act(async () => {
      screen.getByText('login').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('autenticado').textContent).toBe('true')
    );
    expect(w.login).toHaveBeenCalled();
  });

  test('logout retorna ao estado não autenticado', async () => {
    const w = wrapperFake({ contaInicial: { homeAccountId: 'c1' } });
    render(
      <AuthProvider wrapper={w}>
        <Sonda />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId('autenticado').textContent).toBe('true')
    );
    await act(async () => {
      screen.getByText('logout').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('autenticado').textContent).toBe('false')
    );
    expect(w.logout).toHaveBeenCalled();
  });

  test('useAuth fora do provider lança erro', () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Sonda />)).toThrow(/dentro de <AuthProvider>/);
    } finally {
      console.error = original;
    }
  });
});
