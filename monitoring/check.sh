#!/bin/bash
# Automna Fly.io Health Check
# Checks per-user gateway health

set -e

FLY_API_TOKEN=$(jq -r .token /root/clawd/projects/automna/config/fly.json)
TURSO_API_TOKEN=$(jq -r .token /root/clawd/projects/automna/config/turso-api.json)
METRICS_FILE="/root/clawd/projects/automna/monitoring/metrics.jsonl"

timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Get list of user apps from Turso
apps=$(turso db shell automna "SELECT app_name FROM machines WHERE status = 'started';" 2>/dev/null | grep -v APP_NAME | tr -d '[:space:]' | head -5)

healthy_count=0
unhealthy_count=0
total_count=0

for app in $apps; do
  if [ -z "$app" ]; then continue; fi
  total_count=$((total_count + 1))
  
  # Check HTTP health
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://${app}.fly.dev/" 2>/dev/null || echo "000")
  
  if [ "$status" = "200" ]; then
    healthy_count=$((healthy_count + 1))
  else
    unhealthy_count=$((unhealthy_count + 1))
    echo "[$timestamp] WARN: $app returned $status"
  fi
done

# Output summary
cat << EOJSON
{
  "timestamp": "$timestamp",
  "total_apps": $total_count,
  "healthy": $healthy_count,
  "unhealthy": $unhealthy_count
}
EOJSON

# Append to metrics
echo "{\"timestamp\":\"$timestamp\",\"total\":$total_count,\"healthy\":$healthy_count,\"unhealthy\":$unhealthy_count}" >> "$METRICS_FILE"
