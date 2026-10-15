// =============================================================================
// main.bicep — Entrada da infraestrutura do Sistema_Orcamento_MT
//
// Escopo: Resource Group único e dedicado à solução (R3.1).
//
// A entrada orquestra as camadas da solução, todas no mesmo Resource Group (R3.1):
//   - REDE PRIVADA (12.1): VNet, subnet-apps (delegada a Microsoft.Web/serverFarms
//     para a VNet Integration do App Service), subnet-endpoints e Private DNS
//     Zones (Cosmos, Key Vault e App Service) — R4.1, R4.4, R4.5.
//   - DADOS (12.2): Cosmos DB serverless + Key Vault, ambos sem rede pública e
//     acessíveis apenas por Private Endpoint resolvido pelas Private DNS Zones
//     (R4.5, R5.2, R5.3). Criptografia em repouso >= AES-256 nativa do Cosmos.
//   - COMPUTAÇÃO/OBSERVABILIDADE (12.2): App Service (Linux) com entrada privada
//     (publicNetworkAccess Disabled + Private Endpoint), saída por VNet
//     Integration, HTTPS/TLS 1.2+, Managed Identity que lê segredos do Key Vault
//     via RBAC, e Application Insights (R3.2, R4.1-R4.4).
//
// Decisão de plataforma: App Service (Linux) substitui Azure Container Apps. A
// subnet de integração do App Service cabe em /26 (<= /25 corporativo), enquanto
// o ambiente interno do Container Apps exigia /23.
//
// Fluxo de dependências entre módulos:
//   rede  ->  dados (subnet-endpoints, zonas DNS)
//   rede  ->  computacao (subnet-apps, subnet-endpoints, zona DNS do App Service)
//   dados ->  computacao (keyVaultId/Uri e cosmosEndpoint para o App Service)
// =============================================================================

targetScope = 'resourceGroup'

// -----------------------------------------------------------------------------
// Parâmetros (expressam as diferenças entre dev/hml/prd apenas por valor — R6.2)
// -----------------------------------------------------------------------------

@description('Identificador do ambiente (dev, hml ou prd).')
@allowed([
  'dev'
  'hml'
  'prd'
])
param ambiente string

@description('Prefixo base dos nomes dos recursos.')
@minLength(2)
@maxLength(12)
param prefixoNome string = 'orcamt'

@description('Região (location) dos recursos. Por padrão herda do Resource Group.')
param localizacao string = resourceGroup().location

@description('CIDR da VNet privada.')
param prefixoEnderecoVnet string = '10.20.0.0/16'

@description('CIDR da subnet-apps (delegada a Microsoft.Web/serverFarms). Recomendado /26 (<= /25).')
param prefixoEnderecoSubnetApps string = '10.20.0.0/26'

@description('CIDR da subnet-endpoints (Private Endpoints).')
param prefixoEnderecoSubnetEndpoints string = '10.20.0.64/26'

@description('SKU do App Service Plan (Linux).')
param skuPlano string = 'P1v3'

@description('Runtime do App Service Linux (linuxFxVersion).')
param runtimeLinux string = 'NODE|20-lts'

@description('Tags corporativas aplicadas aos recursos.')
param tags object = {
  solucao: 'orcamento-mt'
  ambiente: ambiente
}

// -----------------------------------------------------------------------------
// Camada de rede privada
// -----------------------------------------------------------------------------

module rede 'modules/rede.bicep' = {
  name: 'rede-privada'
  params: {
    ambiente: ambiente
    prefixoNome: prefixoNome
    localizacao: localizacao
    prefixoEnderecoVnet: prefixoEnderecoVnet
    prefixoEnderecoSubnetApps: prefixoEnderecoSubnetApps
    prefixoEnderecoSubnetEndpoints: prefixoEnderecoSubnetEndpoints
    tags: tags
  }
}

// -----------------------------------------------------------------------------
// Camada de dados (Cosmos DB serverless + Key Vault, só por Private Endpoint)
// -----------------------------------------------------------------------------

module dados 'modules/dados.bicep' = {
  name: 'dados-privados'
  params: {
    ambiente: ambiente
    prefixoNome: prefixoNome
    localizacao: localizacao
    // Consome os outputs do módulo de rede (subnet e zonas DNS privadas).
    subnetEndpointsId: rede.outputs.subnetEndpointsId
    dnsZoneCosmosId: rede.outputs.dnsZoneCosmosId
    dnsZoneKeyVaultId: rede.outputs.dnsZoneKeyVaultId
    tags: tags
  }
}

// -----------------------------------------------------------------------------
// Camada de computação (App Service Linux privado) e observabilidade (App Insights)
// -----------------------------------------------------------------------------

module computacao 'modules/computacao.bicep' = {
  name: 'computacao-interna'
  params: {
    ambiente: ambiente
    prefixoNome: prefixoNome
    localizacao: localizacao
    // subnet-apps (delegada) para a VNet Integration do App Service e
    // subnet-endpoints para o Private Endpoint de entrada do site.
    subnetAppsId: rede.outputs.subnetAppsId
    subnetEndpointsId: rede.outputs.subnetEndpointsId
    dnsZoneAppServiceId: rede.outputs.dnsZoneAppServiceId
    // Key Vault e Cosmos do módulo de dados: o App Service lê segredos via
    // Managed Identity (RBAC) e recebe os endpoints como app settings.
    keyVaultId: dados.outputs.keyVaultId
    keyVaultUri: dados.outputs.keyVaultUri
    cosmosEndpoint: dados.outputs.cosmosEndpoint
    skuPlano: skuPlano
    runtimeLinux: runtimeLinux
    tags: tags
  }
}

// -----------------------------------------------------------------------------
// Outputs da solução
// -----------------------------------------------------------------------------

@description('ID da VNet privada.')
output vnetId string = rede.outputs.vnetId

@description('ID da subnet-apps (delegada a Microsoft.Web/serverFarms).')
output subnetAppsId string = rede.outputs.subnetAppsId

@description('ID da subnet-endpoints (Private Endpoints).')
output subnetEndpointsId string = rede.outputs.subnetEndpointsId

@description('ID da Private DNS Zone do Cosmos DB.')
output dnsZoneCosmosId string = rede.outputs.dnsZoneCosmosId

@description('ID da Private DNS Zone do Key Vault.')
output dnsZoneKeyVaultId string = rede.outputs.dnsZoneKeyVaultId

@description('ID da Private DNS Zone do App Service.')
output dnsZoneAppServiceId string = rede.outputs.dnsZoneAppServiceId

@description('ID da conta Cosmos DB serverless.')
output cosmosId string = dados.outputs.cosmosId

@description('Endpoint privado do Cosmos DB.')
output cosmosEndpoint string = dados.outputs.cosmosEndpoint

@description('ID do Key Vault.')
output keyVaultId string = dados.outputs.keyVaultId

@description('URI do Key Vault.')
output keyVaultUri string = dados.outputs.keyVaultUri

@description('ID do App Service (Web App).')
output webAppId string = computacao.outputs.webAppId

@description('Hostname padrão (privado) do App Service.')
output webAppHost string = computacao.outputs.webAppHost

@description('Principal ID da Managed Identity do App Service.')
output webAppPrincipalId string = computacao.outputs.webAppPrincipalId

@description('ID do Application Insights.')
output appInsightsId string = computacao.outputs.appInsightsId
