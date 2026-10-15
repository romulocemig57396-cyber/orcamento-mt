// =============================================================================
// Módulo: computacao.bicep
// Camada de computação privada e observabilidade do Sistema_Orcamento_MT
// (R3.1, R3.2, R4.1, R4.2, R4.3, R4.4).
//
// Provisiona:
//   - Log Analytics Workspace (backend do Application Insights)
//   - Application Insights (modo workspace-based) para telemetria            (observabilidade)
//   - App Service Plan (Linux) para hospedar a SPA + API                     (R3.2)
//   - App Service (Web App Linux) com:
//       * Managed Identity atribuída pelo sistema (para acessar o Key Vault) (R9.2)
//       * publicNetworkAccess = Disabled -> entrada só por Private Endpoint  (R4.1/R4.4)
//       * VNet Integration na subnet-apps (saída pela VNet, IP privado)      (R4.1)
//       * httpsOnly = true e minTlsVersion = 1.2                             (R4.2/R4.3)
//   - Private Endpoint de ENTRADA do App Service na subnet-endpoints          (R4.4)
//   - Atribuição de papel RBAC (Key Vault Secrets User) à Managed Identity   (R9.2)
//
// Decisão de plataforma: migramos de Azure Container Apps para Azure App
// Service (Linux). Motivo: a subnet de integração do App Service cabe em /26,
// respeitando o limite corporativo de /25 por subnet, enquanto o ambiente
// interno do Container Apps exigia /23 (incompatível com o limite).
//
// Princípios:
//   - Nenhum recurso cria IP público; a entrada é por Private Endpoint e a
//     aplicação exige HTTPS com TLS mínimo 1.2.
//   - Parametrizável por ambiente (dev/hml/prd) — R6.2.
// =============================================================================

// -----------------------------------------------------------------------------
// Parâmetros
// -----------------------------------------------------------------------------

@description('Identificador do ambiente (dev, hml ou prd). Compõe os nomes dos recursos para evitar colisão e isolar ambientes.')
@allowed([
  'dev'
  'hml'
  'prd'
])
param ambiente string

@description('Prefixo base dos nomes dos recursos da solução (ex.: "orcamt").')
@minLength(2)
@maxLength(12)
param prefixoNome string = 'orcamt'

@description('Região (location) dos recursos de computação. Por padrão herda a região do Resource Group.')
param localizacao string = resourceGroup().location

@description('ID da subnet-apps (saída do módulo de rede), delegada a Microsoft.Web/serverFarms, usada na VNet Integration do App Service.')
param subnetAppsId string

@description('ID da subnet-endpoints (saída do módulo de rede), onde é criado o Private Endpoint de entrada do App Service.')
param subnetEndpointsId string

@description('ID da Private DNS Zone do App Service (saída do módulo de rede), usada no grupo de zonas DNS do Private Endpoint de entrada.')
param dnsZoneAppServiceId string

@description('ID do Key Vault (saída do módulo de dados), alvo da atribuição de papel à Managed Identity do App Service.')
param keyVaultId string

@description('URI do Key Vault (saída do módulo de dados) injetado como app setting para a aplicação recuperar segredos via Managed Identity.')
param keyVaultUri string = ''

@description('Endpoint do Cosmos DB (saída do módulo de dados) injetado como app setting da aplicação.')
param cosmosEndpoint string = ''

@description('SKU do App Service Plan (Linux). Padrão P1v3 (produção/privado); pode ser ajustado por ambiente.')
param skuPlano string = 'P1v3'

@description('Runtime do App Service Linux (linuxFxVersion). Padrão Node 20 LTS para servir a SPA + API.')
param runtimeLinux string = 'NODE|20-lts'

@description('Tags corporativas aplicadas a todos os recursos criados pelo módulo.')
param tags object = {}

// -----------------------------------------------------------------------------
// Variáveis
// -----------------------------------------------------------------------------

var nomeLogAnalytics = '${prefixoNome}-log-${ambiente}'
var nomeAppInsights = '${prefixoNome}-appi-${ambiente}'
var nomePlano = '${prefixoNome}-plan-${ambiente}'
var nomeWebApp = '${prefixoNome}-app-${ambiente}'
var nomePeWebApp = '${prefixoNome}-pe-app-${ambiente}'

// GUID do papel interno "Key Vault Secrets User" — concede leitura de segredos.
var papelKeyVaultSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'

// -----------------------------------------------------------------------------
// Observabilidade: Log Analytics + Application Insights
// -----------------------------------------------------------------------------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: nomeLogAnalytics
  location: localizacao
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// Application Insights no modo workspace-based (telemetria da aplicação — R10).
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: nomeAppInsights
  location: localizacao
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// -----------------------------------------------------------------------------
// App Service Plan (Linux)
// -----------------------------------------------------------------------------

resource plano 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: nomePlano
  location: localizacao
  tags: tags
  sku: {
    name: skuPlano
  }
  kind: 'linux'
  properties: {
    // reserved = true identifica um plano Linux.
    reserved: true
  }
}

// -----------------------------------------------------------------------------
// App Service (Web App Linux) — entrada privada, saída por VNet Integration
// -----------------------------------------------------------------------------

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: nomeWebApp
  location: localizacao
  tags: tags
  kind: 'app,linux'
  // Managed Identity atribuída pelo sistema: usada para acessar o Key Vault
  // sem segredos em código/config (R9.2).
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plano.id
    httpsOnly: true
    // VNet Integration: tráfego de SAÍDA roteado pela subnet-apps delegada.
    virtualNetworkSubnetId: subnetAppsId
    // Entrada bloqueada na rede pública; acesso só pelo Private Endpoint (R4.1/R4.4).
    publicNetworkAccess: 'Disabled'
    siteConfig: {
      linuxFxVersion: runtimeLinux
      // Exige TLS mínimo 1.2 e redireciona HTTP para HTTPS (R4.2/R4.3).
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      // Roteia todo o tráfego de saída pela VNet (inclui chamadas a dados).
      vnetRouteAllEnabled: true
      alwaysOn: true
      appSettings: [
        {
          name: 'AMBIENTE'
          value: ambiente
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVaultUri
        }
        {
          name: 'COSMOS_ENDPOINT'
          value: cosmosEndpoint
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
      ]
    }
  }
}

// -----------------------------------------------------------------------------
// Private Endpoint de ENTRADA do App Service (groupId "sites")
// -----------------------------------------------------------------------------

resource peWebApp 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: nomePeWebApp
  location: localizacao
  tags: tags
  properties: {
    subnet: {
      id: subnetEndpointsId
    }
    privateLinkServiceConnections: [
      {
        name: '${nomePeWebApp}-conn'
        properties: {
          privateLinkServiceId: webApp.id
          groupIds: [
            'sites'
          ]
        }
      }
    ]
  }
}

// Vincula o Private Endpoint do App Service à Private DNS Zone (resolução privada).
resource dnsGrupoWebApp 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: peWebApp
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'appservice'
        properties: {
          privateDnsZoneId: dnsZoneAppServiceId
        }
      }
    ]
  }
}

// -----------------------------------------------------------------------------
// RBAC: concede à Managed Identity do App Service leitura de segredos do Key Vault
// -----------------------------------------------------------------------------

// Referência ao Key Vault existente (criado no módulo de dados) para escopar a
// atribuição de papel. O papel "Key Vault Secrets User" permite ler segredos
// via RBAC, sem access policies e sem expor valores em código (R9.2).
resource keyVaultRef 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: last(split(keyVaultId, '/'))
}

resource atribuicaoKeyVault 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVaultRef
  // GUID determinístico por (vault, identidade, papel) para idempotência.
  name: guid(keyVaultId, webApp.id, papelKeyVaultSecretsUser)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', papelKeyVaultSecretsUser)
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

@description('ID do App Service Plan (Linux).')
output planoId string = plano.id

@description('ID do App Service (Web App).')
output webAppId string = webApp.id

@description('Nome do App Service (Web App).')
output webAppNome string = webApp.name

@description('Hostname padrão do App Service (resolvido de forma privada pela Private DNS Zone).')
output webAppHost string = webApp.properties.defaultHostName

@description('Principal ID (objectId) da Managed Identity atribuída ao App Service.')
output webAppPrincipalId string = webApp.identity.principalId

@description('ID do recurso de Application Insights.')
output appInsightsId string = appInsights.id

@description('Connection string do Application Insights (telemetria).')
output appInsightsConnectionString string = appInsights.properties.ConnectionString

@description('ID do Log Analytics Workspace.')
output logAnalyticsId string = logAnalytics.id
