# Varredura de segredos no histórico de commits

Tarefa **1.2** da spec `adequacao-diretrizes-cemig` — _Requirement 9.4_.

Antes de estabelecer o Azure DevOps (`Repositorio_Destino`) como origem única do
código, o histórico **completo** de commits precisa estar livre de credenciais,
tokens e chaves em texto claro — não apenas o `HEAD`, mas todos os commits
antigos (R9.4). Este diretório contém:

| Arquivo | Função |
| --- | --- |
| `varrer-segredos-historico.sh` | Executa a varredura sobre todo o histórico e gera o relatório. |
| `gitleaks.toml` | Configuração/regras da ferramenta de varredura (gitleaks). |
| `README-varredura-segredos.md` | Este guia: como varrer, interpretar o relatório, limpar o histórico e rotacionar segredos. |

> Posicionamento no fluxo de migração: `git clone --mirror` (Tarefa 1.1) →
> **varredura de segredos no histórico (esta tarefa)** → _se houver ocorrência_
> limpeza/reescrita + rotação → `git push --mirror` + cutover (Tarefa 1.3).

## 1. Pré-requisitos

- `git`
- [`gitleaks`](https://github.com/gitleaks/gitleaks) versão 8.x ou superior
  - macOS: `brew install gitleaks`
  - Windows: `choco install gitleaks`
  - Go: `go install github.com/gitleaks/gitleaks/v8@latest`
- Para a limpeza do histórico (apenas se segredos forem encontrados):
  [`git filter-repo`](https://github.com/newren/git-filter-repo)
  - `pip install git-filter-repo` (recomendado pela própria documentação do git)

## 2. Executar a varredura

A partir da cópia-espelho obtida na Tarefa 1.1 (ou do próprio repositório):

```bash
# Varre o repositório atual, gravando o relatório em ./relatorio-segredos-historico.json
./scripts/migracao/varrer-segredos-historico.sh

# Ou informando explicitamente o repositório e o caminho do relatório:
./scripts/migracao/varrer-segredos-historico.sh /caminho/para/espelho.git ./relatorio.json
```

O script usa `gitleaks detect --log-opts="--all"`, que percorre **todo o
histórico** de todas as refs (branches e tags), e não apenas o estado atual.

### Códigos de saída

| Código | Significado | Ação |
| --- | --- | --- |
| `0` | Nenhum segredo encontrado | Seguir para o `git push --mirror` definitivo. |
| `2` | Segredos encontrados no histórico | **Não** fazer o push. Executar limpeza (seção 4) e rotação (seção 5). |
| `1` | Erro de execução / pré-requisito ausente | Corrigir o ambiente e repetir. |

## 3. Relatório de ocorrências

O relatório é um JSON (`--report-format json`) com uma entrada por ocorrência,
contendo pelo menos: regra acionada (`RuleID`), arquivo (`File`), commit
(`Commit`), autor/data e linha. Os valores dos segredos são **redigidos**
(`--redact`) para não reintroduzir o segredo no relatório.

Para cada ocorrência, triar:

1. **Falso positivo** → adicionar o caminho/padrão à `allowlist` em
   `gitleaks.toml` e repetir a varredura.
2. **Segredo real** → prosseguir para limpeza do histórico **e** rotação.

## 4. Limpeza / reescrita do histórico (se houver segredo real)

> Reescrever o histórico altera os hashes dos commits. Faça isto **antes** do
> cutover e comunique a equipe. Trabalhe sempre sobre uma cópia; nunca sobre o
> único repositório vivo.

Exemplo com `git filter-repo` removendo um arquivo que continha segredo em todo
o histórico:

```bash
# Remover por completo um arquivo sensível de todos os commits:
git filter-repo --path caminho/para/arquivo-com-segredo --invert-paths

# Ou substituir valores de segredo por um marcador (expressions.txt com
# linhas no formato  valor-do-segredo==>REMOVIDO ):
git filter-repo --replace-text expressions.txt
```

Depois da reescrita:

```bash
# Reexecutar a varredura para confirmar que o histórico ficou limpo:
./scripts/migracao/varrer-segredos-historico.sh
```

Só prosseguir para o push definitivo quando a varredura retornar código `0`.

## 5. Rotação dos segredos expostos (obrigatória)

Reescrever o histórico **não** torna o segredo seguro: ele pode já ter sido
copiado. Todo segredo que esteve em texto claro no histórico deve ser
**revogado e regerado**:

1. Revogar/invalidar imediatamente a credencial, chave ou token exposto no
   serviço de origem (Entra ID, Azure, provedores externos etc.).
2. Gerar um novo segredo e armazená-lo exclusivamente no `Cofre_Segredos`
   (Azure Key Vault) — nunca em arquivos de configuração, variáveis de ambiente
   em texto claro ou logs (R9.1).
3. Atualizar os consumidores para recuperar o novo segredo em tempo de execução
   via Managed Identity (R9.2).
4. Registrar a rotação (o quê, quando, por quem) para fins de auditoria.

## 6. Prevenção contínua

Após a migração, a varredura de segredos passa a ser um gate obrigatório do
`Pipeline_CICD` a cada submissão (Tarefa 13.4 / R9.5, R9.6), bloqueando a
submissão e apontando o local da ocorrência. Esta varredura de histórico é o
passo pontual de saneamento feito **uma vez**, no momento da migração.
