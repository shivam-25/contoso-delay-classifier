#!/usr/bin/env bash
# Area E: load test + failure test against the live portal.
# usage: ./scripts/loadtest.sh https://<host> [requests] [concurrency]
set -uo pipefail
HOST="${1:?usage: loadtest.sh <https://host> [n] [concurrency]}"
N="${2:-100}"; C="${3:-10}"
VALID='{"carrier":"Delhivery","distance_km":1500,"weight_kg":4.2,"items":5,"order_hour":18,"is_sale_day":1,"warehouse_backlog":55,"weather_index":0.6}'
BAD='{"carrier":"NotACarrier","distance_km":-5,"items":0}'

echo "== load test: $N requests, concurrency $C =="
seq 1 "$N" | xargs -P "$C" -I{} curl -s -o /dev/null -w "%{http_code} %{time_total}\n" \
  -X POST "$HOST/api/predict" -H 'Content-Type: application/json' -d "$VALID" > /tmp/lt.txt
awk '{c[$1]++; t[NR]=$2*1000} END {
  n=asort(t);
  printf "  p50 %.0f ms   p95 %.0f ms   max %.0f ms\n", t[int(n*0.5)], t[int(n*0.95)], t[n];
  for (k in c) printf "  HTTP %s: %d\n", k, c[k];
}' /tmp/lt.txt 2>/dev/null || {
  echo "  status counts:"; cut -d' ' -f1 /tmp/lt.txt | sort | uniq -c
  echo "  slowest:"; sort -k2 -rn /tmp/lt.txt | head -3
}

echo
echo "== failure test: malformed payload should return 400, not 500 =="
curl -s -w "\n  -> HTTP %{http_code}\n" -X POST "$HOST/api/predict" \
  -H 'Content-Type: application/json' -d "$BAD"

echo
echo "== metrics after load =="
curl -s "$HOST/api/metrics?limit=500" | python3 -m json.tool | head -30
