#!/bin/bash
# Monitor all Automna user machines for LLM proxy errors
# Checks fly logs for 504 errors and other LLM issues

export FLY_API_TOKEN=$(jq -r .token /root/clawd/projects/automna/config/fly.json)
export PATH="$PATH:/root/.fly/bin:/root/.turso"
export TURSO_API_TOKEN=$(jq -r .token /root/clawd/projects/automna/config/turso-api.json)

SINCE=$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-10M +%Y-%m-%dT%H:%M:%SZ)
ISSUES=""

# Get all active user apps
APPS=$(turso db shell automna "SELECT app_name FROM machines WHERE status='started' AND app_name IS NOT NULL;" 2>/dev/null | tail -n +2)

for APP in $APPS; do
  APP=$(echo "$APP" | tr -d '[:space:]')
  [ -z "$APP" ] && continue
  
  # Check for 504 errors in recent logs
  ERRORS=$(/root/.fly/bin/fly logs -a "$APP" --no-tail 2>/dev/null | grep -c "504\|formatAssistantErrorText\|Long error truncated" 2>/dev/null)
  
  if [ "$ERRORS" -gt 0 ] 2>/dev/null; then
    # Get last error detail
    LAST_ERROR=$(/root/.fly/bin/fly logs -a "$APP" --no-tail 2>/dev/null | grep -E "504|formatAssistantErrorText|Long error truncated" | tail -1 | sed 's/\x1b\[[0-9;]*m//g' | cut -c1-200)
    ISSUES="${ISSUES}\n**${APP}**: ${ERRORS} error(s) - ${LAST_ERROR}"
  fi
done

# Also check Vercel runtime logs via API
VERCEL_TOKEN=$(jq -r .token /root/clawd/projects/automna/config/vercel.json)
VERCEL_ERRORS=$(curl -s "https://api.vercel.com/v2/projects/prj_PlRX8SAhQT1oYTkH4XJAg7GAPb58/events?limit=100&direction=backward" \
  -H "Authorization: Bearer $VERCEL_TOKEN" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        errors = [e for e in data if 'LLM Proxy' in e.get('payload',{}).get('text','') and ('504' in e.get('payload',{}).get('text','') or 'ERROR' in e.get('payload',{}).get('text','') or 'HTML error' in e.get('payload',{}).get('text',''))]
        for e in errors[:5]:
            print(e.get('payload',{}).get('text','')[:200])
except:
    pass
" 2>/dev/null)

if [ -n "$VERCEL_ERRORS" ]; then
  ISSUES="${ISSUES}\n**Vercel proxy logs**:\n${VERCEL_ERRORS}"
fi

# Output results
if [ -n "$ISSUES" ]; then
  echo -e "ISSUES_FOUND${ISSUES}"
else
  echo "ALL_CLEAR"
fi
