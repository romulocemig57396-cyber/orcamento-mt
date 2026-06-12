import { describe, test, expect } from 'vitest';
import { analisarTexto, extrairQuantidade } from '../components/Importacao';

const TEXTO_1 = `NS: 1150323805
Cliente: CONSORCIO JACARANDA
Município: Juiz De Fora
Tensão: 22 kV
Data do estudo: 23/04/2021

Obras de Média Tensão (MT):
Obras de responsabilidade da Cemig - Condição técnica
- Instalação de religador trifásico 34,5 kV N.F.. 1 Peça coordenada pela Cemig.
Obras de responsabilidade do cliente
- Abertura de chave. 1 conj coordenado pelo cliente.
- Relocação de religador. 1 Peça coordenada pelo cliente.
- Modificação de RDU para 3#RDP 150mm². 0,1 km coordenada pelo cliente.
- Construção de RDP 3#150mm². 0,05 km coordenada pelo cliente.
- Construção de RDR 3#170mm² 336MCM. 0,3 km coordenada pelo cliente.`;

const TEXTO_2 = `NS: 1252831726
Cliente: ARCELORMITTAL BIOFLORESTAS LTDA
Município: Martinho Campos
Tensão: 13,8 kV
Data do estudo: 19/05/2026
Aumento de demanda contratada fora de ponta de 200kW HFP para 1500kW HFP.

Obras de Média Tensão (MT):
Obras com custo de responsabilidade da Cemig
- DLI.22.2012.L04 - LD B DESPACHO 2-S GONÇALO PARÁ,138kV. Construção de aprox. 70 km de linha 138kV. Conclusão estimada: 31/05/2027.
- Abertura de chave. 1 conj coordenado pela Cemig.
Obras de responsabilidade do interessado
- Modificação de RDU para 3#RDP 150mm². 3,33 km coordenada pelo interessado. Proporcionalidade 65% cliente.
- Construção de RDR 3#170mm² 336MCM. 11,33 km coordenada pelo interessado. Proporcionalidade 65% cliente.
- Instalação de BRT de 13,8 kV 167 kVA. 1 banco coordenado pelo interessado. Proporcionalidade 65% cliente.`;

describe('analisarTexto — cabeçalho', () => {
  test('TEXTO_1 — extrai NS corretamente', () => {
    expect(analisarTexto(TEXTO_1).cab.ns).toBe('1150323805');
  });

  test('TEXTO_1 — extrai cliente', () => {
    expect(analisarTexto(TEXTO_1).cab.cliente).toBe('CONSORCIO JACARANDA');
  });

  test('TEXTO_1 — extrai município', () => {
    expect(analisarTexto(TEXTO_1).cab.municipio).toBe('Juiz De Fora');
  });

  test('TEXTO_1 — extrai tensão', () => {
    expect(analisarTexto(TEXTO_1).cab.tensaoKv).toBe('22');
  });

  test('TEXTO_2 — detecta ampliação de carga', () => {
    const { cab } = analisarTexto(TEXTO_2);
    expect(cab.tipoAtendimento).toBe('Ampliação de Carga');
    expect(cab.cargaAtual).toBe(200);
    expect(cab.demandaFutura).toBe(1500);
  });

  test('TEXTO_2 — extrai data do estudo', () => {
    expect(analisarTexto(TEXTO_2).cab.dataEstudo).toBe('19/05/2026');
  });
});

describe('analisarTexto — categoria dos itens', () => {
  test('item após bloco CEMIG → categoria ctc', () => {
    const { itens } = analisarTexto(TEXTO_2);
    const item = itens.find(i => /abertura de chave/i.test(i.textoOriginal));
    expect(item.categoria).toBe('ctc');
  });

  test('item com Proporcionalidade → categoria pp', () => {
    const { itens } = analisarTexto(TEXTO_2);
    const item = itens.find(i => /modificação de rdu/i.test(i.textoOriginal));
    expect(item.categoria).toBe('pp');
  });

  test('item com Proporcionalidade → percentualCemig correto', () => {
    const { itens } = analisarTexto(TEXTO_2);
    const item = itens.find(i => /modificação de rdu/i.test(i.textoOriginal));
    expect(item.percentualCemig).toBe(35);
  });

  test('item sem Proporcionalidade no bloco cliente → parcela_reg', () => {
    const { itens } = analisarTexto(TEXTO_1);
    const item = itens.find(i => /abertura de chave/i.test(i.textoOriginal));
    expect(item.categoria).toBe('parcela_reg');
  });

  test('item sem Proporcionalidade e sem "exclusivo" → parcela_reg', () => {
    const { itens } = analisarTexto(TEXTO_1);
    const item = itens.find(i => /relocação de religador/i.test(i.textoOriginal));
    expect(item.categoria).toBe('parcela_reg');
  });
});

describe('analisarTexto — match na biblioteca', () => {
  test('Modificação RDU → RDP 150 gera DOIS itens', () => {
    const { itens } = analisarTexto(TEXTO_2);
    const relacionados = itens.filter(i => /modificação de rdu/i.test(i.textoOriginal));
    expect(relacionados.length).toBe(2);
    expect(relacionados.some(i => i.tipoSelecionado === 'RDP 150 Dupla Camada')).toBe(true);
    expect(relacionados.some(i => i.retiradaPendente === true)).toBe(true);
  });

  test('Construção RDP 150 → RDP 150 Dupla Camada', () => {
    const { itens } = analisarTexto(TEXTO_1);
    const item = itens.find(i => /construção de rdp/i.test(i.textoOriginal));
    expect(item.tipoSelecionado).toBe('RDP 150 Dupla Camada');
  });

  test('Construção RDR 336 → Tri CAA 336,4', () => {
    const { itens } = analisarTexto(TEXTO_1);
    const item = itens.find(i => /construção de rdr/i.test(i.textoOriginal));
    expect(item.tipoSelecionado).toBe('Tri CAA 336,4');
  });

  test('BRT 167 → BRT trif 167 kVA - Rural', () => {
    const { itens } = analisarTexto(TEXTO_2);
    const item = itens.find(i => /instalação de brt/i.test(i.textoOriginal));
    expect(item.tipoSelecionado).toBe('BRT trif 167 kVA - Rural');
  });

  test('Religador 34,5 kV → Religador trifásico 36KV', () => {
    const { itens } = analisarTexto(TEXTO_1);
    const item = itens.find(i => /religador trifásico 34,5/i.test(i.textoOriginal));
    expect(item.tipoSelecionado).toBe('Religador trifásico 36KV');
  });

  test('Alta tensão 138kV → vai para textosAltaTensao, não para itens', () => {
    const { itens, textosAltaTensao } = analisarTexto(TEXTO_2);
    expect(textosAltaTensao.length).toBeGreaterThan(0);
    expect(itens.some(i => /138kv/i.test(i.textoOriginal))).toBe(false);
  });
});

describe('analisarTexto — quantidades', () => {
  test('detecta km com vírgula: "0,1 km" → 0.1', () => {
    expect(extrairQuantidade('Modificação de RDU. 0,1 km da coordenada')).toEqual({ quantidade: 0.1, unidade: 'km' });
  });

  test('detecta km com ponto: "11.33 km" → 11.33', () => {
    expect(extrairQuantidade('Construção de RDR. 11.33 km da coordenada')).toEqual({ quantidade: 11.33, unidade: 'km' });
  });

  test('detecta banco: "1 banco" → 1, unidade ponto', () => {
    expect(extrairQuantidade('Instalação de BRT. 1 banco coordenado')).toEqual({ quantidade: 1, unidade: 'ponto' });
  });

  test('detecta peça: "1 Peça" → 1, unidade ponto', () => {
    expect(extrairQuantidade('Instalação de religador. 1 Peça coordenada')).toEqual({ quantidade: 1, unidade: 'ponto' });
  });

  test('detecta conj: "1 conj" → 1, unidade ponto', () => {
    expect(extrairQuantidade('Abertura de chave. 1 conj coordenado')).toEqual({ quantidade: 1, unidade: 'ponto' });
  });
});
