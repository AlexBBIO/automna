#!/bin/bash
# Automna Fly.io Health Check
# Checks per-user gateway health

set -e

FLY_API_TOKEN=$(jq -r .token /root/clawd/projects/automna/config/fly.json)
TURSO_API_TOKEN=$(jq -r .token /root/clawd/projects/automna/config/turso-api.json)
METRICS_FILE="/root/clawd/projects/automna/monitoring/metrics.jsonl"

export PATH="$PATH:/root/.turso"

timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Get list of user apps from Turso
# Use tail to skip header, sed to trim whitespace from each line
apps=$(turso db shell automna "SELECT app_name FROM machines WHERE status = 'started';" 2>/dev/null | tail -n +2 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$')

healthy_count=0
unhealthy_count=0
cold_start_count=0
total_count=0
unhealthy_apps=""

for app in $apps; do
  if [ -z "$app" ]; then continue; fi
  total_count=$((total_count + 1))
  
  # Check HTTP health with timing
  start_ms=$(date +%s%N)
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "https://${app}.fly.dev/" 2>/dev/null || echo "000")
  end_ms=$(date +%s%N)
  latency_ms=$(( (end_ms - start_ms) / 1000000 ))
  
  if [ "$status" = "200" ] || [ "$status" = "301" ] || [ "$status" = "302" ] || [ "$status" = "304" ]; then
    healthy_count=$((healthy_count + 1))
    # Flag cold starts (latency > 10s usually means machine was suspended)
    if [ "$latency_ms" -gt 10000 ]; then
      cold_start_count=$((cold_start_count + 1))
      echo "[$timestamp] INFO: $app cold start (${latency_ms}ms)"
    fi
  else
    unhealthy_count=$((unhealthy_count + 1))
    unhealthy_apps="${unhealthy_apps}${app}(${status}) "
    echo "[$timestamp] WARN: $app returned $status (${latency_ms}ms)"
  fi
done

# Output summary
cat << EOJSON
{
  "timestamp": "$timestamp",
  "total_apps": $total_count,
  "healthy": $healthy_count,
  "unhealthy": $unhealthy_count,
  "cold_starts": $cold_start_count,
  "unhealthy_apps": "${unhealthy_apps}"
}
EOJSON

# Append to metrics
echo "{\"timestamp\":\"$timestamp\",\"total\":$total_count,\"healthy\":$healthy_count,\"unhealthy\":$unhealthy_count,\"cold_starts\":$cold_start_count}" >> "$METRICS_FILE"
