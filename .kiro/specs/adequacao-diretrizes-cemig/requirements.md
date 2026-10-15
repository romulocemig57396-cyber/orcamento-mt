# Requirements Document

## Introduction

O Sistema de Orçamento MT é hoje uma aplicação de página única (SPA) React 18 + Vite, executada inteiramente no navegador, com persistência em `localStorage`, sem autenticação, publicada no GitHub Pages via GitHub Actions. Para operar como solução corporativa da Cemig, a aplicação precisa ser adequada às diretrizes do framework corporativo (pasta `diretrizes/`): identidade via Microsoft Entra ID, hospedagem em nuvem homologada (Azure) com padrão *serverless first*, infraestrutura como código, pipeline CI/CD com gates de segurança, observabilidade, conformidade LGPD, governança de repositório no Azure DevOps e versionamento semântico.

Este documento especifica os **requisitos de alteração da solução** — as mudanças técnicas, arquiteturais e de processo que a aplicação deve sofrer para atender às diretrizes. O preenchimento dos campos "(preencher)" dos documentos da pasta `diretrizes/` é tratado como tarefa operacional de apoio e aparece apenas como um requisito menor de registro documental, não como foco da adequação.

O escopo cobre a migração de hospedagem e repositório, a introdução de autenticação e autorização corporativas, a restrição de acesso exclusivamente à rede interna corporativa (sem exposição à internet pública e, portanto, sem camada de borda externa com WAF/CDN), o provisionamento de infraestrutura por código, a esteira de CI/CD com segurança integrada, observabilidade, tratamento de dados pessoais conforme LGPD e a produção do documento de requisitos macro da solução.

## Glossary

- **Sistema_Orcamento_MT**: Aplicação web de criação e gestão de orçamentos de obras em Média Tensão objeto desta adequação.
- **Entra_ID**: Microsoft Entra ID, provedor corporativo de identidade da Cemig.
- **Azure_DevOps**: Plataforma corporativa de repositório de código (Azure DevOps Repos) e esteira CI/CD (Azure DevOps Pipelines).
- **Repositorio_Destino**: Repositório do projeto "Orcamento MT" no Azure_DevOps (organização "cemig"), identificado por https://dev.azure.com/cemig/Orcamento%20MT, destino único do código-fonte da solução.
- **Repositorio_GitHub**: Repositório atual do Sistema_Orcamento_MT hospedado no GitHub, origem do código-fonte e do histórico de commits a serem migrados.
- **Pipeline_CICD**: Esteira de integração e entrega contínua definida no Azure DevOps Pipelines para o Sistema_Orcamento_MT.
- **IaC**: Infraestrutura como Código versionada (Bicep ou Terraform) que provisiona os recursos de nuvem.
- **Resource_Group**: Grupo de recursos da Azure que agrupa os componentes de nuvem do Sistema_Orcamento_MT.
- **Cofre_Segredos**: Serviço gerenciado de segredos da Azure (Azure Key Vault).
- **Observabilidade**: Conjunto de logs, métricas e alertas (Application Insights / Azure Monitor) do Sistema_Orcamento_MT.
- **Dado_Pessoal**: Qualquer informação relacionada a pessoa natural identificada ou identificável, nos termos da LGPD, tratada pelo Sistema_Orcamento_MT (ex.: dados de atendimento).
- **Ambiente**: Instância isolada da solução — desenvolvimento, homologação ou produção.
- **Papel_Aplicacao**: Perfil de autorização da aplicação mapeado a partir de grupos do Entra_ID (RBAC).
- **Documento_Requisitos_Macro**: Documento que descreve, em nível macro, objetivo, escopo, usuários, dados, integrações e requisitos não funcionais da solução.
- **Severidade_Critica**: Classificação de vulnerabilidade de severidade alta ou crítica apontada por verificação de segurança.

## Requirements

### Requirement 1: Autenticação via Microsoft Entra ID

**User Story:** Como responsável de segurança da Cemig, quero que o acesso à aplicação seja autenticado pela identidade corporativa, para que apenas usuários autorizados utilizem o sistema sem credenciais próprias.

#### Acceptance Criteria

1. WHEN um usuário não autenticado solicita acesso a uma funcionalidade do Sistema_Orcamento_MT, THE Sistema_Orcamento_MT SHALL redirecionar o usuário para autenticação no Entra_ID usando OAuth 2.0 com OpenID Connect e PKCE.
2. WHEN o Entra_ID retorna um token de identidade cujo emissor, audiência, assinatura e expiração são validados com sucesso, THE Sistema_Orcamento_MT SHALL estabelecer a sessão autenticada do usuário.
3. IF o token de identidade apresentado é inválido quanto a emissor, audiência, assinatura ou expiração, THEN THE Sistema_Orcamento_MT SHALL recusar o acesso e exigir nova autenticação.
4. WHILE uma sessão autenticada permanece inativa por período igual ou superior a 30 minutos, THE Sistema_Orcamento_MT SHALL encerrar a sessão e exigir nova autenticação.
5. THE Sistema_Orcamento_MT SHALL utilizar exclusivamente o Entra_ID como provedor de identidade, sem oferecer cadastro ou senha próprios.
6. IF um usuário autentica com sucesso no Entra_ID mas não possui autorização de acesso ao Sistema_Orcamento_MT, THEN THE Sistema_Orcamento_MT SHALL recusar o acesso, não estabelecer sessão autenticada e apresentar indicação de acesso não autorizado.
7. IF a comunicação com o Entra_ID falha ou não é concluída dentro de 30 segundos durante o fluxo de autenticação, THEN THE Sistema_Orcamento_MT SHALL recusar o acesso, não estabelecer sessão autenticada e apresentar indicação de falha de autenticação permitindo nova tentativa.

### Requirement 2: Autorização baseada em papéis (RBAC)

**User Story:** Como administrador da solução, quero que as permissões sejam controladas por grupos corporativos, para que cada usuário acesse apenas as funcionalidades compatíveis com seu papel.

#### Acceptance Criteria

1. WHEN uma sessão autenticada é estabelecida, THE Sistema_Orcamento_MT SHALL mapear os grupos do Entra_ID do usuário para os Papel_Aplicacao correspondentes, concedendo à sessão a união das permissões de todos os Papel_Aplicacao mapeados, em até 2 segundos após o estabelecimento da sessão.
2. IF um usuário autenticado solicita uma operação para a qual seu Papel_Aplicacao não possui permissão, THEN THE Sistema_Orcamento_MT SHALL negar a operação, preservar o estado dos dados sem qualquer alteração, apresentar ao usuário uma indicação de acesso negado e registrar a tentativa contendo identificador do usuário, operação solicitada e data/hora.
3. THE Sistema_Orcamento_MT SHALL aplicar negação por padrão, concedendo a um Papel_Aplicacao somente as permissões explicitamente associadas a ele e negando toda operação não explicitamente permitida.
4. IF uma sessão autenticada não possui nenhum grupo do Entra_ID mapeável para um Papel_Aplicacao, THEN THE Sistema_Orcamento_MT SHALL negar o acesso a todas as funcionalidades protegidas, apresentar ao usuário uma indicação de ausência de permissões e registrar o evento contendo identificador do usuário e data/hora.

### Requirement 3: Hospedagem em Azure com padrão serverless first

**User Story:** Como arquiteto corporativo, quero a aplicação hospedada em nuvem homologada seguindo o padrão serverless, para que a solução atenda à arquitetura de referência da Cemig.

#### Acceptance Criteria

1. THE Sistema_Orcamento_MT SHALL ser hospedado exclusivamente em recursos da Azure agrupados em um único Resource_Group dedicado à solução, sem recursos da solução fora desse Resource_Group.
2. THE Sistema_Orcamento_MT SHALL utilizar componentes serverless da Azure (por exemplo Azure Functions, Container Apps, Blob Storage, Cosmos DB ou SQL Database Serverless) como abordagem padrão, admitindo componente não serverless apenas quando houver exceção aprovada registrada conforme o critério 3.
3. WHERE a hospedagem adotada divergir do padrão serverless, THE Documento_Requisitos_Macro SHALL registrar, para cada divergência, a justificativa, o componente não serverless adotado e a identificação da aprovação concedida pela Arquitetura.
4. THE Sistema_Orcamento_MT SHALL ter todos os seus recursos de hospedagem na Azure provisionados por meio de infraestrutura como código versionada, sem provisionamento manual pelo console.
5. THE Sistema_Orcamento_MT SHALL deixar de ser publicado no GitHub Pages, de modo que não exista publicação ativa da aplicação no GitHub Pages nem referência ao GitHub Pages como ambiente de publicação na configuração de deploy.

### Requirement 4: Restrição de acesso à rede interna corporativa

**User Story:** Como responsável de segurança, quero que a aplicação seja acessível apenas pela rede interna corporativa, para que a solução não fique exposta à internet pública.

#### Acceptance Criteria

1. THE Sistema_Orcamento_MT SHALL ser acessível exclusivamente a partir da rede interna corporativa, sem exposição a acesso pela internet pública.
2. THE Sistema_Orcamento_MT SHALL servir todo o tráfego de acesso exclusivamente sobre TLS versão 1.2 ou superior com certificado gerenciado válido e não expirado.
3. IF uma requisição chega por protocolo não criptografado ou com TLS inferior à versão 1.2, THEN THE Sistema_Orcamento_MT SHALL recusar a conexão sem encaminhar o tráfego aos componentes internos.
4. THE Sistema_Orcamento_MT SHALL manter todos os componentes sem endereço IP público acessível diretamente pela internet, de modo que qualquer tentativa de acesso a partir da internet pública resulte em conexão recusada ou sem resposta.
5. WHERE a comunicação entre serviços internos é possível em rede privada, THE Sistema_Orcamento_MT SHALL utilizar endpoints privados para essa comunicação, sem trânsito pela internet pública.
6. IF uma requisição de acesso ao Sistema_Orcamento_MT origina-se fora da rede interna corporativa, THEN THE Sistema_Orcamento_MT SHALL recusar o acesso.

### Requirement 5: Persistência de dados adequada à arquitetura corporativa

**User Story:** Como arquiteto da solução, quero avaliar e definir a persistência dos dados de orçamento, para que os dados não fiquem restritos ao navegador e atendam aos controles corporativos.

#### Acceptance Criteria

1. THE Documento_Requisitos_Macro SHALL registrar a decisão de persistência dos dados de orçamento, indicando qual das três opções será adotada: (a) manter exclusivamente o `localStorage` do navegador; (b) complementar o `localStorage` com armazenamento gerenciado na Azure; ou (c) substituir o `localStorage` por armazenamento gerenciado na Azure.
2. WHERE os dados de orçamento são armazenados em serviço gerenciado da Azure, THE Sistema_Orcamento_MT SHALL manter esses dados criptografados em repouso com algoritmo de robustez igual ou superior ao AES com chave de 256 bits.
3. WHERE os dados de orçamento são armazenados em serviço gerenciado da Azure, THE Sistema_Orcamento_MT SHALL segregar os dados por Ambiente, de modo que dados de um Ambiente não sejam legíveis nem acessíveis a partir de outro Ambiente.
4. IF a gravação dos dados de orçamento em serviço gerenciado da Azure falha, THEN THE Sistema_Orcamento_MT SHALL preservar o estado anterior sem alteração parcial e apresentar ao usuário uma indicação de erro.
5. WHERE os dados de orçamento são gravados em serviço gerenciado da Azure sob condição de rede corporativa disponível, THE Sistema_Orcamento_MT SHALL concluir a operação de gravação em até 5 segundos.

### Requirement 6: Infraestrutura como código

**User Story:** Como engenheiro de plataforma, quero que todos os recursos de nuvem sejam provisionados por código versionado, para que a infraestrutura seja reproduzível e auditável entre ambientes.

#### Acceptance Criteria

1. THE IaC SHALL provisionar todos os recursos de nuvem do Sistema_Orcamento_MT exclusivamente a partir de código versionado no repositório, não existindo nenhum recurso de nuvem do sistema criado fora do código versionado.
2. THE IaC SHALL ser parametrizado de forma que o mesmo código provisione os ambientes de desenvolvimento, homologação e produção, com as diferenças entre ambientes expressas apenas por valores de parâmetros versionados e nenhuma alteração no código entre ambientes.
3. THE IaC SHALL manter o estado da infraestrutura em armazenamento remoto com controle de acesso restrito a identidades autorizadas, versionamento de histórico de estado habilitado e bloqueio que impeça execuções concorrentes de alterarem o mesmo estado simultaneamente.
4. IF um recurso de nuvem do Sistema_Orcamento_MT precisa ser criado ou alterado, THEN THE processo de provisionamento SHALL executar a alteração por meio do IaC a partir de código versionado, sem provisionamento manual pelo console.
5. WHEN uma execução do IaC falha antes de concluir todas as alterações planejadas, THE IaC SHALL preservar o último estado remoto válido sem gravar um estado parcial e registrar uma indicação de erro informando a causa da falha.
6. WHEN uma alteração de recurso é aplicada pelo IaC, THE IaC SHALL registrar de forma auditável a identidade que iniciou a execução, o horário da execução e o conjunto de recursos criados, alterados ou removidos.

### Requirement 7: Esteira CI/CD no Azure DevOps com gates de segurança

**User Story:** Como responsável de governança, quero uma esteira automatizada com estágios de segurança obrigatórios, para que nenhum código inseguro chegue à produção.

#### Acceptance Criteria

1. THE Pipeline_CICD SHALL ser definido no Azure_DevOps Pipelines, substituindo o fluxo atual de publicação do GitHub Actions.
2. THE Pipeline_CICD SHALL executar os estágios na sequência build, análise de segurança (SAST, SCA e varredura de segredos), testes automatizados, deploy em homologação, teste dinâmico de segurança (DAST) e deploy em produção, de modo que cada estágio só inicie após a conclusão com sucesso do estágio anterior.
3. IF o estágio de build falha, THEN THE Pipeline_CICD SHALL interromper a execução, impedir os estágios seguintes e registrar o estágio reprovado com indicação de status de falha.
4. IF os testes automatizados falham, THEN THE Pipeline_CICD SHALL interromper a execução, impedir o deploy em homologação e em produção e registrar o estágio reprovado com indicação de status de falha.
5. IF a análise de segurança ou o DAST aponta pelo menos 1 vulnerabilidade de Severidade_Critica, THEN THE Pipeline_CICD SHALL bloquear o deploy em produção, interromper a execução e registrar uma indicação de bloqueio por severidade.
6. WHEN o deploy em produção é solicitado, THE Pipeline_CICD SHALL exigir aprovação manual registrada de ao menos 1 aprovador antes de prosseguir.
7. IF a aprovação manual do deploy em produção não é concedida dentro de 72 horas, THEN THE Pipeline_CICD SHALL cancelar o deploy em produção e registrar o cancelamento por expiração da aprovação.

### Requirement 8: Governança do repositório no Azure DevOps

**User Story:** Como mantenedor do projeto, quero o código em repositório corporativo com proteção de branch, para que as mudanças sejam revisadas e rastreáveis.

#### Acceptance Criteria

1. THE Sistema_Orcamento_MT SHALL ter o código-fonte hospedado em um único repositório do Azure_DevOps Repos, correspondente ao Repositorio_Destino.
2. THE repositório SHALL conter, na raiz, as pastas `src`, `tests`, `infra`, `pipeline` e `docs`, estando cada uma presente mesmo que vazia (contendo ao menos um arquivo marcador).
3. WHEN uma alteração é proposta para a branch `main`, THE repositório SHALL exigir um pull request vinculado a essa branch antes de permitir a integração.
4. IF um pull request para a branch `main` não possui execução do Pipeline_CICD com status aprovado, THEN THE repositório SHALL bloquear a conclusão (merge) do pull request e indicar que a validação do pipeline é obrigatória.
5. IF um pull request para a branch `main` possui menos de 1 revisão com status aprovado, THEN THE repositório SHALL bloquear a conclusão (merge) do pull request e indicar que a revisão aprovada é obrigatória.
6. THE repositório SHALL conter, na raiz, um arquivo `README.md` que inclua, de forma identificável, as seções: objetivo do projeto, descrição da arquitetura, instruções de execução local e instruções de implantação.
7. WHEN a migração do repositório é executada, THE processo de migração SHALL transferir o conteúdo do Repositorio_GitHub, incluindo código-fonte e histórico de commits, para o Repositorio_Destino, preservando o histórico de commits original.
8. THE processo de migração SHALL, após a conclusão da migração, estabelecer o Repositorio_Destino como origem única do código, de modo que o Repositorio_GitHub deixe de ser o repositório ativo de desenvolvimento, sem desenvolvimento paralelo no Repositorio_GitHub.

### Requirement 9: Gestão de segredos em cofre gerenciado

**User Story:** Como responsável de segurança, quero que segredos fiquem em cofre gerenciado, para que nenhuma credencial seja exposta no código ou no pipeline.

#### Acceptance Criteria

1. THE Sistema_Orcamento_MT SHALL armazenar credenciais, chaves e connection strings exclusivamente no Cofre_Segredos, sem persistir cópias em arquivos de configuração, variáveis de ambiente em texto claro ou logs.
2. WHEN o Sistema_Orcamento_MT necessitar de uma credencial, chave ou connection string em tempo de execução, THE Sistema_Orcamento_MT SHALL recuperá-la do Cofre_Segredos.
3. IF a recuperação de um segredo do Cofre_Segredos falhar, THEN THE Sistema_Orcamento_MT SHALL abortar a operação dependente, registrar o evento de falha sem expor o valor do segredo e retornar uma indicação de erro informando a indisponibilidade do segredo.
4. THE repositório SHALL manter o código-fonte livre de credenciais, tokens ou chaves em texto claro, incluindo o histórico de commits.
5. WHEN uma alteração for submetida ao repositório, THE Pipeline_CICD SHALL executar varredura automática de segredos e, IF algum segredo em texto claro for detectado, THEN THE Pipeline_CICD SHALL bloquear a submissão e retornar uma indicação de erro apontando o local da ocorrência.
6. THE Pipeline_CICD SHALL referenciar segredos exclusivamente como variáveis protegidas, mascarando seus valores em qualquer saída de log ou console da execução.

### Requirement 10: Observabilidade da solução

**User Story:** Como operador da solução, quero logs, métricas e alertas, para que seja possível monitorar a saúde da aplicação e responder a incidentes.

#### Acceptance Criteria

1. THE Sistema_Orcamento_MT SHALL emitir logs estruturados de operação para a Observabilidade contendo, no mínimo, carimbo de tempo em UTC, nível de severidade (DEBUG, INFO, WARN, ERROR), identificador de correlação da requisição e identificador do componente de origem.
2. THE Sistema_Orcamento_MT SHALL emitir para a Observabilidade métricas de operação contendo, no mínimo, taxa de requisições, taxa de erros e latência de resposta por operação.
3. WHEN uma anomalia operacional configurada é detectada, THE Observabilidade SHALL gerar um alerta automático em até 60 segundos após a detecção, contendo a identificação da anomalia, o horário de ocorrência em UTC e o componente afetado.
4. WHEN um log é registrado, THE Sistema_Orcamento_MT SHALL mascarar todo Dado_Pessoal presente antes da gravação, de forma que o valor original não seja recuperável a partir do conteúdo gravado.
5. IF a emissão de um log ou métrica para a Observabilidade falha, THEN THE Sistema_Orcamento_MT SHALL registrar localmente a falha de emissão e continuar a execução da operação em curso sem interrompê-la.

### Requirement 11: Conformidade LGPD e classificação de dados

**User Story:** Como encarregado de dados, quero que o tratamento de dados pessoais esteja mapeado e controlado, para que a solução cumpra a LGPD.

#### Acceptance Criteria

1. THE Documento_Requisitos_Macro SHALL registrar a classificação da informação tratada pelo Sistema_Orcamento_MT em um dos níveis público, interno, confidencial ou restrito e, para os Dado_Pessoal, a base legal entre as hipóteses da LGPD, a finalidade do tratamento e o prazo de retenção expresso em dias ou meses.
2. THE Sistema_Orcamento_MT SHALL manter os ambientes de desenvolvimento, homologação e produção isolados entre si, sem compartilhamento de credenciais, bases de dados ou armazenamento entre eles.
3. IF Dado_Pessoal originado do ambiente de produção é utilizado em ambiente de desenvolvimento ou homologação, THEN THE Sistema_Orcamento_MT SHALL utilizar esses dados anonimizados de forma a impedir a reidentificação do titular, rejeitando o uso de dados de produção não anonimizados nesses ambientes.
4. WHEN um titular solicita o exercício de um direito sobre seus Dado_Pessoal (acesso, correção, exclusão ou portabilidade), THE Sistema_Orcamento_MT SHALL registrar a solicitação e atendê-la em até 15 dias corridos.
5. IF uma solicitação de direito do titular não pode ser atendida, THEN THE Sistema_Orcamento_MT SHALL registrar o motivo e preservar o estado dos Dado_Pessoal sem alteração.

### Requirement 12: Versionamento e rastreabilidade de releases

**User Story:** Como mantenedor do projeto, quero versionamento semântico e histórico de mudanças, para que cada release em produção seja identificável e rastreável.

#### Acceptance Criteria

1. THE Sistema_Orcamento_MT SHALL adotar versionamento semântico no formato MAJOR.MINOR.PATCH, com cada componente sendo um inteiro de 0 a 999999, incrementando MAJOR para mudanças incompatíveis, MINOR para funcionalidades compatíveis e PATCH para correções compatíveis.
2. WHEN uma release é implantada em produção, THE processo de release SHALL registrar no repositório, em até 5 minutos após a implantação, uma tag única no formato da versão semântica correspondente à release.
3. IF a tag correspondente à versão de uma release já existe no repositório, THEN THE processo de release SHALL preservar a tag existente e retornar uma indicação de erro de conflito de versão.
4. WHEN uma release é publicada, THE processo de release SHALL registrar no CHANGELOG uma entrada contendo a versão, a data da release e a lista das mudanças incluídas.
5. IF a atualização do CHANGELOG falha durante a release, THEN THE processo de release SHALL preservar o conteúdo anterior do CHANGELOG e retornar uma indicação de erro.

### Requirement 13: Design responsivo

**User Story:** Como usuário final, quero usar a aplicação em diferentes dispositivos, para que eu consiga trabalhar em celular, tablet e desktop.

#### Acceptance Criteria

1. THE Sistema_Orcamento_MT SHALL apresentar interface utilizável sem rolagem horizontal e com todos os controles acessíveis em larguras de viewport representativas de celular (até 480 px), tablet (de 481 px a 1024 px) e desktop (acima de 1024 px).
2. WHERE a largura do viewport é inferior a 320 px, THE Sistema_Orcamento_MT SHALL manter o conteúdo legível e os controles acionáveis, sem sobreposição que impeça a interação.
3. THE Sistema_Orcamento_MT SHALL ser validado em pelo menos três resoluções de tela, sendo ao menos uma de celular, uma de tablet e uma de desktop, antes da submissão à aprovação.

### Requirement 14: Documento de requisitos macro e registro das diretrizes

**User Story:** Como demandante da solução, quero um documento macro de requisitos e as diretrizes de onboarding preenchidas, para que a solução esteja formalmente registrada perante a TI.

#### Acceptance Criteria

1. WHEN o Documento_Requisitos_Macro for criado, THE Documento_Requisitos_Macro SHALL conter, em seções identificáveis e não vazias, as sete informações: objetivo, escopo, público usuário, dados tratados, integrações, requisitos não funcionais e critérios de aceite da solução.
2. THE processo de adequação SHALL registrar, nos documentos de onboarding da pasta `diretrizes/`, as decisões correspondentes definidas no Documento_Requisitos_Macro, substituindo cada campo marcado como "(preencher)".
3. IF, ao concluir o processo de adequação, qualquer campo "(preencher)" permanecer nos documentos de onboarding da pasta `diretrizes/`, THEN THE processo de adequação SHALL sinalizar os campos remanescentes como pendentes, preservando o conteúdo já registrado nos demais campos.
