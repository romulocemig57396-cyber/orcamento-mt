import { describe, test, expect } from 'vitest';
import { validarCamposObrigatorios } from '../utils/validacoes';

describe('validarCamposObrigatorios', () => {
  test('estado vazio → retorna lista de erros com campos obrigatórios', () => {
    const erros = validarCamposObrigatorios({
      cliente: '',
      tipoAtendimento: '',
      tensaoKv: '',
      demandaFutura: '',
      municipio: '',
    });
    expect(erros.length).toBeGreaterThan(0);
    expect(erros).toContain('Cliente é obrigatório');
    expect(erros).toContain('Tipo de atendimento é obrigatório');
    expect(erros).toContain('Município é obrigatório');
  });

  test('cliente preenchido → não retorna erro de cliente', () => {
    const erros = validarCamposObrigatorios({
      cliente: 'EMPRESA TESTE',
      tipoAtendimento: '',
      tensaoKv: '',
      demandaFutura: '',
      municipio: '',
    });
    expect(erros).not.toContain('Cliente é obrigatório');
  });

  test('todos campos preenchidos → retorna array vazio', () => {
    const erros = validarCamposObrigatorios({
      cliente: 'EMPRESA TESTE',
      tipoAtendimento: 'Ligação Nova',
      tensaoKv: 13.8,
      demandaFutura: 300,
      municipio: 'Belo Horizonte',
    });
    expect(erros).toEqual([]);
  });
});
