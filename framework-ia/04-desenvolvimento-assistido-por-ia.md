# 04 — Desenvolvimento Assistido por IA

> Diretrizes para uso de IDEs agênticas e ferramentas de IA no desenvolvimento.

---

## 1. Ferramentas homologadas

| Ferramenta | Situação | Suporte da TI |
| --- | --- | --- |
| Kiro | Preferencial | Completo |
| GitHub Copilot Enterprise | Homologada | Completo |
| Outras IDEs agênticas | Permitidas | Sem suporte dedicado |

### 1.1 Contas de acesso

Para todas as IDEs agênticas (Kiro, GitHub Copilot e demais), o uso deve ser **sempre com a conta corporativa Cemig homologada** (login corporativo/Entra ID), nunca com conta pessoal.

| Tipo de conta | Uso permitido? | Motivo |
| --- | --- | --- |
| Conta corporativa Cemig homologada | ✅ Obrigatória | Rastreabilidade, governança e suporte da TI |
| Conta pessoal (Gmail, GitHub pessoal, etc.) | ❌ Não recomendada | Risco de vazamento de código/dados corporativos, ausência de controle e suporte da TI |

> A TI **não recomenda** o uso de contas particulares para acesso a IDEs agênticas, por questões de segurança. Antes de iniciar o uso de qualquer ferramenta de IA, confirme com a TI que a conta utilizada é a corporativa homologada.

---

## 2. O que pode ser enviado para IA

| Tipo de informação | Permitido? | Condição |
| --- | --- | --- |
| Código-fonte próprio | ✅ Sim | — |
| Especificações funcionais | ✅ Sim | — |
| Dados anonimizados | ✅ Sim | Verificar que não há reversão possível |
| Documentação pública | ✅ Sim | — |
| Diagramas de arquitetura | ✅ Sim | Desde que não contenham credenciais |

---

## 3. O que NÃO pode ser enviado para IA

| Tipo de informação | Motivo |
| --- | --- |
| Dados pessoais (CPF, nome, e-mail de clientes) | LGPD |
| Credenciais, tokens, chaves de API | Segurança |
| Informações classificadas como restritas | Política de classificação |
| Dados de consumidores de energia | LGPD e regulação setorial |
| Contratos e documentos jurídicos sem aprovação | Confidencialidade |
| Informações estratégicas sem aprovação | Governança |

---

## 4. Engenharia de prompt — boas práticas

### 4.1 Prompt inicial para novo projeto

```text
Crie uma aplicação serverless em [AWS | GCP | Azure] que [descrição do objetivo].

Requisitos obrigatórios:
- Arquitetura serverless, sem servidores dedicados
- Autenticação e autorização via Microsoft Entra ID (OAuth 2.0 / OIDC)
- Componentes em rede privada (VPC/VNet); entrada externa apenas via API Gateway com WAF
- Front-end responsivo (celular, tablet e desktop)
- Infraestrutura como código
- Segredos em cofre gerenciado, nada de credencial no código
- Pipeline no Azure DevOps com build, SAST, SCA, testes, DAST e deploy com aprovação
- Logs centralizados com retenção mínima de 90 dias
- Dados pessoais tratados conforme LGPD (se aplicável)
```

### 4.2 Prompt para integrações

```text
Integre com o sistema [nome], hospedado em [nuvem ou on-premise], usando APIs REST
autenticadas. O tráfego deve permanecer em rede privada (Private Link / VPC Endpoint
ou equivalente) sempre que possível. Quando necessário acesso externo, utilize API
Gateway com WAF. Trate erros, timeouts e novas tentativas com backoff exponencial.
```

### 4.3 Prompt para segurança

```text
Configure SAST, SCA, varredura de segredos e DAST no pipeline do Azure DevOps.
Implemente autenticação via Entra ID com validação de token no back-end.
Verifique que não há credenciais no código e mova segredos para o cofre gerenciado.
Garanta que logs não contenham dados pessoais (mascaramento obrigatório).
```

---

## 5. Revisão humana obrigatória

A saída da IA é uma **proposta**, não uma decisão final. Toda geração deve ser revisada:

| Aspecto | O que verificar |
| --- | --- |
| **Código** | Lógica correta, sem vulnerabilidades, sem credenciais hardcoded |
| **Segurança** | Autenticação implementada, validações de entrada, princípio do menor privilégio |
| **Arquitetura** | Aderência ao padrão serverless, rede privada, infra como código |
| **Dependências** | Versões fixas, pacotes conhecidos, sem vulnerabilidades críticas |
| **Dados** | Nenhum dado pessoal exposto, classificação respeitada |

---

## 6. Boas práticas de uso

- **Peça o plano antes do código** em mudanças que envolvam mais de um componente.
- Revise as dependências sugeridas: versões fixas e pacotes conhecidos.
- Não aceite código que contorne autenticação ou desative validações de segurança.
- Use contexto (steering files, docs) para manter consistência entre sessões.
- Faça commits incrementais — facilita revisão e rollback.
- Documente decisões de arquitetura tomadas durante o desenvolvimento.

---

## 7. Limitações da IA

| Limitação | Mitigação |
| --- | --- |
| Alucinação (informações incorretas) | Validar com documentação oficial e time técnico |
| Código inseguro | SAST + revisão humana |
| Dependências desatualizadas ou inexistentes | Verificar no registro oficial (npm, PyPI, etc.) |
| Não conhece padrões internos | Usar steering files e documentação como contexto |
| Pode sugerir práticas obsoletas | Validar com frameworks de referência atuais |

---

> Próximo documento: [05 — DevOps e Governança](05-devops-e-governanca.md)
