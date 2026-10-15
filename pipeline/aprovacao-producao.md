# Aprovação manual de produção com expiração (R7.6 / R7.7)

Este documento descreve, passo a passo, como configurar a **aprovação manual
registrada** e a **expiração em 72 horas** do deploy em produção do
`Sistema_Orcamento_MT` no Azure DevOps.

## Por que isto não está no YAML do pipeline

No Azure DevOps, a aprovação manual e a expiração são **"Approvals and checks"
do _Environment_**, não do arquivo `azure-pipelines.yml`. O estágio
`deploy_producao` apenas declara `environment: 'producao'`; o _check_ de
aprovação é vinculado a esse Environment pelo portal e passa a valer para
**toda** execução que tente implantar no ambiente.

Enquanto o check estiver ativo:

- Toda execução do estágio `deploy_producao` fica **pendente**, aguardando a
  aprovação de pelo menos 1 aprovador (R7.6).
- Se a aprovação **não** for concedida dentro do prazo configurado (72h), a
  execução **expira e o deploy em produção é cancelado**, e o cancelamento por
  expiração fica **registrado no histórico da execução** (R7.7).

## Pré-requisitos

- Projeto migrado para o Azure DevOps com o pipeline `azure-pipelines.yml`
  importado (tarefas 13.1/13.2/13.4).
- O Environment `producao` já criado em **Pipelines > Environments**. Se ainda
  não existir, a primeira execução do estágio `deploy_producao` o cria
  automaticamente; você também pode criá-lo manualmente com o nome exato
  `producao` (precisa casar com o `environment:` do YAML).
- Permissão de **Administrator** sobre o Environment `producao` para criar
  checks.

## Passo a passo — configurar o check de Approvals

1. No Azure DevOps, abra o projeto e vá em **Pipelines > Environments**.
2. Selecione o Environment **`producao`**.
3. No canto superior direito, clique em **⋮ (More actions) > Approvals and
   checks**.
4. Clique em **+ (Add check)** e escolha **Approvals**.
5. Em **Approvers**, adicione **ao menos 1 aprovador** (R7.6). Prefira adicionar
   um **grupo** (equipe de operação/segurança) em vez de uma única pessoa, para
   não depender de um indivíduo. Veja as recomendações abaixo.
6. Em **Advanced**, marque **"Requester should not be able to approve their own
   runs"** para **impedir que o solicitante aprove a si mesmo** (segregação de
   funções). Se um grupo for usado como aprovador, você pode exigir aprovação de
   um número mínimo de membros.
7. Em **Control options > Timeout**, defina a expiração da aprovação para
   **72 horas** (equivalente a `3 days` ou `4320 minutes`). Esse é o prazo do
   R7.7: não aprovada nesse intervalo, a execução expira e o deploy em produção
   é cancelado.
8. Em **Instructions to approvers**, registre instruções claras do que o
   aprovador deve verificar antes de aprovar (ver recomendações). Isso cumpre o
   requisito de **instruções registradas**.
9. Clique em **Create** para salvar o check.

Depois de criado, o check aparece na lista **Approvals and checks** do
Environment `producao` e passa a bloquear automaticamente o estágio
`deploy_producao` em todas as execuções.

## Como o comportamento atende aos requisitos

- **R7.6 — aprovação manual registrada de ≥ 1 aprovador:** o check de
  _Approvals_ exige a ação explícita de pelo menos 1 aprovador antes de o
  estágio prosseguir. A aprovação (quem aprovou, quando e eventual comentário)
  fica **registrada no histórico da execução**, na aba do Environment e nos logs
  da run.
- **R7.7 — expiração em 72h com cancelamento registrado:** o **Timeout** de 72h
  faz a execução **expirar** quando ninguém aprova no prazo. Ao expirar, o Azure
  DevOps **cancela o deploy em produção** e registra o motivo (expiração da
  aprovação) no histórico da execução, deixando a trilha de auditoria.

## Recomendações

- **Aprovadores do grupo de operação/segurança:** use grupos corporativos
  (ex.: equipe de operação e/ou segurança) como aprovadores, em vez de pessoas
  nomeadas, para garantir cobertura mesmo com ausências e manter a
  responsabilidade na equipe correta.
- **Impedir autoaprovação:** mantenha marcada a opção que impede o solicitante
  de aprovar a própria execução (**"Requester should not be able to approve
  their own runs"**), garantindo segregação de funções.
- **Instruções registradas aos aprovadores:** no campo **Instructions**,
  descreva objetivamente os itens de verificação antes de aprovar, por exemplo:
  - confirmar que o DAST e os gates de severidade (R7.5) passaram sem
    `Severidade_Critica`;
  - confirmar que os testes automatizados (R7.4) estão verdes;
  - confirmar que não houve detecção de segredos (R9.5);
  - confirmar a versão/artefato que será promovido para produção.
- **Prazo (72h):** não aumente o Timeout além de 72h sem revisão, pois isso
  afrouxa o controle do R7.7. Se a aprovação expirar, dispare uma nova execução
  após tratar a pendência — a expiração anterior permanece no histórico para
  auditoria.
- **Rastreabilidade:** mantenha os registros de aprovação/expiração como
  evidência de conformidade com R7.6/R7.7 (histórico da execução e do
  Environment `producao`).

## Referência cruzada

- Pipeline: `pipeline/azure-pipelines.yml` — estágio `deploy_producao`
  (`environment: 'producao'`).
- Requisitos: **R7.6** (aprovação manual de ≥ 1 aprovador) e **R7.7**
  (cancelamento por expiração em 72h, com registro).
- Design: seção *Pipeline CI/CD* — aprovação manual e expiração.
