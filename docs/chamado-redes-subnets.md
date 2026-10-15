# Chamado para a Equipe de Redes — Provisionamento de Subnets (ORCAMT)

> Documento de solicitação para a equipe de Redes. As subnets são criadas
> **manualmente pela equipe de Redes** (não via IaC). Este chamado dimensiona o
> tamanho ideal de cada subnet, respeitando o limite corporativo de **/25 por
> subnet**, para a solução **ORCAMT** (Orçamento MT).

## 1. Contexto e premissas

- Plataforma de hospedagem: **Azure App Service (Linux)** com **VNet Integration**
  (saída) + **Private Endpoint** (entrada). A integração do App Service exige uma
  **subnet dedicada e delegada** ao serviço `Microsoft.Web/serverFarms`.
- Dimensionamento recomendado pela Microsoft para a subnet de VNet Integration do
  App Service: **/26 (64 IPs)** por ambiente. Esse tamanho atende com folga e
  respeita o limite máximo de **/25**.
- **Private Endpoints** da solução são fornecidos por **outra VNet**,
  disponibilizada **após a implantação** — portanto **não** são dimensionados
  neste chamado.
- **RG da subnet não precisa ser informado**: a subnet é recurso filho da VNet.
- Acesso à aplicação é **exclusivamente por rede interna** (sem exposição à
  internet).
- Repositório da solução: `https://dev.azure.com/cemig/_git/Orcamento%20MT`

### Topologia solicitada

| Branch              | Subscription               | Resource Group        | VNets                         |
|---------------------|----------------------------|-----------------------|-------------------------------|
| `dev`               | `CEMIG-DEVSECOPS-DEV`       | `RG-ORCAMT-DEV`       | 1 VNET (provisionada na VPC do dev) |
| `homolog` + `main`  | `CEMIG-DEVSECOPS-QA-PRD`    | `RG-ORCAMT-QA-PRD`    | 2 VNETS (1 para QA, 1 para PRD)     |

## 2. Modelo do chamado (campos obrigatórios por subnet)

1. **Nome da Subnet** (nome exato).
2. **Range de endereçamento IP** (CIDR).
3. **RG**: não é necessário informar (subnet é filha da VNet).
4. **Private Endpoint**: fornecido por outra VNet, disponibilizada após a
   implantação (fora do escopo deste chamado).
5. **Tamanho máximo**: a subnet deve ter no máximo uma rede **/25**.

## 3. Subnets solicitadas

### 3.1. Ambiente DEV

- **Nome da Subnet:** `SNET-CEMIG-DEVSECOPS-BR-SOUTH-ORCAMT-DEV`
- **Range de endereçamento IP (sugerido):** `10.20.0.0/26` (64 IPs)
- **Subscription:** `CEMIG-DEVSECOPS-DEV`
- **Resource Group (referência):** `RG-ORCAMT-DEV` (não informar na subnet)
- **VNet:** VNET do ambiente dev (provisionada pela equipe de Redes na VPC do dev)
- **Delegação:** `Microsoft.Web/serverFarms` (App Service VNet Integration)
- **Private Endpoint:** fornecido por outra VNet, pós-implantação (fora deste chamado)
- **Limite:** dentro do máximo /25 ✔ (/26 ≤ /25)

### 3.2. Ambiente QA (Homologação)

- **Nome da Subnet:** `SNET-CEMIG-DEVSECOPS-BR-SOUTH-ORCAMT-QA`
- **Range de endereçamento IP (sugerido):** `10.21.0.0/26` (64 IPs)
- **Subscription:** `CEMIG-DEVSECOPS-QA-PRD`
- **Resource Group (referência):** `RG-ORCAMT-QA-PRD` (não informar na subnet)
- **VNet:** VNET de QA (uma das 2 VNETS da subscription QA-PRD)
- **Delegação:** `Microsoft.Web/serverFarms` (App Service VNet Integration)
- **Private Endpoint:** fornecido por outra VNet, pós-implantação (fora deste chamado)
- **Limite:** dentro do máximo /25 ✔ (/26 ≤ /25)

### 3.3. Ambiente PRD (Produção)

- **Nome da Subnet:** `SNET-CEMIG-DEVSECOPS-BR-SOUTH-ORCAMT-PRD`
- **Range de endereçamento IP (sugerido):** `10.22.0.0/26` (64 IPs)
- **Subscription:** `CEMIG-DEVSECOPS-QA-PRD`
- **Resource Group (referência):** `RG-ORCAMT-QA-PRD` (não informar na subnet)
- **VNet:** VNET de PRD (a outra das 2 VNETS da subscription QA-PRD)
- **Delegação:** `Microsoft.Web/serverFarms` (App Service VNet Integration)
- **Private Endpoint:** fornecido por outra VNet, pós-implantação (fora deste chamado)
- **Limite:** dentro do máximo /25 ✔ (/26 ≤ /25)

## 4. Resumo (tabela consolidada)

| Ambiente | Nome da Subnet                                  | Range (sugerido) | IPs | Subscription             | VNet       | Delegação                    |
|----------|-------------------------------------------------|------------------|-----|--------------------------|------------|------------------------------|
| DEV      | `SNET-CEMIG-DEVSECOPS-BR-SOUTH-ORCAMT-DEV`      | `10.20.0.0/26`   | 64  | `CEMIG-DEVSECOPS-DEV`    | VNET dev   | `Microsoft.Web/serverFarms`  |
| QA       | `SNET-CEMIG-DEVSECOPS-BR-SOUTH-ORCAMT-QA`       | `10.21.0.0/26`   | 64  | `CEMIG-DEVSECOPS-QA-PRD` | VNET qa    | `Microsoft.Web/serverFarms`  |
| PRD      | `SNET-CEMIG-DEVSECOPS-BR-SOUTH-ORCAMT-PRD`      | `10.22.0.0/26`   | 64  | `CEMIG-DEVSECOPS-QA-PRD` | VNET prd   | `Microsoft.Web/serverFarms`  |

## 5. Observações para a equipe de Redes

- Os **ranges são sugestões**. O plano de endereçamento corporativo é de
  responsabilidade da equipe de Redes; caso os blocos acima conflitem com o
  plano vigente, substituir por blocos **/26** equivalentes dentro das VNets
  correspondentes.
- O token de região no nome (`BR-SOUTH`) assume a região **Brazil South**.
  Ajustar se a convenção corporativa usar outro identificador.
- Cada subnet de App Service deve ser **dedicada** (não compartilhar com outros
  serviços) e **delegada** a `Microsoft.Web/serverFarms`.
- Caso a equipe de Redes prefira padronizar em **/25** por política, o tamanho
  também é compatível com o App Service (basta não exceder o máximo /25).
