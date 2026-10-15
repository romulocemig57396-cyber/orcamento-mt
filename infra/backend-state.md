# State remoto e auditoria do IaC (modelo ARM/Bicep) — tarefa 12.4

> Atende aos critérios **R6.1, R6.3, R6.4, R6.5 e R6.6** da spec `adequacao-diretrizes-cemig`.
> Ver `design.md` → tabela de Error Handling, linha *"Falha de execução do IaC"* (R6.5).

## Contexto: por que o Bicep não usa arquivo de state separado

O projeto adotou **Bicep** como IaC (não Terraform). O Bicep é compilado para **ARM
(Azure Resource Manager)** e implantado por `az deployment group create`. Diferente do
Terraform, **o ARM não mantém um arquivo de state separado** (nenhum `terraform.tfstate`
em blob/conta de armazenamento): o **estado de verdade é o próprio conjunto de recursos
no Resource Group**, e cada implantação é registrada como um objeto
`Microsoft.Resources/deployments` versionado no histórico do Resource Group.

Portanto, **não trocamos a tecnologia** para satisfazer R6.3/R6.6: descrevemos o
equivalente nativo do ARM a "state remoto com versionamento, acesso restrito e bloqueio",
que é fornecido pela plataforma Azure sem infraestrutura adicional de state.

| Conceito "state remoto" (R6) | Equivalente nativo no modelo ARM/Bicep |
| --- | --- |
| State armazenado remotamente | Estado real dos recursos no **Resource Group** + histórico de **deployments ARM** (serviço gerenciado, remoto por natureza) |
| Versionamento de histórico de state (R6.3) | **Histórico de deployments** do Resource Group — cada execução é um registro imutável e consultável |
| Acesso restrito a identidades autorizadas (R6.3) | **RBAC no Resource Group** (quem pode ler/implantar) + **OIDC federado** do pipeline (sem segredos de longa duração) |
| Bloqueio contra execuções concorrentes (R6.3) | **Concorrência do ambiente de deploy do pipeline** + **nome de deployment determinístico** + (opcional) **resource lock** no RG durante a janela |
| Preservar último state válido em falha, sem state parcial (R6.5) | ARM aplica a implantação sobre o estado anterior; em falha, o **último deployment bem-sucedido permanece** e o motivo é gravado no histórico |
| Auditoria: identidade, horário e recursos alterados (R6.6) | Metadados do deployment ARM + **Activity Log** do Resource Group (caller, timestamp, operações por recurso) |

## R6.3 — Acesso restrito, versionamento e bloqueio

### Acesso restrito a identidades autorizadas

- **Quem pode implantar** é controlado por **RBAC no escopo do Resource Group**. Apenas a
  identidade de deploy do pipeline (service connection com **OIDC/Workload Identity
  Federation**, sem segredo persistido) e um grupo restrito de operadores de plataforma
  recebem papel com permissão de escrita (`Contributor` com escopo no RG, ou papel
  customizado mais restrito). Leitura do histórico pode ser concedida a auditores com
  `Reader`.
- Nenhuma identidade pessoal implanta diretamente em `hml`/`prd`: a alteração entra
  **sempre pelo pipeline a partir de código versionado** (R6.1, R6.4), nunca pelo console.
- O ambiente de produção do pipeline exige **aprovação manual** antes do deploy
  (ver R7.6, pipeline), reforçando o acesso restrito ao state de produção.

### Versionamento de histórico de state

Cada `az deployment group create` cria um registro de deployment **nomeado e datado** no
Resource Group. O histórico:

- é **imutável** por execução e consultável a qualquer momento;
- preserva **parâmetros, template, resultado (sucesso/falha) e recursos tocados**;
- dá a **linha do tempo versionada** do estado da infraestrutura, equivalente ao
  versionamento de histórico de state exigido por R6.3.

```bash
# Linha do tempo (versões) do state da infraestrutura do RG
az deployment group list \
  --resource-group rg-orcamento-mt-prd \
  --query "[].{nome:name, estado:properties.provisioningState, inicio:properties.timestamp}" \
  --output table

# Detalhe de uma versão específica (recursos alterados, parâmetros, resultado)
az deployment group show \
  --resource-group rg-orcamento-mt-prd \
  --name <nome-do-deployment>
```

### Bloqueio contra execuções concorrentes

Duas camadas, combinadas, impedem que duas execuções alterem o **mesmo** state
simultaneamente:

1. **Serialização no pipeline (principal):** cada ambiente tem um grupo de concorrência
   dedicado (um deploy por ambiente por vez). Um segundo deploy do mesmo ambiente **aguarda
   ou é recusado** até o primeiro terminar. É o mesmo princípio do `concurrency:` já usado
   no workflow atual, agora por ambiente de IaC.
2. **Nome de deployment determinístico por janela + verificação de deploy em andamento:**
   o script `scripts/iac/implantar.sh` usa um nome de deployment **estável e por ambiente**
   e, antes de iniciar, **recusa a execução se já houver um deployment `Running`** no RG.
   Opcionalmente, aplica um **resource lock** (`CanNotDelete`) no RG durante a janela como
   trava adicional contra alterações concorrentes/acidentais.

> Observação: `az deployment group create` é idempotente e o próprio ARM serializa
> operações conflitantes sobre o mesmo recurso; a serialização no pipeline evita a corrida
> antes mesmo de chegar ao ARM.

## R6.5 — Falha preserva o último state válido (sem state parcial) e registra a causa

- O ARM **não grava um "state parcial" paralelo**: ele aplica a implantação sobre o estado
  real existente. Se a execução **falha antes de concluir todas as alterações planejadas**,
  o **último deployment bem-sucedido continua sendo o estado válido** do Resource Group — não
  há arquivo de state corrompido/parcial a reconciliar.
- A **causa da falha** fica registrada no histórico do deployment (`provisioningState =
  Failed` + mensagem/código de erro por operação), consultável por auditoria.
- O script trata a falha de forma **não destrutiva**: em erro, **não remove recursos** nem
  tenta "desfazer" o estado anterior; apenas **captura e registra a causa** e sai com código
  de erro, deixando o último state válido intacto.

```bash
# Causa da falha da última execução (erros por operação)
az deployment operation group list \
  --resource-group rg-orcamento-mt-prd \
  --name <nome-do-deployment> \
  --query "[?properties.provisioningState=='Failed'].{recurso:properties.targetResource.id, codigo:properties.statusMessage.error.code, msg:properties.statusMessage.error.message}" \
  --output json
```

> **Pré-validação obrigatória** antes de qualquer deploy em `hml`/`prd`:
> `az bicep build` + `az deployment group what-if`. O `what-if` mostra as alterações
> planejadas e reduz o risco de uma execução falhar no meio.

## R6.6 — Auditoria: identidade, horário e recursos alterados

Toda alteração aplicada pelo IaC é auditável por **duas fontes complementares**, ambas
nativas e retidas pela plataforma:

1. **Histórico de deployments ARM** — para cada execução: nome, `timestamp` (horário),
   `provisioningState`, parâmetros e **lista de recursos criados/alterados/removidos**
   (`properties.outputResources` / operações do deployment).
2. **Activity Log do Resource Group** — registra a **identidade que iniciou** cada operação
   de escrita (`caller`), o **horário** e a **operação por recurso**. Recomenda-se exportar
   o Activity Log para o Log Analytics do App Insights (R10) via **Diagnostic Settings**,
   garantindo retenção e rastreabilidade de longo prazo.

```bash
# Identidade + horário + operações de escrita no RG (auditoria R6.6)
az monitor activity-log list \
  --resource-group rg-orcamento-mt-prd \
  --offset 7d \
  --query "[?authorization.action && contains(authorization.action, 'write')].{identidade:caller, horario:eventTimestamp, recurso:resourceId, operacao:operationName.localizedValue}" \
  --output table
```

Para dar **nome determinístico e auditável** às execuções (prefixo + ambiente + carimbo de
tempo UTC) e aplicar o bloqueio de concorrência, use o script padronizado abaixo.

## Script padronizado de implantação

`scripts/iac/implantar.sh` encapsula a estratégia descrita aqui:

- nomeia o deployment de forma **determinística e auditável** (`orcamt-<ambiente>-<UTC>`);
- **recusa** iniciar se já houver deployment em andamento no RG (bloqueio de concorrência);
- opcionalmente aplica/retira **resource lock** no RG durante a janela (`--com-lock`);
- executa **`what-if` antes** do deploy (pré-visualização);
- em falha, **preserva o último state válido** e **registra a causa** (sem desfazer nada);
- ao final imprime o **rastro de auditoria** (identidade, horário, recursos alterados).

```bash
# Pré-visualização (não altera nada)
./scripts/iac/implantar.sh --ambiente dev --apenas-what-if

# Implantação com bloqueio de concorrência e lock durante a janela
./scripts/iac/implantar.sh --ambiente prd --com-lock
```

## Resumo de rastreabilidade

| Critério | Como é atendido | Onde |
| --- | --- | --- |
| R6.1 | Recursos provisionados só a partir de `infra/*.bicep` versionado | `infra/` |
| R6.3 — acesso restrito | RBAC no RG + OIDC do pipeline, sem segredo persistido | RBAC Azure / service connection |
| R6.3 — versionamento | Histórico de deployments ARM (imutável, consultável) | `az deployment group list/show` |
| R6.3 — bloqueio concorrente | Concorrência por ambiente no pipeline + checagem de deploy `Running` + resource lock | `scripts/iac/implantar.sh` + pipeline |
| R6.4 | Alteração sempre pelo IaC/pipeline, nunca pelo console | pipeline + RBAC |
| R6.5 | ARM preserva o último deployment bem-sucedido; script não desfaz e registra a causa | histórico de deployment + script |
| R6.6 | Identidade, horário e recursos alterados no deployment ARM + Activity Log | `az monitor activity-log` / Diagnostic Settings |
