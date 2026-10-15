# 06 — Observabilidade

> Logs, métricas, tracing, dashboards, alertas e retenção.

---

## 1. Princípio

Toda aplicação em produção deve ser **observável**: problemas devem ser detectados antes que o usuário final perceba. Observabilidade é obrigatória e deve ser configurada **antes** da entrada em produção.

---

## 2. Pilares da observabilidade

| Pilar | O que é | Ferramenta por nuvem |
| --- | --- | --- |
| **Logs** | Registros textuais de eventos | CloudWatch Logs (AWS), Log Analytics (Azure), Cloud Logging (GCP) |
| **Métricas** | Indicadores numéricos ao longo do tempo | CloudWatch Metrics, Azure Monitor, Cloud Monitoring |
| **Tracing** | Rastreamento de requisições entre componentes | X-Ray (AWS), Application Insights (Azure), Cloud Trace (GCP) |

---

## 3. Requisitos obrigatórios

| Requisito | Descrição |
| --- | --- |
| **Logs centralizados** | Toda aplicação envia logs para serviço centralizado |
| **Formato estruturado** | Logs em JSON para facilitar consultas e alertas |
| **Correlation ID** | Todas as requisições carregam um ID de correlação entre componentes |
| **Monitoramento de disponibilidade** | Health checks e uptime monitoring |
| **Alertas para incidentes críticos** | Notificação automática (e-mail, Teams, PagerDuty) para erros e indisponibilidade |
| **Métricas de negócio** | Dashboards com indicadores relevantes para a operação |
| **Auditoria** | Registro de ações sensíveis (login, alteração de dados, acessos admin) |

---

## 4. Política de retenção de logs

| Tipo de log | Retenção mínima | Observação |
| --- | --- | --- |
| Logs de aplicação | 90 dias | Em ambiente quente (consulta rápida) |
| Logs de auditoria e segurança | 1 ano | Obrigatório para compliance |
| Logs de acesso (autenticação) | 1 ano | Requisito de auditoria |
| Métricas de infraestrutura | 90 dias | Resolução reduzida após 30 dias é aceitável |
| Logs com dados pessoais | Conforme LGPD | Respeitar prazo de retenção e descarte |

### Regras de retenção

- A política deve ser definida no início do projeto.
- Configurar rotação automática e arquivamento (cold storage) após o período quente.
- Logs expirados devem ser excluídos automaticamente.
- Custos de armazenamento de logs devem ser considerados na estimativa de custo.

---

## 5. O que registrar nos logs

### Obrigatório

- Timestamp (UTC ou com timezone explícito)
- Correlation ID
- Nível de severidade (DEBUG, INFO, WARN, ERROR, FATAL)
- Serviço/componente de origem
- Mensagem descritiva
- Contexto relevante (endpoint, usuário*, ação)

### Proibido em logs

- Dados pessoais (CPF, nome, e-mail) — usar mascaramento
- Credenciais, tokens, chaves de API
- Conteúdo de requisição/resposta com dados sensíveis
- Informações classificadas como restritas

> *Registrar identificador do usuário (object ID do Entra ID), nunca dados pessoais diretos.

---

## 6. Alertas

| Tipo | Exemplo | Ação |
| --- | --- | --- |
| Crítico | Aplicação indisponível, erro 5xx acima de threshold | Notificação imediata + escalonamento |
| Alto | Latência degradada, fila acumulando | Notificação em até 5 minutos |
| Médio | Aumento de erros 4xx, uso de recurso acima de 80% | Notificação periódica (dashboard) |
| Baixo | Warnings informativos | Registro para análise posterior |

---

## 7. Dashboards

Toda aplicação em produção deve ter ao menos um dashboard com:

- Disponibilidade (uptime %)
- Latência (p50, p95, p99)
- Taxa de erros
- Volume de requisições
- Métricas de negócio relevantes
- Custo operacional (quando disponível)

---

## 8. Responsabilidades

| Responsabilidade | Quem |
| --- | --- |
| Configurar observabilidade | Time de desenvolvimento |
| Monitorar alertas em horário comercial | Time de sustentação |
| Definir escalonamento | Responsável pela solução |
| Revisar dashboards periodicamente | Time de operação |

---

## 9. Boas práticas

- Configurar log level por ambiente (DEBUG em dev, INFO/WARN em produção).
- Evitar logging excessivo em produção (custo e performance).
- Testar alertas antes de ir para produção (simular falhas).
- Revisar dashboards mensalmente para manter relevância.
- Automatizar o descarte de logs conforme política de retenção.

---

> Próximo documento: [07 — Catálogo de Arquiteturas](07-catalogo-de-arquiteturas.md)
