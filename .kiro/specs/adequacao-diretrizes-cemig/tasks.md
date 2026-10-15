# Implementation Plan: Adequação às Diretrizes Cemig

## Overview

Este plano converte o design da adequação do Sistema_Orcamento_MT em passos de implementação incrementais e orientados a código. A sequência respeita a transição definida no design: a **migração do repositório** para o Azure DevOps é o primeiro passo (origem única), seguida da introdução da **camada de API serverless**, autenticação/autorização corporativa, persistência gerenciada, infraestrutura como código, pipeline com gates de segurança, segredos, observabilidade, LGPD, versionamento, responsividade e, por fim, os artefatos documentais.

As 10 Correctness Properties do design são implementadas com **fast-check** (ecossistema JS/TS já usado no projeto), mínimo de 100 iterações por propriedade, cada teste referenciando sua propriedade. A Propriedade 6 (preservação dos cálculos CT/PP/ERD/PFC e da migração de schema) é o destaque — garante que a introdução da API e do Cosmos DB **não altere nenhum resultado financeiro** existente.

Tarefas marcadas com `*` são opcionais. Além dos testes, estão marcadas como opcionais as tarefas que dependem de **recursos corporativos externos** fora do controle direto do desenvolvedor (criação efetiva do repositório Azure DevOps, grupos do Entra ID, ExpressRoute/VPN, provisionamento real na Azure). Os artefatos de código (Bicep, pipeline YAML, clientes, mapeamentos) são produzidos de qualquer forma; apenas a **aplicação efetiva** em recursos corporativos é opcional.

## Tasks

- [x] 1. Migração do repositório para o Azure DevOps (origem única)
  - [x]* 1.1 Script de espelhamento preservando histórico
    - Criar `scripts/migracao/espelhar-repo.sh` que executa `git clone --mirror` do Repositorio_GitHub e, após validação, `git push --mirror` para o Repositorio_Destino (`https://dev.azure.com/cemig/Orcamento%20MT`)
    - Documentar que o modo *mirror* transfere todas as branches, tags e histórico de commits sem reescrita
    - _Requirements: 8.7_

  - [x] 1.2 Varredura de segredos sobre todo o histórico de commits
    - Configurar ferramenta de varredura de segredos (ex.: gitleaks/trufflehog) para analisar **todo o histórico**, não apenas o HEAD, via `scripts/migracao/varrer-segredos-historico.sh`
    - Produzir relatório de ocorrências; se houver segredo em texto claro, documentar procedimento de limpeza/reescrita de histórico e rotação antes do push definitivo
    - _Requirements: 9.4_

  - [x]* 1.3 Cutover para origem única e congelamento do GitHub
    - Criar `scripts/migracao/cutover.sh` documentando o reaponto de remotes para o Azure DevOps e o congelamento/arquivamento (read-only) do Repositorio_GitHub
    - _Requirements: 8.8_

  - [x] 1.4 Estrutura de pastas corporativa do repositório
    - Garantir na raiz as pastas `src`, `tests`, `infra`, `pipeline`, `docs`, cada uma com ao menos um arquivo marcador (ex.: `.gitkeep`) quando vazia
    - _Requirements: 8.2_

  - [x] 1.5 README corporativo com seções obrigatórias
    - Atualizar `README.md` na raiz com seções identificáveis: objetivo do projeto, descrição da arquitetura, instruções de execução local, instruções de implantação
    - _Requirements: 8.6_

  - [x]* 1.6 Documentar branch policy da `main`
    - Registrar em `docs/branch-policy.md` a configuração exigida: PR obrigatório, pipeline aprovado e ao menos 1 revisão aprovada antes do merge
    - _Requirements: 8.1, 8.3, 8.4, 8.5_

- [x] 2. Checkpoint - migração validada
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Versionamento semântico (SemVer, tags, CHANGELOG)
  - [x] 3.1 Implementar módulo de versionamento semântico
    - Criar `src/versao/semver.js` com parse, format e incrementos MAJOR/MINOR/PATCH, cada componente inteiro de 0 a 999999, respeitando os limites e as regras de incremento
    - _Requirements: 12.1_

  - [x]* 3.2 Property test de round-trip e incremento SemVer
    - **Property 10: Round-trip e incremento de versão semântica**
    - **Validates: Requirements 12.1**

  - [x] 3.3 Implementar processo de tag e CHANGELOG de release
    - Criar `src/versao/release.js`: registrar tag única no formato SemVer; se a tag já existe, preservar e retornar erro de conflito; registrar entrada no CHANGELOG (versão, data, lista de mudanças); se a atualização do CHANGELOG falhar, preservar conteúdo anterior e retornar erro
    - _Requirements: 12.2, 12.3, 12.4, 12.5_

  - [x]* 3.4 Testes unitários do processo de release
    - Testar conflito de tag existente e falha de atualização do CHANGELOG preservando estado
    - _Requirements: 12.3, 12.5_

- [x] 4. Observabilidade: logging estruturado e mascaramento
  - [x] 4.1 Implementar logger estruturado
    - Criar `src/observabilidade/logger.js` emitindo log JSON com carimbo de tempo UTC, nível (DEBUG/INFO/WARN/ERROR), identificador de correlação e identificador do componente de origem
    - Degradação graciosa: se a emissão falhar, registrar localmente e continuar a operação
    - _Requirements: 10.1, 10.5_

  - [x] 4.2 Implementar mascaramento de dados pessoais e segredos
    - Criar `src/observabilidade/mascarar.js` que remove/ofusca Dado_Pessoal e valores de segredo de logs e mensagens de erro, de forma não reversível a partir do conteúdo gravado
    - _Requirements: 9.3, 10.4_

  - [x]* 4.3 Property test de mascaramento
    - **Property 7: Mascaramento de dados sensíveis em logs e segredos**
    - **Validates: Requirements 9.3, 10.4**

  - [x]* 4.4 Property test de estrutura obrigatória do log
    - **Property 8: Estrutura obrigatória do log**
    - **Validates: Requirements 10.1**

  - [x] 4.5 Instrumentar métricas de operação
    - Adicionar emissão de métricas (taxa de requisições, taxa de erros, latência por operação) em `src/observabilidade/metricas.js`, com adaptador para Application Insights
    - _Requirements: 10.2_

- [x] 5. Camada de autenticação e autorização (API serverless)
  - [x] 5.1 Esqueleto da API serverless e contrato de rotas
    - Criar a estrutura da API em `src/api/` com as rotas do design (`/api/health`, `/api/orcamentos`, `/api/orcamentos/{id}` GET/PUT/DELETE, `/api/titular/solicitacoes`), ainda sem lógica de negócio, retornando stubs
    - _Requirements: 1.1, 2.1_

  - [x] 5.2 Implementar validação de token (JWKS)
    - Criar `src/api/auth/validarToken.js` validando emissor, audiência, assinatura e expiração contra JWKS do tenant; estabelecer sessão apenas se todos válidos; recusar (401) caso contrário
    - Timeout de 30 s no fluxo de autenticação devolve falha permitindo nova tentativa
    - _Requirements: 1.2, 1.3, 1.7_

  - [x]* 5.3 Property test de validação de token
    - **Property 1: Validação de token aceita apenas tokens íntegros**
    - **Validates: Requirements 1.2, 1.3**

  - [x] 5.4 Implementar expiração de sessão por inatividade
    - Em `src/api/auth/sessao.js`, encerrar sessão quando inatividade `≥ 30 min` e exigir nova autenticação; manter válida quando `< 30 min`
    - _Requirements: 1.4_

  - [x]* 5.5 Property test de expiração de sessão
    - **Property 2: Expiração de sessão por inatividade**
    - **Validates: Requirements 1.4**

  - [x] 5.6 Implementar mapeamento grupo → papel e permissões
    - Criar `src/api/auth/rbac.js` e o arquivo de configuração versionado (mapeamentos grupo→papel e permissões por papel) conforme o Data Model; conceder à sessão a união das permissões dos papéis mapeados em ≤ 2 s
    - _Requirements: 2.1_

  - [x]* 5.7 Property test de união de permissões
    - **Property 3: Permissões da sessão são a união dos papéis mapeados**
    - **Validates: Requirements 2.1**

  - [x] 5.8 Implementar negação por padrão nas rotas
    - Aplicar middleware de autorização em todas as rotas: negar operação não explicitamente permitida ao papel preservando o estado dos dados; 403 "acesso negado" com log (oid, operação, data/hora); 403 "sem permissões" quando não há papel mapeável com log (oid, data/hora); recusar usuário autenticado sem autorização à aplicação (R1.6)
    - _Requirements: 1.6, 2.2, 2.3, 2.4_

  - [x]* 5.9 Property test de negação por padrão
    - **Property 4: Negação por padrão preservando o estado**
    - **Validates: Requirements 1.6, 2.2, 2.3, 2.4**

- [x] 6. Checkpoint - auth/RBAC verificados
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Autenticação no front-end (SPA)
  - [x] 7.1 Integrar MSAL.js com Authorization Code + PKCE
    - Adicionar camada de autenticação em `src/auth/` usando MSAL.js (fluxo OIDC + PKCE); nenhum cadastro/senha próprios; redirecionar usuário não autenticado para o Entra ID
    - _Requirements: 1.1, 1.5_

  - [x] 7.2 Implementar guards de rota e anexo de token
    - Proteger funcionalidades com guards; anexar access token (Bearer) nas chamadas à API; tratar falha/timeout de autenticação com indicação e nova tentativa; indicar acesso não autorizado
    - _Requirements: 1.1, 1.6, 1.7_

  - [x]* 7.3 Testes unitários dos guards e tratamento de erro de login
    - Testar redirecionamento sem sessão, anexo de token e indicação de falha
    - _Requirements: 1.1, 1.7_

- [x] 8. Persistência gerenciada (Cosmos DB + localStorage como cache)
  - [x] 8.1 Definir modelo de documento de orçamento
    - Criar `src/persistencia/modelo.js` com o documento (id, ambiente, versaoSchema, proprietarioOid, classificacao, timestamps, dados), reaproveitando `src/utils/migracao.js` para `versaoSchema`
    - _Requirements: 5.1, 11.1_

  - [x] 8.2 Implementar cliente de persistência na API (gravação atômica)
    - Criar `src/api/persistencia/cosmos.js`: gravação atômica; em falha de gravação, preservar o estado anterior sem alteração parcial e retornar indicação de erro; particionar por ambiente
    - _Requirements: 5.2, 5.3, 5.4_

  - [x]* 8.3 Property test de atomicidade da gravação
    - **Property 5: Atomicidade da gravação de orçamento**
    - **Validates: Requirements 5.4**

  - [x] 8.4 Implementar cliente de persistência no front (cache + sincronização)
    - Substituir o acesso direto a `localStorage` em `src/hooks/useOrcamento.js` por um cliente que fala com a API, mantendo `localStorage` como cache local/offline, com resolução de conflito
    - _Requirements: 5.1_

  - [x]* 8.5 Property test de preservação de dados e cálculos na migração
    - **Property 6: Preservação dos dados e cálculos na migração**
    - **Validates: Requirements 5.4**
    - Round-trip de serialização/desserialização; idempotência da migração de schema; invariantes financeiros de `src/utils/calculos.js` (PFC ≥ 0; ERD coberto ≤ min(disponível, parcela regulatória, PFC antes do ERD); consistência material 60% / serviços 40%)

  - [x]* 8.6 Teste de integração de latência de gravação
    - Medir p95 de gravação em rede corporativa, validando conclusão em ≤ 5 s
    - _Requirements: 5.5_

- [x] 9. Gestão de segredos (Key Vault + Managed Identity)
  - [x] 9.1 Implementar recuperação de segredos via Key Vault
    - Criar `src/api/segredos/keyvault.js` recuperando credenciais/chaves/connection strings do Cofre_Segredos via Managed Identity em tempo de execução; sem persistir cópias em config/env/logs
    - _Requirements: 9.1, 9.2_

  - [x] 9.2 Tratar falha de recuperação de segredo
    - Em falha, abortar a operação dependente, registrar o evento sem expor o valor e retornar erro de indisponibilidade
    - _Requirements: 9.3_

  - [x]* 9.3 Testes unitários da recuperação de segredos
    - Testar sucesso, falha de indisponibilidade e ausência de vazamento em logs
    - _Requirements: 9.2, 9.3_

- [x] 10. LGPD: isolamento, anonimização e direitos do titular
  - [x] 10.1 Implementar função de anonimização de dados de produção
    - Criar `src/lgpd/anonimizar.js` que, para Dado_Pessoal de produção usado em dev/hml, remove o identificador original e impede reidentificação; rejeitar uso de dados de produção não anonimizados nesses ambientes
    - _Requirements: 11.3_

  - [x]* 10.2 Property test de anonimização
    - **Property 9: Anonimização impede reidentificação**
    - **Validates: Requirements 11.3**

  - [x] 10.3 Implementar registro e atendimento de direitos do titular
    - Criar o modelo e o handler de `POST /api/titular/solicitacoes` (acesso, correção, exclusão, portabilidade); registrar solicitação com prazo de 15 dias corridos; em recusa, registrar motivo e preservar o Dado_Pessoal sem alteração
    - _Requirements: 11.4, 11.5_

  - [x]* 10.4 Testes unitários de direitos do titular
    - Testar registro, cálculo de prazo e recusa preservando estado
    - _Requirements: 11.4, 11.5_

- [x] 11. Checkpoint - código de aplicação completo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Infraestrutura como código (Bicep)
  - [x] 12.1 Criar módulos Bicep de rede privada
    - Em `infra/`, definir VNet, `subnet-apps` (delegada a Container Apps), `subnet-endpoints`, Private DNS Zones; sem IP público
    - _Requirements: 3.1, 4.1, 4.4, 4.5_

  - [x] 12.2 Criar módulos Bicep de computação e dados
    - Container Apps Environment em modo *internal* (ingress privado, TLS 1.2+); Cosmos DB serverless com `publicNetworkAccess=Disabled`, criptografia em repouso ≥ AES-256 e Private Endpoint; Key Vault com Private Endpoint; Application Insights; tudo em um único Resource_Group dedicado
    - _Requirements: 3.1, 3.2, 4.2, 4.3, 5.2, 5.3_

  - [x] 12.3 Parametrizar ambientes dev/hml/prd
    - Criar arquivos de parâmetros por ambiente em `infra/params/`, de forma que o mesmo código provisione os três ambientes isolados apenas por valores versionados
    - _Requirements: 6.2, 11.2_

  - [x] 12.4 Configurar state remoto e auditoria do IaC
    - Configurar state remoto com acesso restrito, versionamento de histórico e bloqueio contra execuções concorrentes; em falha de execução preservar o último state válido (sem state parcial) e registrar a causa; registrar identidade, horário e recursos alterados
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6_

  - [x]* 12.5 Checagens de política e what-if do Bicep
    - Adicionar testes de snapshot/`what-if` validando ingress interno, `publicNetworkAccess=Disabled`, TLS mínimo e Resource Group único
    - _Requirements: 3.1, 4.1, 4.2, 4.4_

  - [x]* 12.6 Provisionar recursos reais na Azure (recurso corporativo externo)
    - Executar o IaC nos ambientes corporativos (depende de assinatura Azure, VNet corporativa, ExpressRoute/VPN)
    - _Requirements: 3.1, 4.6, 6.1_

- [x] 13. Pipeline CI/CD no Azure DevOps
  - [x] 13.1 Definir pipeline com estágios e ordem
    - Criar `pipeline/azure-pipelines.yml` com os estágios na ordem build → segurança (SAST/SCA/segredos) → testes → deploy hml → DAST → deploy prd, cada estágio iniciando só após sucesso do anterior; substitui o GitHub Actions
    - _Requirements: 7.1, 7.2_

  - [x] 13.2 Configurar gates de falha e bloqueio por severidade
    - Falha de build interrompe; falha de testes bloqueia deploy; vulnerabilidade de Severidade_Critica em SAST/SCA/DAST bloqueia produção e registra o bloqueio
    - _Requirements: 7.3, 7.4, 7.5_

  - [x] 13.3 Configurar aprovação manual de produção com expiração
    - Exigir aprovação manual registrada de ≥ 1 aprovador; cancelar o deploy em produção se não aprovado em 72 h, registrando a expiração
    - _Requirements: 7.6, 7.7_

  - [x] 13.4 Configurar varredura de segredos e segredos protegidos no pipeline
    - Executar varredura automática de segredos em cada submissão, bloqueando e apontando o local em caso de ocorrência; referenciar segredos apenas como variáveis protegidas mascaradas em logs
    - _Requirements: 9.5, 9.6_

  - [x] 13.5 Remover publicação no GitHub Pages
    - Remover `.github/workflows/deploy.yml` e qualquer referência ao GitHub Pages como ambiente de publicação; a publicação passa a ser na Azure (Container Apps)
    - _Requirements: 3.5, 7.1_

  - [x]* 13.6 Integrar release (tag + CHANGELOG) ao estágio de produção
    - Acionar o módulo de release (tarefa 3.3) no deploy de produção, registrando tag SemVer em ≤ 5 min após a implantação
    - _Requirements: 12.2_

- [x] 14. Responsividade da interface
  - [x] 14.1 Ajustar layout responsivo nos breakpoints
    - Garantir interface sem rolagem horizontal e controles acessíveis em celular (≤480 px), tablet (481–1024 px) e desktop (>1024 px); conteúdo legível e acionável abaixo de 320 px
    - _Requirements: 13.1, 13.2_

  - [x]* 14.2 Testes de layout nos breakpoints
    - Testes de layout/snapshot nas três faixas de viewport, com ao menos uma resolução de celular, tablet e desktop
    - _Requirements: 13.3_

- [x] 15. Artefatos documentais
  - [x] 15.1 Produzir o Documento de Requisitos Macro
    - Criar `docs/requisitos-macro.md` com seções não vazias: objetivo, escopo, público usuário, dados tratados, integrações, requisitos não funcionais e critérios de aceite; registrar a decisão de persistência (R5.1), eventuais divergências do serverless e aprovações (R3.3) e a classificação/base legal/finalidade/retenção dos dados (R11.1)
    - _Requirements: 3.3, 5.1, 11.1, 14.1_

  - [x]* 15.2 Registrar decisões nas diretrizes de onboarding (item menor)
    - Substituir os campos "(preencher)" dos documentos da pasta `diretrizes/` com as decisões do Documento de Requisitos Macro; sinalizar como pendentes os campos remanescentes, preservando os já registrados
    - _Requirements: 14.2, 14.3_

- [x] 16. Integração e wiring final
  - [x] 16.1 Conectar SPA, API, auth, persistência e observabilidade
    - Integrar front (MSAL + cliente de persistência) à API (validação de token, RBAC, Cosmos, Key Vault, logs/métricas), garantindo que não haja código órfão e que o fluxo ponta a ponta opere
    - _Requirements: 1.1, 2.1, 5.1, 9.2, 10.1_

  - [x]* 16.2 Testes de integração essenciais
    - Autenticação ponta a ponta (SPA ↔ Entra ID ↔ API); recuperação de segredo via Managed Identity + Key Vault; isolamento entre ambientes; disparo de alerta em ≤ 60 s
    - _Requirements: 1.1, 1.7, 9.2, 10.2, 10.3, 11.2_

- [x] 17. Checkpoint final - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tarefas marcadas com `*` são opcionais: incluem todos os testes (unitários, de propriedade, integração) e as tarefas que dependem de recursos corporativos externos (criação efetiva do repositório Azure DevOps, grupos do Entra ID, ExpressRoute/VPN, provisionamento real na Azure). O código-fonte dos artefatos (Bicep, pipeline, clientes, mapeamentos) é sempre produzido; apenas a aplicação efetiva em recursos corporativos é opcional.
- Cada tarefa referencia os requisitos (R#) para rastreabilidade; tarefas de teste de propriedade referenciam explicitamente a propriedade correspondente do design.
- Os testes de propriedade usam fast-check (mínimo 100 iterações) e seguem a tag: **Feature: adequacao-diretrizes-cemig, Property {número}: {texto}**.
- A Propriedade 6 é o seguro da migração: garante que a introdução da API e do Cosmos DB não altere nenhum resultado financeiro dos cálculos existentes.
- Checkpoints asseguram validação incremental em pontos de corte naturais da transição.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"] },
    { "id": 1, "tasks": ["3.1", "4.1", "4.2", "5.1", "8.1", "12.1", "14.1", "15.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "4.3", "4.4", "4.5", "5.2", "5.4", "5.6", "8.2", "9.1", "10.1", "12.2", "12.3", "15.2"] },
    { "id": 3, "tasks": ["3.4", "5.3", "5.5", "5.7", "5.8", "7.1", "8.3", "8.4", "9.2", "10.2", "10.3", "12.4"] },
    { "id": 4, "tasks": ["5.9", "7.2", "8.5", "8.6", "9.3", "10.4", "12.5", "13.1", "14.2"] },
    { "id": 5, "tasks": ["7.3", "12.6", "13.2", "13.3", "13.4", "13.5"] },
    { "id": 6, "tasks": ["13.6", "16.1"] },
    { "id": 7, "tasks": ["16.2"] }
  ]
}
```
