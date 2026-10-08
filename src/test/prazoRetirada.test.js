import { describe, test, expect } from 'vitest';
import { calcularPrazoEstimado } from '../utils/calculos';

describe('A4 — prazo não conta a retirada da rede antiga', () => {
  const itensModificacao = [
    { descricao: 'RDP 150 Dupla Camada', itemOrigem: 'ext_urbano_rdp150_dupla', quantidade: 15, unidade: 'poste' },
    { descricao: '1 Km de RDP 3ᴓ 50 a 150mm²', itemOrigem: 'rede_ret_rdp_3f_50_150', quantidade: 0.6, unidade: 'km' },
  ];

  test('RDP 150 (15 postes) + retirada 0,6 km → kmTotal 0,6 e prazo 120 dias', () => {
    const prazo = calcularPrazoEstimado({ itensObra: itensModificacao });
    expect(prazo.kmTotal).toBeCloseTo(0.6, 10);
    expect(prazo.prazoRede).toBe(120);
  });

  test('todas as retiradas da biblioteca são ignoradas', () => {
    const ids = ['rede_ret_rdr_1f_4_1_0', 'rede_ret_rdr_3f_4_1_0', 'rede_ret_rdr_3f_4_0_336', 'rede_ret_rdp_1f_50', 'rede_ret_rdp_3f_50_150'];
    const prazo = calcularPrazoEstimado({ itensObra: ids.map(id => ({ itemOrigem: id, quantidade: 5, unidade: 'km' })) });
    expect(prazo.kmTotal).toBe(0);
  });

  test('item de rede comum continua contando', () => {
    const prazo = calcularPrazoEstimado({ itensObra: [{ itemOrigem: 'ext_rural_tri_caa336', quantidade: 1.5, unidade: 'km' }] });
    expect(prazo.kmTotal).toBe(1.5);
    expect(prazo.prazoRede).toBe(365);
  });
});
