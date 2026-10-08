/* ─────────────────────────────────────────────────────────────────────────────
   tabelaCustos.js — camada de compatibilidade

   Os 70 itens da biblioteca de custos passaram a morar em `biblioteca.json`,
   com a formação de cada custo registrada item a item. Este arquivo mantém as
   assinaturas antigas para o resto do app, que não precisou mudar.

   Código novo deve importar de `./biblioteca`, que também expõe as referências,
   os preços da US, as composições e o mapeamento dos projetos do PROORC.
   ───────────────────────────────────────────────────────────────────────────── */

export {
  TABELA_CUSTOS,
  ANOS_DISPONIVEIS,
  getValorPorAno,
  getItemById,
  getItensPorCategoria,
  getItensPorSubcategoria,
  buscarItens,
  formatarValor,
  getCategorias,
  getSubcategorias,
} from './biblioteca';
