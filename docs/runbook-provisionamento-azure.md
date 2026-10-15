# Runbook — Provisionamento dos recursos reais na Azure

> **Spec:** `adequacao-diretrizes-cemig` · **Tarefa:** 12.6 — Provisionar recursos reais na Azure (recurso corporativo externo)
> **Requisitos atendidos:** **R3.1** (Resource Group único), **R4.6** (acesso só pela rede interna corporativa), **R6.1** (tudo provisionado por IaC versionado).
> **IaC de referência:** `infra/main.bicep` + `infra/modules/*.bicep` + `infra/params/<amb>.bicepparam`.
> **Script de implantação:** `scripts/iac/implantar.sh`.
> **State/auditoria:** ver [`infra/backend-state.md`](../infra/backend-state.md) (R6.3, R6.4, R6.5, R6.6).

---

## ⚠️ Status desta tarefa: EXECUÇÃO EFETIVA PENDENTE

A **execução real** deste runbook **não foi realizada** neste ambiente e **não pode ser**:
o provisionamento depende de **recursos corporativos externos** que não estão disponíveis
aqui:

- Assinatura (subscription) Azure corporativa e permissões (RBAC) no escopo dos Resource Groups;
- VNet corporativa com peering/rotas e **ExpressRoute/VPN** para acesso pela rede interna (R4.6);
- Azure CLI (`az`) com extensão **Bicep** **autenticada** (`az login` / OIDC do pipeline);
- Grupos do **Microsoft Entra ID** criados e seus **GUIDs** conhecidos.

Este documento é o **artefato operacional** que torna o provisionamento **executável por quem
tiver acesso** ao ambiente corporativo. Nenhum passo abaixo foi aplicado; todos são
instruções a executar por um operador autorizado. A tarefa 12.6 é marcada como opcional
exatamente por depender desses recursos externos (ver `tasks.md` → notas).

---

## 1. Pré-requisitos

Conclua **todos** os itens antes de qualquer `what-if`/`apply`. Sem eles, o deploy falha ou
viola um critério de aceite.

### 1.1 Assinatura e contexto da Azure CLI

- Acesso à **assinatura** corporativa homologada (nuvem comercial ou soberana).
- `az` instalado **com a extensão Bicep**:

  ```bash
  az version                       # confirmar az instalada
  az bicep install                 # instalar/atualizar a extensão Bicep
  az login                         # ou autenticação OIDC no pipeline (sem segredo persistido)
  az account set --subscription "<ID-ou-nome-da-assinatura>"
  az account show --output table   # conferir o contexto ativo
  ```

### 1.2 RBAC no Resource Group (acesso restrito — R6.3)

- A **identidade de deploy** (service connection OIDC do pipeline, ou operador de plataforma)
  precisa de papel de **escrita no escopo do Resource Group** de cada ambiente
  (`Contributor` no RG, ou papel customizado mais restrito).
- Atribuir também **`User Access Administrator`** (ou equivalente) à identidade de deploy
  **no escopo do RG**, porque o `computacao.bicep` cria um `roleAssignment`
  (*Key Vault Secrets User* para a Managed Identity) — criar atribuições de papel exige essa
  permissão.
- Auditores recebem apenas **`Reader`** no RG (leitura do histórico de deployments).
- **Nenhuma** identidade pessoal implanta em `hml`/`prd`: a alteração entra **sempre pelo
  pipeline a partir de código versionado** (R6.4), nunca pelo console.

### 1.3 Service connection OIDC (pipeline → Azure)

- Criar/validar a **service connection** do Azure DevOps com **Workload Identity Federation
  (OIDC)**, sem segredo de longa duração.
- Vincular a service connection a **ambientes** do Azure DevOps (`dev`, `hml`, `prd`), com
  **aprovação manual** obrigatória em `prd` (R7.6).

### 1.4 Resource Groups por ambiente (R3.1 — um RG por ambiente)

Crie **um único Resource Group por ambiente** (nenhum recurso da solução fora dele — R3.1).
O script **não cria** o RG por segurança; crie-o antecipadamente:

```bash
az group create --name rg-orcamento-mt-dev --location <regiao> --tags solucao=orcamento-mt ambiente=dev
az group create --name rg-orcamento-mt-hml --location <regiao> --tags solucao=orcamento-mt ambiente=hml
az group create --name rg-orcamento-mt-prd --location <regiao> --tags solucao=orcamento-mt ambiente=prd
```

> O nome padrão esperado pelo script é `rg-orcamento-mt-<amb>`. Para outro nome, passe
> `--resource-group <nome>` ao `implantar.sh`.

### 1.5 Rede corporativa: peering/rotas + ExpressRoute/VPN (R4.6)

O Bicep provisiona a **VNet privada** da solução, as subnets (`subnet-apps`,
`subnet-endpoints`), as **Private DNS Zones** e os **Private Endpoints** (sem IP público).
Para que o acesso seja **exclusivamente pela rede interna corporativa** (R4.6) e o ingress
interno seja alcançável, é necessário conectar a VNet da solução à rede corporativa — essa
parte depende da **topologia corporativa** e normalmente é feita pela equipe de rede:

- **VNet peering** entre a VNet da solução (CIDR por ambiente: `dev 10.20.0.0/16`,
  `hml 10.21.0.0/16`, `prd 10.22.0.0/16`) e a(s) VNet(s)/hub corporativo, **sem sobreposição
  de endereçamento** (R11.2);
- **Rotas** (UDR/route tables) e propagação para que a origem interna chegue ao **Private
  Endpoint de entrada do App Service** na `subnet-endpoints` (e à `subnet-apps` usada pela
  VNet Integration do App Service);
- **ExpressRoute** e/ou **VPN** ligando a rede corporativa ao ambiente Azure, de modo que a
  origem do acesso seja **interna** (R4.6: requisição originada fora da rede interna é
  recusada);
- Garantir que as **Private DNS Zones** (`privatelink.documents.azure.com`,
  `privatelink.vaultcore.azure.net`, `privatelink.azurewebsites.net`) sejam resolvíveis a
  partir da rede corporativa (vinculação de zonas / encaminhamento de DNS corporativo para o
  resolver privado), para que App Service, Cosmos DB e Key Vault resolvam por **Private Endpoint**.

> **Nota:** os CIDRs por ambiente estão versionados em `infra/params/<amb>.bicepparam`.
> Alinhe-os com o plano de endereçamento corporativo **antes** do deploy; qualquer ajuste é
> feito **somente** nesses arquivos de parâmetros (R6.2), nunca no código.

### 1.6 Grupos do Entra ID + GUIDs no RBAC_CONFIG / Key Vault

- Criar (ou identificar) os **grupos do Entra ID** correspondentes aos papéis da aplicação:
  **leitor**, **editor**, **admin**.
- Coletar o **GUID (object id)** de cada grupo:

  ```bash
  az ad group show --group "<nome-do-grupo-leitores>" --query id --output tsv
  az ad group show --group "<nome-do-grupo-editores>" --query id --output tsv
  az ad group show --group "<nome-do-grupo-admins>"   --query id --output tsv
  ```

- **Preencher os GUIDs** na configuração versionada de RBAC
  [`src/api/auth/rbac.config.js`](../src/api/auth/rbac.config.js), substituindo os
  placeholders (`00000000-0000-0000-0000-00000000000{1,2,3}`) pelos GUIDs reais. Essa é a
  **fonte única** do mapeamento grupo → papel (R2.1):

  | Papel  | Placeholder atual                         | Substituir pelo GUID real do grupo |
  | ------ | ----------------------------------------- | ---------------------------------- |
  | leitor | `00000000-0000-0000-0000-000000000001`    | `<guid-grupo-leitores>`            |
  | editor | `00000000-0000-0000-0000-000000000002`    | `<guid-grupo-editores>`            |
  | admin  | `00000000-0000-0000-0000-000000000003`    | `<guid-grupo-admins>`              |

- Como a configuração grupo → papel é **config versionada (não dado de usuário)**, os GUIDs
  reais de ambientes sensíveis podem, alternativamente, ser injetados a partir do **Key Vault**
  em tempo de execução (o App Service lê segredos via **Managed Identity**, R9.2),
  mantendo o repositório sem GUIDs de produção quando essa for a política corporativa.
- Registrar/App rooting: a Managed Identity do App Service recebe **Key Vault Secrets User**
  automaticamente pelo `computacao.bicep` (R9.2) — não há segredo em código/config.

---

## 2. Ordem de execução por ambiente (dev → hml → prd)

Promova **sempre na ordem** `dev → hml → prd`, validando cada ambiente antes de avançar.
Em `hml`/`prd` o **`what-if` é obrigatório** antes do `apply` (R6.5: reduz risco de falha no
meio da execução). Use o script padronizado `scripts/iac/implantar.sh`, que: valida o template
(`az bicep build`), **recusa iniciar se houver deployment `Running`** (bloqueio de
concorrência — R6.3), pré-visualiza com `what-if`, aplica com **nome determinístico/auditável**
(`orcamt-<amb>-<UTC>`), **preserva o último state válido em falha** (R6.5) e imprime o rastro
de auditoria (R6.6).

> O script é `bash`. Em Windows, execute por **WSL** ou **Git Bash**. Dê permissão de execução
> uma vez: `chmod +x scripts/iac/implantar.sh`.

### 2.1 Desenvolvimento (`dev`)

```bash
# 1) Pré-visualização (NÃO altera nada)
./scripts/iac/implantar.sh --ambiente dev --apenas-what-if

# 2) Revisar o diff do what-if. Se estiver conforme o esperado, aplicar:
./scripts/iac/implantar.sh --ambiente dev
```

Depois execute as **verificações pós-deploy** da Seção 3 para `dev`. **Só avance para `hml`
após `dev` passar** em todos os critérios.

### 2.2 Homologação (`hml`)

```bash
./scripts/iac/implantar.sh --ambiente hml --apenas-what-if   # obrigatório revisar o diff
./scripts/iac/implantar.sh --ambiente hml --com-lock         # lock no RG durante a janela
```

Execute as verificações pós-deploy da Seção 3 para `hml`. **Só avance para `prd` após `hml`
passar.**

### 2.3 Produção (`prd`)

- A promoção para `prd` deve ocorrer **pelo pipeline**, após **aprovação manual registrada**
  de ≥ 1 aprovador (R7.6); não implante `prd` manualmente pelo console.
- O `what-if` é **obrigatório** e o `--com-lock` é **recomendado**:

```bash
./scripts/iac/implantar.sh --ambiente prd --apenas-what-if   # obrigatório revisar o diff
./scripts/iac/implantar.sh --ambiente prd --com-lock
```

Execute as verificações pós-deploy da Seção 3 para `prd`.

---

## 3. Verificações pós-deploy

Rode em **cada ambiente** após o `apply`. Todas devem passar antes de promover ao próximo
ambiente. Substitua `<amb>` por `dev`/`hml`/`prd` e os nomes de recurso conforme os outputs do
deployment (`az deployment group show ... --query properties.outputs`).

### 3.1 Entrada privada sem IP público (R4.4 / R4.6)

```bash
# Nenhum IP público no RG (esperado: lista vazia)
az network public-ip list --resource-group rg-orcamento-mt-<amb> --output table

# App Service com rede pública desabilitada (entrada só por Private Endpoint)
az webapp show --resource-group rg-orcamento-mt-<amb> --name <nome-da-app> \
  --query "publicNetworkAccess" --output tsv   # esperado: Disabled

# App Service com HTTPS obrigatório e TLS mínimo 1.2
az webapp show --resource-group rg-orcamento-mt-<amb> --name <nome-da-app> \
  --query "httpsOnly" --output tsv              # esperado: true
az webapp config show --resource-group rg-orcamento-mt-<amb> --name <nome-da-app> \
  --query "minTlsVersion" --output tsv          # esperado: 1.2

# Private Endpoint de entrada do App Service provisionado
az network private-endpoint list --resource-group rg-orcamento-mt-<amb> \
  --query "[?contains(name, 'pe-app')].name" --output tsv
```

- **Aceite:** nenhum IP público; `publicNetworkAccess=Disabled`; `httpsOnly=true`;
  `minTlsVersion=1.2`; Private Endpoint de entrada do App Service presente.

### 3.2 Private Endpoints resolvendo (R4.5)

```bash
# Private Endpoints provisionados (Cosmos e Key Vault)
az network private-endpoint list --resource-group rg-orcamento-mt-<amb> --output table

# A partir de um host NA REDE INTERNA (jump box / agente do pipeline na VNet),
# os FQDNs devem resolver para IP PRIVADO (10.x), não público:
nslookup <conta-cosmos>.documents.azure.com
nslookup <nome-keyvault>.vault.azure.net
nslookup <nome-da-app>.azurewebsites.net
```

- **Aceite:** FQDNs do App Service, do Cosmos DB e do Key Vault resolvem para **IP privado**
  da `subnet-endpoints`, via Private DNS Zones.

### 3.3 Key Vault acessível via Managed Identity (R9.2)

- A partir do App Service (ou validando a atribuição de papel):

```bash
# A Managed Identity (SystemAssigned) do App Service deve ter "Key Vault Secrets User" no cofre
PRINCIPAL=$(az webapp show --resource-group rg-orcamento-mt-<amb> --name <nome-da-app> \
  --query identity.principalId --output tsv)

az role assignment list --assignee "$PRINCIPAL" \
  --scope "$(az keyvault show --name <nome-keyvault> --query id --output tsv)" \
  --query "[].roleDefinitionName" --output tsv   # esperado conter: Key Vault Secrets User
```

- **Aceite:** a Managed Identity possui *Key Vault Secrets User*; a app recupera segredos em
  runtime **sem** segredos em código/config.

### 3.4 Application Insights recebendo telemetria (R10)

- Gere uma chamada à API (ex.: `GET /api/health`) a partir da rede interna e confirme a
  telemetria no Log Analytics do App Insights:

```bash
az monitor app-insights query --app <nome-app-insights> --resource-group rg-orcamento-mt-<amb> \
  --analytics-query "requests | where timestamp > ago(15m) | summarize count()"
```

- **Aceite:** o App Insights registra requisições/dependências após o tráfego de teste.

### 3.5 Critérios de aceite da tarefa 12.6

| Critério | Como validar | Status esperado |
| --- | --- | --- |
| **R3.1 — Resource Group único** | `az resource list --resource-group rg-orcamento-mt-<amb>` e confirmar que **todos** os recursos da solução estão nesse RG, e que não há recursos da solução fora dele | Todos no RG; nenhum fora |
| **R4.6 — acesso só pela rede interna** | 3.1 (sem IP público, ingress interno) + peering/rotas + ExpressRoute/VPN (1.5); tentativa de acesso **de fora** da rede interna deve ser **recusada/sem resposta** | Acesso externo recusado; interno OK |
| **R6.1 — tudo por IaC** | Recursos criados **somente** a partir de `infra/*.bicep`; nenhum recurso criado manualmente pelo console. Conferir histórico de deployments: `az deployment group list --resource-group rg-orcamento-mt-<amb> --output table` | Todo recurso rastreável a um deployment do IaC |

---

## 4. Rollback / preservação de estado em falha e auditoria

A estratégia completa está em [`infra/backend-state.md`](../infra/backend-state.md). Resumo
operacional:

### 4.1 Em caso de falha de execução (R6.5)

- **Não há state parcial a reconciliar.** No modelo ARM/Bicep não existe arquivo de state
  separado: o estado de verdade é o conjunto de recursos do RG + o histórico de deployments.
  Em falha, o **último deployment bem-sucedido permanece** como state válido.
- O `implantar.sh` trata a falha de forma **não destrutiva**: **não remove recursos** nem tenta
  "desfazer" o estado anterior; apenas **captura e registra a causa** e sai com erro.
- Diagnosticar a causa da última execução:

  ```bash
  az deployment operation group list \
    --resource-group rg-orcamento-mt-<amb> \
    --name <nome-do-deployment> \
    --query "[?properties.provisioningState=='Failed'].{recurso:properties.targetResource.id, codigo:properties.statusMessage.error.code, msg:properties.statusMessage.error.message}" \
    --output json
  ```

- **Procedimento de rollback:** corrija a causa **no código versionado** (`infra/*.bicep` ou
  `params/<amb>.bicepparam`), rode `what-if`, e **reaplique pelo IaC** (R6.4 — nunca pelo
  console). Para voltar a um estado anterior conhecido, faça checkout do commit correspondente
  do IaC e reaplique; o ARM reconcilia o RG para o estado descrito pelo template.
- Se usou `--com-lock`, o script **remove o resource lock** ao final (inclusive em falha, via
  `trap`); confirme com `az lock list --resource-group rg-orcamento-mt-<amb>`.

### 4.2 Auditoria (R6.6)

Toda alteração aplicada pelo IaC é auditável por duas fontes nativas:

```bash
# Linha do tempo (versões) do state da infraestrutura do RG
az deployment group list --resource-group rg-orcamento-mt-<amb> \
  --query "[].{nome:name, estado:properties.provisioningState, inicio:properties.timestamp}" --output table

# Identidade + horário + operações de escrita (Activity Log)
az monitor activity-log list --resource-group rg-orcamento-mt-<amb> --offset 7d \
  --query "[?authorization.action && contains(authorization.action, 'write')].{identidade:caller, horario:eventTimestamp, recurso:resourceId, operacao:operationName.localizedValue}" \
  --output table
```

- Recomenda-se exportar o **Activity Log** para o Log Analytics do App Insights (Diagnostic
  Settings) para retenção e rastreabilidade de longo prazo.

---

## 5. Checklist de execução (para o operador autorizado)

- [ ] Assinatura selecionada e `az`/`bicep` autenticados (1.1)
- [ ] RBAC no RG + `User Access Administrator` para a identidade de deploy (1.2)
- [ ] Service connection OIDC + ambientes do Azure DevOps com aprovação em `prd` (1.3)
- [ ] Resource Groups `rg-orcamento-mt-{dev,hml,prd}` criados (1.4)
- [ ] Peering/rotas + ExpressRoute/VPN + resolução das Private DNS Zones pela rede corporativa (1.5)
- [ ] Grupos do Entra ID criados e **GUIDs preenchidos** no `rbac.config.js` / Key Vault (1.6)
- [ ] `dev`: `what-if` revisado → `apply` → verificações 3.1–3.5 OK
- [ ] `hml`: `what-if` revisado → `apply --com-lock` → verificações 3.1–3.5 OK
- [ ] `prd`: aprovação manual → `what-if` revisado → `apply --com-lock` → verificações 3.1–3.5 OK
- [ ] Auditoria conferida (4.2) e Activity Log exportado para o Log Analytics

---

## 6. Referências

- IaC: `infra/main.bicep`, `infra/modules/{rede,dados,computacao}.bicep`, `infra/params/<amb>.bicepparam`
- Visão geral do IaC: [`infra/README.md`](../infra/README.md)
- State remoto, concorrência, falha e auditoria: [`infra/backend-state.md`](../infra/backend-state.md)
- Script de implantação: [`scripts/iac/implantar.sh`](../scripts/iac/implantar.sh)
- Config RBAC (GUIDs dos grupos): [`src/api/auth/rbac.config.js`](../src/api/auth/rbac.config.js)
- Requisitos: `.kiro/specs/adequacao-diretrizes-cemig/requirements.md` (R3.1, R4.6, R6.1)
- Design: `.kiro/specs/adequacao-diretrizes-cemig/design.md`

> **Lembrete final:** a **execução efetiva** deste runbook **fica pendente** de ambiente
> corporativo (assinatura, RBAC, VNet/ExpressRoute/VPN, `az` autenticada, grupos do Entra ID).
> Este documento habilita a execução por um operador autorizado; nenhum recurso foi
> provisionado a partir deste ambiente.

