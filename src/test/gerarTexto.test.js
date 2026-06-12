import { describe, test, expect } from 'vitest';
import { gerarMemorialDescritivo } from '../utils/gerarTexto';

describe('gerarMemorialDescritivo', () => {
  test('ligação nova — texto correto', () => {
    const dados = {
      cliente: 'EMPRESA TESTE',
      tipoAtendimento: 'Ligação Nova',
      demandaFutura: 300,
      cargaAtual: 0,
      tensaoKv: '13.8',
      localUnidade: 'Fazenda Modelo',
      municipio: 'Belo Horizonte',
      observacoes: '',
      itensObra: [
        { tipo: 'RDP 150', descricao: 'RDP 150', categoria: 'pp', quantidade: 371, unidade: 'poste' },
      ],
    };

    const resultado = gerarMemorialDescritivo(dados);
    const lower = resultado.toLowerCase();

    expect(lower).toContain('para atendimento à solicitação de empresa teste');
    expect(lower).toContain('ligação nova');
    expect(resultado).toContain('300 kW');
    expect(lower.includes('13.8 kv') || lower.includes('13,8 kv')).toBe(true);
    expect(resultado).toContain('Fazenda Modelo');
    expect(resultado).toContain('Belo Horizonte');
    expect(resultado).toContain('14,84 km');
    expect(resultado).not.toContain('(371 poste)');
  });

  test('ampliação — mostra demanda atual e futura', () => {
    const dados = {
      cliente: 'EMPRESA TESTE',
      tipoAtendimento: 'Ampliação de Carga',
      cargaAtual: 200,
      demandaFutura: 1500,
      tensaoKv: '13.8',
      localUnidade: 'Fazenda Modelo',
      municipio: 'Belo Horizonte',
      observacoes: '',
      itensObra: [],
    };

    const resultado = gerarMemorialDescritivo(dados);

    expect(resultado).toContain('200 kW');
    expect(resultado).toContain('1.500 kW');
  });

  test('observações aparecem no final', () => {
    const dados = {
      cliente: 'EMPRESA TESTE',
      tipoAtendimento: 'Ligação Nova',
      demandaFutura: 300,
      cargaAtual: 0,
      tensaoKv: '13.8',
      localUnidade: 'Fazenda Modelo',
      municipio: 'Belo Horizonte',
      observacoes: 'Texto de observação teste',
      itensObra: [],
    };

    const resultado = gerarMemorialDescritivo(dados);

    expect(resultado.endsWith('Texto de observação teste')).toBe(true);
  });

  test('itens agrupados por descrição', () => {
    const dados = {
      cliente: 'EMPRESA TESTE',
      tipoAtendimento: 'Ligação Nova',
      demandaFutura: 300,
      cargaAtual: 0,
      tensaoKv: '13.8',
      localUnidade: 'Fazenda Modelo',
      municipio: 'Belo Horizonte',
      observacoes: '',
      itensObra: [
        { tipo: 'p/ RDP 150', descricao: 'p/ RDP 150', categoria: 'pp', quantidade: 4, unidade: 'poste' },
        { tipo: 'p/ RDP 150', descricao: 'p/ RDP 150', categoria: 'pp', quantidade: 174, unidade: 'poste' },
      ],
    };

    const resultado = gerarMemorialDescritivo(dados);

    const ocorrencias = resultado.split('rede de distribuição protegida 3#150mm²').length - 1;
    expect(ocorrencias).toBe(1);
    expect(resultado).toContain('7,12 km');
  });

  test('itens ponto sem unidade no texto', () => {
    const dados = {
      cliente: 'EMPRESA TESTE',
      tipoAtendimento: 'Ligação Nova',
      demandaFutura: 300,
      cargaAtual: 0,
      tensaoKv: '13.8',
      localUnidade: 'Fazenda Modelo',
      municipio: 'Belo Horizonte',
      observacoes: '',
      itensObra: [
        { tipo: 'Religador trifásico 24KV Rural', descricao: 'Religador trifásico 24KV Rural', categoria: 'pp', quantidade: 3, unidade: 'ponto' },
      ],
    };

    const resultado = gerarMemorialDescritivo(dados);

    expect(resultado).toContain('3 religadores trifásicos');
    expect(resultado.toLowerCase()).not.toContain('ponto');
  });
});
