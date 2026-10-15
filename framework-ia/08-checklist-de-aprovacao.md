# 08 — Checklist de Aprovação

> Critérios de entrada em produção. Percorra a lista antes de submeter à TI.

---

## Checkpoints obrigatórios

Este checklist não deve ser avaliado apenas uma vez, no fim do projeto. Execute um **checkpoint de avaliação** contra estes critérios nos seguintes marcos:

| Marco | Escopo mínimo a avaliar |
| --- | --- |
| Após definir a arquitetura | Arquitetura, Segurança |
| Antes de abrir pull request | Segurança, LGPD e proteção de dados, IA, DevOps |
| Antes do deploy em produção | Checklist completo |

O checkpoint pode ser executado com apoio de um agente de IA dedicado à avaliação de conformidade (ex.: agente "Checkpoint de Diretrizes"), que lê estes critérios e verifica evidências no projeto. O resultado do agente é uma **proposta de avaliação** — a decisão final e a aprovação continuam sendo humanas.

---

## Arquitetura

- [ ] A solução é serverless (ou possui exceção justificada e aprovada pela Arquitetura)
- [ ] A nuvem foi escolhida com justificativa de custo-benefício registrada
- [ ] Os componentes estão em rede privada (VPC/VNet) sempre que possível
- [ ] O acesso externo, se houver, passa por camada de borda com WAF
- [ ] Toda a infraestrutura está descrita como código (Terraform, Bicep, CDK, etc.)
- [ ] Design responsivo implementado e testado (celular, tablet, desktop)

---

## Segurança

- [ ] SAST configurado no pipeline
- [ ] SCA e varredura de segredos configurados no pipeline
- [ ] DAST configurado antes da promoção para produção
- [ ] Autenticação via Microsoft Entra ID implementada
- [ ] Autorização por grupos/papéis (RBAC) implementada
- [ ] Nenhuma credencial no código; segredos em cofre gerenciado
- [ ] Criptografia em trânsito (TLS 1.2+) e em repouso habilitada
- [ ] Menor privilégio aplicado em todas as identidades e roles

---

## LGPD e proteção de dados

- [ ] Classificação da informação definida
- [ ] Dados pessoais identificados e mapeados (se aplicável)
- [ ] Base legal definida para cada tratamento de dados pessoais
- [ ] Finalidade documentada para cada tratamento
- [ ] Minimização aplicada (apenas dados necessários coletados)
- [ ] Política de retenção e descarte definida
- [ ] Dados pessoais mascarados em logs
- [ ] Ambientes não produtivos com dados anonimizados/pseudonimizados
- [ ] Mecanismo para atender direitos do titular implementado (se aplicável)
- [ ] Avaliação de impacto (RIPD) realizada (se dados sensíveis ou larga escala)

---

## IA (quando aplicável)

- [ ] IDE agêntica utilizada com conta corporativa Cemig homologada (não conta pessoal)
- [ ] Modelo utilizado documentado
- [ ] Dados enviados ao modelo identificados e aprovados
- [ ] Nenhum dado pessoal enviado ao LLM sem avaliação de impacto
- [ ] Logging de prompts e respostas configurado
- [ ] Revisão humana implementada para ações críticas
- [ ] Fontes de dados controladas e documentadas
- [ ] Indicação clara ao usuário de que interage com IA

---

## DevOps

- [ ] Código hospedado no repositório corporativo homologado
- [ ] Pipeline CI/CD com todos os estágios mínimos (build, SAST, SCA, testes, DAST, deploy)
- [ ] Aprovação manual configurada para deploy em produção
- [ ] Política de pull request ativa na branch principal
- [ ] Versionamento semântico aplicado
- [ ] README.md completo

---

## Observabilidade

- [ ] Logs centralizados com formato estruturado (JSON)
- [ ] Política de retenção de logs definida e configurada
- [ ] Métricas e alertas configurados
- [ ] Rastreabilidade de requisições (correlation ID / tracing)
- [ ] Dashboard operacional criado
- [ ] Auditoria de ações sensíveis configurada
- [ ] Responsável pela sustentação e escalonamento definido
- [ ] Dados pessoais mascarados em logs

---

## Documentação

- [ ] README.md completo (objetivo, arquitetura, execução local, deploy)
- [ ] Partes interessadas listadas
- [ ] Integrações documentadas
- [ ] Arquitetura documentada com diagrama
- [ ] Estimativa de custo mensal em R$ registrada
- [ ] Decisões de arquitetura registradas (ADRs ou similar)

---

## Aprovação

| Campo | Preenchimento |
| --- | --- |
| Solução | |
| Data da validação | |
| Validado por (desenvolvedor/área) | |
| Aprovado por (TI/Arquitetura) | |
| Observações | |

---

> Voltar para: [00 — Visão Geral](00-visao-geral.md)
