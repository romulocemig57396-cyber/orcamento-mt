# 05 — DevOps e Governança

> Repositórios, pipelines, CI/CD e controle de código.

---

## 1. Repositório de código

### 1.1 Plataforma

| Item | Definição |
| --- | --- |
| Repositório padrão | Azure DevOps Repos (homologado pela TI) |
| Possíveis alterações futuras | GitHub Enterprise, GitLab ou outra plataforma, conforme análise da TI |
| Proibido | Repositórios fora da plataforma corporativa homologada |

> A plataforma de repositório pode ser alterada pela TI no futuro. As demais diretrizes (pipeline, segurança, governança) continuam valendo independentemente da plataforma.

### 1.2 Ao criar o projeto

- Nome claro e descritivo, alinhado ao formulário de solicitação (doc 01).
- `README.md` com: objetivo, arquitetura, como executar localmente e como implantar.
- *Owners* e partes interessadas cadastrados.
- Política de branch na `main`: pull request obrigatório, pipeline verde e no mínimo uma revisão aprovada.

### 1.3 Estrutura mínima de pastas

```text
seu-projeto/
├── src/            # Código-fonte da aplicação
├── tests/          # Testes automatizados
├── infra/          # Infraestrutura como código
├── pipeline/       # Definições de CI/CD
├── docs/           # Documentação, decisões de arquitetura e diagramas
└── README.md       # Documentação principal
```

---

## 2. Git Flow

### 2.1 Branches

| Branch | Finalidade | Proteção |
| --- | --- | --- |
| `main` | Código em produção | PR obrigatório, pipeline verde, revisão aprovada |
| `develop` | Integração de features (quando aplicável) | PR recomendado |
| `feature/*` | Desenvolvimento de funcionalidades | — |
| `hotfix/*` | Correções urgentes em produção | PR obrigatório para main |
| `release/*` | Preparação de release (quando aplicável) | — |

### 2.2 Regras de commit

- Mensagens claras e descritivas.
- Prefixo indicando tipo: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- Um commit por mudança lógica (evitar commits monolíticos).

---

## 3. Pipeline CI/CD

### 3.1 Ferramentas

| Finalidade | Ferramenta |
| --- | --- |
| CI/CD | Azure DevOps Pipelines |
| Rastreamento de trabalho | Azure DevOps Boards |

### 3.2 Estágios mínimos obrigatórios

| Ordem | Estágio | Conteúdo | Bloqueia? |
| --- | --- | --- | --- |
| 1 | Build | Compilação e empacotamento | Sim, em erro |
| 2 | SAST + SCA + segredos | Análise estática, dependências, varredura de credenciais | Sim, em severidade alta/crítica |
| 3 | Testes | Unitários e integração | Sim, em falha |
| 4 | Deploy homologação | Implantação automática | — |
| 5 | DAST | Teste dinâmico em homologação | Sim, em severidade alta/crítica |
| 6 | Deploy produção | Com aprovação manual registrada | — |

### 3.3 Esqueleto de pipeline

```yaml
# azure-pipelines.yml — estrutura mínima
trigger:
  branches:
    include:
      - main

stages:
  - stage: build
    displayName: Build
    jobs:
      - job: compilar
        steps:
          - script: echo "compilar e empacotar o artefato"

  - stage: seguranca_estatica
    displayName: SAST, SCA e varredura de segredos
    dependsOn: build
    jobs:
      - job: analise
        steps:
          - script: echo "executar SAST, SCA e detecção de segredos"

  - stage: testes
    displayName: Testes automatizados
    dependsOn: seguranca_estatica
    jobs:
      - job: automatizados
        steps:
          - script: echo "executar testes unitários e de integração"

  - stage: deploy_homologacao
    displayName: Deploy em homologação
    dependsOn: testes
    jobs:
      - deployment: homologacao
        environment: homologacao
        strategy:
          runOnce:
            deploy:
              steps:
                - script: echo "implantar em homologação"

  - stage: dast
    displayName: DAST
    dependsOn: deploy_homologacao
    jobs:
      - job: dinamico
        steps:
          - script: echo "executar teste dinâmico de segurança"

  - stage: deploy_producao
    displayName: Deploy em produção
    dependsOn: dast
    jobs:
      - deployment: producao
        environment: producao   # aprovação manual configurada no environment
        strategy:
          runOnce:
            deploy:
              steps:
                - script: echo "implantar em produção"
```

---

## 4. Versionamento

| Regra | Descrição |
| --- | --- |
| Semântico | Usar versionamento semântico (MAJOR.MINOR.PATCH) |
| Tags | Criar tag para cada release em produção |
| Changelog | Manter CHANGELOG.md atualizado |

---

## 5. Aprovações e gates

| Ambiente | Requisito de aprovação |
| --- | --- |
| Desenvolvimento | Automático |
| Homologação | Automático (após pipeline verde) |
| Produção | Aprovação manual registrada (mínimo 1 aprovador) |

---

## 6. Artefatos e imagens

- Artefatos de build armazenados em registro corporativo (Azure Artifacts, ECR, Artifact Registry).
- Imagens de contêiner escaneadas antes do deploy.
- Nenhum artefato de produção gerado localmente na máquina do desenvolvedor.

---

> Próximo documento: [06 — Observabilidade](06-observabilidade.md)
