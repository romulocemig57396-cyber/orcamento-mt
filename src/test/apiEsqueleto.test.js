import { describe, test, expect } from 'vitest';
import { CONTRATO, criarRoteador, casarRota } from '../api/index.js';

const req = (metodo, caminho, extra = {}) => ({
  metodo,
  caminho,
  params: {},
  query: {},
  headers: {},
  corpo: null,
  sessao: null,
  ...extra,
});

describe('Esqueleto da API serverless (tarefa 5.1)', () => {
  test('o contrato cobre exatamente as seis rotas do design', () => {
    const rotas = CONTRATO.map((r) => `${r.metodo} ${r.caminho}`).sort();
    expect(rotas).toEqual(
      [
        'DELETE /api/orcamentos/{id}',
        'GET /api/health',
        'GET /api/orcamentos',
        'GET /api/orcamentos/{id}',
        'POST /api/titular/solicitacoes',
        'PUT /api/orcamentos/{id}',
      ].sort()
    );
  });

  test('casarRota extrai o parâmetro {id} de rotas parametrizadas', () => {
    const m = casarRota('GET', '/api/orcamentos/abc-123');
    expect(m).not.toBeNull();
    expect(m.params).toEqual({ id: 'abc-123' });
  });

  test('casarRota não confunde a coleção com o item', () => {
    const colecao = casarRota('GET', '/api/orcamentos');
    expect(colecao.rota.handler).toBe('listarOrcamentos');
    const item = casarRota('GET', '/api/orcamentos/42');
    expect(item.rota.handler).toBe('obterOrcamento');
  });

  describe('despacho pelo roteador (sem ganchos injetados)', () => {
    const despachar = criarRoteador();

    test('GET /api/health responde 200 ok', async () => {
      const res = await despachar(req('GET', '/api/health'));
      expect(res.status).toBe(200);
      expect(res.corpo).toEqual({ status: 'ok' });
    });

    test.each([
      ['GET', '/api/orcamentos'],
      ['GET', '/api/orcamentos/1'],
      ['PUT', '/api/orcamentos/1'],
      ['DELETE', '/api/orcamentos/1'],
    ])('%s %s retorna stub 501 Not Implemented', async (metodo, caminho) => {
      const res = await despachar(req(metodo, caminho));
      expect(res.status).toBe(501);
      expect(res.corpo.erro).toBe('nao_implementado');
    });

    test('POST /api/titular/solicitacoes com corpo ausente retorna 400', async () => {
      const res = await despachar(req('POST', '/api/titular/solicitacoes', { corpo: null }));
      expect(res.status).toBe(400);
    });

    test('POST /api/titular/solicitacoes com corpo válido retorna 201', async () => {
      const res = await despachar(
        req('POST', '/api/titular/solicitacoes', {
          corpo: { tipo: 'acesso', titularRef: 'ref-1' },
        })
      );
      expect(res.status).toBe(201);
    });

    test('rota inexistente retorna 404', async () => {
      const res = await despachar(req('GET', '/api/inexistente'));
      expect(res.status).toBe(404);
    });

    test('método não suportado em rota conhecida retorna 404', async () => {
      const res = await despachar(req('PATCH', '/api/orcamentos/1'));
      expect(res.status).toBe(404);
    });
  });

  describe('pontos de extensão (ganchos opcionais)', () => {
    test('deps.validarToken e deps.autorizar são chamados em rota protegida', async () => {
      const chamadas = [];
      const despachar = criarRoteador({
        validarToken: () => {
          chamadas.push('validarToken');
          return { oid: 'u1' };
        },
        autorizar: () => {
          chamadas.push('autorizar');
        },
      });
      const res = await despachar(req('GET', '/api/orcamentos'));
      expect(chamadas).toEqual(['validarToken', 'autorizar']);
      expect(res.status).toBe(501); // chega ao handler-stub após as camadas
    });

    test('rota pública (health) não aciona validarToken', async () => {
      let chamou = false;
      const despachar = criarRoteador({
        validarToken: () => {
          chamou = true;
          return {};
        },
      });
      const res = await despachar(req('GET', '/api/health'));
      expect(chamou).toBe(false);
      expect(res.status).toBe(200);
    });

    test('erro formatado lançado por um gancho é propagado como resposta', async () => {
      const despachar = criarRoteador({
        validarToken: () => {
          throw { status: 401, headers: {}, corpo: { erro: 'token_invalido' } };
        },
      });
      const res = await despachar(req('GET', '/api/orcamentos'));
      expect(res.status).toBe(401);
      expect(res.corpo.erro).toBe('token_invalido');
    });
  });
});
