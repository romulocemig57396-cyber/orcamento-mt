/* ─────────────────────────────────────────────────────────────────────────────
   gerarBibliotecaJson.js — grava a nova referência no formato do arquivo

   A saída substitui src/data/biblioteca.json no repositório. A serialização é
   estável (mesma ordem de chaves, indentação de 2) para o diff do git mostrar
   só o que mudou de verdade.

   As referências que já existem não são tocadas.
   ───────────────────────────────────────────────────────────────────────────── */

const v = (x) => parseFloat(x) || 0;
const CAMPOS = ['material', 'maoObra', 'usConstr', 'unitario'];

// Arredonda para 8 casas: o cálculo gera dízimas que não significam nada em R$ mil
const arredondar = (n) => Math.round(v(n) * 1e8) / 1e8;

export const aplicarNovaReferencia = ({
  biblioteca,
  resultado,
  chave,
  rotulo,
  fonte,
  atual = true,
  itensNovos = [],
}) => {
  const chaveNova = String(chave).trim();
  if (!chaveNova) throw new Error('Informe a chave da nova referência.');
  if (biblioteca.referencias.some(r => r.chave === chaveNova)) {
    throw new Error(`A referência "${chaveNova}" já existe na biblioteca.`);
  }

  const referencias = [
    { chave: chaveNova, rotulo: String(rotulo || chaveNova).trim(), fonte: String(fonte || '').trim(), atual: !!atual },
    ...biblioteca.referencias.map(r => (atual ? { ...r, atual: false } : { ...r })),
  ];

  // Itens novos criados a partir de projetos do PROORC (R9): entram no arquivo
  // só com a referência nova, e a ligação com o projeto vai para o mapeamento.
  const idsExistentes = new Set(biblioteca.itens.map(i => i.id));
  const novos = itensNovos
    .filter(i => !idsExistentes.has(i.id))
    .map(i => ({ ...i, custos: {}, composicoes: {} }));

  const itens = [...biblioteca.itens, ...novos].map(item => {
    const custosNovos = resultado.custos[item.id];
    if (!custosNovos) return item;

    const bloco = {};
    CAMPOS.forEach(c => { bloco[c] = arredondar(custosNovos[c]); });
    const linha = resultado.previa.find(l => l.id === item.id);
    if (linha?.naoAtualizado) bloco.naoAtualizadoPeloProorc = true;

    const composicao = resultado.composicoes[item.id];
    return {
      ...item,
      custos: { ...item.custos, [chaveNova]: bloco },
      composicoes: composicao
        ? { ...item.composicoes, [chaveNova]: composicao }
        : { ...item.composicoes },
    };
  });

  const ligacoesNovas = {};
  novos.forEach(i => {
    if (!i.formacao?.projeto) return;
    ligacoesNovas[i.formacao.projeto] = {
      item: i.id,
      unidadesPorProjeto: v(i.formacao.unidadesPorProjeto) || 1,
      situacao: 'item novo',
      descricao: resultado.composicoes[i.id]?.descricaoProjeto || '',
    };
  });

  return {
    ...biblioteca,
    referencias,
    mapeamentoProorc: { ...biblioteca.mapeamentoProorc, ...ligacoesNovas },
    precosUS: { ...biblioteca.precosUS, [chaveNova]: resultado.precosUS },
    catalogoMateriais: { ...biblioteca.catalogoMateriais, [chaveNova]: resultado.catalogoMateriais },
    itens,
  };
};

export const serializarBiblioteca = (biblioteca) => `${JSON.stringify(biblioteca, null, 2)}\n`;

// Entrega o arquivo para o navegador baixar
export const baixarBiblioteca = (biblioteca, nomeArquivo = 'biblioteca.json') => {
  const blob = new Blob([serializarBiblioteca(biblioteca)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
