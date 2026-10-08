/* ─────────────────────────────────────────────────────────────────────────────
   lerAnalitico.js — rptOrcamentoGeralAnalitico.xlsx

   Materiais requisitados por projeto. Uma linha de material começa com o código
   de 8 dígitos e termina com quantidade, custo unitário e custo total.

   Coluna UC/UAR:
   - SIM → equipamento ou estrutura patrimonial (postes, chaves, religadores,
     reguladores, trafos);
   - MUT → cabos e condutores;
   - "-"  → material de consumo (COM).
   A última linha traz o resumo "UC/UAR (R$) | COM (R$) | TOTAL (R$)", em que
   UC/UAR = SIM + MUT. É usado como validação na consolidação.
   ───────────────────────────────────────────────────────────────────────────── */

import { lerLinhas, lerCabecalhoProjeto, lerDataReferencia, ehSomatorio } from './planilha';
import { lerNumeroBR } from '../utils/numeros';

export const CLASSES = {
  SIM: { chave: 'patrimonial', rotulo: 'UC/UAR' },
  MUT: { chave: 'cabo', rotulo: 'Cabo' },
  '-': { chave: 'consumo', rotulo: 'Consumo' },
};

export const classeDoMaterial = (ucUar) => {
  const t = String(ucUar ?? '').trim().toUpperCase();
  return (CLASSES[t] || CLASSES['-']).chave;
};

const CODIGO_MATERIAL = /^\d{8}$/;
const RESUMO = /^UC\/UAR\s*\(R\$\)/i;

// "UC/UAR (R$): 2.335.588,97" → 2335588.97
const valorRotulado = (texto) => lerNumeroBR(String(texto ?? '').split(':').pop());

export const lerAnalitico = (buffer) => {
  const linhas = lerLinhas(buffer);
  const projetos = [];
  let atual = null;
  let resumo = null;

  for (const linha of linhas) {
    if (!linha.length) continue;

    if (ehSomatorio(linha[0])) { atual = null; continue; }

    const cab = lerCabecalhoProjeto(linha[0]);
    if (cab) {
      atual = { ...cab, totalMateriais: lerNumeroBR(linha[1]) || 0, materiais: [] };
      projetos.push(atual);
      continue;
    }

    if (RESUMO.test(linha[0])) {
      resumo = {
        ucUar: valorRotulado(linha[0]),
        com: valorRotulado(linha[1]),
        total: valorRotulado(linha[2]),
      };
      continue;
    }

    if (atual && CODIGO_MATERIAL.test(linha[0]) && linha.length >= 5) {
      const [quantidade, precoUnitario, total] = linha.slice(-3).map(lerNumeroBR);
      const ucUar = (linha[3] || '-').trim() || '-';
      atual.materiais.push({
        codigo: linha[0],
        descricao: linha[1],
        unidade: linha[2],
        ucUar,
        classe: classeDoMaterial(ucUar),
        quantidade: isNaN(quantidade) ? 0 : quantidade,
        precoUnitario: isNaN(precoUnitario) ? 0 : precoUnitario,
        total: isNaN(total) ? 0 : total,
      });
    }
  }

  return { dataReferencia: lerDataReferencia(linhas), projetos, resumo };
};
