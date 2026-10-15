# 07 — Catálogo de Arquiteturas

> Exemplos prontos de arquiteturas de referência para cenários comuns.

---

## 1. Aplicação Web Interna

### Cenário
Aplicação web para uso interno (intranet), sem acesso externo.

### Componentes

```mermaid
flowchart TD
    subgraph Usuários
        U[Colaboradores<br/>Rede corporativa]
    end
    subgraph Entra["Identidade"]
        ID[Microsoft Entra ID]
    end
    subgraph Cloud["Nuvem (rede privada)"]
        FE[Frontend<br/>SPA em CDN interna ou Storage]
        API[API serverless<br/>Functions / Lambda]
        DB[Banco gerenciado<br/>Cosmos DB / DynamoDB / Aurora]
        COFRE[Cofre de segredos]
    end
    U --> ID
    ID -->|Token OIDC| FE
    FE --> API
    API --> DB
    API --> COFRE
```

### Stack por nuvem

| Componente | AWS | Azure | GCP |
| --- | --- | --- | --- |
| Frontend | S3 + CloudFront (interno) | Blob Storage + Private Endpoint | Cloud Storage |
| API | Lambda + API Gateway (privado) | Azure Functions + VNet Integration | Cloud Functions + VPC Connector |
| Banco | Aurora Serverless / DynamoDB | Cosmos DB / SQL Serverless | Firestore / Cloud SQL |
| Segredos | Secrets Manager | Key Vault | Secret Manager |

---

## 2. Aplicação Web com Acesso Externo

### Cenário
Aplicação acessível via internet (portal de clientes, B2B).

### Componentes

```mermaid
flowchart TD
    subgraph Internet
        U[Usuários externos]
    end
    subgraph Borda
        CDN[CDN]
        WAF[WAF]
        GW[API Gateway]
    end
    subgraph Entra["Identidade"]
        ID[Microsoft Entra ID]
    end
    subgraph Cloud["Rede privada"]
        API[API serverless]
        DB[Banco gerenciado]
        FILA[Fila / Eventos]
        COFRE[Cofre de segredos]
    end
    U --> CDN
    U --> ID
    CDN --> WAF
    WAF --> GW
    ID -->|Token| GW
    GW --> API
    API --> DB
    API --> FILA
    API --> COFRE
```

### Proteções obrigatórias

- WAF com regras OWASP
- Rate limiting no API Gateway
- DDoS protection ativo
- TLS 1.2+ em todas as conexões
- Certificado gerenciado

---

## 3. Chatbot com IA

### Cenário
Assistente conversacional usando LLM com acesso a documentos corporativos (RAG).

### Componentes

```mermaid
flowchart TD
    subgraph Usuários
        U[Colaboradores]
    end
    subgraph Entra["Identidade"]
        ID[Entra ID]
    end
    subgraph Cloud["Rede privada"]
        FE[Interface conversacional]
        ORCH[Orquestrador<br/>Functions / Lambda]
        LLM[Modelo LLM<br/>OpenAI / Claude / Gemini]
        VDB[Banco vetorial<br/>Índice de documentos]
        DOCS[Documentos corporativos<br/>SharePoint / Storage]
        LOG[Logging de prompts]
    end
    U --> ID
    ID --> FE
    FE --> ORCH
    ORCH --> LLM
    ORCH --> VDB
    VDB --> DOCS
    ORCH --> LOG
```

### Requisitos específicos

- Não enviar dados pessoais ao LLM sem avaliação de impacto
- Logging de todos os prompts e respostas (auditoria)
- Indicação clara ao usuário de que está interagindo com IA
- Fontes das respostas referenciadas (grounding)
- Monitoramento de alucinações

---

## 4. Integração SAP

### Cenário
Integração com SAP on-premise ou cloud.

### Componentes

```mermaid
flowchart TD
    subgraph Cloud["Nuvem (rede privada)"]
        API[API serverless]
        MW[Middleware / Integration]
        FILA[Fila de eventos]
    end
    subgraph OnPrem["On-premise / SAP Cloud"]
        SAP[SAP ERP]
    end
    subgraph Rede["Conectividade"]
        VPN[VPN / ExpressRoute / Direct Connect]
    end
    API --> MW
    MW --> FILA
    FILA --> VPN
    VPN --> SAP
    SAP --> VPN
    VPN --> MW
```

### Requisitos específicos

- Conectividade privada (VPN, ExpressRoute, Direct Connect)
- Autenticação mTLS ou OAuth entre sistemas
- Tratamento de erros com retry e dead letter queue
- Mapeamento de dados e transformação no middleware
- Monitoramento de latência e disponibilidade da integração

---

## 5. Agente de IA Corporativo

### Cenário
Agente autônomo que executa tarefas com aprovação humana.

### Componentes

```mermaid
flowchart TD
    subgraph Usuários
        U[Solicitante]
    end
    subgraph Entra["Identidade"]
        ID[Entra ID]
    end
    subgraph Cloud["Rede privada"]
        ORCH[Orquestrador<br/>Agente]
        TOOLS[Ferramentas<br/>APIs, MCP Servers]
        KB[Base de conhecimento<br/>Documentos vetorizados]
        LLM[Modelo LLM]
        LOG[Logging completo]
        APROV[Gate de aprovação]
    end
    U --> ID
    ID --> ORCH
    ORCH --> LLM
    ORCH --> TOOLS
    ORCH --> KB
    ORCH --> APROV
    APROV -->|Aprovado| TOOLS
    ORCH --> LOG
```

### Requisitos específicos

- Níveis de autonomia definidos (ver doc 09)
- Logging de prompts, contexto e ações executadas
- Gate de aprovação humana para ações destrutivas
- Fontes de dados controladas e aprovadas
- Monitoramento de custos de uso do LLM

---

## 6. Processamento de eventos (Event-Driven)

### Cenário
Sistema reativo a eventos de negócio.

### Componentes

```mermaid
flowchart TD
    subgraph Fontes
        S1[Sistema A]
        S2[Sistema B]
        S3[IoT / Sensores]
    end
    subgraph Cloud["Rede privada"]
        BUS[Event Bus<br/>EventBridge / Event Grid / Pub/Sub]
        FN[Functions processadoras]
        DB[Banco de dados]
        NOTIFY[Notificações]
        DLQ[Dead Letter Queue]
    end
    S1 --> BUS
    S2 --> BUS
    S3 --> BUS
    BUS --> FN
    FN --> DB
    FN --> NOTIFY
    FN -->|Falha| DLQ
```

### Requisitos específicos

- Idempotência nos consumidores
- Dead letter queue para falhas
- Retry com backoff exponencial
- Ordenação quando necessário (FIFO)
- Monitoramento de profundidade de fila

---

## Como usar este catálogo

1. Identifique o cenário mais próximo da sua solução.
2. Use o diagrama como ponto de partida para a IDE agêntica.
3. Adapte os componentes conforme a nuvem escolhida.
4. Valide com a Arquitetura antes de iniciar o desenvolvimento.
5. Documente desvios em relação ao padrão.

---

> Próximo documento: [08 — Checklist de Aprovação](08-checklist-de-aprovacao.md)
