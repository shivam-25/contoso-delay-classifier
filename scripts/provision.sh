#!/usr/bin/env bash
# Provision the Contoso Delay Classifier stack. Idempotent: safe to re-run.
set -euo pipefail

LOC="${LOC:-centralindia}"
RG="${RG:-rg-contoso-delay}"
SUFFIX="${SUFFIX:-$(echo $RANDOM | md5 2>/dev/null | cut -c1-5 || echo $RANDOM)}"
SQL_SERVER="${SQL_SERVER:-sql-contoso-$SUFFIX}"
SQL_DB="${SQL_DB:-contosodelay}"
SQL_ADMIN="${SQL_ADMIN:-contosoadmin}"
SQL_PASS="${SQL_PASS:?set SQL_PASS}"
COSMOS="${COSMOS:-cosmos-contoso-$SUFFIX}"
SWA="${SWA:-swa-contoso-$SUFFIX}"

echo "==> resource group $RG in $LOC"
az group create -n "$RG" -l "$LOC" -o none

echo "==> Azure SQL server $SQL_SERVER"
az sql server create -g "$RG" -n "$SQL_SERVER" -l "$LOC" \
  -u "$SQL_ADMIN" -p "$SQL_PASS" -o none
# Allow Azure services + this machine so we can load the CSV.
az sql server firewall-rule create -g "$RG" -s "$SQL_SERVER" \
  -n AllowAzure --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none
MYIP=$(curl -s https://api.ipify.org)
az sql server firewall-rule create -g "$RG" -s "$SQL_SERVER" \
  -n AllowClient --start-ip-address "$MYIP" --end-ip-address "$MYIP" -o none
echo "==> Azure SQL database $SQL_DB (Basic)"
az sql db create -g "$RG" -s "$SQL_SERVER" -n "$SQL_DB" \
  --service-objective Basic --backup-storage-redundancy Local -o none

echo "==> Cosmos DB $COSMOS (serverless)"
az cosmosdb create -g "$RG" -n "$COSMOS" --locations regionName="$LOC" \
  --capabilities EnableServerless -o none
az cosmosdb sql database create -g "$RG" -a "$COSMOS" -n contoso -o none
# requests: partitioned by date - the dashboard reads a recent slice.
az cosmosdb sql container create -g "$RG" -a "$COSMOS" -d contoso \
  -n requests --partition-key-path /date -o none
# model_runs: partitioned by model_name - tiny, read-mostly.
az cosmosdb sql container create -g "$RG" -a "$COSMOS" -d contoso \
  -n model_runs --partition-key-path /model_name -o none

echo "==> Static Web App $SWA"
az staticwebapp create -g "$RG" -n "$SWA" -l eastasia --sku Free -o none

COSMOS_EP=$(az cosmosdb show -g "$RG" -n "$COSMOS" --query documentEndpoint -o tsv)
COSMOS_KEY=$(az cosmosdb keys list -g "$RG" -n "$COSMOS" --query primaryMasterKey -o tsv)

echo "==> wiring server-side app settings (keys never reach the browser)"
az staticwebapp appsettings set -n "$SWA" -g "$RG" --setting-names \
  COSMOS_ENDPOINT="$COSMOS_EP" COSMOS_KEY="$COSMOS_KEY" \
  COSMOS_DB=contoso COSMOS_REQUESTS_CONTAINER=requests \
  COSMOS_RUNS_CONTAINER=model_runs -o none

cat > .env.local <<ENVEOF
RG=$RG
SQL_SERVER=$SQL_SERVER
SQL_DB=$SQL_DB
SQL_ADMIN=$SQL_ADMIN
COSMOS=$COSMOS
COSMOS_ENDPOINT=$COSMOS_EP
SWA=$SWA
SWA_HOSTNAME=$(az staticwebapp show -g "$RG" -n "$SWA" --query defaultHostname -o tsv)
ENVEOF
echo
echo "PROVISIONED. Portal: https://$(az staticwebapp show -g "$RG" -n "$SWA" --query defaultHostname -o tsv)"
echo "(.env.local written - it is gitignored)"
