import { describe, test, expect } from 'vitest';
import {
  registrarSolicitacao,
  atenderSolicitacao,
  recusarSolicitacao,
  calcularPrazoLimite,
  tipoValido,
  TIPOS_DIREITO,
  STATUS,
  PRAZO_DIAS_CORRIDOS,
  ERRO,
} from '../lgpd/direitosTitular.js';
import { registrarSolicitacaoTitular } from '../api/handlers/titular.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Testes unitários — direitos do titular (LGPD): R11.4 e R11.5.

   - R11.4: registro da solicitação e cálculo do prazo = registradaEm + 15 dias
     corridos, para os quatro tipos (acesso, correção, exclusão, portabilidade).
   - R11.5: recusa registra o motivo e PRESERVA o Dado_Pessoal sem alteração.

   Também cobre o handler POST /api/titular/solicitacoes com persistência
   injetada (DI) e sem persistência (esqueleto funcional).
   ───────────────────────────────────────────────────────────────────────────── */

const MS_POR_DIA = 24 * 60 * 60 * 1000;

describe('calcularPrazoLimite — 15 dias corridos (R11.4)', () => {
  test('soma exatamente 15 dias corridos ao instante de registro', () => {
    const registradaEm = '2025-01-01T00:00:00.000Z';
    const prazo = calcularPrazoLimite(registradaEm);
    expect(prazo).toBe('2025-01-16T00:00:00.000Z');
  });

  test('dias corridos atravessam fim de semana e virada de mês', () => {
    // 20/02/2025 + 15 dias corridos = 07/03/2025 (inclui fim de semana e troca de mês).
    const prazo = calcularPrazoLimite('2025-02-20T12:00:00.000Z');
    expect(prazo).toBe('2025-03-07T12:00:00.000Z');
  });

  test('diferença em ms é sempre 15 dias para qualquer base válida', () => {
    const base = new Date('2024-12-29T09:30:00.000Z');
    const prazo = new Date(calcularPrazoLimite(base));
    expect(prazo.getTime() - base.getTime()).toBe(PRAZO_DIAS_CORRIDOS * MS_POR_DIA);
  });

  test('rejeita instante inválido', () => {
    expect(() => calcularPrazoLimite('nao-e-data')).toThrow();
  });
});

describe('registrarSolicitacao (R11.4)', () => {
  test.each(TIPOS_DIREITO)('registra solicitação do tipo %s com prazo de 15 dias', (tipo) => {
    const registradaEm = '2025-05-10T00:00:00.000Z';
    const res = registrarSolicitacao({ tipo, titularRef: 'ref-opaca-123', registradaEm });

    expect(res.ok).toBe(true);
    expect(res.valor.tipo).toBe(tipo);
    expect(res.valor.status).toBe(STATUS.REGISTRADA);
    expect(res.valor.motivoRecusa).toBeNull();
    expect(res.valor.registradaEm).toBe('2025-05-10T00:00:00.000Z');
    expect(res.valor.prazoLimite).toBe('2025-05-25T00:00:00.000Z');
    expect(typeof res.valor.id).toBe('string');
    expect(res.valor.id.length).toBeGreaterThan(0);
  });

  test('usa o instante atual quando registradaEm é omitido', () => {
    const antes = Date.now();
    const res = registrarSolicitacao({ tipo: 'acesso', titularRef: 'ref-xyz' });
    const depois = Date.now();

    expect(res.ok).toBe(true);
    const t = new Date(res.valor.registradaEm).getTime();
    expect(t).toBeGreaterThanOrEqual(antes);
    expect(t).toBeLessThanOrEqual(depois);
    // prazo coerente com o registro.
    expect(new Date(res.valor.prazoLimite).getTime() - t).toBe(
      PRAZO_DIAS_CORRIDOS * MS_POR_DIA,
    );
  });

  test('rejeita tipo de direito inválido', () => {
    const res = registrarSolicitacao({ tipo: 'remocao', titularRef: 'ref' });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.TIPO_INVALIDO);
  });

  test('rejeita titularRef ausente ou vazio', () => {
    expect(registrarSolicitacao({ tipo: 'acesso' }).codigo).toBe(ERRO.TITULAR_INVALIDO);
    expect(registrarSolicitacao({ tipo: 'acesso', titularRef: '   ' }).codigo).toBe(
      ERRO.TITULAR_INVALIDO,
    );
  });

  test('tipoValido reconhece apenas os quatro direitos', () => {
    expect(TIPOS_DIREITO).toEqual(['acesso', 'correcao', 'exclusao', 'portabilidade']);
    expect(tipoValido('portabilidade')).toBe(true);
    expect(tipoValido('exclusao-total')).toBe(false);
  });
});

describe('atenderSolicitacao (R11.4)', () => {
  test('transiciona de registrada para atendida sem mutar a entrada', () => {
    const registro = registrarSolicitacao({ tipo: 'acesso', titularRef: 'ref' }).valor;
    const res = atenderSolicitacao(registro);

    expect(res.ok).toBe(true);
    expect(res.valor.status).toBe(STATUS.ATENDIDA);
    // entrada preservada (função pura).
    expect(registro.status).toBe(STATUS.REGISTRADA);
  });

  test('recusa transição a partir de estado não-registrada', () => {
    const registro = registrarSolicitacao({ tipo: 'acesso', titularRef: 'ref' }).valor;
    const atendida = atenderSolicitacao(registro).valor;
    const res = atenderSolicitacao(atendida);
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.TRANSICAO_INVALIDA);
  });
});

describe('recusarSolicitacao — registra motivo e preserva o dado (R11.5)', () => {
  test('registra o motivo e marca como recusada', () => {
    const registro = registrarSolicitacao({ tipo: 'exclusao', titularRef: 'ref' }).valor;
    const res = recusarSolicitacao(registro, 'Obrigação legal de retenção fiscal.');

    expect(res.ok).toBe(true);
    expect(res.valor.solicitacao.status).toBe(STATUS.RECUSADA);
    expect(res.valor.solicitacao.motivoRecusa).toBe('Obrigação legal de retenção fiscal.');
  });

  test('preserva o Dado_Pessoal SEM alteração (mesma referência, conteúdo intacto)', () => {
    const registro = registrarSolicitacao({ tipo: 'exclusao', titularRef: 'ref' }).valor;
    const dadoPessoal = { id: 'orc-1', dados: { cliente: 'ACME', ns: '123' } };
    const copiaProfunda = JSON.parse(JSON.stringify(dadoPessoal));

    const res = recusarSolicitacao(registro, 'Base legal de obrigação regulatória.', dadoPessoal);

    expect(res.ok).toBe(true);
    // Preservação por identidade: o dado devolvido é a MESMA referência recebida.
    expect(res.valor.dadoPreservado).toBe(dadoPessoal);
    // E o conteúdo não foi alterado em nada.
    expect(dadoPessoal).toEqual(copiaProfunda);
  });

  test('não muta a solicitação de origem', () => {
    const registro = registrarSolicitacao({ tipo: 'correcao', titularRef: 'ref' }).valor;
    recusarSolicitacao(registro, 'Dados inconsistentes para correção.');
    expect(registro.status).toBe(STATUS.REGISTRADA);
    expect(registro.motivoRecusa).toBeNull();
  });

  test('exige motivo na recusa', () => {
    const registro = registrarSolicitacao({ tipo: 'acesso', titularRef: 'ref' }).valor;
    expect(recusarSolicitacao(registro, '').codigo).toBe(ERRO.MOTIVO_OBRIGATORIO);
    expect(recusarSolicitacao(registro).codigo).toBe(ERRO.MOTIVO_OBRIGATORIO);
  });

  test('recusa transição a partir de estado não-registrada', () => {
    const registro = registrarSolicitacao({ tipo: 'acesso', titularRef: 'ref' }).valor;
    const atendida = atenderSolicitacao(registro).valor;
    const res = recusarSolicitacao(atendida, 'motivo qualquer');
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.TRANSICAO_INVALIDA);
  });
});

describe('handler POST /api/titular/solicitacoes (R11.4)', () => {
  const req = (corpo) => ({ metodo: 'POST', caminho: '/api/titular/solicitacoes', corpo });

  test('registra e retorna 201 sem persistência injetada', async () => {
    const resp = await registrarSolicitacaoTitular(req({ tipo: 'acesso', titularRef: 'ref-1' }));
    expect(resp.status).toBe(201);
    expect(resp.corpo.status).toBe(STATUS.REGISTRADA);
    expect(resp.corpo.tipo).toBe('acesso');
    expect(typeof resp.corpo.prazoLimite).toBe('string');
  });

  test('persiste via DID e devolve o valor persistido', async () => {
    const gravadas = [];
    const deps = {
      persistenciaTitular: {
        registrar: (s) => {
          gravadas.push(s);
          return { ok: true, valor: s };
        },
      },
    };
    const resp = await registrarSolicitacaoTitular(
      req({ tipo: 'portabilidade', titularRef: 'ref-2' }),
      deps,
    );
    expect(resp.status).toBe(201);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0].tipo).toBe('portabilidade');
  });

  test('400 para corpo ausente', async () => {
    const resp = await registrarSolicitacaoTitular(req(null));
    expect(resp.status).toBe(400);
  });

  test('400 para tipo inválido', async () => {
    const resp = await registrarSolicitacaoTitular(req({ tipo: 'x', titularRef: 'ref' }));
    expect(resp.status).toBe(400);
    expect(resp.corpo.erro).toBe(ERRO.TIPO_INVALIDO);
  });

  test('502 quando a persistência falha, sem estado parcial exposto', async () => {
    const deps = {
      persistenciaTitular: {
        registrar: () => {
          throw new Error('indisponível');
        },
      },
    };
    const resp = await registrarSolicitacaoTitular(
      req({ tipo: 'acesso', titularRef: 'ref' }),
      deps,
    );
    expect(resp.status).toBe(502);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   Casos de borda adicionais (ampliação da cobertura — tarefa 10.4).

   Não duplicam os testes acima; cobrem lacunas identificadas:
   - atender TODOS os quatro tipos (acima, só 'acesso' era atendido);
   - prazo em bordas de virada de ano e com entrada em fuso não-UTC;
   - recusa que preserva TODOS os demais campos da solicitação sem alteração;
   - idempotência / estabilidade das transições inválidas.
   ───────────────────────────────────────────────────────────────────────────── */

describe('atenderSolicitacao — todos os quatro tipos (R11.4)', () => {
  test.each(TIPOS_DIREITO)('atende solicitação do tipo %s preservando a identidade do registro', (tipo) => {
    const registradaEm = '2025-07-01T08:00:00.000Z';
    const registro = registrarSolicitacao({ tipo, titularRef: 'ref-opaca', registradaEm }).valor;

    const res = atenderSolicitacao(registro);

    expect(res.ok).toBe(true);
    expect(res.valor.status).toBe(STATUS.ATENDIDA);
    // tipo e demais campos de identidade seguem intactos na transição.
    expect(res.valor.tipo).toBe(tipo);
    expect(res.valor.id).toBe(registro.id);
    expect(res.valor.titularRef).toBe(registro.titularRef);
    expect(res.valor.registradaEm).toBe(registradaEm);
    expect(res.valor.prazoLimite).toBe(registro.prazoLimite);
    expect(res.valor.motivoRecusa).toBeNull();
    // entrada preservada (função pura).
    expect(registro.status).toBe(STATUS.REGISTRADA);
  });
});

describe('calcularPrazoLimite — bordas de fuso e virada de ano (R11.4)', () => {
  test('15 dias corridos atravessam a virada de ano (dez → jan)', () => {
    // 25/12/2024 + 15 dias corridos = 09/01/2025.
    const prazo = calcularPrazoLimite('2024-12-25T00:00:00.000Z');
    expect(prazo).toBe('2025-01-09T00:00:00.000Z');
  });

  test('ano bissexto: 20/02/2024 + 15 dias cai em 06/03/2024 (passa por 29/02)', () => {
    const prazo = calcularPrazoLimite('2024-02-20T00:00:00.000Z');
    expect(prazo).toBe('2024-03-06T00:00:00.000Z');
  });

  test('entrada em fuso não-UTC é normalizada para UTC antes de somar o prazo', () => {
    // 2025-01-01T00:00:00-03:00 == 2025-01-01T03:00:00Z; +15 dias = 2025-01-16T03:00:00Z.
    const prazo = calcularPrazoLimite('2025-01-01T00:00:00-03:00');
    expect(prazo).toBe('2025-01-16T03:00:00.000Z');
  });

  test('entrada em fuso positivo também é normalizada (UTC+09)', () => {
    // 2025-01-01T00:00:00+09:00 == 2024-12-31T15:00:00Z; +15 dias = 2025-01-15T15:00:00Z.
    const prazo = calcularPrazoLimite('2025-01-01T00:00:00+09:00');
    expect(prazo).toBe('2025-01-15T15:00:00.000Z');
  });
});

describe('recusarSolicitacao — não altera nenhum outro campo da solicitação (R11.5)', () => {
  test('mantém id, titularRef, tipo, registradaEm e prazoLimite; só muda status e motivoRecusa', () => {
    const registradaEm = '2025-03-10T10:00:00.000Z';
    const registro = registrarSolicitacao({
      tipo: 'exclusao',
      titularRef: 'ref-preserva',
      registradaEm,
    }).valor;

    const motivo = 'Retenção obrigatória por prazo regulatório.';
    const { solicitacao: recusada } = recusarSolicitacao(registro, motivo).valor;

    // únicos campos alterados pela recusa:
    expect(recusada.status).toBe(STATUS.RECUSADA);
    expect(recusada.motivoRecusa).toBe(motivo);
    // todos os demais campos preservados byte a byte:
    expect(recusada.id).toBe(registro.id);
    expect(recusada.titularRef).toBe(registro.titularRef);
    expect(recusada.tipo).toBe(registro.tipo);
    expect(recusada.registradaEm).toBe(registradaEm);
    expect(recusada.prazoLimite).toBe(registro.prazoLimite);
    // o conjunto de chaves é exatamente o mesmo (sem campos extras/removidos):
    expect(Object.keys(recusada).sort()).toEqual(Object.keys(registro).sort());
  });
});

describe('transições — estabilidade e idempotência (R11.4 / R11.5)', () => {
  test('reatender uma solicitação já atendida falha de forma estável e não produz novo estado', () => {
    const registro = registrarSolicitacao({ tipo: 'acesso', titularRef: 'ref' }).valor;
    const atendida = atenderSolicitacao(registro).valor;

    const r1 = atenderSolicitacao(atendida);
    const r2 = atenderSolicitacao(atendida);

    expect(r1.ok).toBe(false);
    expect(r1.codigo).toBe(ERRO.TRANSICAO_INVALIDA);
    // idempotente: repetir a tentativa dá o mesmo erro e não altera o objeto.
    expect(r2).toEqual(r1);
    expect(atendida.status).toBe(STATUS.ATENDIDA);
  });

  test('recusar novamente uma solicitação já recusada falha e preserva motivo original', () => {
    const registro = registrarSolicitacao({ tipo: 'correcao', titularRef: 'ref' }).valor;
    const { solicitacao: recusada } = recusarSolicitacao(registro, 'Motivo original.').valor;

    const r1 = recusarSolicitacao(recusada, 'Motivo diferente.');
    const r2 = recusarSolicitacao(recusada, 'Outro motivo ainda.');

    expect(r1.ok).toBe(false);
    expect(r1.codigo).toBe(ERRO.TRANSICAO_INVALIDA);
    expect(r2).toEqual(r1);
    // o motivo original permanece intocado após as tentativas rejeitadas.
    expect(recusada.motivoRecusa).toBe('Motivo original.');
    expect(recusada.status).toBe(STATUS.RECUSADA);
  });

  test('atender uma solicitação já recusada é transição inválida', () => {
    const registro = registrarSolicitacao({ tipo: 'portabilidade', titularRef: 'ref' }).valor;
    const { solicitacao: recusada } = recusarSolicitacao(registro, 'Base legal conflitante.').valor;

    const res = atenderSolicitacao(recusada);
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe(ERRO.TRANSICAO_INVALIDA);
    expect(recusada.status).toBe(STATUS.RECUSADA);
  });
});
