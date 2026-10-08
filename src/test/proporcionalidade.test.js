import { describe, test, expect } from 'vitest';
import { analisarTexto, lerProporcionalidade, AVISO_PROPORCIONALIDADE } from '../components/Importacao';

describe('A7 — lerProporcionalidade', () => {
  test('"Proporcionalidade 65% cliente" → Cemig 35, sem aviso', () => {
    expect(lerProporcionalidade('Proporcionalidade 65% cliente.')).toEqual({ percentualCemig: 35, aviso: false });
  });

  test('"Proporcionalidade: Cemig 35% e cliente 65%" → Cemig 35, sem aviso', () => {
    expect(lerProporcionalidade('Proporcionalidade: Cemig 35% e cliente 65%')).toEqual({ percentualCemig: 35, aviso: false });
  });

  test('"Proporcionalidade 65% cliente e 35% Cemig" → Cemig 35', () => {
    expect(lerProporcionalidade('Proporcionalidade 65% cliente e 35% Cemig')).toEqual({ percentualCemig: 35, aviso: false });
  });

  test('"Proporcionalidade de 40% para o interessado" → Cemig 60', () => {
    expect(lerProporcionalidade('Proporcionalidade de 40% para o interessado.')).toEqual({ percentualCemig: 60, aviso: false });
  });

  test('"consumidor" também identifica o cliente', () => {
    expect(lerProporcionalidade('Proporcionalidade 20% do consumidor')).toEqual({ percentualCemig: 80, aviso: false });
  });

  test('só o % da Cemig → usa direto', () => {
    expect(lerProporcionalidade('Proporcionalidade: 70% Cemig.')).toEqual({ percentualCemig: 70, aviso: false });
  });

  test('"Proporcionalidade 30%" sem dono → Cemig 70, com aviso', () => {
    expect(lerProporcionalidade('Proporcionalidade 30%.')).toEqual({ percentualCemig: 70, aviso: true });
  });

  test('os dois % não somam 100 → aviso', () => {
    expect(lerProporcionalidade('Proporcionalidade: Cemig 30% e cliente 65%').aviso).toBe(true);
  });

  test('sem proporcionalidade → null', () => {
    expect(lerProporcionalidade('Construção de RDP. 1 km')).toBeNull();
  });
});

describe('A7 — itens detectados', () => {
  const texto = (prop) => `Obras de responsabilidade do interessado\n- Construção de RDR 3#170mm² 336MCM. 1 km. ${prop}`;

  test('item recebe o % da Cemig correto e categoria pp', () => {
    const [item] = analisarTexto(texto('Proporcionalidade: Cemig 35% e cliente 65%')).itens;
    expect(item.categoria).toBe('pp');
    expect(item.percentualCemig).toBe(35);
    expect(item.avisoProporcionalidade).toBe(false);
  });

  test('item ambíguo é marcado com aviso', () => {
    const [item] = analisarTexto(texto('Proporcionalidade 30%')).itens;
    expect(item.percentualCemig).toBe(70);
    expect(item.avisoProporcionalidade).toBe(true);
    expect(AVISO_PROPORCIONALIDADE).toBe('Confira o % da proporcionalidade');
  });
});
