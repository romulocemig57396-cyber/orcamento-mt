import { describe, test, expect } from 'vitest';
import { analisarTexto, extrairQuantidade } from '../components/Importacao';

const TEXTO_3 = `Obras de Média Tensão (MT):
Obras com custo de responsabilidade da Cemig
- Construção de RDP 3#150mm² 34,5 kV. 2,24 km da coord.
23:345792:8086023 a coord. 23-346551:8087724. Melhor traçado definir em
campo. .
- Construção de RDP 3#150mm² 34,5 kV. 12,02 km da coord.
23-346551:8087724 a coord. 23-355388:8092432. Melhor traçado definir em
campo .
- Obras, equipamentos e serviços necessários à coordenação da proteção
serão indicados pelas equipes de operação do sistema elétrico.
________________________________________
Observações/Recomendações:
- Medida criada para formalização da execução da obra de 14 km como
condição técnica, uma vez o trecho será utilizado no futuro para
interligação da SE Paracatu 11 - João Pinheiro 7.
- Mesmo alimentador da NS 1149308680
- Esse atendimento só poderá ocorrer mediante a redução 500kW na demanda
do cliente referente a NS 1149308680 até a conclusão da SE João Pinheiro
7. Ver medida 61 - SAP da NS 1149308680.`;

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

describe('analisarTexto — conversão km → postes (item vinculado a item de biblioteca "poste")', () => {
  test('Construção de RDP 150 com quantidade em km é convertida para postes', () => {
    const { itens } = analisarTexto(TEXTO_1);
    const item = itens.find(i => /construção de rdp/i.test(i.textoOriginal));
    expect(item.unidade).toBe('poste');
    // 0,05 km * 1000 / 40 = 1,25 → arredonda para 1
    expect(item.quantidade).toBe(1);
    expect(item.quantidadeKmOriginal).toBe(0.05);
  });

  test('item de retirada pendente (sem tipo vinculado) mantém a quantidade em km', () => {
    const { itens } = analisarTexto(TEXTO_2);
    const retirada = itens.find(i => /modificação de rdu/i.test(i.textoOriginal) && i.retiradaPendente);
    expect(retirada.unidade).toBe('km');
    expect(retirada.quantidade).toBe(3.33);
  });

  test('caso real — dois itens RDP 150, quantidades convertidas corretamente para postes', () => {
    const { itens } = analisarTexto(TEXTO_3);
    expect(itens.length).toBe(2);

    const [item1, item2] = itens;
    expect(item1.tipoSelecionado).toBe('RDP 150 Dupla Camada');
    expect(item1.categoria).toBe('ctc');
    expect(item1.unidade).toBe('poste');
    expect(item1.quantidadeKmOriginal).toBe(2.24);
    expect(item1.quantidade).toBe(56); // Math.round(2.24 * 1000 / 40)

    expect(item2.tipoSelecionado).toBe('RDP 150 Dupla Camada');
    expect(item2.categoria).toBe('ctc');
    expect(item2.unidade).toBe('poste');
    expect(item2.quantidadeKmOriginal).toBe(12.02);
    expect(item2.quantidade).toBe(301); // Math.round(12.02 * 1000 / 40)
  });
});

describe('analisarTexto — não captura observações/recomendações fora do bloco de obras', () => {
  test('frases de "Observações/Recomendações" não viram itens detectados', () => {
    const { itens } = analisarTexto(TEXTO_3);
    const textos = itens.map(i => i.textoOriginal).join(' ');
    expect(textos).not.toMatch(/medida criada para formalização/i);
    expect(textos).not.toMatch(/mesmo alimentador/i);
    expect(textos).not.toMatch(/esse atendimento só poderá ocorrer/i);
    // a frase de observação também cita "14 km" — garante que é a seção, e não
    // a ausência de km, que está excluindo o texto
    expect(textos).not.toMatch(/14 km/i);
  });

  test('nota de coordenação da proteção (sem regra nem quantidade) não vira item, mesmo dentro do bloco Cemig', () => {
    const { itens } = analisarTexto(TEXTO_3);
    const textos = itens.map(i => i.textoOriginal).join(' ');
    expect(textos).not.toMatch(/coordenação da proteção/i);
  });

  test('bloco de obras sem marcador "Custo Estimado" continua sendo cortado em "Observações"', () => {
    // regressão: garante que o marcador original ("Custo Estimado") continua
    // funcionando junto com os novos marcadores
    const texto = `Obras de Média Tensão (MT):
Obras com custo de responsabilidade da Cemig
- Abertura de chave. 1 conj coordenado pela Cemig.
Custo Estimado: R$ 50.000,00
Observações/Recomendações:
- Nota qualquer que não deve virar item.`;
    const { itens } = analisarTexto(texto);
    expect(itens.length).toBe(1);
    expect(itens[0].textoOriginal).toMatch(/abertura de chave/i);
  });
});
