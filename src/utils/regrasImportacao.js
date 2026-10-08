import { TABELA_CUSTOS } from '../data/tabelaCustos';

// ── Itens de retirada pendente — usuário escolhe entre estes 5 itens ────────
export const RETIRADA_IDS = [
  'rede_ret_rdr_1f_4_1_0',
  'rede_ret_rdr_3f_4_1_0',
  'rede_ret_rdr_3f_4_0_336',
  'rede_ret_rdp_1f_50',
  'rede_ret_rdp_3f_50_150',
];

// ── Regras de mapeamento Obras → Biblioteca ──────────────────────────────────
// Cada regra retorna a lista de itens a gerar para a linha (1 ou 2 itens).
// Os itens são referenciados pelo `id` da biblioteca: o `tipo` se repete entre
// categorias (ex.: "CAA 4 p/ 1/0" existe em Conversão e em Recondutoramento).
export const REGRAS = [
  // --- Modificação RDU → RDP (gera DOIS itens: construção + retirada pendente)
  [/modificação.*rdu.*rdp.*150/i, () => [{ id: 'ext_urbano_rdp150_dupla' }, { id: '', retiradaPendente: true }]],
  [/modificação.*rdu.*rdp.*50/i,  () => [{ id: 'ext_urbano_rdp50_dupla' },  { id: '', retiradaPendente: true }]],
  [/modificação.*rdu.*rdp.*240/i, () => [{ id: 'ext_urbano_rdp240' },       { id: '', retiradaPendente: true }]],

  // --- Construção RDP (item único)
  [/construção.*rdp.*150/i, () => [{ id: 'ext_urbano_rdp150_dupla' }]],
  [/construção.*rdp.*50/i,  () => [{ id: 'ext_urbano_rdp50_dupla' }]],
  [/construção.*rdp.*240/i, () => [{ id: 'ext_urbano_rdp240' }]],

  // --- Recondutoramento Rural (gera DOIS itens: recondutoramento + retirada pendente)
  [/(modificação|recondutoramento).*rdr.*336/i, () => [{ id: 'recon_caa2_336' }, { id: '', retiradaPendente: true }]],
  [/modificação.*rdr.*4\/0/i,                    () => [{ id: 'recon_caa2_4_0' }, { id: '', retiradaPendente: true }]],
  [/modificação.*rdr.*(1\/0|1\.0caa)/i,          () => [{ id: 'recon_caa4_1_0' }, { id: '', retiradaPendente: true }]],
  [/modificação.*rdr.*caa.*2/i,                  () => [{ id: 'conv_caa2_2' },    { id: '', retiradaPendente: true }]],

  // --- Construção RDR Rural (item único)
  [/construção.*rdr.*336/i,    () => [{ id: 'ext_rural_tri_caa336' }]],
  [/construção.*rdr.*4\/0/i,   () => [{ id: 'ext_rural_tri_caa4_0' }]],
  [/construção.*rdr.*1\/0/i,   () => [{ id: 'ext_rural_tri_caa1_0' }]],
  [/construção.*rdr.*caa.*2/i, () => [{ id: 'ext_rural_tri_caa2' }]],
  [/construção.*rdr.*caa.*4/i, () => [{ id: 'ext_rural_tri_caa4' }]],

  // --- Equipamentos
  [/abertura.*chave|fechamento.*chave|instalação.*chave.*n\.f\./i,             () => [{ id: 'equip_abert_fecha_chave' }]],
  [/relocação.*religador.*monofásico|relocar.*religador.*mono/i,               () => [{ id: 'equip_reloc_relig_mono' }]],
  [/relocação.*religador|relocar.*religador/i,                                  () => [{ id: 'equip_reloc_relig_tri' }]],
  [/substituir.*religador.*chave|substituir.*religador.*faca/i,                () => [{ id: 'equip_reloc_relig_tri' }]],
  [/instalação.*religador.*34|religador.*34,5/i,                                () => [{ id: 'equip_relig_tri_36kv' }]],
  [/instalação.*religador.*trifásico.*24|religador.*trifásico.*24/i,           () => [{ id: 'equip_relig_tri_24kv_rural' }]],
  [/instalação.*religador.*monofásico|religador.*monofásico.*15/i,             () => [{ id: 'equip_relig_mono_15kv' }]],
  [/instalação.*brt.*167/i, () => [{ id: 'equip_brt_167_rural' }]],
  [/instalação.*brt.*250/i, () => [{ id: 'equip_brt_250_rural' }]],
  [/instalação.*brt.*76/i,  () => [{ id: 'equip_brt_76' }]],

  // --- Sem correspondência na biblioteca — campo livre para o usuário
  [/retirar.*sec|instalar.*sec|substituir.*sec/i,    () => [{ id: '' }]],
  [/desativação.*equip|desligar.*banco.*cap/i,        () => [{ id: '' }]],
];

export function matchRegras(texto) {
  for (const [re, gerar] of REGRAS) {
    if (re.test(texto)) return gerar();
  }
  return null;
}

// Opções do select da importação — todas as versões, inclusive tipos repetidos.
export const rotuloItemBiblioteca = (t) =>
  `${t.tipo} — ${t.categoria}${t.subcategoria ? ` › ${t.subcategoria}` : ''}`;

export const OPCOES_BIBLIOTECA = TABELA_CUSTOS.map(t => ({ id: t.id, label: rotuloItemBiblioteca(t) }));

// Migração: `tipoSelecionado` gravado como tipo (formato antigo) → id.
// Quando o tipo é ambíguo, usa a regra que casa com o texto original.
export const tipoParaId = (tipoSelecionado, textoOriginal = '') => {
  if (!tipoSelecionado) return '';
  if (TABELA_CUSTOS.some(t => t.id === tipoSelecionado)) return tipoSelecionado;
  const candidatos = TABELA_CUSTOS.filter(t => t.tipo === tipoSelecionado);
  if (candidatos.length === 0) return '';
  const idsDaRegra = (matchRegras(textoOriginal) || []).map(s => s.id);
  const daRegra = candidatos.find(c => idsDaRegra.includes(c.id));
  return (daRegra || candidatos[0]).id;
};
