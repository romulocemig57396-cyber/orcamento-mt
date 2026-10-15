import { describe, test, expect, vi } from 'vitest';
import {
  TIPO_METRICA,
  criarMetricas,
  criarSinkApplicationInsights,
} from '../observabilidade/metricas.js';

/**
 * Sink fake: coleta todos os pontos de métrica emitidos para inspeção.
 * @returns {{ pontos: object[], sink: (ponto: object) => void }}
 */
const criarSinkFake = () => {
  const pontos = [];
  return { pontos, sink: (ponto) => pontos.push(ponto) };
};

describe('registrarRequisicao / registrarErro (R10.2)', () => {
  test('emite e agrega contagem de requisições por operação', () => {
    const { pontos, sink } = criarSinkFake();
    const m = criarMetricas({ sink });

    m.registrarRequisicao('GET /api/orcamentos');
    m.registrarRequisicao('GET /api/orcamentos');

    const resumo = m.resumo('GET /api/orcamentos');
    expect(resumo.requisicoes).toBe(2);
    expect(resumo.erros).toBe(0);
    expect(resumo.taxaErro).toBe(0);

    const deRequisicao = pontos.filter((p) => p.tipo === TIPO_METRICA.REQUISICAO);
    expect(deRequisicao).toHaveLength(2);
    expect(deRequisicao[0].operacao).toBe('GET /api/orcamentos');
    expect(deRequisicao[0].valor).toBe(1);
    expect(typeof deRequisicao[0].timestamp).toBe('string');
  });

  test('taxa de erros é a proporção erros/requisições', () => {
    const { sink } = criarSinkFake();
    const m = criarMetricas({ sink });

    m.registrarRequisicao('op');
    m.registrarRequisicao('op');
    m.registrarRequisicao('op');
    m.registrarRequisicao('op');
    m.registrarErro('op');

    const resumo = m.resumo('op');
    expect(resumo.requisicoes).toBe(4);
    expect(resumo.erros).toBe(1);
    expect(resumo.taxaErro).toBe(0.25);
  });
});

describe('registrarLatencia (R10.2)', () => {
  test('agrega latência com média, min, max e p95', () => {
    const { pontos, sink } = criarSinkFake();
    const m = criarMetricas({ sink });

    for (const d of [10, 20, 30, 40, 100]) {
      m.registrarLatencia('op', d);
    }

    const resumo = m.resumo('op');
    expect(resumo.latenciaMinMs).toBe(10);
    expect(resumo.latenciaMaxMs).toBe(100);
    expect(resumo.latenciaMediaMs).toBe(40); // (10+20+30+40+100)/5
    expect(resumo.latenciaP95Ms).toBe(100); // nearest-rank p95 de 5 amostras

    const deLatencia = pontos.filter((p) => p.tipo === TIPO_METRICA.LATENCIA);
    expect(deLatencia).toHaveLength(5);
    expect(deLatencia[0].valor).toBe(10);
  });

  test('normaliza latência inválida/negativa para 0', () => {
    const { sink } = criarSinkFake();
    const m = criarMetricas({ sink });

    m.registrarLatencia('op', -5);
    m.registrarLatencia('op', Number.NaN);

    const resumo = m.resumo('op');
    expect(resumo.latenciaMaxMs).toBe(0);
    expect(resumo.latenciaMinMs).toBe(0);
  });
});

describe('medirOperacao — wrapper de latência (R10.2)', () => {
  test('mede duração, emite requisição e latência, e devolve o resultado', async () => {
    const { pontos, sink } = criarSinkFake();
    let t = 1000;
    const m = criarMetricas({ sink, relogioMs: () => t });

    const resultado = await m.medirOperacao('consulta', async () => {
      t += 42; // simula 42 ms de duração
      return 'ok';
    });

    expect(resultado).toBe('ok');

    const resumo = m.resumo('consulta');
    expect(resumo.requisicoes).toBe(1);
    expect(resumo.erros).toBe(0);
    expect(resumo.latenciaMaxMs).toBe(42);

    const tipos = pontos.map((p) => p.tipo);
    expect(tipos).toContain(TIPO_METRICA.REQUISICAO);
    expect(tipos).toContain(TIPO_METRICA.LATENCIA);
    expect(tipos).not.toContain(TIPO_METRICA.ERRO);
  });

  test('em erro: emite latência e erro, e repropaga a exceção', async () => {
    const { pontos, sink } = criarSinkFake();
    let t = 0;
    const m = criarMetricas({ sink, relogioMs: () => t });

    const falha = new Error('boom');
    await expect(
      m.medirOperacao('escrita', async () => {
        t += 10;
        throw falha;
      })
    ).rejects.toBe(falha);

    const resumo = m.resumo('escrita');
    expect(resumo.requisicoes).toBe(1);
    expect(resumo.erros).toBe(1);
    expect(resumo.taxaErro).toBe(1);
    expect(resumo.latenciaMaxMs).toBe(10);

    expect(pontos.map((p) => p.tipo)).toContain(TIPO_METRICA.ERRO);
  });
});

describe('degradação graciosa — falha de emissão não interrompe (R10.5)', () => {
  test('sink que lança não interrompe registrarRequisicao', () => {
    const consoleErro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sinkQuebrado = () => {
      throw new Error('backend indisponível');
    };
    const m = criarMetricas({ sink: sinkQuebrado });

    expect(() => m.registrarRequisicao('op')).not.toThrow();
    // o agregado em memória continua correto mesmo com falha de emissão
    expect(m.resumo('op').requisicoes).toBe(1);
    expect(consoleErro).toHaveBeenCalled();

    consoleErro.mockRestore();
  });

  test('medirOperacao conclui e devolve resultado mesmo com sink quebrado', async () => {
    const consoleErro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sinkQuebrado = () => {
      throw new Error('backend indisponível');
    };
    const m = criarMetricas({ sink: sinkQuebrado });

    const resultado = await m.medirOperacao('op', async () => 123);
    expect(resultado).toBe(123);

    consoleErro.mockRestore();
  });
});

describe('resumoGeral e reiniciar', () => {
  test('resumoGeral consolida todas as operações observadas', () => {
    const { sink } = criarSinkFake();
    const m = criarMetricas({ sink });

    m.registrarRequisicao('a');
    m.registrarRequisicao('b');
    m.registrarErro('b');

    const geral = m.resumoGeral();
    expect(Object.keys(geral).sort()).toEqual(['a', 'b']);
    expect(geral.a.requisicoes).toBe(1);
    expect(geral.b.erros).toBe(1);
  });

  test('reiniciar zera os agregados', () => {
    const { sink } = criarSinkFake();
    const m = criarMetricas({ sink });

    m.registrarRequisicao('a');
    m.reiniciar();

    expect(m.resumoGeral()).toEqual({});
    expect(m.resumo('a').requisicoes).toBe(0);
  });
});

describe('criarSinkApplicationInsights — adaptador de produção', () => {
  test('traduz pontos de métrica em chamadas trackMetric', () => {
    const chamadas = [];
    const clientFake = { trackMetric: (t) => chamadas.push(t) };
    const m = criarMetricas({ sink: criarSinkApplicationInsights(clientFake) });

    m.registrarRequisicao('GET /x', { ambiente: 'prd' });
    m.registrarErro('GET /x');
    m.registrarLatencia('GET /x', 55);

    expect(chamadas).toHaveLength(3);
    expect(chamadas[0]).toMatchObject({
      name: 'operacao.requisicoes',
      value: 1,
      properties: { operacao: 'GET /x', ambiente: 'prd' },
    });
    expect(chamadas[1].name).toBe('operacao.erros');
    expect(chamadas[2]).toMatchObject({ name: 'operacao.latencia_ms', value: 55 });
  });

  test('rejeita cliente sem trackMetric', () => {
    expect(() => criarSinkApplicationInsights({})).toThrow(TypeError);
    expect(() => criarSinkApplicationInsights(null)).toThrow(TypeError);
  });
});
