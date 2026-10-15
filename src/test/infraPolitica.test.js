import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// =============================================================================
// Checagens de política do IaC (Bicep) — tarefa 12.5
//
// As CLIs `az`/`bicep` não estão disponíveis neste ambiente, então estas
// asserções estáticas cumprem o papel das checagens de política (equivalente a
// um `what-if`/policy-as-code executável agora): leem os arquivos .bicep e
// garantem que as propriedades-chave de segurança do design permaneçam fixas.
//
// Plataforma de hospedagem: Azure App Service (Linux) com entrada por Private
// Endpoint (publicNetworkAccess Disabled) e saída por VNet Integration numa
// subnet delegada a Microsoft.Web/serverFarms (substitui Azure Container Apps,
// cuja subnet /23 excedia o limite corporativo de /25 por subnet).
//
// Validam:
//   - App Service com publicNetworkAccess: Disabled (entrada só por PE)  (R4.1, R4.4)
//   - App Service com httpsOnly e minTlsVersion 1.2                       (R4.2, R4.3)
//   - App Service com VNet Integration (virtualNetworkSubnetId)           (R4.1)
//   - Private Endpoint de entrada do App Service (groupId sites)          (R4.4)
//   - Cosmos DB e Key Vault com publicNetworkAccess: Disabled             (R4.4)
//   - TLS mínimo 1.2 (minimalTlsVersion: Tls12 no Cosmos)                 (R4.2)
//   - Nenhum recurso de IP público em qualquer módulo                     (R4.4)
//   - Resource Group único (main.bicep com targetScope 'resourceGroup' e
//     sem criação de Resource Groups adicionais)                          (R3.1)
//
// Os arquivos Bicep NÃO são alterados por este teste — apenas lidos e validados.
// =============================================================================

const diretorioTeste = dirname(fileURLToPath(import.meta.url));
// src/test -> ../../infra
const diretorioInfra = resolve(diretorioTeste, '..', '..', 'infra');

function lerBicep(caminhoRelativo) {
  const caminho = resolve(diretorioInfra, caminhoRelativo);
  return readFileSync(caminho, 'utf8');
}

/**
 * Normaliza o texto do Bicep para asserções robustas a espaçamento:
 * remove comentários de linha e colapsa espaços em branco em um único espaço.
 * Isso evita que uma asserção case/falhe por indentação ou quebra de linha.
 */
function normalizar(bicep) {
  return bicep
    .split('\n')
    .map((linha) => {
      const semComentario = linha.replace(/\/\/.*$/, '');
      return semComentario;
    })
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifica a presença de um par chave: valor no Bicep, tolerante a espaços.
 * Ex.: temPropriedade(txt, 'publicNetworkAccess', "'Disabled'").
 */
function temPropriedade(bicepNormalizado, chave, valorEntreAspas) {
  const padrao = new RegExp(
    `${chave}\\s*:\\s*${valorEntreAspas.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  );
  return padrao.test(bicepNormalizado);
}

const main = lerBicep('main.bicep');
const rede = lerBicep('modules/rede.bicep');
const dados = lerBicep('modules/dados.bicep');
const computacao = lerBicep('modules/computacao.bicep');

const mainN = normalizar(main);
const dadosN = normalizar(dados);
const computacaoN = normalizar(computacao);
const redeN = normalizar(rede);

describe('IaC — App Service com entrada privada (R4.1, R4.4)', () => {
  test('o App Service bloqueia a rede pública (publicNetworkAccess: Disabled)', () => {
    expect(temPropriedade(computacaoN, 'publicNetworkAccess', "'Disabled'")).toBe(true);
  });

  test('o App Service integra-se à VNet pela subnet-apps (virtualNetworkSubnetId)', () => {
    expect(temPropriedade(computacaoN, 'virtualNetworkSubnetId', 'subnetAppsId')).toBe(true);
  });

  test('existe Private Endpoint de entrada do App Service (groupId sites)', () => {
    expect(/'sites'/.test(computacaoN)).toBe(true);
    expect(/Microsoft\.Network\/privateEndpoints/i.test(computacao)).toBe(true);
  });
});

describe('IaC — rede pública desabilitada em Cosmos DB e Key Vault (R4.4)', () => {
  test('Cosmos DB tem publicNetworkAccess: Disabled', () => {
    expect(temPropriedade(dadosN, 'publicNetworkAccess', "'Disabled'")).toBe(true);
  });

  test('Key Vault tem publicNetworkAccess: Disabled e default Deny', () => {
    // Há duas ocorrências de publicNetworkAccess Disabled (Cosmos e Key Vault);
    // garantimos pelo menos duas no módulo de dados.
    const ocorrencias = dadosN.match(/publicNetworkAccess\s*:\s*'Disabled'/g) || [];
    expect(ocorrencias.length).toBeGreaterThanOrEqual(2);
    expect(temPropriedade(dadosN, 'defaultAction', "'Deny'")).toBe(true);
  });

  test('nenhum serviço de dados habilita rede pública (Enabled)', () => {
    expect(temPropriedade(dadosN, 'publicNetworkAccess', "'Enabled'")).toBe(false);
  });
});

describe('IaC — TLS mínimo 1.2 e HTTPS obrigatório (R4.2, R4.3)', () => {
  test('Cosmos DB exige minimalTlsVersion: Tls12', () => {
    expect(temPropriedade(dadosN, 'minimalTlsVersion', "'Tls12'")).toBe(true);
  });

  test('o App Service exige HTTPS (httpsOnly: true)', () => {
    expect(temPropriedade(computacaoN, 'httpsOnly', 'true')).toBe(true);
  });

  test('o App Service exige TLS mínimo 1.2 (minTlsVersion: 1.2)', () => {
    expect(temPropriedade(computacaoN, 'minTlsVersion', "'1.2'")).toBe(true);
  });
});

describe('IaC — ausência de IP público em todos os módulos (R4.4)', () => {
  const modulos = [
    ['main.bicep', main],
    ['rede.bicep', rede],
    ['dados.bicep', dados],
    ['computacao.bicep', computacao],
  ];

  test.each(modulos)('%s não declara recurso Microsoft.Network/publicIPAddresses', (_nome, conteudo) => {
    expect(/Microsoft\.Network\/publicIPAddresses/i.test(conteudo)).toBe(false);
  });

  test.each(modulos)('%s não declara recurso Microsoft.Network/natGateways', (_nome, conteudo) => {
    expect(/Microsoft\.Network\/natGateways/i.test(conteudo)).toBe(false);
  });

  test('nenhum módulo referencia publicIPAddress / publicIpAddress como propriedade de recurso', () => {
    for (const [, conteudo] of modulos) {
      // Permite o texto apenas em comentários; a normalização remove comentários.
      const normal = normalizar(conteudo);
      expect(/publicIP?Address\s*:/i.test(normal)).toBe(false);
    }
  });
});

describe('IaC — Resource Group único (R3.1)', () => {
  test('main.bicep opera no escopo de Resource Group (targetScope resourceGroup)', () => {
    // A diretiva usa atribuição (=), não par chave:valor; valida a sintaxe real.
    expect(/targetScope\s*=\s*'resourceGroup'/.test(mainN)).toBe(true);
  });

  test('nenhum módulo cria Resource Groups adicionais (Microsoft.Resources/resourceGroups)', () => {
    for (const conteudo of [main, rede, dados, computacao]) {
      expect(/Microsoft\.Resources\/resourceGroups/i.test(conteudo)).toBe(false);
    }
  });

  test('nenhum módulo é implantado em escopo de subscription/tenant', () => {
    for (const conteudo of [main, rede, dados, computacao]) {
      expect(/targetScope\s*=\s*'subscription'/i.test(conteudo)).toBe(false);
      expect(/targetScope\s*=\s*'tenant'/i.test(conteudo)).toBe(false);
      expect(/targetScope\s*=\s*'managementGroup'/i.test(conteudo)).toBe(false);
    }
  });
});

describe('IaC — rede privada coerente com acesso interno (R4.1)', () => {
  test('a subnet-apps é delegada a Microsoft.Web/serverFarms (VNet Integration do App Service)', () => {
    expect(temPropriedade(redeN, 'serviceName', "'Microsoft.Web/serverFarms'")).toBe(true);
  });

  test('existem Private DNS Zones para resolução privada (sem internet pública)', () => {
    expect(/privatelink\.documents\.azure\.com/.test(rede)).toBe(true);
    expect(/privatelink\.vaultcore\.azure\.net/.test(rede)).toBe(true);
    expect(/privatelink\.azurewebsites\.net/.test(rede)).toBe(true);
  });
});
