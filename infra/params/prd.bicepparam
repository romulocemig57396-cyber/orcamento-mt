// =============================================================================
// prd.bicepparam — Parâmetros do ambiente de PRODUÇÃO
//
// Mesmo código (infra/main.bicep) provisiona dev/hml/prd; as diferenças entre
// ambientes se expressam APENAS por valores versionados neste arquivo (R6.2).
//
// Isolamento (R11.2): cada ambiente usa nomes (via `ambiente`) e um bloco CIDR
// /16 EXCLUSIVO, sem sobreposição com os demais ambientes, garantindo recursos
// de rede distintos e sem compartilhamento entre dev/hml/prd.
//   dev -> 10.20.0.0/16 | hml -> 10.21.0.0/16 | prd -> 10.22.0.0/16
//
// Dimensionamento de subnets (App Service): a subnet-apps (VNet Integration,
// delegada a Microsoft.Web/serverFarms) e a subnet-endpoints (Private Endpoints)
// usam /26 (64 IPs cada), respeitando o limite corporativo de /25 por subnet.
// =============================================================================

using '../main.bicep'

param ambiente = 'prd'

param prefixoNome = 'orcamt'

// Plano de endereçamento exclusivo do ambiente prd (sem sobreposição — R11.2).
param prefixoEnderecoVnet = '10.22.0.0/16'
param prefixoEnderecoSubnetApps = '10.22.0.0/26'
param prefixoEnderecoSubnetEndpoints = '10.22.0.64/26'

// Tags corporativas versionadas por ambiente.
param tags = {
  solucao: 'orcamento-mt'
  ambiente: 'prd'
  criticidade: 'alta'
  gestao: 'iac-bicep'
}
