#!/usr/bin/env bash
#
# varrer-segredos-historico.sh
# ----------------------------------------------------------------------------
# Varredura de segredos sobre TODO o histórico de commits (não apenas o HEAD).
#
# Contexto (spec adequacao-diretrizes-cemig, Tarefa 1.2 / Requirement 9.4):
#   Antes do push definitivo para o Repositorio_Destino (Azure DevOps), o
#   histórico completo da cópia-espelho precisa estar livre de credenciais,
#   tokens ou chaves em texto claro — incluindo commits antigos (R9.4).
#
# Este script configura e executa o gitleaks em modo "detect" sobre o
# histórico inteiro do repositório e produz um relatório de ocorrências.
# NÃO reescreve o histórico nem remove segredos: a limpeza/rotação é um passo
# manual e deliberado, documentado em README-varredura-segredos.md.
#
# Pré-requisitos:
#   - git
#   - gitleaks >= 8.x   (https://github.com/gitleaks/gitleaks)
#
# Uso:
#   ./varrer-segredos-historico.sh [CAMINHO_REPO] [CAMINHO_RELATORIO]
#
#   CAMINHO_REPO       (opcional) raiz do repositório/cópia-espelho a varrer.
#                      Padrão: raiz do repositório atual (git rev-parse).
#   CAMINHO_RELATORIO  (opcional) arquivo JSON de saída do relatório.
#                      Padrão: ./relatorio-segredos-historico.json
#
# Códigos de saída:
#   0  nenhum segredo encontrado no histórico (seguro para push definitivo)
#   1  pré-requisito ausente ou erro de execução
#   2  segredos encontrados no histórico (ver relatório e README; NÃO fazer
#      o push definitivo antes de limpeza/reescrita e rotação)
# ----------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/gitleaks.toml"

REPO_PATH="${1:-}"
REPORT_PATH="${2:-./relatorio-segredos-historico.json}"

log()  { printf '[varredura] %s\n' "$*"; }
err()  { printf '[varredura][erro] %s\n' "$*" >&2; }

# --- Validações de pré-requisitos -------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  err "git não encontrado no PATH."
  exit 1
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  err "gitleaks não encontrado no PATH. Instale a partir de https://github.com/gitleaks/gitleaks"
  err "Ex.: brew install gitleaks | choco install gitleaks | go install github.com/gitleaks/gitleaks/v8@latest"
  exit 1
fi

if [[ -z "${REPO_PATH}" ]]; then
  REPO_PATH="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi

if [[ -z "${REPO_PATH}" || ! -d "${REPO_PATH}/.git" ]]; then
  err "Caminho de repositório inválido: '${REPO_PATH}'. Informe a raiz de um repositório git (ou a cópia-espelho)."
  exit 1
fi

if [[ ! -f "${CONFIG_FILE}" ]]; then
  err "Arquivo de configuração do gitleaks não encontrado: ${CONFIG_FILE}"
  exit 1
fi

# --- Execução ----------------------------------------------------------------
# "gitleaks detect" varre TODO o histórico de commits por padrão
# (ao contrário de "gitleaks protect", que inspeciona apenas mudanças não
# commitadas / staged). Isto satisfaz a exigência de analisar o histórico
# completo, e não apenas o HEAD (R9.4).
log "Repositório alvo : ${REPO_PATH}"
log "Config gitleaks  : ${CONFIG_FILE}"
log "Relatório (JSON) : ${REPORT_PATH}"
log "Iniciando varredura do histórico completo de commits..."

set +e
gitleaks detect \
  --source "${REPO_PATH}" \
  --config "${CONFIG_FILE}" \
  --report-format json \
  --report-path "${REPORT_PATH}" \
  --redact \
  --log-opts="--all" \
  --verbose
SCAN_STATUS=$?
set -e

# gitleaks: código 0 = nada encontrado; 1 = leaks encontrados; outro = erro.
if [[ ${SCAN_STATUS} -eq 0 ]]; then
  log "Nenhum segredo encontrado no histórico. Seguro para o push definitivo."
  exit 0
elif [[ ${SCAN_STATUS} -eq 1 ]]; then
  err "Segredos encontrados no histórico de commits."
  err "Relatório detalhado: ${REPORT_PATH}"
  err "NÃO execute o push definitivo (git push --mirror) antes de:"
  err "  1) limpar/reescrever o histórico removendo os segredos;"
  err "  2) rotacionar (revogar e regerar) os segredos expostos."
  err "Procedimento completo em: ${SCRIPT_DIR}/README-varredura-segredos.md"
  exit 2
else
  err "Falha na execução do gitleaks (código ${SCAN_STATUS})."
  exit 1
fi
