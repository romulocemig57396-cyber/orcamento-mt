# Política de proteção da branch `main`

> Documento de governança do repositório **Orcamento MT** no Azure DevOps Repos.
> Organização: `cemig` · Projeto: **Orcamento MT** · URL: <https://dev.azure.com/cemig/Orcamento%20MT>
>
> _Rastreabilidade:_ Requisito 8 — Governança do repositório no Azure DevOps (critérios 8.1, 8.3, 8.4 e 8.5).

## 1. Objetivo

Garantir que toda alteração integrada à branch `main` seja revisada, validada pelo pipeline corporativo e rastreável, de modo que o repositório de destino seja a **origem única** do código do Sistema_Orcamento_MT. Este documento registra a configuração exigida de proteção de branch e descreve como aplicá-la no Azure DevOps.

## 2. Repositório de destino (R8.1)

- O código-fonte é hospedado em **um único repositório** do Azure DevOps Repos, correspondente ao `Repositorio_Destino`.
- Localização: organização `cemig`, projeto **Orcamento MT** (<https://dev.azure.com/cemig/Orcamento%20MT>).
- Após a migração (ver Requisito 8.7/8.8), o Azure DevOps passa a ser a origem única; não há desenvolvimento paralelo no repositório GitHub de origem, que é congelado/arquivado (read-only).

## 3. Política exigida para a branch `main`

A branch `main` deve estar **protegida** com os três controles obrigatórios abaixo. Nenhum push direto para `main` é permitido — toda alteração entra exclusivamente por pull request (PR).

| # | Controle obrigatório | Requisito | Efeito no merge |
|---|----------------------|-----------|-----------------|
| 1 | Pull request vinculado à `main` antes da integração | R8.3 | Sem PR, não há integração — push direto bloqueado |
| 2 | Execução do Pipeline_CICD com status **aprovado** (build validation) | R8.4 | PR sem pipeline aprovado tem a conclusão (merge) bloqueada |
| 3 | No mínimo **1 revisão aprovada** | R8.5 | PR com menos de 1 revisão aprovada tem a conclusão (merge) bloqueada |

### 3.1 Pull request obrigatório (R8.3)

- Quando uma alteração é proposta para a `main`, o repositório **exige um pull request** vinculado a essa branch antes de permitir a integração.
- Commits não podem ser enviados (push) diretamente para `main`; o único caminho de integração é via PR a partir de uma branch de trabalho (feature/bugfix/release).

### 3.2 Validação do pipeline obrigatória (R8.4)

- O PR só pode ser concluído (merge) se existir uma **execução do Pipeline_CICD com status aprovado** sobre a última versão do código do PR.
- Se o PR **não** possui pipeline aprovado (não executado, em andamento, falho ou expirado), o repositório **bloqueia a conclusão** do PR e **indica que a validação do pipeline é obrigatória**.

### 3.3 Revisão aprovada obrigatória (R8.5)

- O PR só pode ser concluído se tiver **ao menos 1 revisão com status aprovado**.
- Se o PR possui **menos de 1 revisão aprovada**, o repositório **bloqueia a conclusão** do PR e **indica que a revisão aprovada é obrigatória**.
- Recomendado: a aprovação do próprio autor não conta como a revisão exigida (ver "Opções recomendadas" na seção 5).

## 4. Comportamento de bloqueio de merge

O botão **Complete** (concluir) do pull request só fica habilitado quando **todos** os critérios obrigatórios são atendidos simultaneamente. Enquanto qualquer critério estiver pendente, o Azure DevOps:

- Mantém o merge **bloqueado** e exibe a lista de verificações (checks) pendentes ou reprovadas no PR.
- Sinaliza explicitamente a causa do bloqueio, por exemplo:
  - **"Required check — Build validation"** não aprovado → indica que a validação do pipeline é obrigatória (R8.4).
  - **"Required reviewers"/"Minimum number of reviewers"** não atendido → indica que a revisão aprovada é obrigatória (R8.5).
- Impede qualquer tentativa de push direto para `main`, redirecionando a alteração para o fluxo de PR (R8.3).

Resumo da regra de decisão:

> `merge permitido` **se e somente se** `PR existe (R8.3)` **E** `pipeline aprovado (R8.4)` **E** `revisões aprovadas ≥ 1 (R8.5)`.
> Caso contrário, o merge é bloqueado e a causa é indicada no PR.

## 5. Como configurar no Azure DevOps

A proteção é aplicada em **branch policies** da `main`.

Caminho na interface: **Project Settings** → **Repositories** → selecione o repositório → aba **Policies** → em **Branch Policies**, selecione a branch `main`. (Alternativamente: **Repos** → **Branches** → menu `⋯` da `main` → **Branch policies**.)

### 5.1 Exigir pull request (R8.3)

- Em **Branch Policies** da `main`, o simples fato de haver políticas ativas já impede push direto; garanta que a `main` esteja listada como branch protegida.
- Opcional recomendado: habilitar **Limit merge types** para padronizar o tipo de merge (ex.: _Squash_).

### 5.2 Require a minimum number of reviewers (R8.5)

- Ative **Require a minimum number of reviewers**.
- Defina **Minimum number of reviewers = 1**.
- Marque **"When new changes are pushed: Reset code reviewer votes"** para que novas alterações exijam nova aprovação.
- Marque **"Prohibit the most recent pusher from approving their own changes"** (impede que o autor aprove o próprio PR), reforçando revisão independente.

### 5.3 Check for linked work items / Comment resolution (opcional)

- **Check for linked work items**: recomendável para rastreabilidade (vincular PR a item de trabalho).
- **Check for comment resolution**: exigir que todos os comentários do PR estejam resolvidos antes do merge.

### 5.4 Build Validation (R8.4)

- Em **Build Validation**, clique em **+** para adicionar uma política de build.
- Selecione o **pipeline** do Azure DevOps do projeto (`pipeline/azure-pipelines.yml`).
- **Trigger**: _Automatic_ (executa a cada atualização do PR).
- **Policy requirement**: _Required_ (obrigatório — o merge fica bloqueado sem build aprovado).
- Defina **Build expiration** (ex.: expira após 12 horas) para forçar reexecução quando o código do alvo mudar.

### 5.5 Automatically included reviewers (opcional)

- Em **Automatically included reviewers**, é possível adicionar um grupo/time de revisores obrigatórios por caminho de arquivo, se desejado.

## 6. Fluxo de trabalho resultante

1. A pessoa desenvolvedora cria uma branch a partir da `main` (ex.: `feature/...`, `bugfix/...`).
2. Abre um **pull request** para a `main` (R8.3).
3. O **pipeline** é disparado automaticamente e precisa concluir com **status aprovado** (R8.4).
4. **Pelo menos 1 revisor** aprova o PR (R8.5).
5. Com pipeline aprovado **e** revisão aprovada, o botão **Complete** é habilitado e o merge é realizado.
6. Se qualquer critério falhar, o merge permanece **bloqueado** com a causa indicada no PR (seção 4).

## 7. Verificação da configuração

Checklist para confirmar que a política está corretamente aplicada:

- [ ] Push direto para `main` é rejeitado (apenas via PR).
- [ ] Um PR sem build aprovado não permite **Complete** e indica validação de pipeline pendente.
- [ ] Um PR sem revisão aprovada não permite **Complete** e indica revisão obrigatória.
- [ ] Um PR com build aprovado **e** ≥ 1 revisão aprovada permite **Complete**.
- [ ] A `main` aparece como branch protegida em **Project Settings → Repositories → Policies**.

---

_Observação:_ a aplicação efetiva desta política depende de acesso administrativo ao projeto no Azure DevOps (recurso corporativo). Este documento registra a configuração exigida e o passo a passo; a ativação deve ser feita por quem possui permissão de administração do repositório.
