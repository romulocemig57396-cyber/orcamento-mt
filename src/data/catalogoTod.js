/* ─────────────────────────────────────────────────────────────────────────────
   catalogoTod.js — catálogo de materiais da TOD

   TOD — Tabela para Orçamento da Distribuição (Cemig), Lista Básica de
   Materiais Padronizados. O arquivo `catalogoTod.json` é a lista conferida pelo
   responsável e não é alterado pelo app. Ele tem materiais, sucatas e serviços;
   só os materiais entram no catálogo da aba "Criar Item".

   A TOD só alimenta a montagem de itens novos: não muda o preço de nenhum item
   que já existe na biblioteca.
   ───────────────────────────────────────────────────────────────────────────── */

import dados from './catalogoTod.json';

export const TOD = {
  fonte: dados.fonte,
  dataBase: dados.dataBase,       // 'AAAA-MM-DD'
  emissao: dados.emissao,
  unidadeMonetaria: dados.unidadeMonetaria,
  totais: dados.totais,
};

// Todos os itens do arquivo, inclusive sucatas e serviços
export const ITENS_TOD = dados.itens;

// Só os materiais: é o que entra no catálogo
export const MATERIAIS_TOD = dados.itens.filter(i => i.tipo === 'material');

// { codigo: material } — para conferir preços de composições com fonte TOD
export const MATERIAIS_TOD_POR_CODIGO = Object.fromEntries(MATERIAIS_TOD.map(i => [i.codigo, i]));

export const getMaterialTod = (codigo) => MATERIAIS_TOD_POR_CODIGO[String(codigo ?? '').trim()] || null;
