# Orçamento MT — contexto do projeto

Sistema web da Cemig para elaborar orçamentos de obras de Média Tensão (MT) em pedidos de conexão de clientes. Usado pela equipe de análise de pedidos de conexão em MT.

## Stack
- React 18 + Vite 5, JavaScript (JSX), sem TypeScript. Estilos inline.
- jsPDF + jspdf-autotable (PDF), SheetJS `xlsx` (Excel, botão desabilitado).
- Persistência: `localStorage`, chave `orcamento_mt_app`, um orçamento por navegador.
- Testes: Vitest + jsdom + Testing Library (`src/test/`).
- Deploy: GitHub Pages (`npm run deploy`, `base: '/orcamento-mt/'`).

## Comandos
- `npm run dev` — servidor local
- `npm run test:run` — todos os testes (usar sempre antes de concluir qualquer tarefa)
- `npm run build` — build de produção

## Mapa do código
| Arquivo | Responsabilidade |
|---|---|
| `src/hooks/useOrcamento.js` | Estado do orçamento, persistência e recálculo de todos os derivados |
| `src/utils/calculos.js` | Regras de cálculo: totais por categoria, limite do ERD, PFC, prazo, validade |
| `src/utils/diferencaCabo.js` | Diferença de cabo por item (cabo superior × cabo necessário) |
| `src/utils/postes.js` | Conversão km ↔ postes (1 poste = 40 m) e formatação de quantidade |
| `src/utils/gerarTexto.js` | Memorial descritivo |
| `src/utils/exportar.js` | PDF do orçamento, PDF do rateio e Excel |
| `src/data/tabelaCustos.js` | Biblioteca de custos (70 itens, R$ mil por unidade, anos 2024/2022/2021) |
| `src/components/Importacao.jsx` | Parser do texto do parecer técnico (`analisarTexto`) + tela de importação |
| `src/components/*.jsx` | Uma aba por componente |

## Regras de negócio (não alterar sem pedido explícito)
- Categorias: CTI (cliente paga), CTC (Cemig paga), PP (Cemig paga % sobre a base; o restante vai para a Parcela Regulatória), Parcela Regulatória (coberta pelo ERD).
- **Diferença de cabo:** a obra é lançada com o cabo superior; a diferença de custo total para o cabo necessário vai para o CTC; o rateio do item usa a base = valor − diferença. Total da Obra não muda.
- **ERD** abate a Parcela Regulatória, limitado ao menor entre ERD, Parcela Regulatória e o que o cliente pagaria antes do ERD. **Não existe PFC negativa.**
- PFC = Total − CTC − PP − ERD aplicado (mínimo zero). Parcela D = CTC + PP.
- Cenário de referência (teste obrigatório): Total 7.361.977,53; CTC 556.081,53; PP 2.039.524,43; PFC 2.904.299,77; Parcela D 2.595.605,96.

## Convenções
- Tudo em português do Brasil: código de domínio, textos de tela, comentários, mensagens de commit.
- Itens da biblioteca devem ser referenciados pelo `id` (ex.: `recon_caa4_1_0`), **nunca** pelo `tipo`, porque há tipos repetidos entre categorias.
- Valores monetários internos em R$ (reais); a biblioteca está em R$ mil e é multiplicada por 1000 ao entrar no orçamento.
- Formatação sempre pt-BR (`Intl.NumberFormat('pt-BR')`, `Intl.DateTimeFormat('pt-BR')`).
- A fonte padrão do jsPDF não tem os símbolos "≈" e "→": nos PDFs usar "aprox." e "p/".
- Orçamentos já salvos no navegador dos usuários precisam continuar abrindo: toda mudança de formato de dados exige migração na leitura do `localStorage`.

## Não fazer
- Não rodar `npm audit fix` nem `npm audit fix --force`.
- Não adicionar dependências sem perguntar.
- Não alterar `vite.config.js`, `package.json` (scripts/deploy) nem a chave do `localStorage`.
- Não fazer `git push` nem `npm run deploy` — o responsável faz após revisar.
