#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-kindred-support}"
LOCATION="${AZURE_LOCATION:-eastus}"
SWA_LOCATION="${AZURE_SWA_LOCATION:-eastus2}"
CONTAINER_ENV="${AZURE_CONTAINER_ENV:-aca-kindred-support}"
STATIC_APP="${AZURE_STATIC_APP:-swa-kindred-support}"

if ! az account show --output none >/dev/null 2>&1; then
  echo "Sign in to Azure first with: az login" >&2
  exit 1
fi

az extension add --name containerapp --upgrade --yes
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

if ! az containerapp env show --name "$CONTAINER_ENV" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null; then
  az containerapp env create \
    --name "$CONTAINER_ENV" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --logs-destination none \
    --output none
fi

if ! az staticwebapp show --name "$STATIC_APP" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null; then
  az staticwebapp create \
    --name "$STATIC_APP" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$SWA_LOCATION" \
    --sku Free \
    --output none
fi

echo "Resource group: $RESOURCE_GROUP"
echo "Container Apps environment: $CONTAINER_ENV"
echo "Static Web App: $STATIC_APP"
echo "Static Web App URL: https://$(az staticwebapp show --name "$STATIC_APP" --resource-group "$RESOURCE_GROUP" --query defaultHostname --output tsv)"
echo "Static Web Apps deployment token is available with: az staticwebapp secrets list --name $STATIC_APP --resource-group $RESOURCE_GROUP --query properties.apiKey --output tsv"
