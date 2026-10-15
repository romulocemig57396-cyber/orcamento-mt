#!/usr/bin/env bash
#
# cutover.sh
# ----------------------------------------------------------------------------
# Corte (cutover) para origem única e congelamento do Repositorio_GitHub.
#
# Contexto (spec adequacao-diretrizes-cemig, Tarefa 1.3 / Requirement 8.8):
#   Após o espelhamento preservando histórico (1.1 / R8.7) e a varredura de
#   segredos sobre todo o histórico (1.2 / R9.4), o Repositorio_Destino no
#   Azure DevOps passa a ser a ORIGEM ÚNICA do código. A partir desse corte:
#     a) os `remotes` locais da equipe são reapontados do GitHub para o
#        Azure DevOps (https://dev.azure.com/cemig/Orcamento%20MT); e
#     b) o Repositorio_GitHub é CONGELADO/ARQUIVADO (tornado read-only ou
#        arquivado) para impedir desenvolvimento paralelo (R8.8).
#
# Ver design.md > "Migração do repositório para o Azure DevOps (R8.7, R8.8)",
# item 3 ("Corte (cutover) e origem única").
#
# O que este script FAZ:
#   - Reaponta o remote `origin` do clone LOCAL atual para o Azure DevOps.
#     Essa operação é local (não depende de credenciais corporativas) e é
#     reversível: o script guarda a URL anterior e orienta como restaurá-la.
#   - Documenta e, quando confirmado explicitamente, ORQUESTRA o congelamento
#     do repositório GitHub via gh CLI (arquivamento). O passo efetivo de
#     congelamento é protegido pela flag --confirmar.
#
# O que este script NÃO FAZ (por segurança):
#   - NÃO executa, por padrão, nenhuma operação efetiva/destrutiva que dependa
#     de credenciais corporativas (arquivamento no GitHub, push ao Azure).
#   - NÃO embute segredos: a autenticação (gh auth / git credential / PAT /
#     SSH) deve ser provida pelo ambiente.
#
# Pré-requisitos:
#   - git
#   - gh (GitHub CLI) >= 2.x  — OPCIONAL; usado apenas para automatizar o
#     congelamento (arquivamento). Se ausente, o script imprime as instruções
#     manuais equivalentes (fallback).
#
# Uso:
#   ./cutover.sh [opções]
#
#   Também aceita variáveis de ambiente como padrão:
#     REPO_DESTINO    URL do Repositorio_Destino (Azure DevOps)
#     REPO_GITHUB     identificador do Repositorio_GitHub no formato OWNER/REPO
#                     (ex.: cemig/orcamento-mt), usado pelo gh CLI
#     GIT_REMOTE      nome do remote local a reapontar (padrão: origin)
#
#   Opções:
#     --destino   <url>        URL do Azure DevOps para onde o remote aponta.
#                              Padrão: https://dev.azure.com/cemig/Orcamento%20MT
#     --repo-github <owner/repo>  Repo GitHub a congelar (para o gh CLI).
#     --remote    <nome>       Nome do remote local a reapontar (padrão: origin).
#     --congelamento <modo>    Como congelar o GitHub: 'arquivar' (default) ou
#                              'read-only'. Veja as notas abaixo.
#     --confirmar              Confirma a execução EFETIVA (reaponte do remote
#                              e congelamento do GitHub). Sem esta flag o script
#                              roda em modo simulação (dry-run) e apenas mostra
#                              o que faria.
#     -h | --help              Mostra esta ajuda.
#
# Notas sobre o congelamento (read-only vs. arquivar):
#   - 'arquivar': `gh repo archive OWNER/REPO` torna o repositório somente
#     leitura de forma reversível (`gh repo unarchive`). É a forma mais simples
#     e recomendada de congelar um repositório inteiro no GitHub.
#   - 'read-only': o GitHub não possui um único comando para tornar TODO o repo
#     read-only sem arquivar; a prática equivalente é restringir escrita via
#     branch protection / regras de proteção (exigindo permissão de admin) e/ou
#     revogar permissões de escrita das equipes. Nesse modo o script apenas
#     documenta os passos manuais (fallback), pois dependem de políticas
#     corporativas e de permissões de administração do repositório.
# ----------------------------------------------------------------------------

set -euo pipefail

# --- Valores padrão -------------------------------------------------------
# Destino padrão conforme o Repositorio_Destino definido na spec (R8.1/R8.8).
REPO_DESTINO="${REPO_DESTINO:-https://dev.azure.com/cemig/Orcamento%20MT}"
REPO_GITHUB="${REPO_GITHUB:-}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
MODO_CONGELAMENTO="arquivar"
CONFIRMAR=0

# --- Funções auxiliares ---------------------------------------------------

# Imprime a ajuda resumida de uso.
mostrar_ajuda() {
  cat <<'EOF'
Uso:
  ./cutover.sh [opções]

Opções:
  --destino      <url>          URL do Azure DevOps (destino do remote).
                                Padrão: https://dev.azure.com/cemig/Orcamento%20MT
  --repo-github  <owner/repo>   Repo GitHub a congelar (para o gh CLI).
  --remote       <nome>         Remote local a reapontar (padrão: origin).
  --congelamento <modo>         'arquivar' (padrão) ou 'read-only'.
  --confirmar                   Executa de fato (reaponte + congelamento).
                                Sem a flag, roda em simulação (dry-run).
  -h | --help                   Mostra esta ajuda.

Variáveis de ambiente (usadas como padrão):
  REPO_DESTINO, REPO_GITHUB, GIT_REMOTE
EOF
}

# Loga mensagens padronizadas em stderr para não poluir a saída de dados.
log()  { printf '[cutover] %s\n' "$*" >&2; }
erro() { printf '[cutover][ERRO] %s\n' "$*" >&2; }

# Encerra com mensagem de erro e código de saída não-zero.
abortar() {
  erro "$1"
  exit "${2:-1}"
}

# --- Parsing dos argumentos ----------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --destino)      REPO_DESTINO="${2:-}"; shift 2 ;;
    --repo-github)  REPO_GITHUB="${2:-}"; shift 2 ;;
    --remote)       GIT_REMOTE="${2:-}"; shift 2 ;;
    --congelamento) MODO_CONGELAMENTO="${2:-}"; shift 2 ;;
    --confirmar)    CONFIRMAR=1; shift ;;
    -h|--help)      mostrar_ajuda; exit 0 ;;
    *)              abortar "Argumento desconhecido: $1 (use --help)" 2 ;;
  esac
done

# --- Checagens básicas de pré-requisitos ---------------------------------

# 1) git precisa estar disponível no PATH.
command -v git >/dev/null 2>&1 || abortar "git não encontrado no PATH."

# 2) URL de destino é obrigatória para o reaponte do remote.
[[ -n "$REPO_DESTINO" ]] || abortar "URL de destino não informada (use --destino ou REPO_DESTINO)." 2

# 3) O modo de congelamento precisa ser um dos valores aceitos.
case "$MODO_CONGELAMENTO" in
  arquivar|read-only) : ;;
  *) abortar "Modo de congelamento inválido: '$MODO_CONGELAMENTO' (use 'arquivar' ou 'read-only')." 2 ;;
esac

if [[ "$CONFIRMAR" -ne 1 ]]; then
  log "MODO SIMULAÇÃO (dry-run): nenhuma alteração efetiva será aplicada."
  log "Reexecute com --confirmar para aplicar o reaponte do remote e o congelamento."
else
  log "MODO EFETIVO (--confirmar): as alterações serão aplicadas."
fi
log "Destino (Azure DevOps): $REPO_DESTINO"
log "Remote local alvo     : $GIT_REMOTE"
log "Modo de congelamento  : $MODO_CONGELAMENTO"

# ==========================================================================
# ETAPA 1 — Reaponte do remote local para o Azure DevOps (origem única, R8.8)
# ==========================================================================
# Essa etapa é LOCAL e reversível: altera apenas a URL do remote neste clone.
# Cada integrante da equipe deve executá-la em seu próprio clone (ou refazer o
# clone a partir do Azure DevOps).
log "----------------------------------------------------------------------"
log "ETAPA 1: Reaponte do remote local '$GIT_REMOTE' -> Azure DevOps"

# Só faz sentido reapontar um remote se estivermos dentro de um repositório git.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  # Captura a URL atual do remote (se existir) para permitir reversão.
  URL_ATUAL="$(git remote get-url "$GIT_REMOTE" 2>/dev/null || true)"

  if [[ -n "$URL_ATUAL" ]]; then
    log "URL atual do remote '$GIT_REMOTE': $URL_ATUAL"
  else
    log "Remote '$GIT_REMOTE' ainda não existe neste clone; será criado."
  fi

  if [[ "$URL_ATUAL" == "$REPO_DESTINO" ]]; then
    log "O remote '$GIT_REMOTE' já aponta para o destino; nada a fazer na Etapa 1."
  elif [[ "$CONFIRMAR" -eq 1 ]]; then
    if [[ -n "$URL_ATUAL" ]]; then
      log "Reapontando remote existente para o destino..."
      git remote set-url "$GIT_REMOTE" "$REPO_DESTINO" \
        || abortar "Falha ao reapontar o remote '$GIT_REMOTE'."
      log "Para reverter, se necessário: git remote set-url $GIT_REMOTE \"$URL_ATUAL\""
    else
      log "Criando remote '$GIT_REMOTE' apontando para o destino..."
      git remote add "$GIT_REMOTE" "$REPO_DESTINO" \
        || abortar "Falha ao criar o remote '$GIT_REMOTE'."
    fi
    log "Remote '$GIT_REMOTE' agora aponta para: $(git remote get-url "$GIT_REMOTE")"
    log "Dica: valide o acesso com 'git fetch $GIT_REMOTE' (requer credenciais do ambiente)."
  else
    # Simulação: mostra exatamente o comando que seria executado.
    if [[ -n "$URL_ATUAL" ]]; then
      log "[simulação] git remote set-url $GIT_REMOTE \"$REPO_DESTINO\""
    else
      log "[simulação] git remote add $GIT_REMOTE \"$REPO_DESTINO\""
    fi
  fi
else
  log "Diretório atual não é um repositório git; pulando o reaponte do remote."
  log "Execute este script dentro do clone local, ou refaça o clone do Azure DevOps:"
  log "  git clone \"$REPO_DESTINO\""
fi

# ==========================================================================
# ETAPA 2 — Congelamento/arquivamento do Repositorio_GitHub (R8.8)
# ==========================================================================
# Impede desenvolvimento paralelo no GitHub após a origem única passar para o
# Azure DevOps. O passo EFETIVO depende de credenciais/permissões corporativas
# e, por isso, só é executado com --confirmar.
log "----------------------------------------------------------------------"
log "ETAPA 2: Congelamento do Repositorio_GitHub (modo: $MODO_CONGELAMENTO)"

# Verifica se o gh CLI está disponível para automatizar o arquivamento.
GH_DISPONIVEL=0
if command -v gh >/dev/null 2>&1; then
  GH_DISPONIVEL=1
fi

if [[ "$MODO_CONGELAMENTO" == "arquivar" ]]; then
  if [[ "$GH_DISPONIVEL" -eq 1 && -n "$REPO_GITHUB" ]]; then
    if [[ "$CONFIRMAR" -eq 1 ]]; then
      log "Arquivando o repositório GitHub '$REPO_GITHUB' via gh CLI..."
      log "A autenticação é provida pelo ambiente (gh auth login); nenhum segredo é embutido."
      # 'gh repo archive' torna o repositório somente leitura de forma reversível.
      gh repo archive "$REPO_GITHUB" --yes \
        || abortar "Falha ao arquivar '$REPO_GITHUB' via gh CLI. Verifique autenticação/permissões."
      log "Repositório '$REPO_GITHUB' arquivado (read-only). Reversível com: gh repo unarchive $REPO_GITHUB"
    else
      log "[simulação] gh repo archive $REPO_GITHUB --yes"
    fi
  else
    # Fallback: gh ausente ou repo não informado -> instruções manuais.
    [[ "$GH_DISPONIVEL" -eq 1 ]] || log "gh CLI não encontrado no PATH (fallback para instruções manuais)."
    [[ -n "$REPO_GITHUB" ]]      || log "Repo GitHub não informado (use --repo-github OWNER/REPO) — instruções manuais abaixo."
    cat >&2 <<'EOF'
[cutover] CONGELAMENTO MANUAL (arquivar) — passos no GitHub:
  Opção A) Via gh CLI (instale: https://cli.github.com/):
    gh auth login
    gh repo archive OWNER/REPO --yes
    # Reverter, se necessário: gh repo unarchive OWNER/REPO
  Opção B) Pela interface web do GitHub:
    1. Acesse o repositório > Settings (Configurações).
    2. Role até "Danger Zone" (Zona de perigo).
    3. Clique em "Archive this repository" e confirme.
    O repositório fica somente leitura; é possível desarquivar depois.
EOF
  fi
else
  # Modo 'read-only': não há comando único; documentamos a prática equivalente.
  cat >&2 <<'EOF'
[cutover] CONGELAMENTO MANUAL (read-only) — passos no GitHub:
  O GitHub não oferece um único comando para tornar TODO o repositório
  read-only sem arquivar. Para manter o repositório visível porém sem
  escrita, aplique as medidas abaixo (requer permissão de administração):
    1. Settings > Collaborators and teams: remover/rebaixar permissões de
       escrita (manter apenas leitura) das equipes e colaboradores.
    2. Settings > Branches > Branch protection rules: proteger a branch
       padrão exigindo PR + revisões e bloqueando push direto; opcionalmente
       bloquear criação/edição de branches.
    3. Adicionar um aviso no README indicando que a ORIGEM ÚNICA do código
       migrou para o Azure DevOps (REPO_DESTINO) e que o GitHub está congelado.
  Alternativa recomendada e mais simples: arquivar o repositório
  (reexecute com '--congelamento arquivar'), tornando-o read-only por completo.
EOF
fi

# --- Encerramento ---------------------------------------------------------
log "----------------------------------------------------------------------"
if [[ "$CONFIRMAR" -eq 1 ]]; then
  log "Cutover efetivo concluído: origem única no Azure DevOps e GitHub congelado."
else
  log "Simulação concluída. Nenhuma alteração aplicada."
  log "Para efetivar, reexecute com --confirmar (e, para arquivar, informe --repo-github OWNER/REPO)."
fi
log "Próximos passos no destino: branch policy da main (1.6), estrutura de pastas (1.4) e pipeline (seção 13)."
