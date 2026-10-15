#!/usr/bin/env bash
#
# espelhar-repo.sh
# ----------------------------------------------------------------------------
# Espelhamento do repositório preservando o histórico completo (R8.7).
#
# Objetivo:
#   Migrar o código do Repositorio_GitHub (origem atual) para o
#   Repositorio_Destino no Azure DevOps, preservando TODO o histórico de
#   commits, todas as branches e todas as tags, SEM reescrita.
#
# Estratégia (ver design.md > "Migração do repositório para o Azure DevOps"):
#   1. `git clone --mirror`  da origem  -> cria uma cópia espelho local
#      (bare repo) contendo branches, tags e histórico de commits originais.
#   2. Validação do espelho (contagem de refs/commits, listagem de branches
#      e tags) antes de qualquer envio ao destino.
#   3. `git push --mirror`   para o destino -> transfere o espelho integral.
#
# Por que o modo *mirror*?
#   `--mirror` NÃO é uma cópia parcial: ele reproduz fielmente todas as
#   referências do repositório (refs/heads, refs/tags, refs/remotes e demais
#   refs). O `git push --mirror` empurra exatamente essas refs para o destino,
#   de modo que TODAS as branches, TODAS as tags e o HISTÓRICO DE COMMITS
#   ORIGINAL são transferidos SEM reescrita (os hashes dos commits são
#   preservados). Isso satisfaz a exigência de preservação do histórico (R8.7).
#
#   ATENÇÃO: por ser um espelho fiel, o `push --mirror` pode SOBRESCREVER e
#   REMOVER refs do destino que não existam na origem. Use-o apenas quando o
#   Repositorio_Destino estiver vazio/recém-criado ou quando a intenção for,
#   de fato, torná-lo um espelho idêntico da origem.
#
# Uso:
#   ./espelhar-repo.sh --origem <URL_ORIGEM> --destino <URL_DESTINO> [opções]
#
#   Também aceita variáveis de ambiente como padrão:
#     REPO_ORIGEM   URL do Repositorio_GitHub (origem)
#     REPO_DESTINO  URL do Repositorio_Destino (Azure DevOps)
#
#   Opções:
#     --origem   <url>    URL do repositório de origem (GitHub).
#     --destino  <url>    URL do repositório de destino (Azure DevOps).
#     --dir      <path>   Diretório local para a cópia espelho
#                         (padrão: ./espelho-orcamento-mt.git).
#     --dry-run           Executa clone e validação, mas NÃO faz o push.
#     --sim-push          Confirma a execução do `git push --mirror`.
#                         Sem esta flag o script faz apenas clone + validação
#                         (comportamento seguro por padrão).
#     -h | --help         Mostra esta ajuda.
#
# Observação importante sobre credenciais:
#   O push para o Azure DevOps (https://dev.azure.com/cemig/Orcamento%20MT)
#   depende de credenciais corporativas (PAT/SSH). Este script NÃO embute
#   segredos: a autenticação deve ser provida pelo ambiente (git credential
#   manager, PAT em cache, chave SSH etc.). Por padrão o push fica desativado;
#   habilite-o explicitamente com --sim-push após validar o espelho.
# ----------------------------------------------------------------------------

set -euo pipefail

# --- Valores padrão -------------------------------------------------------
# Destino padrão conforme o Repositorio_Destino definido na spec (R8.1/R8.7).
REPO_ORIGEM="${REPO_ORIGEM:-}"
REPO_DESTINO="${REPO_DESTINO:-https://dev.azure.com/cemig/Orcamento%20MT}"
DIR_ESPELHO="./espelho-orcamento-mt.git"
DRY_RUN=0
CONFIRMA_PUSH=0

# --- Funções auxiliares ---------------------------------------------------

# Imprime a ajuda extraída do cabeçalho de uso.
mostrar_ajuda() {
  cat <<'EOF'
Uso:
  ./espelhar-repo.sh --origem <URL_ORIGEM> --destino <URL_DESTINO> [opções]

Opções:
  --origem   <url>   URL do repositório de origem (GitHub).
  --destino  <url>   URL do repositório de destino (Azure DevOps).
                     Padrão: https://dev.azure.com/cemig/Orcamento%20MT
  --dir      <path>  Diretório local da cópia espelho.
                     Padrão: ./espelho-orcamento-mt.git
  --dry-run          Clona e valida, mas NÃO envia (push) ao destino.
  --sim-push         Confirma a execução do 'git push --mirror'.
                     Sem esta flag o script faz apenas clone + validação.
  -h | --help        Mostra esta ajuda.

Variáveis de ambiente (usadas como padrão):
  REPO_ORIGEM, REPO_DESTINO
EOF
}

# Loga mensagens padronizadas em stderr para não poluir a saída de dados.
log()  { printf '[espelhar-repo] %s\n' "$*" >&2; }
erro() { printf '[espelhar-repo][ERRO] %s\n' "$*" >&2; }

# Encerra com mensagem de erro e código de saída não-zero.
abortar() {
  erro "$1"
  exit "${2:-1}"
}

# --- Parsing dos argumentos ----------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --origem)   REPO_ORIGEM="${2:-}"; shift 2 ;;
    --destino)  REPO_DESTINO="${2:-}"; shift 2 ;;
    --dir)      DIR_ESPELHO="${2:-}"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --sim-push) CONFIRMA_PUSH=1; shift ;;
    -h|--help)  mostrar_ajuda; exit 0 ;;
    *)          abortar "Argumento desconhecido: $1 (use --help)" 2 ;;
  esac
done

# --- Checagens básicas de pré-requisitos ---------------------------------

# 1) git precisa estar disponível no PATH.
command -v git >/dev/null 2>&1 || abortar "git não encontrado no PATH."

# 2) URLs de origem e destino são obrigatórias.
[[ -n "$REPO_ORIGEM" ]]  || abortar "URL de origem não informada (use --origem ou REPO_ORIGEM)." 2
[[ -n "$REPO_DESTINO" ]] || abortar "URL de destino não informada (use --destino ou REPO_DESTINO)." 2

# 3) Origem e destino não podem ser idênticos (evita espelho sobre si mesmo).
[[ "$REPO_ORIGEM" != "$REPO_DESTINO" ]] || abortar "Origem e destino são idênticos; abortando." 2

log "Origem : $REPO_ORIGEM"
log "Destino: $REPO_DESTINO"
log "Espelho local: $DIR_ESPELHO"

# --- Etapa 1: clone espelho ----------------------------------------------
# Se o diretório do espelho já existir, não sobrescrevemos silenciosamente:
# o operador deve remover/escolher outro diretório, evitando estado ambíguo.
if [[ -e "$DIR_ESPELHO" ]]; then
  abortar "Diretório de espelho já existe: $DIR_ESPELHO (remova-o ou use --dir)."
fi

log "Clonando espelho (git clone --mirror) — transfere branches, tags e histórico..."
git clone --mirror "$REPO_ORIGEM" "$DIR_ESPELHO" \
  || abortar "Falha ao clonar o espelho da origem."

# --- Etapa 2: validação do espelho ---------------------------------------
# Confirmamos que o espelho tem conteúdo antes de qualquer envio ao destino.
log "Validando a cópia espelho..."

TOTAL_REFS=$(git --git-dir="$DIR_ESPELHO" for-each-ref --format='%(refname)' | wc -l | tr -d ' ')
TOTAL_BRANCHES=$(git --git-dir="$DIR_ESPELHO" for-each-ref --format='%(refname)' refs/heads/ | wc -l | tr -d ' ')
TOTAL_TAGS=$(git --git-dir="$DIR_ESPELHO" for-each-ref --format='%(refname)' refs/tags/ | wc -l | tr -d ' ')
TOTAL_COMMITS=$(git --git-dir="$DIR_ESPELHO" rev-list --all --count 2>/dev/null || echo 0)

log "Referências (refs) : $TOTAL_REFS"
log "Branches           : $TOTAL_BRANCHES"
log "Tags               : $TOTAL_TAGS"
log "Commits (todas refs): $TOTAL_COMMITS"

# Um espelho válido precisa ter ao menos uma referência e ao menos um commit.
[[ "$TOTAL_REFS" -ge 1 ]]    || abortar "Espelho sem referências; migração abortada."
[[ "$TOTAL_COMMITS" -ge 1 ]] || abortar "Espelho sem commits no histórico; migração abortada."

log "Validação concluída: histórico, branches e tags presentes no espelho."

# --- Etapa 3: push espelho para o destino --------------------------------
# Em modo dry-run encerramos aqui, sem enviar nada.
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "--dry-run ativo: clone e validação concluídos; push NÃO executado."
  log "Espelho disponível em: $DIR_ESPELHO"
  exit 0
fi

# Guarda de segurança: o push só ocorre com confirmação explícita (--sim-push).
# Isso evita envios acidentais ao Azure DevOps (que dependem de credenciais
# corporativas e podem sobrescrever/remover refs do destino).
if [[ "$CONFIRMA_PUSH" -ne 1 ]]; then
  log "Push NÃO executado (padrão seguro)."
  log "Revise o espelho acima e, para enviar ao destino, reexecute com --sim-push."
  log "Lembrete: o push --mirror torna o destino um espelho FIEL da origem"
  log "          (pode sobrescrever/remover refs que não existam na origem)."
  exit 0
fi

log "Enviando espelho ao destino (git push --mirror)..."
log "A autenticação é provida pelo ambiente (PAT/SSH); nenhum segredo é embutido."
git --git-dir="$DIR_ESPELHO" push --mirror "$REPO_DESTINO" \
  || abortar "Falha no push --mirror para o destino. Verifique credenciais/permissões."

log "Espelhamento concluído: destino agora reflete branches, tags e histórico da origem."
log "Próximos passos: varredura de segredos no histórico (1.2) e cutover/origem única (1.3)."
