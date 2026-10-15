# 01 — Solicitação de Solução

> Formulário de onboarding para novos projetos.
> Preencha e envie à TI **antes** de iniciar o desenvolvimento.

---

## 1. Identificação do projeto

| Campo | Preenchimento |
| --- | --- |
| Nome do projeto | Sistema de Orçamento MT (Sistema_Orcamento_MT) |
| Área demandante | *(pendente — a validar com a área de negócio demandante)* |
| Data da solicitação (DD/MM/AAAA) | *(pendente — a validar com a área demandante)* |
| Responsável técnico pela solução | *(pendente — a validar com a área demandante)* |

---

## 2. Partes interessadas

> E-mails e nomes exigem validação humana e não foram inferidos do Documento de Requisitos Macro.

| Nome | Papel | E-mail |
| --- | --- | --- |
| *(pendente — a validar com a área demandante)* | Patrocinador / área de negócio | *(pendente)* |
| *(pendente — a validar com a equipe de identidade/negócio)* | Encarregado de dados (DPO) | *(pendente)* |
| *(pendente — a validar com a Arquitetura/TI)* | Arquitetura e aprovação | *(pendente)* |

---

## 3. Descrição da solução

| Item | Preenchimento |
| --- | --- |
| O que o sistema fará (resumo em até 5 linhas) | Aplicação web corporativa de criação e gestão de orçamentos de obras de distribuição de energia em Média Tensão (MT). Apoia o atendimento a solicitações de obra, calculando custos técnicos (CT), participação do particular (PP), ERD, PFC do cliente e demais componentes financeiros, produzindo o memorial de cálculo e consolidando os dados no formato PROORC. |
| Problema de negócio que resolve | Padroniza e automatiza a elaboração de orçamentos de obras de distribuição em MT, substituindo o cálculo manual e consolidando os dados financeiros/regulatórios no formato PROORC de forma auditável. |
| Público usuário e volume estimado | Colaboradores internos da Cemig autenticados pelo Entra ID e autorizados por grupo corporativo (perfis leitor, editor e admin). Volume estimado: *(pendente — a validar com a área demandante)*. |
| Criticidade (baixa / média / alta) | *(pendente — a validar com a área demandante)* |

---

## 4. Integrações

- [ ] Não haverá integrações
- [x] Haverá integrações conforme a tabela abaixo

| Sistema | Hospedagem (AWS / GCP / Azure / On-premise) | Tipo de integração | Responsável pelo sistema |
| --- | --- | --- | --- |
| Microsoft Entra ID | Azure | Identidade — autenticação OIDC + PKCE e grupos para RBAC | *(pendente — equipe de identidade)* |
| Azure App Service (Linux) | Azure | Hospedagem gerenciada (PaaS) da SPA e da API — entrada por Private Endpoint (sem IP público), saída por VNet Integration, HTTPS/TLS 1.2+ | *(pendente — Arquitetura/TI)* |
| Azure Cosmos DB (serverless) | Azure | Persistência gerenciada (fonte da verdade), acesso por Private Endpoint | *(pendente — Arquitetura/TI)* |
| Azure Key Vault | Azure | Cofre de segredos recuperado em runtime via Managed Identity | *(pendente — Arquitetura/TI)* |
| Application Insights / Azure Monitor | Azure | Observabilidade (logs, métricas e alertas) | *(pendente — Arquitetura/TI)* |
| Azure DevOps (Repos + Pipelines) | Azure | Repositório único e esteira CI/CD com gates de segurança | *(pendente — Arquitetura/TI)* |
| Rede corporativa (ExpressRoute / VPN) | On-premise | Rede privada — único caminho de acesso dos usuários internos | *(pendente — Rede/Infra)* |

---

## 5. Acesso, dados e LGPD

| Item | Opções | Preenchimento |
| --- | --- | --- |
| Forma de acesso | Apenas interno (rede privada) / Acesso externo necessário | Apenas interno (rede privada) — acesso exclusivo pela rede corporativa (ExpressRoute/VPN), sem IP público |
| Classificação dos dados | Público / Interno / Confidencial / Restrito | Interno por padrão; Confidencial quando houver dado pessoal de pessoa natural (cliente/NS). Classificação definitiva por campo *(pendente — a validar com DPO/negócio)* |
| Trata dados pessoais (LGPD)? | Sim / Não | Sim |
| Se sim, quais categorias de dados pessoais? | Nome, CPF, e-mail, dados sensíveis, etc. | Dados de atendimento (cliente e Nota de Serviço — NS) que podem conter dado pessoal de pessoa natural identificada ou identificável |
| Base legal para tratamento (LGPD) | Consentimento / Execução de contrato / Legítimo interesse / Obrigação legal / Outra | Execução de procedimentos preliminares de contrato e obrigação legal/regulatória do setor (art. 7º, V e II) e, quando aplicável, legítimo interesse (art. 7º, IX). Hipótese definitiva por campo *(pendente — a validar com DPO/negócio)* |
| Retenção de dados prevista | Ex: 5 anos, enquanto durar o contrato, etc. | 60 meses (5 anos) após conclusão ou cancelamento do atendimento. Valor definitivo *(pendente — a validar com DPO/negócio)* |
| Necessidade de acesso externo? | Sim / Não | Não |
| Se sim, justificativa | | Não aplicável — a solução não é exposta à internet pública nem a usuários externos |

---

## 6. IA Generativa

| Item | Opções | Preenchimento |
| --- | --- | --- |
| Utiliza IA generativa? | Sim / Não | Não — a solução não emprega IA generativa em runtime; a lógica de negócio é composta por funções JavaScript puras. (IA generativa é usada apenas no desenvolvimento assistido, não como funcionalidade do produto.) |
| Modelo pretendido | GPT-4, Claude, Gemini, etc. | Não aplicável |
| Quais dados serão enviados ao modelo? | | Não aplicável — nenhum dado de negócio é enviado a modelo de IA pela aplicação |
| Dados pessoais serão enviados? | Sim / Não | Não |
| Avaliação de impacto regulatório realizada? | Sim / Não / Não aplicável | Não aplicável |

---

## 7. Nuvem escolhida

| Item | Preenchimento |
| --- | --- |
| Nuvem (AWS / GCP / Azure) | Microsoft Azure (nuvem homologada) |
| Justificativa (custo, integração, funcionalidades) | Nuvem homologada da Cemig, com integração nativa ao Entra ID (identidade corporativa) e ao Azure DevOps (repositório e CI/CD). Cosmos DB serverless adere ao padrão *serverless first* (escala a zero, cobra por consumo). A hospedagem da SPA/API usa Azure App Service (Linux) — PaaS gerenciado — porque o limite corporativo de /25 por subnet (subnets criadas manualmente pela Rede) inviabiliza o Container Apps interno (que exige /23); essa divergência do serverless first está registrada no Documento de Requisitos Macro e permanece *(pendente — ratificação pela Arquitetura)*. |
| Estimativa de custo mensal (R$) | *(pendente — a validar com Arquitetura/TI)* |

---

## 8. Aprovação

| Campo | Preenchimento |
| --- | --- |
| Aprovado por (TI) | *(pendente — a validar com a TI/aprovador)* |
| Data da aprovação | *(pendente — a validar com a TI/aprovador)* |
| Observações / condições | *(pendente)* — itens dependentes de validação: GUIDs dos grupos do Entra ID por papel (identidade/negócio); classificação e base legal LGPD por campo e prazo de retenção definitivo (DPO/negócio); ratificação de Azure App Service (Linux) como plataforma de hospedagem e da divergência do serverless first dela decorrente (Arquitetura). |

---

> Após aprovação, prossiga para o documento [02 — Arquitetura de Referência](02-arquitetura-de-referencia.md).

