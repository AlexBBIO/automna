#!/bin/bash
# Automna Moltworker Health Check
# Outputs JSON with metrics

WORKER_URL="https://moltbot-sandbox.alex-0bb.workers.dev"
METRICS_FILE="/root/clawd/projects/automna/monitoring/metrics.jsonl"

# Generate test signed URL (using test params - worker will validate format)
TEST_USER="healthcheck-$(date +%s)"
TEST_EXP=$(($(date +%s) + 3600))

# Check basic HTTP endpoint
start_http=$(date +%s%3N)
http_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$WORKER_URL/" 2>/dev/null)
end_http=$(date +%s%3N)
http_latency=$((end_http - start_http))

# Check WebSocket upgrade capability (just the handshake)
start_ws=$(date +%s%3N)
ws_check=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  "$WORKER_URL/ws" 2>/dev/null)
end_ws=$(date +%s%3N)
ws_latency=$((end_ws - start_ws))

# Check API history endpoint (will fail auth but should respond)
start_api=$(date +%s%3N)
api_response=$(curl -s --max-time 30 "$WORKER_URL/api/history?userId=test&exp=0&sig=test" 2>/dev/null)
end_api=$(date +%s%3N)
api_latency=$((end_api - start_api))
api_has_response=$(echo "$api_response" | grep -q "error\|messages" && echo "true" || echo "false")

# Determine health status
cold_start="false"
if [ $http_latency -gt 5000 ] || [ $ws_latency -gt 5000 ]; then
  cold_start="true"
fi

healthy="true"
error_msg=""
# 401 = auth required (worker is alive), 200 = ok, 101 = ws upgrade, 426 = upgrade required
# Only fail on 5xx errors, timeouts, or no response
if [ "$http_status" = "000" ] || [ "${http_status:0:1}" = "5" ]; then
  healthy="false"
  error_msg="HTTP error: $http_status"
fi
if [ "$api_has_response" != "true" ]; then
  healthy="false"
  error_msg="${error_msg} API not responding"
fi

# Output JSON
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat << EOF
{
  "timestamp": "$timestamp",
  "healthy": $healthy,
  "cold_start": $cold_start,
  "http_status": "$http_status",
  "http_latency_ms": $http_latency,
  "ws_upgrade_status": "$ws_check",
  "ws_latency_ms": $ws_latency,
  "api_latency_ms": $api_latency,
  "api_responding": $api_has_response,
  "error": "$error_msg"
}
EOF

# Append to metrics file
cat << EOF >> "$METRICS_FILE"
{"timestamp":"$timestamp","healthy":$healthy,"cold_start":$cold_start,"http_latency_ms":$http_latency,"ws_latency_ms":$ws_latency,"api_latency_ms":$api_latency,"error":"$error_msg"}
EOF
