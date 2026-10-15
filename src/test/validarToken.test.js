import { describe, test, expect, vi } from 'vitest';
import {
  validarTokenNucleo,
  criarValidadorToken,
  decodificarToken,
  extrairBearer,
  comTimeout,
  MOTIVO,
  TIMEOUT_AUTENTICACAO_MS,
} from '../api/auth/validarToken.js';

/* ───────────────────────────── helpers de teste ─────────────────────────────
   Montam um JWT estrutural (header.payload.assinatura) em base64url, sem cripto
   real. A verificação de assinatura e a resolução de JWKS são injetadas como
   mocks — exatamente o ponto de extensão exigido pelo design.
   ──────────────────────────────────────────────────────────────────────────── */

function b64url(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const EMISSOR = 'https://login.microsoftonline.com/tenant-123/v2.0';
const AUDIENCIA = 'api://orcamento-mt';
const AGORA_MS = 1_700_000_000_000; // relógio fixo
const AGORA_S = Math.floor(AGORA_MS / 1000);

function criarToken(overrides = {}) {
  const header = { alg: 'RS256', kid: 'chave-1', ...(overrides.header || {}) };
  const payload = {
    iss: EMISSOR,
    aud: AUDIENCIA,
    exp: AGORA_S + 3600,
    oid: 'oid-usuario-1',
    sub: 'sub-1',
    groups: ['grupo-editores'],
    ...(overrides.payload || {}),
  };
  const assinatura = overrides.assinatura ?? 'assinatura-valida';
  return `${b64url(header)}.${b64url(payload)}.${assinatura}`;
}

// Config padrão com dependências injetadas (sem rede).
function configPadrao(over = {}) {
  return {
    emissorEsperado: EMISSOR,
    audienciaEsperada: AUDIENCIA,
    agora: () => AGORA_MS,
    resolverJwks: vi.fn(async () => ({ kty: 'RSA', kid: 'chave-1' })),
    verificarAssinatura: vi.fn((token) => !token.endsWith('.assinatura-invalida')),
    ...over,
  };
}

describe('validarToken — utilitários puros', () => {
  test('extrairBearer lê o token do cabeçalho Authorization (case-insensitive)', () => {
    expect(extrairBearer({ authorization: 'Bearer abc.def.ghi' })).toBe('abc.def.ghi');
    expect(extrairBearer({ Authorization: 'bearer  xyz ' })).toBe('xyz');
    expect(extrairBearer({})).toBeNull();
    expect(extrairBearer({ authorization: 'Basic zzz' })).toBeNull();
  });

  test('decodificarToken separa header/payload e rejeita formatos inválidos', () => {
    const tok = criarToken();
    const d = decodificarToken(tok);
    expect(d).not.toBeNull();
    expect(d.payload.iss).toBe(EMISSOR);
    expect(d.header.kid).toBe('chave-1');

    expect(decodificarToken('so.duas')).toBeNull();
    expect(decodificarToken('a.b.c.d')).toBeNull();
    expect(decodificarToken('')).toBeNull();
    expect(decodificarToken(null)).toBeNull();
    expect(decodificarToken('nao-base64!.nao-base64!.x')).toBeNull();
  });
});

describe('validarTokenNucleo — token íntegro estabelece sessão (R1.2)', () => {
  test('todos os aspectos válidos → ok com sessão parcial', async () => {
    const cfg = configPadrao();
    const r = await validarTokenNucleo(criarToken(), cfg);
    expect(r.ok).toBe(true);
    expect(r.motivo).toBeNull();
    expect(r.sessao).toMatchObject({
      oid: 'oid-usuario-1',
      sub: 'sub-1',
      groups: ['grupo-editores'],
      iss: EMISSOR,
      aud: AUDIENCIA,
    });
    expect(cfg.resolverJwks).toHaveBeenCalledWith('chave-1', expect.anything());
    expect(cfg.verificarAssinatura).toHaveBeenCalled();
  });

  test('oid ausente cai para sub', async () => {
    const r = await validarTokenNucleo(
      criarToken({ payload: { oid: undefined } }),
      configPadrao()
    );
    expect(r.ok).toBe(true);
    expect(r.sessao.oid).toBe('sub-1');
  });
});

describe('validarTokenNucleo — recusa token inválido (R1.3)', () => {
  test('token ausente', async () => {
    const r = await validarTokenNucleo(null, configPadrao());
    expect(r).toMatchObject({ ok: false, motivo: MOTIVO.AUSENTE, permitirNovaTentativa: false });
  });

  test('token malformado', async () => {
    const r = await validarTokenNucleo('xxx', configPadrao());
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVO.MALFORMADO);
  });

  test('emissor inválido', async () => {
    const r = await validarTokenNucleo(
      criarToken({ payload: { iss: 'https://atacante.example/v2.0' } }),
      configPadrao()
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVO.EMISSOR);
  });

  test('audiência inválida', async () => {
    const r = await validarTokenNucleo(
      criarToken({ payload: { aud: 'api://outra-coisa' } }),
      configPadrao()
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVO.AUDIENCIA);
  });

  test('audiência como array é aceita quando contém a esperada', async () => {
    const r = await validarTokenNucleo(
      criarToken({ payload: { aud: ['outra', AUDIENCIA] } }),
      configPadrao()
    );
    expect(r.ok).toBe(true);
  });

  test('token expirado', async () => {
    const r = await validarTokenNucleo(
      criarToken({ payload: { exp: AGORA_S - 1 } }),
      configPadrao()
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVO.EXPIRADO);
  });

  test('exp ausente é tratado como expirado', async () => {
    const r = await validarTokenNucleo(
      criarToken({ payload: { exp: undefined } }),
      configPadrao()
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVO.EXPIRADO);
  });

  test('assinatura inválida', async () => {
    const r = await validarTokenNucleo(
      criarToken({ assinatura: 'assinatura-invalida' }),
      configPadrao()
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVO.ASSINATURA);
  });

  test('qualquer campo adulterado isolado resulta em recusa (nenhuma sessão)', async () => {
    const casos = [
      criarToken({ payload: { iss: 'x' } }),
      criarToken({ payload: { aud: 'x' } }),
      criarToken({ payload: { exp: AGORA_S - 100 } }),
      criarToken({ assinatura: 'assinatura-invalida' }),
    ];
    for (const tok of casos) {
      const r = await validarTokenNucleo(tok, configPadrao());
      expect(r.ok).toBe(false);
      expect(r.sessao).toBeNull();
    }
  });
});

describe('validarTokenNucleo — timeout do IdP distinto de token inválido (R1.7)', () => {
  test('resolverJwks que estoura 30 s → timeout_idp com nova tentativa', async () => {
    vi.useFakeTimers();
    try {
      const cfg = configPadrao({
        // Nunca resolve: só o timeout encerra.
        resolverJwks: () => new Promise(() => {}),
      });
      const p = validarTokenNucleo(criarToken(), cfg);
      await vi.advanceTimersByTimeAsync(TIMEOUT_AUTENTICACAO_MS + 1);
      const r = await p;
      expect(r.ok).toBe(false);
      expect(r.motivo).toBe(MOTIVO.TIMEOUT_IDP);
      expect(r.permitirNovaTentativa).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test('falha de comunicação (rejeição) → falha_idp com nova tentativa', async () => {
    const cfg = configPadrao({
      resolverJwks: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const r = await validarTokenNucleo(criarToken(), cfg);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVO.FALHA_IDP);
    expect(r.permitirNovaTentativa).toBe(true);
  });

  test('timeout curto é respeitado via signal e marca a falha como de comunicação', async () => {
    // Sem fake timers: usamos um timeout real pequeno.
    const cfg = configPadrao({
      timeoutMs: 10,
      resolverJwks: ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('abortado')));
        }),
    });
    const r = await validarTokenNucleo(criarToken(), cfg);
    expect(r.ok).toBe(false);
    expect(r.permitirNovaTentativa).toBe(true);
  });
});

describe('comTimeout', () => {
  test('resolve o valor quando a fn termina antes do limite', async () => {
    const v = await comTimeout(async () => 42, 1000);
    expect(v).toBe(42);
  });

  test('rejeita com erro .timeout quando excede o limite', async () => {
    vi.useFakeTimers();
    try {
      const p = comTimeout(() => new Promise(() => {}), 5000);
      const assertion = expect(p).rejects.toMatchObject({ timeout: true });
      await vi.advanceTimersByTimeAsync(5001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('criarValidadorToken — gancho do roteador (R1.3 × R1.7)', () => {
  const req = (headers) => ({ metodo: 'GET', caminho: '/api/orcamentos', headers });

  test('sucesso retorna a sessão parcial', async () => {
    const validar = criarValidadorToken(configPadrao());
    const sessao = await validar(req({ authorization: `Bearer ${criarToken()}` }));
    expect(sessao.oid).toBe('oid-usuario-1');
  });

  test('token inválido lança 401 token_invalido sem nova tentativa (R1.3)', async () => {
    const validar = criarValidadorToken(configPadrao());
    const tok = criarToken({ assinatura: 'assinatura-invalida' });
    await expect(validar(req({ authorization: `Bearer ${tok}` }))).rejects.toMatchObject({
      status: 401,
      corpo: { erro: 'token_invalido', permitirNovaTentativa: false },
    });
  });

  test('token ausente lança 401 token_invalido', async () => {
    const validar = criarValidadorToken(configPadrao());
    await expect(validar(req({}))).rejects.toMatchObject({
      status: 401,
      corpo: { erro: 'token_invalido' },
    });
  });

  test('falha de comunicação lança 401 falha_autenticacao com nova tentativa (R1.7)', async () => {
    const validar = criarValidadorToken(
      configPadrao({
        resolverJwks: async () => {
          throw new Error('rede indisponível');
        },
      })
    );
    await expect(
      validar(req({ authorization: `Bearer ${criarToken()}` }))
    ).rejects.toMatchObject({
      status: 401,
      corpo: { erro: 'falha_autenticacao', permitirNovaTentativa: true },
    });
  });
});
