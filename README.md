# ⚡ Sistema de Orçamento MT

Sistema web corporativo da Cemig para criação e gestão de orçamentos de obras em
Média Tensão, construído com React.js e em adequação às diretrizes corporativas
(Microsoft Entra ID, hospedagem Azure *serverless first*, acesso somente pela rede
interna, IaC, CI/CD no Azure DevOps e conformidade LGPD).

## 🎯 Objetivo do projeto

Oferecer aos usuários internos da Cemig uma ferramenta única para montar, calcular e
gerenciar orçamentos de obras em Média Tensão, automatizando os cálculos regulatórios
(CT, PP, ERD e PFC), a geração do memorial descritivo e a consolidação PROORC, com a
informação sob os controles corporativos de identidade, rede, segurança e
conformidade exigidos para uma solução corporativa.

### Funcionalidades

- ✅ Cadastro completo de dados de atendimento
- ✅ Lançamento de itens de obra
- ✅ Cálculo automático de CT, PP, ERD e PFC
- ✅ Geração automática de memorial descritivo
- ✅ Resumo financeiro detalhado
- ✅ Exportação para Excel e PDF
- ✅ Consolidação PROORC
- ✅ Salvamento local no navegador (cache/rascunho)

## 🏗️ Descrição da arquitetura

A solução está sendo adequada do estado atual (SPA 100% client-side publicada no
GitHub Pages) para o estado-alvo corporativo descrito abaixo.

### Estado-alvo

- **Front-end (SPA):** React 18 + Vite + Tailwind CSS, preservando toda a lógica de
  cálculo (CT/PP/ERD/PFC, memorial, consolidação PROORC) como funções puras. A SPA usa
  **MSAL.js** (OIDC + PKCE) para autenticação e mantém o `localStorage` apenas como
  cache local/offline.
- **API serverless:** camada de back-end introduzida entre a SPA e os dados,
  responsável por validar o token de identidade (JWKS), aplicar autorização RBAC com
  negação por padrão, persistir dados de forma atômica, recuperar segredos e emitir
  logs/métricas estruturados. A validação de segurança reside no servidor, nunca no
  front.
- **Identidade e autorização:** autenticação exclusivamente via **Microsoft Entra ID**
  (OAuth 2.0 / OpenID Connect com PKCE); autorização por **RBAC** mapeando grupos do
  Entra ID para papéis da aplicação (leitor, editor, admin).
- **Hospedagem:** **Azure App Service (Linux)** com entrada por **Private Endpoint** e saída por **VNet Integration** (*private
  endpoint*, sem IP público; substitui o Container Apps por causa do limite de /25 por subnet);
  todos os recursos agrupados em um único **Resource Group** dedicado.
- **Rede:** acesso **exclusivamente pela rede interna corporativa** (ExpressRoute/VPN),
  sem exposição à internet pública e sem camada de borda externa (WAF/CDN). TLS 1.2+
  obrigatório. Cosmos DB e Key Vault com `publicNetworkAccess=Disabled`, acessados por
  **Private Endpoints** resolvidos por Private DNS Zones.
- **Persistência:** **Azure Cosmos DB serverless** como fonte da verdade (criptografia
  em repouso ≥ AES-256, segregação por ambiente), complementado pelo `localStorage`
  como cache.
- **Segredos:** **Azure Key Vault** acessado via **Managed Identity**; nenhuma
  credencial em código, configuração ou logs.
- **Observabilidade:** **Application Insights / Azure Monitor** com logs estruturados,
  métricas e alertas, e mascaramento de dados pessoais.

### Diagrama de componentes (estado-alvo)

```
Usuário interno (navegador)
        │  (ExpressRoute / VPN — rede corporativa)
        ▼
┌──────────────────────────────────────────────┐
│ Resource Group dedicado (Azure)               │
│  ┌───────────── VNet privada ──────────────┐  │
│  │ App Service (Linux) — entrada por PE     │  │
│  │   • SPA React (MSAL.js)                  │  │
│  │   • API serverless (token + RBAC)        │  │
│  └───────────────┬───────────┬──────────────┘  │
│   Private Endpoints          │                 │
│        │                     │                 │
│  Cosmos DB serverless   Key Vault   App Insights│
└──────────────────────────────────────────────┘
        ▲
        │  valida token / grupos
Microsoft Entra ID (OIDC · RBAC)
```

### Tecnologias

- React 18
- Vite
- Tailwind CSS
- SheetJS (xlsx)
- jsPDF
- Vitest (testes)
- (Alvo) MSAL.js, Azure App Service (Linux), Azure Cosmos DB serverless, Azure Key Vault,
  Application Insights, Bicep (IaC), Azure DevOps Pipelines (CI/CD)

## 💻 Instruções de execução local

Pré-requisitos: Node.js 18+ e npm.

```bash
# Entre na pasta do projeto
cd orcamento-mt

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento (Vite)
npm run dev

# Gere o build de produção
npm run build

# Pré-visualize o build localmente
npm run preview

# Rode os testes
npm run test       # modo watch
npm run test:run   # execução única
```

O servidor de desenvolvimento sobe a SPA com Vite. Em ambiente local, a persistência
usa `localStorage`; a integração com Entra ID e a API serverless requerem as
configurações de ambiente corporativo correspondentes.

## 🚀 Instruções de implantação

A implantação segue o fluxo corporativo **Azure DevOps + Azure**. O **GitHub Pages
não é mais o ambiente de publicação**.

- **Repositório:** o código-fonte reside no Azure DevOps Repos
  (`https://dev.azure.com/cemig/Orcamento%20MT`), como origem única. A branch `main` é
  protegida: exige pull request, pipeline aprovado e ao menos 1 revisão aprovada antes
  do merge.
- **Infraestrutura como código:** todos os recursos de nuvem são provisionados por
  **Bicep** versionado em `infra/`, parametrizado para os ambientes de desenvolvimento,
  homologação e produção, com state remoto controlado. Nenhum recurso é criado
  manualmente pelo console.
- **Pipeline CI/CD (Azure DevOps Pipelines, `pipeline/azure-pipelines.yml`):** executa,
  em sequência, os estágios **build → análise de segurança (SAST/SCA/varredura de
  segredos) → testes → deploy em homologação → DAST → deploy em produção**. Cada
  estágio só inicia após o sucesso do anterior. Falha de build ou de testes interrompe
  a esteira; vulnerabilidade de severidade crítica bloqueia o deploy em produção.
- **Deploy em produção:** exige **aprovação manual** registrada de ao menos 1
  aprovador; a aprovação expira em 72 horas. A aplicação é publicada em **Azure
  App Service (Linux)**.
- **Versionamento:** a cada release em produção, o processo registra uma **tag SemVer**
  (`MAJOR.MINOR.PATCH`) e uma entrada no CHANGELOG.
- **Segredos:** o pipeline referencia segredos apenas como variáveis protegidas
  (mascaradas em log) e executa varredura de segredos a cada submissão, bloqueando o
  avanço em caso de ocorrência.


