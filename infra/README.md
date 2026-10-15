# Infraestrutura como Código (Bicep)

Infraestrutura do **Sistema_Orcamento_MT** provisionada por código versionado (R6), parametrizada para os ambientes `dev`, `hml` e `prd` (R6.2).

> **Plataforma de hospedagem:** Azure **App Service (Linux)** com entrada por **Private Endpoint** (`publicNetworkAccess = Disabled`) e saída por **VNet Integration** numa subnet dedicada delegada a `Microsoft.Web/serverFarms`. Essa escolha substitui o Azure Container Apps (que exigia subnet /23), porque a equipe de Redes cria as subnets manualmente com limite corporativo de **/25 por subnet** — e a subnet de integração do App Service cabe em **/26**.

## Estrutura

```
infra/
├── main.bicep            # Entrada no escopo de Resource Group; orquestra os módulos
├── modules/
│   ├── rede.bicep        # Camada de rede privada (VNet, subnets, Private DNS Zones)
│   ├── dados.bicep       # Cosmos DB serverless + Key Vault (acesso só por Private Endpoint)
│   └── computacao.bicep  # App Service (Linux) privado + App Insights + Managed Identity
├── params/
│   ├── dev.bicepparam    # Valores do ambiente de desenvolvimento
│   ├── hml.bicepparam    # Valores do ambiente de homologação
│   └── prd.bicepparam    # Valores do ambiente de produção
├── backend-state.md      # Estratégia de state remoto e auditoria (ARM/Bicep)
└── README.md
```

## Camada de rede privada (`modules/rede.bicep`) — tarefa 12.1

Implementa a **topologia de rede privada** descrita no design (seção "Topologia de rede privada"), atendendo a R3.1, R4.1, R4.4 e R4.5:

| Recurso | Função | Requisito |
| --- | --- | --- |
| `Microsoft.Network/virtualNetworks` | VNet privada dedicada à solução | R4.1 |
| `subnet-apps` (delegada a `Microsoft.Web/serverFarms`) | VNet Integration do App Service (saída pela VNet, IP privado) | R4.1, R4.4 |
| `subnet-endpoints` | Hospeda os Private Endpoints de Cosmos DB, Key Vault e App Service | R4.5 |
| Private DNS Zone `privatelink.documents.azure.com` | Resolução privada do Cosmos DB (API SQL) | R4.5 |
| Private DNS Zone `privatelink.vaultcore.azure.net` | Resolução privada do Key Vault | R4.5 |
| Private DNS Zone `privatelink.azurewebsites.net` | Resolução privada do App Service (Private Endpoint de entrada) | R4.5 |
| `virtualNetworkLinks` | Vincula as zonas DNS à VNet (sem auto-registro) | R4.5 |

**Sem IP público:** o módulo não cria nenhum endereço IP público. A entrada da aplicação é por Private Endpoint do App Service (`publicNetworkAccess=Disabled`), a saída é por VNet Integration na `subnet-apps`, e os serviços de dados são acessíveis apenas por Private Endpoint, resolvido pelas Private DNS Zones (R4.4, R4.5).

### Parâmetros principais

- `ambiente` — `dev` | `hml` | `prd` (compõe os nomes para isolar ambientes).
- `prefixoNome` — prefixo base dos nomes dos recursos.
- `prefixoEnderecoVnet`, `prefixoEnderecoSubnetApps`, `prefixoEnderecoSubnetEndpoints` — CIDRs do plano de endereçamento corporativo. As subnets usam **/26** (<= /25 corporativo).
- `zonaDnsCosmos`, `zonaDnsKeyVault`, `zonaDnsAppService` — nomes das Private DNS Zones (parametrizados para nuvens soberanas).
- `tags` — tags corporativas.

> As diferenças entre ambientes se expressam **apenas por valores de parâmetros** versionados; os arquivos de parâmetros por ambiente ficam em `infra/params/` (ver seção abaixo).

## Camada de dados (`modules/dados.bicep`) — tarefa 12.2

Implementa a **persistência gerenciada e o cofre de segredos**, ambos sem rede pública e acessíveis exclusivamente por **Private Endpoint** na `subnet-endpoints`, resolvidos pelas Private DNS Zones do módulo de rede (R3.1, R4.5, R5.2, R5.3):

| Recurso | Configuração-chave | Requisito |
| --- | --- | --- |
| `Microsoft.DocumentDB/databaseAccounts` (API SQL) | `capabilities: EnableServerless` (serverless) | R3.2 |
| | `publicNetworkAccess: Disabled` (sem rede pública) | R4.5 |
| | Criptografia em repouso nativa **≥ AES-256** (sempre ativa, não desabilitável) | R5.2 |
| | `minimalTlsVersion: Tls12` | R4.2, R4.3 |
| banco + container particionado por `/ambiente` | Segregação lógica dos dados por Ambiente | R5.3 |
| Private Endpoint (`groupId: Sql`) + `privateDnsZoneGroups` | Acesso privado ao Cosmos resolvido pela Private DNS Zone | R4.5 |
| `Microsoft.KeyVault/vaults` | `publicNetworkAccess: Disabled` + `networkAcls.defaultAction: Deny` | R4.5 |
| | `enableRbacAuthorization: true`, soft-delete e purge protection | R9 |
| Private Endpoint (`groupId: vault`) + `privateDnsZoneGroups` | Acesso privado ao Key Vault resolvido pela Private DNS Zone | R4.5 |

> A criptografia em repouso do Cosmos DB é fornecida pela plataforma com chaves gerenciadas pelo serviço (AES-256), sempre ativa — satisfazendo R5.2 sem configuração adicional. A segregação por ambiente (R5.3) é obtida pela combinação de conta/nome por ambiente **e** chave de partição `/ambiente` no container.

## Camada de computação e observabilidade (`modules/computacao.bicep`) — tarefa 12.2

Implementa a **hospedagem no App Service (Linux) com entrada privada** e a **telemetria**, consumindo a `subnet-apps` e a `subnet-endpoints` (rede) e os endpoints do módulo de dados (R3.1, R3.2, R4.1–R4.4):

| Recurso | Configuração-chave | Requisito |
| --- | --- | --- |
| `Microsoft.OperationalInsights/workspaces` | Backend do Application Insights | R10 |
| `Microsoft.Insights/components` (App Insights) | Modo *workspace-based*, telemetria JSON | R10 |
| `Microsoft.Web/serverfarms` | App Service Plan Linux (`reserved: true`) | R3.2 |
| `Microsoft.Web/sites` | `identity: SystemAssigned` (Managed Identity) | R9.2 |
| | `publicNetworkAccess: Disabled` (entrada só por Private Endpoint) | R4.1, R4.4 |
| | `virtualNetworkSubnetId: subnet-apps` + `vnetRouteAllEnabled: true` (VNet Integration) | R4.1 |
| | `httpsOnly: true`, `minTlsVersion: 1.2` (recusa HTTP e TLS < 1.2) | R4.2, R4.3 |
| `Microsoft.Network/privateEndpoints` (`groupId: sites`) + `privateDnsZoneGroups` | Private Endpoint de **entrada** do App Service | R4.4 |
| `Microsoft.Authorization/roleAssignments` | Papel **Key Vault Secrets User** à Managed Identity do App Service | R9.2 |

> **Managed Identity → Key Vault:** o App Service usa identidade atribuída pelo sistema; o módulo concede a ela o papel *Key Vault Secrets User* (RBAC) com escopo no Key Vault criado em `dados.bicep`. A aplicação recupera segredos em tempo de execução via Managed Identity, sem segredos em código/config (R9.2). A entrada é **privada** (sem IP público, só pelo Private Endpoint) e exige HTTPS com TLS 1.2+ (R4.2–R4.4).

### Integração no `main.bicep`

`main.bicep` orquestra os três módulos no **mesmo Resource Group** (R3.1), encadeando as dependências pelos outputs:

- `rede` → `dados`: `subnetEndpointsId`, `dnsZoneCosmosId`, `dnsZoneKeyVaultId`.
- `rede` → `computacao`: `subnetAppsId`, `subnetEndpointsId`, `dnsZoneAppServiceId`.
- `dados` → `computacao`: `keyVaultId`, `keyVaultUri`, `cosmosEndpoint` (injetados no App Service como app settings e usados na atribuição de papel RBAC).

Os parâmetros de computação/dados têm **valores padrão** e, por isso, não exigem alteração nos arquivos `.bicepparam` existentes; `skuPlano` e `runtimeLinux` podem ser sobrescritos por ambiente quando necessário.

## Parametrização por ambiente (`infra/params/`) — tarefa 12.3

O **mesmo código** (`main.bicep` + `modules/`) provisiona `dev`, `hml` e `prd`. As diferenças entre ambientes ficam **exclusivamente** nos arquivos de parâmetros versionados, sem nenhuma alteração no código entre ambientes (R6.2). Os arquivos usam o formato `.bicepparam`, que referencia o template com `using '../main.bicep'` e só atribui valores aos parâmetros declarados em `main.bicep` (`ambiente`, `prefixoNome`, `prefixoEnderecoVnet`, `prefixoEnderecoSubnetApps`, `prefixoEnderecoSubnetEndpoints`, `tags`).

### Isolamento entre ambientes (R11.2)

Cada ambiente recebe nomes e um **plano de endereçamento CIDR exclusivo**, sem sobreposição, garantindo recursos de rede distintos e sem compartilhamento entre `dev`/`hml`/`prd`. As subnets usam **/26** (64 IPs), respeitando o limite corporativo de **/25** por subnet:

| Ambiente | `ambiente` | VNet | subnet-apps | subnet-endpoints |
| --- | --- | --- | --- | --- |
| Desenvolvimento | `dev` | `10.20.0.0/16` | `10.20.0.0/26` | `10.20.0.64/26` |
| Homologação | `hml` | `10.21.0.0/16` | `10.21.0.0/26` | `10.21.0.64/26` |
| Produção | `prd` | `10.22.0.0/16` | `10.22.0.0/26` | `10.22.0.64/26` |

> Os CIDRs acima são sugestões coerentes com o /16 por ambiente; o plano de endereçamento definitivo das subnets é de responsabilidade da equipe de Redes (ver `docs/chamado-redes-subnets.md`).

O valor de `ambiente` compõe o nome da VNet (`${prefixoNome}-vnet-${ambiente}`) e dos vínculos de DNS, de modo que recursos de ambientes diferentes nunca colidem de nome. O isolamento é reforçado implantando cada ambiente em seu **próprio Resource Group** (ver comandos abaixo).

### Como implantar cada ambiente

Cada ambiente é implantado com o **mesmo** `main.bicep`, variando apenas o arquivo de parâmetros e o Resource Group de destino:

```bash
# Desenvolvimento
az deployment group create \
  --resource-group rg-orcamento-mt-dev \
  --template-file infra/main.bicep \
  --parameters infra/params/dev.bicepparam

# Homologação
az deployment group create \
  --resource-group rg-orcamento-mt-hml \
  --template-file infra/main.bicep \
  --parameters infra/params/hml.bicepparam

# Produção
az deployment group create \
  --resource-group rg-orcamento-mt-prd \
  --template-file infra/main.bicep \
  --parameters infra/params/prd.bicepparam
```

> Pré-visualize sempre com `what-if` antes do deploy, trocando o `--parameters` pelo arquivo do ambiente alvo:
>
> ```bash
> az deployment group what-if \
>   --resource-group rg-orcamento-mt-dev \
>   --template-file infra/main.bicep \
>   --parameters infra/params/dev.bicepparam
> ```

## State remoto e auditoria (modelo ARM/Bicep) — tarefa 12.4

O projeto adota **Bicep**, compilado para **ARM**. Diferente do Terraform, **o ARM não mantém arquivo de state separado**: o estado de verdade é o conjunto de recursos no Resource Group e o **histórico de deployments ARM** (versionado, imutável e auditável). A estratégia completa de *state remoto*, controle de acesso, bloqueio de concorrência, preservação em falha e auditoria está em **[`backend-state.md`](./backend-state.md)** (atende R6.1, R6.3, R6.4, R6.5, R6.6).

| Critério | Equivalente nativo ARM/Bicep | Requisito |
| --- | --- | --- |
| State remoto + versionamento de histórico | Estado real no Resource Group + histórico de **deployments ARM** | R6.3 |
| Acesso restrito a identidades autorizadas | **RBAC no RG** + **OIDC** do pipeline (sem segredo persistido) | R6.3 |
| Bloqueio contra execuções concorrentes | Concorrência por ambiente no pipeline + checagem de deploy `Running` + **resource lock** | R6.3 |
| Falha preserva o último state válido (sem state parcial) + causa | ARM mantém o último deployment bem-sucedido; a causa fica no histórico | R6.5 |
| Auditoria (identidade, horário, recursos alterados) | Deployment ARM + **Activity Log** do RG | R6.6 |

A implantação padronizada é feita pelo script **`scripts/iac/implantar.sh`**, que nomeia o deployment de forma determinística/auditável (`orcamt-<ambiente>-<UTC>`), recusa iniciar se houver deployment em andamento (bloqueio de concorrência), pré-visualiza com `what-if`, **preserva o último state válido em falha** e, ao final, imprime o rastro de auditoria:

```bash
# Pré-visualização (não altera nada)
./scripts/iac/implantar.sh --ambiente dev --apenas-what-if

# Implantação com bloqueio de concorrência e resource lock durante a janela
./scripts/iac/implantar.sh --ambiente prd --com-lock
```

## Checagens de política (policy-as-code) — tarefa 12.5

As propriedades-chave de segurança do IaC são verificadas automaticamente por um teste executável, independente da Azure CLI, em **`src/test/infraPolitica.test.js`**. O teste lê os arquivos `.bicep` (sem alterá-los) e falha se qualquer uma das garantias abaixo for removida ou enfraquecida:

| Garantia validada | Onde | Requisito |
| --- | --- | --- |
| App Service com `publicNetworkAccess: Disabled` (entrada só por Private Endpoint) | `computacao.bicep` | R4.1, R4.4 |
| App Service com VNet Integration (`virtualNetworkSubnetId`) e Private Endpoint `sites` | `computacao.bicep` | R4.1, R4.4 |
| Cosmos DB e Key Vault com `publicNetworkAccess: Disabled` (e Key Vault `defaultAction: Deny`) | `dados.bicep` | R4.4 |
| TLS mínimo 1.2 e HTTPS: `minimalTlsVersion: Tls12` (Cosmos), `httpsOnly`/`minTlsVersion: 1.2` (App Service) | `dados.bicep`, `computacao.bicep` | R4.2, R4.3 |
| Nenhum recurso de IP público (`publicIPAddresses`, `natGateways`, propriedade `publicIpAddress`) | todos os módulos | R4.4 |
| subnet-apps delegada a `Microsoft.Web/serverFarms` | `rede.bicep` | R4.1 |
| Resource Group único: `targetScope = 'resourceGroup'` e sem criação de `Microsoft.Resources/resourceGroups` nem escopo `subscription`/`tenant` | todos os módulos | R3.1 |

Rodar a checagem localmente ou no pipeline:

```bash
npm run test:run -- src/test/infraPolitica.test.js
```

Essas asserções estáticas desempenham, neste ambiente (sem `az`/`bicep`), o papel das checagens de política de um `what-if`: travam as decisões de segurança do design para que uma alteração acidental no Bicep seja barrada pelos testes do pipeline. Quando a Azure CLI estiver disponível, elas são complementadas pelo `az bicep build` + `az deployment group what-if` (abaixo), que valida sintaxe e prevê o diff de recursos contra um Resource Group alvo.

## Validação

> **Observação:** neste ambiente de desenvolvimento as CLIs `az` e `bicep` **não estavam disponíveis**, então a compilação com `az bicep build` e a validação dos arquivos `.bicepparam` com `az bicep build-params` **não puderam ser executadas**. A checagem de política automatizada (`src/test/infraPolitica.test.js`, seção acima) cobre as propriedades-chave agora; os módulos (`rede.bicep`, `dados.bicep`, `computacao.bicep`), o `main.bicep` e os arquivos de parâmetros por ambiente foram revisados manualmente quanto a sintaxe, encadeamento de outputs entre módulos, consistência com os parâmetros declarados em `main.bicep`, versões de API e aderência ao design (entrada privada por Private Endpoint, `publicNetworkAccess=Disabled`, VNet Integration, HTTPS/TLS mínimo 1.2, criptografia em repouso ≥ AES-256, Private Endpoints e Managed Identity). Recomenda-se executar a validação abaixo em um ambiente com a Azure CLI instalada antes do deploy.

```bash
# Compilação/validação de sintaxe do template
az bicep build --file infra/main.bicep

# Validação de sintaxe de cada arquivo de parâmetros
az bicep build-params --file infra/params/dev.bicepparam
az bicep build-params --file infra/params/hml.bicepparam
az bicep build-params --file infra/params/prd.bicepparam

# Pré-visualização das mudanças (what-if) contra um Resource Group alvo
az deployment group what-if \
  --resource-group rg-orcamento-mt-dev \
  --template-file infra/main.bicep \
  --parameters infra/params/dev.bicepparam
```
