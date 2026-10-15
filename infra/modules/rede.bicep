// =============================================================================
// Módulo: rede.bicep
// Topologia de rede privada do Sistema_Orcamento_MT (R3.1, R4.1, R4.4, R4.5).
//
// Provisiona:
//   - VNet privada dedicada à solução
//   - subnet-apps      -> delegada a Microsoft.Web/serverFarms (App Service
//                         VNet Integration — saída da aplicação para a VNet)
//   - subnet-endpoints -> dedicada a Private Endpoints (Cosmos DB, Key Vault
//                         e o Private Endpoint de ENTRADA do App Service)
//   - Private DNS Zones para resolução dos Private Endpoints:
//       * privatelink.documents.azure.com    (Cosmos DB, API SQL)
//       * privatelink.vaultcore.azure.net     (Key Vault)
//       * privatelink.azurewebsites.net        (App Service / sites)
//   - Vínculo (virtual network link) das zonas DNS à VNet
//
// Princípios aplicados:
//   - Sem endereço IP público: nenhum recurso aqui cria IP público. A entrada
//     da aplicação é por Private Endpoint do App Service (publicNetworkAccess
//     Disabled) e a saída por VNet Integration na subnet-apps; os serviços de
//     dados são acessados apenas por Private Endpoint resolvido pelas Private
//     DNS Zones (R4.4, R4.5).
//   - Parametrizável por ambiente (dev/hml/prd) e por prefixos de endereço,
//     para que o mesmo código provisione os três ambientes isolados apenas
//     por valores versionados (R6.2).
//
// Nota de dimensionamento (chamado de redes): a subnet-apps do App Service é
// dedicada e delegada a Microsoft.Web/serverFarms; o tamanho recomendado é /26
// (64 IPs), respeitando o limite corporativo máximo de /25 por subnet.
// =============================================================================

// -----------------------------------------------------------------------------
// Parâmetros
// -----------------------------------------------------------------------------

@description('Identificador do ambiente (dev, hml ou prd). Compõe os nomes dos recursos para evitar colisão entre ambientes.')
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

@description('Região (location) onde os recursos de rede serão criados. Por padrão herda a região do Resource Group.')
param localizacao string = resourceGroup().location

@description('Espaço de endereçamento (CIDR) da VNet. Deve pertencer ao plano de endereçamento corporativo. Ex.: 10.20.0.0/16.')
param prefixoEnderecoVnet string = '10.20.0.0/16'

@description('CIDR da subnet-apps, dedicada e delegada à VNet Integration do App Service. Recomendado /26 (respeita o máximo corporativo de /25).')
param prefixoEnderecoSubnetApps string = '10.20.0.0/26'

@description('CIDR da subnet-endpoints, dedicada aos Private Endpoints (Cosmos DB, Key Vault e App Service).')
param prefixoEnderecoSubnetEndpoints string = '10.20.0.64/26'

@description('Nome da Private DNS Zone do Cosmos DB (API SQL/Core). Mantido como parâmetro para permitir ajuste caso a nuvem soberana exija sufixo distinto.')
param zonaDnsCosmos string = 'privatelink.documents.azure.com'

@description('Nome da Private DNS Zone do Key Vault.')
param zonaDnsKeyVault string = 'privatelink.vaultcore.azure.net'

@description('Nome da Private DNS Zone do App Service (sites).')
param zonaDnsAppService string = 'privatelink.azurewebsites.net'

@description('Tags corporativas aplicadas a todos os recursos criados pelo módulo.')
param tags object = {}

// -----------------------------------------------------------------------------
// Variáveis
// -----------------------------------------------------------------------------

// Nome da VNet composto por prefixo + ambiente para garantir unicidade por ambiente.
var nomeVnet = '${prefixoNome}-vnet-${ambiente}'
var nomeSubnetApps = 'subnet-apps'
var nomeSubnetEndpoints = 'subnet-endpoints'

// -----------------------------------------------------------------------------
// VNet com as duas subnets
// -----------------------------------------------------------------------------

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: nomeVnet
  location: localizacao
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        prefixoEnderecoVnet
      ]
    }
    subnets: [
      // subnet-apps: dedicada e delegada a Microsoft.Web/serverFarms. A
      // delegação habilita a VNet Integration do App Service, permitindo que o
      // tráfego de SAÍDA da aplicação use IP privado desta subnet (sem IP
      // público). A subnet é exclusiva do App Service (não compartilhada).
      {
        name: nomeSubnetApps
        properties: {
          addressPrefixes: [
            prefixoEnderecoSubnetApps
          ]
          delegations: [
            {
              name: 'delegacao-app-service'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
          // Endpoints privados não ficam nesta subnet; política permanece padrão.
          privateEndpointNetworkPolicies: 'Enabled'
        }
      }
      // subnet-endpoints: hospeda os Private Endpoints do Cosmos DB, do Key
      // Vault e o Private Endpoint de ENTRADA do App Service. As políticas de
      // rede para Private Endpoint são desabilitadas, conforme exigido pela
      // plataforma para alocar os NICs do endpoint.
      {
        name: nomeSubnetEndpoints
        properties: {
          addressPrefixes: [
            prefixoEnderecoSubnetEndpoints
          ]
          privateEndpointNetworkPolicies: 'Disabled'
          privateLinkServiceNetworkPolicies: 'Enabled'
        }
      }
    ]
  }
}

// As subnets são definidas inline na VNet acima. Seus IDs são obtidos a partir
// da coleção `subnets` da própria VNet (padrão idiomático para subnets inline),
// evitando declarações `existing` separadas.

// -----------------------------------------------------------------------------
// Private DNS Zones + vínculo com a VNet
// -----------------------------------------------------------------------------

// Zona DNS privada do Cosmos DB (API SQL). Resolve o FQDN privatelink do
// Private Endpoint para o IP privado na subnet-endpoints (R4.5).
resource dnsZoneCosmos 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  // Private DNS Zones são recursos globais; location fixo em 'global'.
  name: zonaDnsCosmos
  location: 'global'
  tags: tags
}

resource dnsZoneKeyVault 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: zonaDnsKeyVault
  location: 'global'
  tags: tags
}

// Zona DNS privada do App Service: resolve o FQDN privatelink do Private
// Endpoint de entrada do site para o IP privado na subnet-endpoints (R4.5).
resource dnsZoneAppService 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: zonaDnsAppService
  location: 'global'
  tags: tags
}

// Vínculo da zona do Cosmos à VNet, sem auto-registro (registros vêm do Private Endpoint).
resource linkCosmos 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZoneCosmos
  name: '${nomeVnet}-link-cosmos'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource linkKeyVault 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZoneKeyVault
  name: '${nomeVnet}-link-keyvault'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource linkAppService 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZoneAppService
  name: '${nomeVnet}-link-appservice'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

// -----------------------------------------------------------------------------
// Outputs (consumidos pelos módulos de computação e dados)
// -----------------------------------------------------------------------------

@description('ID do recurso da VNet.')
output vnetId string = vnet.id

@description('Nome da VNet.')
output vnetName string = vnet.name

@description('ID da subnet-apps (delegada a Microsoft.Web/serverFarms) — usada na VNet Integration do App Service.')
output subnetAppsId string = vnet.properties.subnets[0].id

@description('ID da subnet-endpoints — usada ao criar os Private Endpoints de Cosmos DB, Key Vault e App Service.')
output subnetEndpointsId string = vnet.properties.subnets[1].id

@description('ID da Private DNS Zone do Cosmos DB — usado ao configurar o grupo de zonas DNS do Private Endpoint.')
output dnsZoneCosmosId string = dnsZoneCosmos.id

@description('ID da Private DNS Zone do Key Vault — usado ao configurar o grupo de zonas DNS do Private Endpoint.')
output dnsZoneKeyVaultId string = dnsZoneKeyVault.id

@description('ID da Private DNS Zone do App Service — usado ao configurar o grupo de zonas DNS do Private Endpoint de entrada do site.')
output dnsZoneAppServiceId string = dnsZoneAppService.id
