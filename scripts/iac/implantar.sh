#!/usr/bin/env bash
#
# implantar.sh
# ----------------------------------------------------------------------------
# Implantação do IaC (Bicep/ARM) com state remoto nativo, bloqueio contra
# execuções concorrentes e auditoria.
#
# Contexto (spec adequacao-diretrizes-cemig, Tarefa 12.4 / R6.1, R6.3, R6.4,
#   R6.5, R6.6). Ver infra/backend-state.md e design.md > Error Handling
#   (linha "Falha de execução do IaC", R6.5).
#
# No modelo ARM/Bicep NÃO existe arquivo de state separado: o estado de verdade
# é o conjunto de recursos no Resource Group e o histórico de deployments ARM
# (versionado, imutável e auditável). Este script orquestra uma implantação
# segura sobre esse modelo:
#
#   - NOME DETERMINÍSTICO E AUDITÁVEL do deployment: orcamt-<ambiente>-<UTC>
#     (R6.3 versionamento / R6.6 auditoria).
#   - BLOQUEIO DE CONCORRÊNCIA (R6.3): recusa iniciar se já houver um deployment
#     em estado "Running" no Resource Group; opcionalmente aplica um resource
#     lock no RG durante a janela de implantação.
#   - PRESERVAÇÃO EM FALHA (R6.5): em erro, NÃO remove recursos nem tenta
#     desfazer o estado anterior — o último deployment bem-sucedido permanece
#     como state válido; a causa da falha é capturada e registrada.
#   - AUDITORIA (R6.6): ao final imprime identidade, horário e recursos tocados
#     a partir do histórico de deployment e do Activity Log.
#
# O que este script FAZ:
#   - Pré-valida o template (az bicep build) e pré-visualiza (what-if).
#   - Implanta com nome determinístico, após checar concorrência.
#   - Em falha, extrai e registra a causa; preserva o último state válido.
#
# O que este script NÃO FAZ (por segurança):
#   - NÃO cria o Resource Group nem concede RBAC (isso é controlado fora, por
#     identidades autorizadas — R6.3). NÃO embute segredos: a autenticação
#     (az login / OIDC do pipeline) deve ser provida pelo ambiente.
#   - NÃO executa operações destrutivas de rollback.
#
# Pré-requisitos:
#   - Azure CLI (az) com a extensão Bicep. Sessão já autenticada (az login) por
#     identidade com RBAC de escrita no Resource Group alvo (R6.3).
#
# Uso:
#   ./implantar.sh --ambiente <dev|hml|prd> [opções]
#
# Opções:
#   --ambiente <dev|hml|prd>   (obrigatório) Ambiente alvo.
#   --resource-group <nome>    RG alvo. Padrão: rg-orcamento-mt-<ambiente>.
#   --com-lock                 Aplica resource lock (CanNotDelete) no RG durante
#                              a janela e o remove ao final (trava extra).
#   --apenas-what-if           Só pré-visualiza (não altera nada).
#   --sem-what-if              Pula a pré-visualização (não recomendado em prd).
#   -h | --help                Mostra esta ajuda.
# ----------------------------------------------------------------------------

set -euo pipefail

# -------------------------- parâmetros / defaults ---------------------------
AMBIENTE=""
RESOURCE_GROUP=""
COM_LOCK=0
APENAS_WHATIF=0
SEM_WHATIF=0

PREFIXO_NOME="orcamt"
# Diretório raiz do repositório (este script fica em scripts/iac/).
RAIZ_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="${RAIZ_REPO}/infra/main.bicep"

uso() { sed -n '2,60p' "${BASH_SOURCE[0]}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ambiente) AMBIENTE="${2:-}"; shift 2 ;;
    --resource-group) RESOURCE_GROUP="${2:-}"; shift 2 ;;
    --com-lock) COM_LOCK=1; shift ;;
    --apenas-what-if) APENAS_WHATIF=1; shift ;;
    --sem-what-if) SEM_WHATIF=1; shift ;;
    -h|--help) uso; exit 0 ;;
    *) echo "ERRO: opção desconhecida: $1" >&2; uso; exit 2 ;;
  esac
done

# ------------------------------- validações --------------------------------
case "${AMBIENTE}" in
  dev|hml|prd) ;;
  *) echo "ERRO: --ambiente deve ser dev, hml ou prd." >&2; exit 2 ;;
esac

if ! command -v az >/dev/null 2>&1; then
  echo "ERRO: Azure CLI (az) não encontrada. Instale a az CLI com a extensão Bicep." >&2
  exit 3
fi

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-orcamento-mt-${AMBIENTE}}"
PARAMS="${RAIZ_REPO}/infra/params/${AMBIENTE}.bicepparam"

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "ERRO: template não encontrado: ${TEMPLATE}" >&2; exit 3
fi
if [[ ! -f "${PARAMS}" ]]; then
  echo "ERRO: arquivo de parâmetros não encontrado: ${PARAMS}" >&2; exit 3
fi

# Nome de deployment DETERMINÍSTICO e AUDITÁVEL (R6.3 versionamento / R6.6).
CARIMBO_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
NOME_DEPLOY="${PREFIXO_NOME}-${AMBIENTE}-${CARIMBO_UTC}"

echo "== Implantação IaC (Bicep/ARM) =="
echo "  Ambiente ...........: ${AMBIENTE}"
echo "  Resource Group .....: ${RESOURCE_GROUP}"
echo "  Template ...........: ${TEMPLATE}"
echo "  Parâmetros .........: ${PARAMS}"
echo "  Deployment .........: ${NOME_DEPLOY}"
echo

# ---------------------- pré-validação do template --------------------------
echo "-- Compilando/validando o template (az bicep build)..."
az bicep build --file "${TEMPLATE}" >/dev/null
echo "   OK."

# ---------------------- bloqueio de concorrência (R6.3) --------------------
# Recusa iniciar se já houver um deployment em andamento no RG. Evita que duas
# execuções alterem o mesmo state simultaneamente.
echo "-- Verificando execuções concorrentes no Resource Group..."
EM_ANDAMENTO="$(az deployment group list \
  --resource-group "${RESOURCE_GROUP}" \
  --query "length([?properties.provisioningState=='Running'])" \
  --output tsv 2>/dev/null || echo 0)"

if [[ "${EM_ANDAMENTO}" != "0" ]]; then
  echo "ERRO (bloqueio de concorrência, R6.3): já existe ${EM_ANDAMENTO} deployment(s)" >&2
  echo "       em andamento (Running) em ${RESOURCE_GROUP}. Aguarde a conclusão." >&2
  exit 4
fi
echo "   Nenhum deployment em andamento."

# ------------------------- pré-visualização (what-if) ----------------------
if [[ "${SEM_WHATIF}" -eq 0 ]]; then
  echo "-- Pré-visualizando alterações (what-if)..."
  az deployment group what-if \
    --resource-group "${RESOURCE_GROUP}" \
    --template-file "${TEMPLATE}" \
    --parameters "${PARAMS}"
fi

if [[ "${APENAS_WHATIF}" -eq 1 ]]; then
  echo "-- --apenas-what-if: nenhuma alteração aplicada. Encerrando."
  exit 0
fi

# -------------- resource lock durante a janela (trava extra) ---------------
LOCK_NOME="iac-${PREFIXO_NOME}-${AMBIENTE}-deploy"
remover_lock() {
  if [[ "${COM_LOCK}" -eq 1 ]]; then
    echo "-- Removendo resource lock da janela de implantação..."
    az lock delete --name "${LOCK_NOME}" --resource-group "${RESOURCE_GROUP}" >/dev/null 2>&1 || true
  fi
}
if [[ "${COM_LOCK}" -eq 1 ]]; then
  echo "-- Aplicando resource lock (CanNotDelete) no RG durante a janela..."
  az lock create \
    --name "${LOCK_NOME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --lock-type CanNotDelete \
    --notes "Janela de implantação IaC ${NOME_DEPLOY}" >/dev/null
  trap remover_lock EXIT
fi

# ------------------------------ implantação --------------------------------
# PRESERVAÇÃO EM FALHA (R6.5): em erro NÃO desfazemos nada. O ARM mantém o
# último deployment bem-sucedido como state válido; aqui apenas capturamos e
# registramos a causa e saímos com erro.
echo "-- Aplicando a implantação..."
if az deployment group create \
    --name "${NOME_DEPLOY}" \
    --resource-group "${RESOURCE_GROUP}" \
    --template-file "${TEMPLATE}" \
    --parameters "${PARAMS}"; then
  echo "   Implantação concluída com sucesso."
else
  COD=$?
  echo "ERRO (R6.5): a execução do IaC falhou (código ${COD})." >&2
  echo "       O último state remoto válido foi PRESERVADO (sem state parcial;" >&2
  echo "       nada foi desfeito). Causa registrada no histórico do deployment:" >&2
  az deployment operation group list \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${NOME_DEPLOY}" \
    --query "[?properties.provisioningState=='Failed'].{recurso:properties.targetResource.id, codigo:properties.statusMessage.error.code, msg:properties.statusMessage.error.message}" \
    --output json >&2 || true
  exit "${COD}"
fi

# -------------------------- auditoria (R6.6) -------------------------------
echo
echo "== Auditoria da execução (R6.6) =="
echo "-- Deployment (horário e recursos alterados):"
az deployment group show \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${NOME_DEPLOY}" \
  --query "{nome:name, horario:properties.timestamp, estado:properties.provisioningState, recursos:properties.outputResources[].id}" \
  --output json || true

echo "-- Identidade que iniciou operações de escrita (Activity Log):"
az monitor activity-log list \
  --resource-group "${RESOURCE_GROUP}" \
  --offset 1h \
  --query "[?authorization.action && contains(authorization.action, 'write')].{identidade:caller, horario:eventTimestamp, operacao:operationName.localizedValue}" \
  --output table || true

echo
echo "Pronto. State versionado no histórico de deployments do Resource Group."
