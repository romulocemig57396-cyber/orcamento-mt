/* ─────────────────────────────────────────────────────────────────────────────
   lerSintetico.js — rptOrcamentoGeralSinteticoPorProjetoCemig.xlsx

   Totais por projeto. Cada bloco tem as linhas ADMINISTRAÇÃO, MÃO-DE-OBRA
   PRÓPRIA, MATERIAIS REQUISITADOS, MATERIAIS SALVADOS, SERVIÇOS CONTRATADOS e
   TOTAL, cada uma com quatro colunas: TOTAL OBRA, VIAB. CEMIG, NÃO VIAB. CEMIG
   e MEDIÇÃO. Os cálculos usam só o TOTAL OBRA (o rodapé do relatório avisa que
   ele não inclui a MEDIÇÃO), mas as quatro são guardadas.
   ───────────────────────────────────────────────────────────────────────────── */

import { lerLinhas, lerCabecalhoProjeto, lerDataReferencia, ehSomatorio } from './planilha';
import { lerNumeroBR } from '../utils/numeros';

const ROTULOS = {
  'ADMINISTRAÇÃO': 'administracao',
  'ADMINISTRACAO': 'administracao',
  'MÃO-DE-OBRA PRÓPRIA': 'maoObraPropria',
  'MAO-DE-OBRA PROPRIA': 'maoObraPropria',
  'MATERIAIS REQUISITADOS': 'materiais',
  'MATERIAIS SALVADOS': 'salvados',
  'SERVIÇOS CONTRATADOS': 'servicos',
  'SERVICOS CONTRATADOS': 'servicos',
  'TOTAL': 'total',
  'TOTAL GERAL': 'total',
};

const COLUNAS = ['totalObra', 'viabCemig', 'naoViabCemig', 'medicao'];

const lerColunas = (linha) => {
  const valores = linha.slice(1, 5).map(lerNumeroBR);
  const colunas = {};
  COLUNAS.forEach((nome, i) => { colunas[nome] = isNaN(valores[i]) ? 0 : valores[i]; });
  return colunas;
};

const projetoVazio = (cab) => ({
  ...cab,
  administracao: 0, maoObraPropria: 0, materiais: 0, salvados: 0, servicos: 0, total: 0,
  colunas: {},
});

export const lerSintetico = (buffer) => {
  const linhas = lerLinhas(buffer);
  const projetos = [];
  let atual = null;
  let somatorio = null;
  let emSomatorio = false;

  for (const linha of linhas) {
    if (!linha.length) continue;

    if (ehSomatorio(linha[0])) {
      emSomatorio = true;
      atual = null;
      somatorio = projetoVazio({ chave: 'SOMATÓRIO', descricao: 'Somatório dos projetos' });
      continue;
    }

    const cab = lerCabecalhoProjeto(linha[0]);
    if (cab) {
      emSomatorio = false;
      atual = projetoVazio(cab);
      projetos.push(atual);
      continue;
    }

    const campo = ROTULOS[linha[0].toUpperCase()];
    const alvo = emSomatorio ? somatorio : atual;
    if (campo && alvo) {
      const colunas = lerColunas(linha);
      alvo[campo] = colunas.totalObra;
      alvo.colunas[campo] = colunas;
    }
  }

  return { dataReferencia: lerDataReferencia(linhas), projetos, somatorio };
};
