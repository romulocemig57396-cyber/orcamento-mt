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
| `src/utils/catalogoMateriais.js` | Catálogo de materiais da aba "Criar Item" (PROORC + TOD): união, divergência, busca e rótulo da fonte |
| `src/data/catalogoTod.json` · `catalogoTod.js` | Lista de materiais da TOD (dez/2024), conferida pelo responsável, e o acesso a ela |
| `src/components/SeloFonte.jsx` | Selo da fonte do preço de um material ("PROORC dd/mm/aaaa" ou "TOD dez/2024") |
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
| `src/proorc/editarReferencia.js` | Edição administrativa (TOD, manuais, fixos e parâmetros) e recálculo em cascata |
| `src/proorc/itensNovos.js` | Item novo a partir de um projeto do PROORC: sugestão, id, validação e criação |
| `src/proorc/propostasAdmin.js` | Recálculo e aprovação das propostas de item |
| `src/components/Importacao.jsx` | Parser do texto do parecer técnico (`analisarTexto`) + tela de importação |
| `src/components/EditarValores.jsx` | Tela "Editar valores" do modo administrador |
| `src/components/SeloPendente.jsx` | Selo e aviso de item pendente (sem custo cadastrado) |
| `src/components/ItemNovoDialog.jsx` | Diálogo "Criar item novo" da tela "Atualizar pelo PROORC" |
| `src/components/*.jsx` | Uma aba por componente |

## Biblioteca de custos
- Os custos vivem em `biblioteca.json`, versionado no repositório. Não há servidor: publicar uma atualização é commit + deploy.
- **Referências** (`2024`, `2022`, `2021`, e as geradas pelo PROORC, ex.: `2026-10`). A chave é **texto**; orçamentos antigos gravaram ano numérico e são normalizados na leitura. Uma referência é marcada como `atual` e é a padrão dos novos orçamentos.
- Cada item registra em `formacao` **como** o seu custo é formado, e cada origem tem o seu caminho de atualização:

  | Origem | O que é | Como é atualizada |
  |---|---|---|
  | `proorc` | Projeto-padrão do PROORC: (materiais + serviços) ÷ unidades por projeto. A regra `postoTransformacao` soma um religador adicional ao material e calcula a mão de obra como percentual dele. | Importação dos relatórios do PROORC (aba "Atualizar pelo PROORC"). O religador adicional e o % de mão de obra dos PT, pela tela "Editar valores". |
  | `tod` | TOD — Tabela de Orçamento da Distribuição (hoje dez/2024, seção 11, as 5 extensões rurais), em R$/km. A mão de obra da TOD já inclui mão de obra própria, serviços de terceiros e taxa de administração: **não** é recalculada pelo preço da US. | Tela "Editar valores": material, mão de obra e a fonte/versão da TOD. Nunca é procurada no PROORC. |
  | `formula` | A partir de outros itens: `redeExistenteMaisNova` (fator 0,33 × rede existente + rede nova) e `extensaoComAcrescimoMaoObra` (mesmo material, mão de obra × 1,05). | Recalculada automaticamente quando muda uma base ou um fator. Os fatores mudam pela tela "Editar valores". |
  | `maoDeObra` | Só mão de obra: US de construção × preço da US. | Recalculada com o preço da US de cada importação do PROORC. |
  | `manual` / `fixo` | `manual`: calculado manualmente pelo responsável (Mono CAA 4, Tri CAA 4, derivações). `fixo`: valor digitado, sem composição (relocações, seções, itens sem custo). | Tela "Editar valores": material, mão de obra e unitário (unitário = soma quando material e mão de obra são maiores que zero). |

- Uma referência nova pelo PROORC copia da anterior os itens `tod`, `manual` e `fixo`. A tela "Editar valores" monta uma referência em preparação a partir de uma base (uma instalada, ou a recém-montada pelo PROORC, pelo botão "Continuar editando valores"); só os itens que dependem do que foi alterado são recalculados, e nenhuma referência existente é alterada. As duas telas terminam em "Baixar biblioteca.json".
- **Item pendente:** um item é pendente numa referência quando o unitário dele ali é 0 (regra derivada do valor, sem campo próprio). Aparece em âmbar na Biblioteca, com o selo "Pendente — sem custo cadastrado", filtro e contagem; pode ser adicionado ao orçamento, mas com aviso de que entra com R$ 0,00, e a linha do item no orçamento leva o mesmo selo. A lista de cabos da diferença de cabo não oferece itens sem custo.
- **Item novo a partir de um projeto do PROORC:** na tela "Atualizar pelo PROORC", cada projeto do relatório sem ligação tem a ação "Criar item novo". O diálogo sugere nome, categoria e unidade pela descrição do projeto (o administrador edita) e gera um id no padrão da biblioteca (`equip_`, `ext_`, …), sem colidir. O item nasce `oficial`, com `formacao: { origem: 'proorc', projeto, unidadesPorProjeto }`, e a ligação vai para `mapeamentoProorc`, para que as próximas importações o atualizem como os demais. Custos e composição são calculados do projeto (materiais ÷ unidades e serviços ÷ unidades). Projeto sem serviços contratados: o diálogo avisa e pede a mão de obra, por percentual sobre o material (`regra: 'maoObraPercentual'`) ou por US informadas × preço da US do relatório (`regra: 'maoObraPorUS'`). A prévia lista esses itens à parte ("Itens novos criados a partir do PROORC"); a criação pode ser desfeita antes de gerar; o arquivo baixado leva o item, a ligação e a composição. A tela "Editar valores" não os edita (origem `proorc`). Se o projeto estava ligado a outro item, a ligação passa para o item novo, e o item antigo deixa de ser atualizado pelo PROORC.
- **Item não disponível numa referência:** um item só existe nas referências em que tem bloco de custos (ex.: um item novo não existe nas referências anteriores à sua criação). Ali ele aparece em cinza com o selo "Não disponível nesta referência", sem valores, e não pode ser adicionado (Biblioteca e Importação). É diferente de pendente, que é custo 0 numa referência em que o item existe.
- **Catálogo de materiais da aba "Criar Item"** (itens propostos pelos analistas): união de duas fontes.
  - **PROORC:** o `catalogoMateriais` da referência selecionada, gravado a cada importação. O selo é "PROORC dd/mm/aaaa", com a data tirada da fonte ou do rótulo da referência.
  - **TOD:** `src/data/catalogoTod.json`, a Lista Básica de Materiais da TOD (data-base 06/12/2024, selo "TOD dez/2024"). O arquivo foi conferido pelo responsável e **não é alterado pelo app**. Tem 2.089 itens; só os 2.023 de tipo `material` entram no catálogo (sucatas e serviços ficam de fora).
  - **Código nas duas fontes:** vira uma linha só. O preço padrão é o do PROORC e o da TOD aparece ao lado. Se os preços diferem em mais de R$ 0,005, aparece "preço diverge entre PROORC e TOD" e quem monta o item escolhe a fonte da linha. Nos relatórios de 07/10/2026, o único caso é o 00375259.
  - **Busca:** por palavras, sem diferenciar maiúsculas e acentos; por código com ou sem zeros à esquerda (a partir de 4 dígitos); filtros por unidade e por fonte; no máximo 50 resultados ("Refine a busca"); atraso de 250 ms.
  - **Cada material da composição grava** `codigo`, `descricao`, `unidade`, `quantidade`, `precoUnitario` (o preço usado), `fonte` (`proorc` ou `tod`) e `dataFonte` (`AAAA-MM-DD`). Material sem `fonte` (propostas e composições antigas) é `proorc`, sem migração.
  - **Classe dos materiais da TOD:** a TOD não informa a classe nem UC/UAR, então eles entram com classe `naoInformada` ("Não informada"), que tem subtotal próprio no diálogo "Composição".
  - **Na aprovação de propostas,** material `tod` é conferido na lista da TOD, e material `proorc`, no catálogo da referência.
  - **A TOD só alimenta a montagem de itens novos:** não muda o preço de nenhum item da biblioteca nem das referências, e não se confunde com a origem `tod` (extensões rurais em R$/km).
- Itens com o campo `verificacao` estão em verificação pelo responsável (hoje `equip_brt_167_urbano` e `equip_relig_tri_36kv`); só mudam por decisão dele.
- A referência 2021 é anterior a essas fórmulas: tem valores digitados que não as seguem.
- **Modo administrador** (`?admin=1` na URL): abas "Atualizar pelo PROORC", "Editar valores" e "Propostas de Itens". Não é segurança — o app é estático e público; só tira as telas de manutenção do caminho dos analistas.
- Os três relatórios do PROORC (`docs/proorc/`) **não** ficam no repositório, que é público. Os testes que dependem deles são ignorados quando os arquivos não estão presentes; a estrutura dos arquivos é coberta por planilhas montadas pelo próprio teste.

## Regras de negócio (não alterar sem pedido explícito)
- Categorias: CTI (cliente paga), CTC (Cemig paga), PP (Cemig paga % sobre a base; o restante vai para a Parcela Regulatória), Parcela Regulatória (coberta pelo ERD).
- **Diferença de cabo:** a obra é lançada com o cabo superior; a diferença de custo total para o cabo necessário vai para o CTC; o rateio do item usa a base = valor − diferença. Total da Obra não muda.
- **ERD** abate a Parcela Regulatória, limitado ao menor entre ERD, Parcela Regulatória e o que o cliente pagaria antes do ERD. **Não existe PFC negativa.**
- PFC = Total − CTC − PP − ERD aplicado (mínimo zero). Parcela D = CTC + PP.
- Cenário de referência (teste obrigatório): Total 7.361.977,53; CTC 556.081,53; PP 2.039.524,43; PFC 2.904.299,77; Parcela D 2.595.605,96.
- **Não alterar os valores das referências de custos que já existem** (2024, 2022, 2021), inclusive os dos itens marcados como "em verificação". Uma atualização do PROORC ou da tela "Editar valores" cria uma referência nova. A única exceção é uma decisão explícita do responsável, registrada como exceção documentada (com o motivo) em `src/test/bibliotecaEquivalencia.test.js` — ex.: rodada 3, R1 (retirada RDP 3ᴓ 12 → 28,906) e R2 (Seção 13,8 kV = 750).
- **Data Base = data de emissão** do orçamento. A validade é Data Base + 120 dias. PDFs e Excel imprimem "Emissão" e "Validade" pela Data Base, nunca pela data de hoje.
- A aba **Materiais Auxiliares foi removida** (rodada 3, R4). Orçamentos antigos com `materiaisAuxiliares` abrem normalmente; o campo é descartado na leitura.

## Convenções
- Tudo em português do Brasil: código de domínio, textos de tela, comentários, mensagens de commit.
- Itens da biblioteca devem ser referenciados pelo `id` (ex.: `recon_caa4_1_0`), **nunca** pelo `tipo`, porque há tipos repetidos entre categorias.
- Valores monetários internos em R$ (reais); a biblioteca está em R$ mil e é multiplicada por 1000 ao entrar no orçamento.
- A referência de custos usada por um item fica gravada nele (`anoReferencia`); nada deve fixar `2024` no código.
- Leitura de relatório e cálculo ficam em funções puras testáveis (`src/proorc/`); os componentes só exibem.
- **Testes não dependem do `biblioteca.json` instalado**, que cresce a cada atualização (referências e itens novos). `src/test/setup.js` substitui o arquivo, em todos os testes, pela biblioteca fixa `src/test/fixtures/biblioteca-base.json` (a da `main` no commit 5826a17). Só `src/test/bibliotecaInstalada.test.js` lê o arquivo instalado do disco, e confere apenas regras permanentes: 2024/2022/2021 idênticas à fixture, ids únicos, origens válidas, mapeamento do PROORC íntegro, uma única referência atual, item presente na atual e ausente só nas referências anteriores à sua criação, fórmulas consistentes em cada referência — sem contagens fixas.
- Teste que depende de `docs/proorc/` usa `describe.skipIf`, e a leitura dos arquivos tem que ficar dentro de `beforeAll` ou do próprio teste: o corpo do `describe` roda mesmo quando os testes são pulados, e a falta dos arquivos quebraria a coleta no CI.
- Formatação sempre pt-BR (`Intl.NumberFormat('pt-BR')`, `Intl.DateTimeFormat('pt-BR')`).
- A fonte padrão do jsPDF não tem os símbolos "≈" e "→": nos PDFs usar "aprox." e "p/".
- Orçamentos já salvos no navegador dos usuários precisam continuar abrindo: toda mudança de formato de dados exige migração na leitura do `localStorage`.

## Não fazer
- Não rodar `npm audit fix` nem `npm audit fix --force`.
- Não adicionar dependências sem perguntar.
- Não alterar `vite.config.js`, `package.json` (scripts/deploy) nem as chaves do `localStorage`.
- Não fazer `git push` nem `npm run deploy` — o responsável faz após revisar.
