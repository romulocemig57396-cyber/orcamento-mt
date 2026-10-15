# 09 — Padrões para Agentes de IA Corporativos

> Diretrizes para agentes, RAG, MCP, fontes confiáveis, autonomia e auditoria.

---

## 1. Escopo

Este documento define regras para sistemas como:

- Copilots internos
- Agentes criados com Copilot Studio
- Agentes desenvolvidos com Semantic Kernel, LangChain ou frameworks similares
- Aplicações usando OpenAI, Claude ou Gemini
- Soluções RAG (Retrieval Augmented Generation)
- Agentes integrados ao Microsoft 365
- Assistentes para SAP, ECM, SharePoint e Power Platform

---

## 2. MCP (Model Context Protocol)

### 2.1 O que é

O MCP (*Model Context Protocol*) é um protocolo aberto que padroniza a integração entre ferramentas de IA (IDEs agênticas, agentes) e fontes de dados/contexto corporativo.

> **Importante:** MCP não deve ser confundido com CAF (Cloud Adoption Framework). São conceitos completamente diferentes.

### 2.2 Quando utilizar MCP

| Cenário | Usar MCP? |
| --- | --- |
| Agente precisa consultar sistemas internos em tempo real | ✅ Sim |
| IDE agêntica precisa acessar banco de dados ou APIs | ✅ Sim |
| Integração simples via API REST já resolve | ❌ Não obrigatório |
| Agente precisa executar ações em sistemas corporativos | ✅ Sim |

### 2.3 Servidores MCP homologados

| Servidor MCP | Finalidade | Status |
| --- | --- | --- |
| *(preencher conforme homologação)* | | Homologado |
| *(preencher)* | | Em avaliação |

### 2.4 Requisitos para servidores MCP

- Autenticação obrigatória (Entra ID / OAuth 2.0)
- Execução em rede privada sempre que possível
- Logging de todas as chamadas (quem, quando, o quê)
- Dados expostos classificados conforme política de classificação
- Princípio do menor privilégio nos acessos
- Auditoria de dados retornados

---

## 3. RAG (Retrieval Augmented Generation)

### 3.1 O que é

RAG permite que a IA consulte documentos corporativos antes de responder, reduzindo alucinações e fundamentando respostas em fontes reais.

### 3.2 Requisitos

| Requisito | Descrição |
| --- | --- |
| **Repositórios permitidos** | Apenas fontes aprovadas (ver seção 4) |
| **Indexação** | Processo automatizado com periodicidade definida |
| **Atualização** | Documentos devem ser reindexados quando alterados |
| **Qualidade da base** | Documentos com proprietário definido, revisados e atualizados |
| **Metadados** | Data de publicação, autor, classificação da informação |
| **Segmentação** | Chunking adequado ao tipo de documento |

### 3.3 Controles de acesso

- O agente deve respeitar as permissões do usuário solicitante.
- Documentos classificados como restritos só são retornados para usuários autorizados.
- Nenhum dado pessoal indexado sem base legal e avaliação de impacto.

---

## 4. Fontes confiáveis

### 4.1 Permitido como fonte de dados para agentes

| Fonte | Condição |
| --- | --- |
| SharePoint corporativo | Sites oficiais e aprovados |
| Azure DevOps | Repositórios e wikis do projeto |
| Wikis oficiais | Conteúdo com proprietário definido |
| Documentação aprovada | Com revisão e data de publicação |
| Bases de dados corporativas | Com autorização do proprietário |

### 4.2 NÃO permitido como fonte

| Fonte | Motivo |
| --- | --- |
| Chats pessoais (Teams, WhatsApp) | Sem governança |
| Arquivos locais não aprovados | Sem controle de versão |
| Documentos sem proprietário definido | Sem responsabilidade |
| Conteúdo sem revisão | Risco de informação incorreta |
| Internet aberta sem curadoria | Risco de desinformação |

---

## 5. Grounding (fundamentação)

### 5.1 Requisitos

Toda resposta de agente que cite informação corporativa **deve**:

| Requisito | Descrição |
| --- | --- |
| Referência da origem | Indicar qual documento/sistema originou a informação |
| Link para documento | Quando possível, link direto para a fonte |
| Data da informação | Indicar quando a informação foi publicada/atualizada |
| Transparência | Informar ao usuário quais fontes foram consultadas |
| Limitação | Indicar quando não encontrou informação suficiente |

### 5.2 Monitoramento de alucinações

- Implementar mecanismo de verificação de fatos contra a base de conhecimento.
- Monitorar taxa de respostas sem fundamentação.
- Revisão periódica de amostra de respostas por equipe humana.

---

## 6. Limites de autonomia

### 6.1 Níveis

| Nível | Descrição | Exemplos |
| --- | --- | --- |
| **0 — Apenas consulta** | Somente lê informações | Consultar documentos, buscar dados |
| **1 — Sugere ações** | Propõe mas não executa | Sugerir código, recomendar ações |
| **2 — Executa com aprovação** | Executa somente após aprovação humana | Criar recursos, alterar dados |
| **3 — Executa automaticamente** | Autonomia total (uso restrito) | Respostas a consultas simples |

### 6.2 Regras

- A maioria dos agentes corporativos deve ficar entre os **níveis 0 e 2**.
- Nível 3 apenas para ações de baixo risco aprovadas pela Arquitetura.
- O nível de autonomia deve ser documentado no formulário de solicitação.

### 6.3 Ações que um agente NUNCA pode executar autonomamente

- Excluir documentos ou dados
- Conceder ou revogar acessos
- Publicar em produção
- Enviar comunicações externas em nome da empresa
- Alterar configurações de segurança
- Processar pagamentos ou transações financeiras

---

## 7. Logging de prompts e ações

### 7.1 O que registrar

| Item | Obrigatório? |
| --- | --- |
| Prompt recebido do usuário | ✅ Sim |
| Contexto utilizado (documentos, dados) | ✅ Sim |
| Documentos consultados (RAG) | ✅ Sim |
| Resposta produzida | ✅ Sim |
| Ações executadas | ✅ Sim |
| Usuário solicitante (object ID) | ✅ Sim |
| Data e hora | ✅ Sim |
| Modelo utilizado | ✅ Sim |
| Tokens consumidos | Recomendado |
| Custo estimado | Recomendado |

### 7.2 Retenção

| Tipo de log | Retenção mínima |
| --- | --- |
| Logs de interação (prompts/respostas) | 1 ano |
| Logs de ações executadas | 1 ano |
| Logs de auditoria de decisões | 1 ano |
| Métricas de uso e custo | 90 dias |

### 7.3 Dados pessoais em logs

- Se o prompt contiver dados pessoais, aplicar mascaramento antes do registro.
- Manter rastreabilidade sem expor dados do titular.

---

## 8. Auditoria de decisões

### 8.1 Rastreabilidade

Para cada ação relevante executada por um agente, deve ser possível responder:

| Pergunta | Registro |
| --- | --- |
| Quem solicitou? | Object ID do usuário no Entra ID |
| Qual aprovação ocorreu? | Registro do gate de aprovação |
| Quais dados foram usados? | Lista de fontes consultadas |
| O que o agente executou? | Log detalhado da ação |
| Qual foi o resultado? | Sucesso/falha e impacto |

### 8.2 Acesso à auditoria

- Restrito a equipes de segurança, compliance e gestores do agente.
- Imutável (append-only).
- Alertas automáticos para padrões anômalos.

---

## 9. Uso de dados corporativos por LLMs

### 9.1 O que pode ser enviado

| Tipo | Permitido? | Condição |
| --- | --- | --- |
| Código-fonte próprio | ✅ | — |
| Diagramas de arquitetura | ✅ | Sem credenciais |
| Especificações funcionais | ✅ | — |
| Dados anonimizados | ✅ | Verificar irreversibilidade |
| Documentação pública | ✅ | — |

### 9.2 O que NÃO pode ser enviado

| Tipo | Motivo |
| --- | --- |
| Dados pessoais sem base legal | LGPD |
| Dados de consumidores de energia | LGPD + regulação setorial |
| Credenciais e chaves de API | Segurança |
| Contratos sem aprovação | Confidencialidade |
| Informações classificadas como restritas | Política de classificação |

### 9.3 Controles obrigatórios

- Classificação da informação antes do envio.
- Anonimização/mascaramento quando necessário.
- Registro de quais dados foram enviados e para qual modelo.
- Preferência por modelos hospedados em nuvem corporativa (não compartilhados).

---

## 10. IA Responsável

| Requisito | Descrição |
| --- | --- |
| **Modelo documentado** | Registrar qual modelo é utilizado e versão |
| **Transparência** | Usuário deve saber que interage com IA |
| **Prevenção de viés** | Avaliar viés nas respostas para decisões críticas |
| **Supervisão humana** | Revisão obrigatória para ações com impacto |
| **Avaliação regulatória** | Verificar impacto em regulações setoriais (ANEEL, etc.) |
| **Monitoramento contínuo** | Acompanhar qualidade das respostas ao longo do tempo |

---

> Voltar para: [00 — Visão Geral](00-visao-geral.md)
