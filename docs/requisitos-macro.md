# Documento de Requisitos Macro — Sistema de Orçamento MT

> Documento de registro formal da solução perante a TI da Cemig, produzido no âmbito da adequação às diretrizes corporativas (spec `adequacao-diretrizes-cemig`).
> Atende aos critérios R14.1 (seções obrigatórias não vazias), R5.1 (decisão de persistência), R3.3 (divergências do padrão serverless e aprovações) e R11.1 (classificação da informação, base legal, finalidade e retenção de dados pessoais).

| Campo | Valor |
| --- | --- |
| Nome da solução | Sistema de Orçamento MT (Sistema_Orcamento_MT) |
| Repositório de destino | https://dev.azure.com/cemig/Orcamento%20MT (Azure DevOps, organização "cemig") |
| Nuvem homologada | Microsoft Azure |
| Provedor de identidade | Microsoft Entra ID |
| Classificação da informação | Interno / Confidencial (ver seção "Dados tratados") |
| Versão deste documento | 1.0.0 |

---

## 1. Objetivo

O Sistema de Orçamento MT é a aplicação web corporativa de criação e gestão de orçamentos de obras de distribuição de energia em Média Tensão (MT). Ele apoia o atendimento a solicitações de obra, calculando os custos técnicos (CT), participação do particular (PP), ERD, PFC do cliente e demais componentes financeiros, produzindo o memorial de cálculo e consolidando os dados no formato PROORC.

O objetivo desta adequação é transformar a solução — hoje uma SPA React executada 100% no navegador, com persistência em `localStorage`, sem autenticação e publicada no GitHub Pages — em uma solução corporativa aderente às diretrizes da Cemig:

- Identidade e acesso via Microsoft Entra ID (autenticação OIDC + PKCE e autorização RBAC por grupos).
- Hospedagem em nuvem homologada (Azure) seguindo o padrão *serverless first*, em Resource Group dedicado.
- Acesso exclusivamente pela rede interna corporativa, sem exposição à internet pública.
- Infraestrutura provisionada por código (IaC) reproduzível e auditável entre ambientes.
- Esteira CI/CD no Azure DevOps com gates de segurança obrigatórios.
- Observabilidade (logs, métricas e alertas) com mascaramento de dados pessoais.
- Conformidade com a LGPD no tratamento dos dados de atendimento.
- Governança de repositório no Azure DevOps e versionamento semântico de releases.

A lógica de negócio existente (cálculos CT/PP/ERD/PFC, memorial e consolidação PROORC), composta por funções JavaScript puras, é preservada integralmente — a adequação não altera nenhum resultado financeiro já produzido.

## 2. Escopo

### 2.1 Dentro do escopo

- **Migração de hospedagem:** do GitHub Pages para Azure App Service (Linux) com entrada por Private Endpoint e saída por VNet Integration, encerrando a publicação no GitHub Pages.
- **Migração de repositório:** do GitHub para o Azure DevOps Repos, preservando o histórico de commits, com cutover para origem única e congelamento do repositório GitHub.
- **Autenticação e autorização corporativas:** integração ao Entra ID (OIDC + PKCE) e RBAC baseado em grupos, com negação por padrão.
- **Introdução de camada de API serverless:** necessária porque a validação de token, o RBAC server-side e a rede privada sem IP público tornam inviável manter a aplicação 100% client-side.
- **Restrição de rede:** acesso exclusivo pela rede interna corporativa (ExpressRoute/VPN), sem IP público, TLS 1.2+ obrigatório, endpoints privados entre serviços. Por não haver exposição à internet pública, não há camada de borda externa com WAF/CDN.
- **Persistência gerenciada:** evolução de `localStorage` para `localStorage` (cache) + Cosmos DB serverless (fonte da verdade). Ver seção 7.1.
- **Infraestrutura como código:** Bicep parametrizado para dev/hml/prd, com state remoto, versionamento e bloqueio contra execuções concorrentes.
- **Esteira CI/CD:** Azure DevOps Pipelines com estágios build → segurança (SAST/SCA/segredos) → testes → deploy hml → DAST → deploy prd, com gates e aprovação manual.
- **Gestão de segredos:** Azure Key Vault + Managed Identity, sem segredos em código, config, variáveis em texto claro ou logs.
- **Observabilidade:** Application Insights / Azure Monitor com logs estruturados, métricas, alertas e mascaramento de dados pessoais.
- **Conformidade LGPD:** classificação dos dados, isolamento entre ambientes, anonimização de dados de produção em dev/hml e atendimento a direitos do titular.
- **Versionamento semântico:** SemVer, tags de release e CHANGELOG automatizados.
- **Responsividade:** interface validada em celular, tablet e desktop.
- **Documentação:** este Documento de Requisitos Macro e o registro das decisões nas diretrizes de onboarding da pasta `diretrizes/`.

### 2.2 Fora do escopo

- Alteração das regras de negócio e das fórmulas de cálculo existentes (CT/PP/ERD/PFC, memorial, PROORC) — são preservadas.
- Exposição da aplicação à internet pública ou a usuários externos.
- Camada de borda externa (WAF/CDN), dispensada por não haver exposição pública.
- Integrações com sistemas de terceiros não citados neste documento.

## 3. Público usuário

A solução é de uso corporativo interno, acessada exclusivamente por colaboradores da Cemig autenticados pelo Entra ID e autorizados por grupo corporativo. Não há cadastro ou senha próprios da aplicação, nem acesso anônimo ou externo.

Os perfis de autorização (Papel_Aplicacao) são mapeados a partir de grupos do Entra ID, com negação por padrão:

| Papel | Grupo de origem (Entra ID) | Permissões | Perfil típico |
| --- | --- | --- | --- |
| leitor | grupo de leitores (a definir no Entra ID) | `orcamentos:ler` | Consulta de orçamentos |
| editor | grupo de editores (a definir no Entra ID) | `orcamentos:ler`, `orcamentos:gravar`, `titular:registrar` | Técnicos/analistas que elaboram e atualizam orçamentos |
| admin | grupo de administradores (a definir no Entra ID) | `orcamentos:ler`, `orcamentos:gravar`, `orcamentos:remover`, `titular:registrar` | Administração da solução |

A sessão recebe a união das permissões de todos os papéis mapeados. Usuário autenticado sem papel mapeável recebe recusa de acesso ("sem permissões"). Os GUIDs dos grupos do Entra ID são **(a validar com a equipe de identidade/negócio)** e serão versionados como parâmetro de IaC/Key Vault.

## 4. Dados tratados

### 4.1 Natureza dos dados

A solução trata dados de orçamento de obras de distribuição em MT, que incluem **dados de atendimento** — cliente e Nota de Serviço (NS), tipo de atendimento — e os dados técnicos e financeiros derivados (itens de obra, categorias, valores, percentuais, ERD, MUSD, totais da obra, CT, PP, parcela regulatória, PFC do cliente, valor total, data-base e data de validade).

Os dados de atendimento (cliente, NS) **podem conter dados pessoais** de pessoa natural identificada ou identificável, nos termos da LGPD. Nesses casos, o tratamento está sujeito aos controles descritos nesta seção.

### 4.2 Classificação da informação (R11.1)

| Item | Classificação |
| --- | --- |
| Dados de orçamento (geral) | **Interno** |
| Dados de atendimento com dado pessoal (cliente/NS de pessoa natural) | **Confidencial** |

A informação é classificada como **interno** por padrão e **confidencial** quando contém dado pessoal de pessoa natural, por envolver identificação de cliente associado a obra e valores. A classificação é materializada no documento persistido pelo campo `classificacao`. A revisão final da classificação dos campos é **(a validar com DPO/negócio)**.

### 4.3 Base legal, finalidade e retenção dos dados pessoais (R11.1)

| Dimensão | Definição | Observação |
| --- | --- | --- |
| **Base legal (LGPD)** | Execução de procedimentos preliminares relacionados a contrato e cumprimento de obrigação legal/regulatória do setor de distribuição de energia (art. 7º, V e II, da LGPD), e, quando aplicável, legítimo interesse do controlador (art. 7º, IX) | A hipótese definitiva por campo é **(a validar com DPO/negócio)** |
| **Finalidade** | Elaboração, cálculo e gestão de orçamentos de obras de distribuição de energia em MT, incluindo participação financeira do particular, ERD e consolidação PROORC | Uso restrito ao propósito do atendimento à solicitação de obra |
| **Prazo de retenção** | **60 meses** (5 anos) após a conclusão ou cancelamento do atendimento | Prazo proposto alinhado a necessidades de auditoria/regulatórias; valor definitivo **(a validar com DPO/negócio)** |

### 4.4 Controles aplicados aos dados

- **Criptografia em repouso** com robustez ≥ AES-256 no armazenamento gerenciado (nativa do Cosmos DB) — R5.2.
- **Segregação por ambiente**: dados de um ambiente não são legíveis nem acessíveis a partir de outro; isolamento forte por contas/recursos distintos por ambiente — R5.3, R11.2.
- **Mascaramento de dado pessoal** em logs e mensagens de erro, de forma não reversível — R10.4.
- **Anonimização** obrigatória de dados de produção usados em dev/hml, impedindo reidentificação; rejeição do uso de dados de produção não anonimizados — R11.3.
- **Identificação por `proprietarioOid`** (object id do Entra ID), evitando persistir dado pessoal direto como chave e servindo de base para os direitos do titular e auditoria — R10.1, R11.4.
- **Direitos do titular** (acesso, correção, exclusão, portabilidade) registrados e atendidos em até 15 dias corridos; recusa registra o motivo e preserva o dado — R11.4, R11.5.

## 5. Integrações

| Integração | Tipo | Finalidade | Requisitos |
| --- | --- | --- | --- |
| Microsoft Entra ID | Identidade (OIDC + PKCE) | Autenticação dos usuários e fornecimento dos grupos para RBAC; validação de token (emissor, audiência, assinatura, expiração) contra JWKS do tenant | R1, R2 |
| Azure App Service (Linux) | Hospedagem gerenciada (PaaS) | Servir a SPA e a API com entrada por Private Endpoint (sem IP público) e saída por VNet Integration, HTTPS/TLS 1.2+ | R3, R4 |
| Azure Cosmos DB (serverless) | Persistência gerenciada | Armazenar os orçamentos como fonte da verdade, criptografados em repouso e segregados por ambiente, acessado por Private Endpoint | R5 |
| Azure Key Vault | Cofre de segredos | Guardar credenciais, chaves e connection strings, recuperadas em runtime via Managed Identity | R9 |
| Application Insights / Azure Monitor | Observabilidade | Receber logs estruturados, métricas e disparar alertas | R10 |
| Azure DevOps (Repos + Pipelines) | Repositório e CI/CD | Origem única do código e esteira de entrega com gates de segurança | R7, R8 |
| Rede corporativa (ExpressRoute / VPN) | Rede privada | Único caminho de acesso dos usuários internos à solução | R4 |

A comunicação entre serviços internos ocorre por endpoints privados na VNet, sem trânsito pela internet pública. A SPA apenas obtém e anexa o token; nenhuma garantia de segurança é confiada ao front — a validação de token e o RBAC residem na API.

## 6. Requisitos não funcionais

### 6.1 Segurança e identidade

- Autenticação exclusiva via Entra ID (OIDC + PKCE); sem cadastro/senha próprios; sessão encerrada após 30 min de inatividade; timeout de 30 s no fluxo de autenticação (R1).
- Autorização RBAC por grupos com negação por padrão; permissões como união dos papéis mapeados; registro das tentativas negadas (R2).
- Segredos exclusivamente no Key Vault, recuperados via Managed Identity; código e histórico livres de segredos em texto claro; varredura de segredos no pipeline (R9).

### 6.2 Rede e disponibilidade

- Acesso exclusivo pela rede interna corporativa; sem IP público; TLS 1.2+ obrigatório, conexões inferiores recusadas; endpoints privados entre serviços (R4).
- Gravação no armazenamento gerenciado concluída em ≤ 5 s sob rede corporativa disponível (R5.5).
- Alertas de anomalia operacional gerados em ≤ 60 s após a detecção (R10.3).

### 6.3 Confiabilidade e integridade

- Gravação atômica dos orçamentos: em falha, o estado anterior é preservado sem gravação parcial (R5.4).
- Preservação integral dos cálculos financeiros existentes na migração (invariantes: PFC do cliente nunca negativa; ERD coberto ≤ mínimo entre ERD disponível, parcela regulatória e PFC antes do ERD; consistência material 60% / serviços 40% do total da obra).
- Degradação graciosa de telemetria: falha de observabilidade não interrompe a operação de negócio (R10.5).

### 6.4 Operação e governança

- IaC reproduzível e auditável, parametrizado para dev/hml/prd, com state remoto, versionamento e bloqueio contra execuções concorrentes (R6).
- Pipeline com gates obrigatórios e aprovação manual de produção que expira em 72 h (R7).
- Repositório único no Azure DevOps com proteção de branch `main` (PR obrigatório, pipeline aprovado, ao menos 1 revisão) e estrutura de pastas `src`/`tests`/`infra`/`pipeline`/`docs` (R8).
- Versionamento semântico MAJOR.MINOR.PATCH com tags e CHANGELOG por release (R12).

### 6.5 Observabilidade

- Logs estruturados com carimbo de tempo UTC, nível de severidade, identificador de correlação e identificador do componente de origem (R10.1).
- Métricas de taxa de requisições, taxa de erros e latência por operação (R10.2).

### 6.6 Usabilidade

- Interface responsiva utilizável sem rolagem horizontal em celular (≤ 480 px), tablet (481–1024 px) e desktop (> 1024 px); conteúdo legível e acionável abaixo de 320 px (R13).

### 6.7 Conformidade

- Tratamento de dados pessoais conforme LGPD (classificação, base legal, finalidade, retenção, isolamento, anonimização e direitos do titular) — R11.

## 7. Decisões registradas

### 7.1 Decisão de persistência (R5.1)

**Opção adotada: (b) complementar o `localStorage` com armazenamento gerenciado na Azure.**

- `localStorage` do navegador permanece como **cache local/offline** (rascunho e resiliência a oscilação de rede).
- **Azure Cosmos DB serverless** passa a ser a **fonte da verdade** dos dados de orçamento.

Justificativa: a opção (b) preserva a experiência atual (trabalho offline/rascunho) e satisfaz os controles corporativos para o dado persistido — criptografia em repouso ≥ AES-256 (R5.2, nativa do Cosmos DB), segregação por ambiente (R5.3), gravação atômica com preservação do estado anterior em falha (R5.4) e conclusão em ≤ 5 s em rede corporativa (R5.5). Cosmos DB serverless escala a zero e cobra por consumo, aderente ao *serverless first* (R3.2). Exige sincronização e resolução de conflito entre o cache local e a fonte da verdade.

As opções (a) manter exclusivamente o `localStorage` e (c) substituir totalmente por armazenamento gerenciado foram avaliadas e descartadas: (a) não atende aos controles corporativos e mantém o dado preso ao navegador, sem backup nem auditoria; (c) perde a edição offline e torna a transição mais abrupta e arriscada.

### 7.2 Padrão serverless, divergências e aprovações (R3.3)

A maior parte da hospedagem é **serverless** e aderente ao *serverless first* (R3.2):

- **Azure Cosmos DB serverless** para a persistência (escala a zero, cobrança por uso).
- **Azure Key Vault**, **Application Insights** e demais componentes gerenciados.
- **Azure App Service (Linux)** para servir a SPA e a API — hospedagem gerenciada (PaaS) com entrada por Private Endpoint e saída por VNet Integration.

**Divergência do padrão serverless a registrar (R3.3):**

| Componente não serverless | Justificativa | Aprovação |
| --- | --- | --- |
| Azure App Service (Linux) — plano dedicado (PaaS, não escala a zero) | A opção serverless preferida (Azure Container Apps em ambiente VNet interno) exige uma subnet de infraestrutura **/23**, acima do limite corporativo de **/25 por subnet** imposto pela equipe de Redes (que cria as subnets manualmente). O App Service integra-se à VNet por uma subnet dedicada de **/26** (dentro do limite), mantendo entrada por Private Endpoint sem IP público (R4) e HTTPS/TLS 1.2+. É a plataforma viável que concilia o acesso privado com a restrição de endereçamento. | *(pendente — a validar/ratificar com a Arquitetura)* |

O Azure Static Web Apps foi descartado para o front por limitação de rede privada (incompatível com R4). Caso a Arquitetura homologue uma exceção de endereçamento (subnet /23) para Container Apps, a topologia serverless anterior volta a ser viável e esta seção deve ser atualizada.

### 7.3 Classificação, base legal, finalidade e retenção (R11.1)

Registradas na seção 4 (Dados tratados), itens 4.2 e 4.3. Resumo: classificação **interno** por padrão e **confidencial** quando houver dado pessoal; base legal associada a procedimentos contratuais e obrigação legal/regulatória do setor; finalidade de elaboração e gestão de orçamentos de obras de distribuição; retenção proposta de **60 meses**. Os itens marcados como "(a validar com DPO/negócio)" dependem de validação do encarregado de dados e da área de negócio.

## 8. Critérios de aceite

A solução é considerada adequada às diretrizes quando os critérios abaixo forem satisfeitos (rastreabilidade aos requisitos entre parênteses):

1. Acesso autenticado exclusivamente pelo Entra ID (OIDC + PKCE), sem cadastro/senha próprios, com sessão expirando em 30 min de inatividade (R1).
2. Autorização RBAC por grupos com negação por padrão e registro das tentativas negadas (R2).
3. Hospedagem exclusivamente em Azure, serverless first, em Resource Group dedicado, sem publicação no GitHub Pages; divergências e aprovações registradas neste documento (R3, seção 7.2).
4. Acesso exclusivo pela rede interna corporativa, sem IP público, com TLS 1.2+ e endpoints privados (R4).
5. Persistência conforme a decisão registrada — `localStorage` como cache + Cosmos DB serverless como fonte da verdade — com criptografia em repouso ≥ AES-256, segregação por ambiente, gravação atômica e conclusão em ≤ 5 s (R5, seção 7.1).
6. Infraestrutura 100% por IaC parametrizado para dev/hml/prd, com state remoto versionado e bloqueio de concorrência (R6).
7. Pipeline no Azure DevOps com estágios na ordem definida, gates de segurança, bloqueio por severidade crítica e aprovação manual de produção com expiração em 72 h (R7).
8. Repositório único no Azure DevOps com histórico preservado, proteção de branch `main`, estrutura de pastas obrigatória e README com as seções exigidas (R8).
9. Segredos exclusivamente no Key Vault via Managed Identity; código e histórico livres de segredos em texto claro; varredura no pipeline (R9).
10. Observabilidade com logs estruturados, métricas, alertas em ≤ 60 s e mascaramento de dado pessoal (R10).
11. Conformidade LGPD: classificação, base legal, finalidade e retenção registradas; isolamento entre ambientes; anonimização de dados de produção em dev/hml; direitos do titular atendidos em até 15 dias corridos (R11, seção 4).
12. Versionamento semântico com tags e CHANGELOG por release (R12).
13. Interface responsiva validada em celular, tablet e desktop (R13).
14. Este Documento de Requisitos Macro criado com as sete seções obrigatórias não vazias e as decisões R5.1, R3.3 e R11.1 registradas; campos "(preencher)" das diretrizes de onboarding preenchidos ou sinalizados como pendentes (R14).

---

### Itens pendentes de validação

- GUIDs dos grupos do Entra ID por papel (seção 3) — **(a validar com a equipe de identidade/negócio)**.
- Classificação definitiva por campo e hipótese de base legal da LGPD por campo (seção 4.2, 4.3) — **(a validar com DPO/negócio)**.
- Prazo de retenção definitivo (seção 4.3) — **(a validar com DPO/negócio)**.
- Ratificação pela Arquitetura da escolha de Azure App Service (Linux) como plataforma de hospedagem e da divergência do padrão serverless dela decorrente (seção 7.2) — **pendente de aprovação da Arquitetura**.

