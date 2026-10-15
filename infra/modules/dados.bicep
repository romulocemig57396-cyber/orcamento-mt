// =============================================================================
// Módulo: dados.bicep
// Camada de dados privada do Sistema_Orcamento_MT (R3.1, R4.5, R5.2, R5.3).
//
// Provisiona:
//   - Cosmos DB (API SQL/Core) em modo serverless, com:
//       * publicNetworkAccess = Disabled (acesso só por Private Endpoint)   (R4.5)
//       * criptografia em repouso nativa >= AES-256 (sempre ativa no Cosmos) (R5.2)
//       * banco e container particionado por ambiente (segregação)          (R5.3)
//       * Private Endpoint na subnet-endpoints + grupo de zona DNS privada
//   - Key Vault, com:
//       * publicNetworkAccess = Disabled + networkAcls default Deny          (R4.5)
//       * RBAC do Azure habilitado (enableRbacAuthorization)
//       * Private Endpoint na subnet-endpoints + grupo de zona DNS privada
//
// Princípios:
//   - Nenhum recurso cria IP público; todo acesso é por Private Endpoint
//     resolvido pelas Private DNS Zones criadas no módulo de rede (R4.4/R4.5).
//   - Parametrizável por ambiente (dev/hml/prd); os nomes carregam o ambiente
//     para garantir isolamento entre ambientes (R5.3, R6.2).
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

@description('Região (location) dos recursos de dados. Por padrão herda a região do Resource Group.')
param localizacao string = resourceGroup().location

@description('ID da subnet-endpoints (saída do módulo de rede) onde os Private Endpoints de Cosmos DB e Key Vault serão criados.')
param subnetEndpointsId string

@description('ID da Private DNS Zone do Cosmos DB (saída do módulo de rede), usada no grupo de zonas DNS do Private Endpoint.')
param dnsZoneCosmosId string

@description('ID da Private DNS Zone do Key Vault (saída do módulo de rede), usada no grupo de zonas DNS do Private Endpoint.')
param dnsZoneKeyVaultId string

@description('Nome do banco de dados SQL (Core) do Cosmos DB.')
param nomeBancoCosmos string = 'orcamentos'

@description('Nome do container de orçamentos no Cosmos DB.')
param nomeContainerCosmos string = 'orcamentos'

@description('Caminho da chave de partição do container (segrega documentos por ambiente/escopo — R5.3).')
param caminhoChaveParticao string = '/ambiente'

@description('Tags corporativas aplicadas a todos os recursos criados pelo módulo.')
param tags object = {}

// -----------------------------------------------------------------------------
// Variáveis
// -----------------------------------------------------------------------------

// Nomes compostos por prefixo + papel + ambiente. Os nomes de Cosmos e Key Vault
// são globalmente únicos no respectivo domínio; usamos uniqueString(RG) como
// sufixo determinístico para reduzir risco de colisão sem perder reprodutibilidade.
var sufixoUnico = uniqueString(resourceGroup().id, ambiente)
var nomeCosmos = toLower('${prefixoNome}cosmos${ambiente}${sufixoUnico}')
// Key Vault aceita no máximo 24 caracteres; recortamos para respeitar o limite.
var nomeKeyVault = toLower(take('${prefixoNome}kv${ambiente}${sufixoUnico}', 24))

var nomePeCosmos = '${prefixoNome}-pe-cosmos-${ambiente}'
var nomePeKeyVault = '${prefixoNome}-pe-keyvault-${ambiente}'

// -----------------------------------------------------------------------------
// Cosmos DB (API SQL) — serverless, sem rede pública, criptografia em repouso
// -----------------------------------------------------------------------------

// A conta Cosmos DB usa criptografia em repouso nativa com chaves gerenciadas
// pelo serviço (AES-256), sempre ativa e não desabilitável — atende R5.2.
// publicNetworkAccess = Disabled força acesso exclusivamente por Private
// Endpoint (R4.5). capabilities EnableServerless ativa o modo serverless (R3.2).
resource contaCosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: nomeCosmos
  location: localizacao
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    // Modo serverless: escala a zero e cobra por consumo (R3.2).
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    // Consistência de sessão (padrão recomendado para carga transacional).
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    // Região única atrelada ao ambiente/location (sem replicação multi-região).
    locations: [
      {
        locationName: localizacao
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    // Rede pública desabilitada; acesso apenas por Private Endpoint (R4.4/R4.5).
    publicNetworkAccess: 'Disabled'
    networkAclBypass: 'None'
    isVirtualNetworkFilterEnabled: false
    // Exige conexões sobre TLS 1.2 ou superior (R4.2/R4.3).
    minimalTlsVersion: 'Tls12'
    // Reforça que o acesso de dados é por identidade/chave sobre canal privado.
    disableLocalAuth: false
  }
}

// Banco de dados SQL (Core) que agrupa os containers da solução.
resource bancoCosmos 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: contaCosmos
  name: nomeBancoCosmos
  properties: {
    resource: {
      id: nomeBancoCosmos
    }
  }
}

// Container de orçamentos particionado por ambiente — garante segregação lógica
// dos dados por Ambiente (R5.3) em conjunto com o isolamento por conta/ambiente.
resource containerCosmos 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: bancoCosmos
  name: nomeContainerCosmos
  properties: {
    resource: {
      id: nomeContainerCosmos
      partitionKey: {
        paths: [
          caminhoChaveParticao
        ]
        kind: 'Hash'
      }
      // Em modo serverless o throughput não é provisionado no container.
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
      }
    }
  }
}

// Private Endpoint do Cosmos DB na subnet-endpoints (groupId "Sql" para API SQL).
resource peCosmos 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: nomePeCosmos
  location: localizacao
  tags: tags
  properties: {
    subnet: {
      id: subnetEndpointsId
    }
    privateLinkServiceConnections: [
      {
        name: '${nomePeCosmos}-conn'
        properties: {
          privateLinkServiceId: contaCosmos.id
          groupIds: [
            'Sql'
          ]
        }
      }
    ]
  }
}

// Vincula o Private Endpoint do Cosmos à Private DNS Zone (resolução privada).
resource dnsGrupoCosmos 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: peCosmos
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'cosmos'
        properties: {
          privateDnsZoneId: dnsZoneCosmosId
        }
      }
    ]
  }
}

// -----------------------------------------------------------------------------
// Key Vault — sem rede pública, RBAC, acesso por Private Endpoint
// -----------------------------------------------------------------------------

// Key Vault com RBAC do Azure (enableRbacAuthorization) e rede pública negada.
// O acesso é concedido por atribuição de papel à Managed Identity da Container
// App (feito no módulo de computação) e o tráfego trafega por Private Endpoint.
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: nomeKeyVault
  location: localizacao
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenant().tenantId
    // Autorização via RBAC do Azure em vez de access policies.
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    // Rede pública desabilitada; default Deny com acesso só por Private Endpoint.
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
      ipRules: []
      virtualNetworkRules: []
    }
  }
}

// Private Endpoint do Key Vault na subnet-endpoints (groupId "vault").
resource peKeyVault 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: nomePeKeyVault
  location: localizacao
  tags: tags
  properties: {
    subnet: {
      id: subnetEndpointsId
    }
    privateLinkServiceConnections: [
      {
        name: '${nomePeKeyVault}-conn'
        properties: {
          privateLinkServiceId: keyVault.id
          groupIds: [
            'vault'
          ]
        }
      }
    ]
  }
}

// Vincula o Private Endpoint do Key Vault à Private DNS Zone (resolução privada).
resource dnsGrupoKeyVault 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: peKeyVault
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'keyvault'
        properties: {
          privateDnsZoneId: dnsZoneKeyVaultId
        }
      }
    ]
  }
}

// -----------------------------------------------------------------------------
// Outputs (consumidos pelo módulo de computação / aplicação)
// -----------------------------------------------------------------------------

@description('ID da conta Cosmos DB.')
output cosmosId string = contaCosmos.id

@description('Nome da conta Cosmos DB.')
output cosmosNome string = contaCosmos.name

@description('Endpoint (FQDN) do Cosmos DB — resolvido de forma privada pela Private DNS Zone.')
output cosmosEndpoint string = contaCosmos.properties.documentEndpoint

@description('Nome do banco de dados SQL do Cosmos.')
output cosmosBancoNome string = bancoCosmos.name

@description('ID do Key Vault — usado para atribuir papel à Managed Identity do App Service.')
output keyVaultId string = keyVault.id

@description('Nome do Key Vault.')
output keyVaultNome string = keyVault.name

@description('URI do Key Vault — usado pela aplicação para recuperar segredos via Managed Identity.')
output keyVaultUri string = keyVault.properties.vaultUri

