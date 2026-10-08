# Orçamento MT — contexto do projeto

Sistema web da Cemig para elaborar orçamentos de obras de Média Tensão (MT) em pedidos de conexão de clientes. Usado pela equipe de análise de pedidos de conexão em MT.

## Stack
- React 18 + Vite 5, JavaScript (JSX), sem TypeScript. Estilos inline.
- jsPDF + jspdf-autotable (PDF), SheetJS `xlsx` (Excel e leitura dos relatórios do PROORC).
- Persistência: `localStorage`. Chave `orcamento_mt_app` (um orçamento por navegador) e `orcamento_mt_propostas` (propostas de itens, separadas do orçamento).
- Testes: Vitest + jsdom + Testing Library (`src/test/`).
- Deploy: GitHub Pages, `base: '/orcamento-mt/'`. A publicação é automática a cada push na `main` (`.github/workflows/deploy.yml`, que roda testes e build antes); `npm run deploy` publica à mão.

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
| `src/utils/datas.js` | Datas de calendário como texto `AAAA-MM-DD`, em horário local |
| `src/utils/numeros.js` | Leitura de número no formato brasileiro (`lerNumeroBR`) |
| `src/utils/migracao.js` | Migração dos orçamentos salvos em formatos antigos, na leitura do `localStorage` |
| `src/utils/tipoAtendimento.js` | Códigos LN/AC/RF e os textos antigos gravados por extenso |
| `src/utils/regrasImportacao.js` | Regras de mapeamento do texto do parecer → itens da biblioteca |
| `src/utils/validacoes.js` | Campos obrigatórios |
| `src/utils/gerarTexto.js` | Memorial descritivo |
| `src/utils/exportar.js` | PDF do orçamento, PDF do rateio e Excel |
| `src/utils/propostas.js` | Propostas de item: cálculo, validação, armazenamento e arquivo |
| `src/utils/modoAdmin.js` | Modo administrador por `?admin=1` |
| `src/data/biblioteca.json` | **A biblioteca de custos**: itens, referências, preços da US, catálogo de materiais e mapeamento dos projetos do PROORC |
| `src/data/biblioteca.js` | Acesso à biblioteca: referências, custos, composições, filtros |
| `src/data/tabelaCustos.js` | Camada de compatibilidade; reexporta a API antiga de `biblioteca.js` |
| `src/proorc/planilha.js` | Base da leitura dos relatórios: linhas, cabeçalho de projeto, data de referência |
| `src/proorc/lerSintetico.js` · `lerAnalitico.js` · `lerServicos.js` | Um leitor por relatório do PROORC |
| `src/proorc/consolidar.js` | Une os três relatórios por projeto e gera os avisos |
| `src/proorc/formacao.js` | Cálculo do custo de um item por origem de formação |
| `src/proorc/calcularReferencia.js` | Monta uma nova referência de custos e a prévia |
| `src/proorc/gerarBibliotecaJson.js` | Grava a nova referência no arquivo e oferece o download |
| `src/proorc/explicarFormacao.js` | Descreve em números como o custo foi formado (tela de composição) |
| `src/proorc/propostasAdmin.js` | Recálculo e aprovação das propostas de item |
| `src/components/Importacao.jsx` | Parser do texto do parecer técnico (`analisarTexto`) + tela de importação |
| `src/components/*.jsx` | Uma aba por componente |

## Biblioteca de custos
- Os custos vivem em `biblioteca.json`, versionado no repositório. Não há servidor: publicar uma atualização é commit + deploy.
- **Referências** (`2024`, `2022`, `2021`, e as geradas pelo PROORC, ex.: `2026-10`). A chave é **texto**; orçamentos antigos gravaram ano numérico e são normalizados na leitura. Uma referência é marcada como `atual` e é a padrão dos novos orçamentos.
- Cada item registra em `formacao` **como** o seu custo é formado, numa de 4 origens:
  - `proorc` — projeto-padrão do PROORC: (materiais + serviços) ÷ unidades por projeto. A regra `postoTransformacao` soma um religador adicional ao material e calcula a mão de obra como percentual dele.
  - `formula` — a partir de outros itens: `redeExistenteMaisNova` (fator × rede existente + rede nova) e `extensaoComAcrescimoMaoObra` (mesmo material, mão de obra × fator).
  - `maoDeObra` — só mão de obra: US de construção × preço da US.
  - `fixo` — valor digitado, sem composição.
- A referência 2021 é anterior a essas fórmulas: tem valores digitados que não as seguem.
- **Modo administrador** (`?admin=1` na URL): abas "Atualizar pelo PROORC" e "Propostas de Itens". Não é segurança — o app é estático e público; só tira as telas de manutenção do caminho dos analistas.
- Os três relatórios do PROORC (`docs/proorc/`) **não** ficam no repositório, que é público. Os testes que dependem deles são ignorados quando os arquivos não estão presentes; a estrutura dos arquivos é coberta por planilhas montadas pelo próprio teste.

## Regras de negócio (não alterar sem pedido explícito)
- Categorias: CTI (cliente paga), CTC (Cemig paga), PP (Cemig paga % sobre a base; o restante vai para a Parcela Regulatória), Parcela Regulatória (coberta pelo ERD).
- **Diferença de cabo:** a obra é lançada com o cabo superior; a diferença de custo total para o cabo necessário vai para o CTC; o rateio do item usa a base = valor − diferença. Total da Obra não muda.
- **ERD** abate a Parcela Regulatória, limitado ao menor entre ERD, Parcela Regulatória e o que o cliente pagaria antes do ERD. **Não existe PFC negativa.**
- PFC = Total − CTC − PP − ERD aplicado (mínimo zero). Parcela D = CTC + PP.
- Cenário de referência (teste obrigatório): Total 7.361.977,53; CTC 556.081,53; PP 2.039.524,43; PFC 2.904.299,77; Parcela D 2.595.605,96.
- **Não alterar os valores das referências de custos que já existem** (2024, 2022, 2021), inclusive os dos itens marcados como "em verificação". Uma atualização do PROORC cria uma referência nova.

## Convenções
- Tudo em português do Brasil: código de domínio, textos de tela, comentários, mensagens de commit.
- Itens da biblioteca devem ser referenciados pelo `id` (ex.: `recon_caa4_1_0`), **nunca** pelo `tipo`, porque há tipos repetidos entre categorias.
- Valores monetários internos em R$ (reais); a biblioteca está em R$ mil e é multiplicada por 1000 ao entrar no orçamento.
- A referência de custos usada por um item fica gravada nele (`anoReferencia`); nada deve fixar `2024` no código.
- Leitura de relatório e cálculo ficam em funções puras testáveis (`src/proorc/`); os componentes só exibem.
- Formatação sempre pt-BR (`Intl.NumberFormat('pt-BR')`, `Intl.DateTimeFormat('pt-BR')`).
- A fonte padrão do jsPDF não tem os símbolos "≈" e "→": nos PDFs usar "aprox." e "p/".
- Orçamentos já salvos no navegador dos usuários precisam continuar abrindo: toda mudança de formato de dados exige migração na leitura do `localStorage`.

## Não fazer
- Não rodar `npm audit fix` nem `npm audit fix --force`.
- Não adicionar dependências sem perguntar.
- Não alterar `vite.config.js`, `package.json` (scripts/deploy) nem as chaves do `localStorage`.
- Não fazer `git push` nem `npm run deploy` — o responsável faz após revisar.
