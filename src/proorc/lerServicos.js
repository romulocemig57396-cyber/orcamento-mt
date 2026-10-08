/* ─────────────────────────────────────────────────────────────────────────────
   lerServicos.js — rptOrcamentoServicosContratados.xlsx

   Mão de obra por projeto, em US (unidades de serviço).
   - USRDA (urbano) e USRDR (rural) → construção, com o mesmo preço;
   - USPROJ → projeto.
   As linhas "CUSTO DE MONTAGEM CONTRATADO – MOC" e "CUSTO DE PROJETO
   CONTRATADO – PRC" são subtotais e não entram na soma.

   Colunas da linha de serviço: código, descrição, quantidade de serviço,
   quantidade de US, total de US, custo unitário e custo total. A quantidade que
   vale é o TOTAL US (quantidade de serviço × quantidade de US).
   ───────────────────────────────────────────────────────────────────────────── */

import { lerLinhas, lerCabecalhoProjeto, lerDataReferencia, ehSomatorio } from './planilha';
import { lerNumeroBR } from '../utils/numeros';

const CODIGO_SERVICO = /^(USRDA|USRDR|USPROJ)$/i;
const grupoDoCodigo = (codigo) => (/USPROJ/i.test(codigo) ? 'projeto' : 'construcao');

export const lerServicos = (buffer) => {
  const linhas = lerLinhas(buffer);
  const projetos = [];
  const precosUS = { construcao: null, projeto: null };
  const precosVistos = { construcao: new Set(), projeto: new Set() };
  let atual = null;
  let totalGeral = null;

  for (const linha of linhas) {
    if (!linha.length) continue;

    if (ehSomatorio(linha[0])) { atual = null; continue; }

    const cab = lerCabecalhoProjeto(linha[0]);
    if (cab) {
      atual = { ...cab, total: lerNumeroBR(linha[1]) || 0, servicos: [] };
      projetos.push(atual);
      continue;
    }

    if (atual && CODIGO_SERVICO.test(linha[0])) {
      const grupo = grupoDoCodigo(linha[0]);
      const quantidadeUS = lerNumeroBR(linha[4]);
      const precoUS = lerNumeroBR(linha[5]);
      const total = lerNumeroBR(linha[6]);
      atual.servicos.push({
        codigo: linha[0].toUpperCase(),
        descricao: linha[1],
        quantidadeUS: isNaN(quantidadeUS) ? 0 : quantidadeUS,
        precoUS: isNaN(precoUS) ? 0 : precoUS,
        total: isNaN(total) ? 0 : total,
        grupo,
      });
      if (!isNaN(precoUS) && precoUS > 0) {
        precosVistos[grupo].add(precoUS);
        if (precosUS[grupo] === null) precosUS[grupo] = precoUS;
      }
      continue;
    }

    // Rodapé: total geral do relatório, sozinho na linha
    if (linha.length === 1) {
      const n = lerNumeroBR(linha[0]);
      if (!isNaN(n)) totalGeral = n;
    }
  }

  return {
    dataReferencia: lerDataReferencia(linhas),
    precosUS,
    precosDivergentes: {
      construcao: [...precosVistos.construcao],
      projeto: [...precosVistos.projeto],
    },
    projetos,
    totalGeral,
  };
};
