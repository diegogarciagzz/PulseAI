#!/usr/bin/env bash
# Deploy PULSE AI to Azure Container Apps with live Microsoft Foundry inference.
#
#   cd pulse-ai && bash deploy/azure-containerapps.sh
#
# Prerequisites: `az login`, the Foundry resource + gpt-5-mini deployment, FOUNDRY_* in .env,
# and the image ghcr.io/<owner>/pulseai:latest built by .github/workflows/container.yml (public package).
# The app authenticates to Foundry with its system-assigned managed identity (no keys anywhere).
set -euo pipefail

RG="${RG:-pulse-ai-rg}"
LOCATION="${LOCATION:-eastus}"
ENV_NAME="${ENV_NAME:-pulse-ai-env}"
APP="${APP:-pulse-ai}"
FOUNDRY_RESOURCE="${FOUNDRY_RESOURCE:-pulseai-diego}"
IMAGE="${IMAGE:-ghcr.io/diegogarciagzz/pulseai:latest}"
DAILY_BUDGET="${DAILY_BUDGET:-400}"   # max model calls per day on the public demo
IP_LIMIT="${IP_LIMIT:-30}"            # model-backed requests per address per hour
FOUNDRY_USER_ROLE="53ca6127-db72-4b80-b1b0-d745d6d5456d"   # Foundry User (formerly Azure AI User)

if [ -f .env ]; then
  FOUNDRY_PROJECT_ENDPOINT="${FOUNDRY_PROJECT_ENDPOINT:-$(grep -E '^FOUNDRY_PROJECT_ENDPOINT=' .env | cut -d= -f2- | tr -d '"' || true)}"
  FOUNDRY_MODEL="${FOUNDRY_MODEL:-$(grep -E '^FOUNDRY_MODEL=' .env | cut -d= -f2- | tr -d '"' || true)}"
fi
: "${FOUNDRY_PROJECT_ENDPOINT:?Set FOUNDRY_PROJECT_ENDPOINT in .env}"
: "${FOUNDRY_MODEL:?Set FOUNDRY_MODEL in .env}"

step() { printf '\n==> %s\n' "$*"; }

step "Checking that the image can be pulled anonymously: $IMAGE"
REPO_PATH="${IMAGE#ghcr.io/}"; REPO_PATH="${REPO_PATH%:*}"; TAG="${IMAGE##*:}"
TOKEN="$(curl -fsS "https://ghcr.io/token?scope=repository:${REPO_PATH}:pull" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))' || true)"
if ! curl -fsS -o /dev/null -H "Authorization: Bearer ${TOKEN}" \
     -H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json" \
     "https://ghcr.io/v2/${REPO_PATH}/manifests/${TAG}"; then
  echo "The image is not public yet (or the GitHub Action has not finished)."
  echo "1. Check https://github.com/${REPO_PATH%%/*}/PulseAI/actions : the 'container' workflow must be green."
  echo "2. Open https://github.com/users/${REPO_PATH%%/*}/packages/container/package/pulseai -> Package settings -> Change visibility -> Public."
  exit 1
fi
echo "OK"

step "Azure subscription"
az account show --query "{subscription:name, user:user.name}" -o table

step "Container Apps CLI extension and resource provider"
az extension add --name containerapp --upgrade --yes --only-show-errors
az provider register --namespace Microsoft.App --wait --only-show-errors

step "Container Apps environment: $ENV_NAME"
if ! az containerapp env show -n "$ENV_NAME" -g "$RG" >/dev/null 2>&1; then
  az containerapp env create -n "$ENV_NAME" -g "$RG" -l "$LOCATION" --logs-destination none --only-show-errors -o none
fi

APP_ENV=(
  "FOUNDRY_PROJECT_ENDPOINT=${FOUNDRY_PROJECT_ENDPOINT}"
  "FOUNDRY_MODEL=${FOUNDRY_MODEL}"
  "PULSE_AI_MODE=auto"
  "PULSE_AI_DAILY_CALL_BUDGET=${DAILY_BUDGET}"
  "PULSE_AI_IP_LIMIT_PER_HOUR=${IP_LIMIT}"
  "AI_TIMEOUT_SECONDS=60"
)

step "Container app: $APP"
if az containerapp show -n "$APP" -g "$RG" >/dev/null 2>&1; then
  az containerapp update -n "$APP" -g "$RG" --image "$IMAGE" --set-env-vars "${APP_ENV[@]}" --only-show-errors -o none
else
  # One replica on purpose: matches, debates and caches live in memory.
  az containerapp create -n "$APP" -g "$RG" --environment "$ENV_NAME" --image "$IMAGE" \
    --target-port 8000 --ingress external --min-replicas 1 --max-replicas 1 --cpu 0.5 --memory 1.0Gi \
    --system-assigned --env-vars "${APP_ENV[@]}" --only-show-errors -o none
fi

step "Granting the app's managed identity access to Foundry ($FOUNDRY_RESOURCE)"
PRINCIPAL_ID="$(az containerapp show -n "$APP" -g "$RG" --query identity.principalId -o tsv)"
SCOPE="$(az cognitiveservices account show -n "$FOUNDRY_RESOURCE" -g "$RG" --query id -o tsv)"
az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
  --role "$FOUNDRY_USER_ROLE" --scope "$SCOPE" --only-show-errors -o none 2>/dev/null || echo "(role already assigned)"

step "Waiting 60 s for the role to propagate, then restarting the app"
sleep 60
az containerapp update -n "$APP" -g "$RG" --set-env-vars "ROLE_REFRESH=$(date +%s)" --only-show-errors -o none

FQDN="$(az containerapp show -n "$APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)"
step "Checking https://${FQDN}/api/system/capabilities"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "https://${FQDN}/api/system/capabilities"; then echo; break; fi
  sleep 10
done

printf '\nPULSE AI is live: https://%s\n' "$FQDN"
printf 'Live check: python scripts/foundry_smoke.py https://%s\n' "$FQDN"
