#!/bin/bash
# Automna Provisioning Path Canary
#
# Tests each stage of the user provisioning path to verify endpoints are
# responding correctly. Does NOT create real users, subscriptions, or machines.
#
# Checks:
# 1. Landing page loads (automna.ai)
# 2. Sign-up page loads (Clerk)
# 3. Pricing page loads
# 4. Checkout API responds (rejects unauthenticated - expected)
# 5. BYOK API responds (rejects unauthenticated - expected)
# 6. Provision API responds (rejects unauthenticated - expected)
# 7. Provision status API responds (rejects unauthenticated - expected)
# 8. Setup/connect page loads
# 9. Stripe webhook endpoint exists (rejects unsigned - expected)
# 10. Clerk webhook endpoint exists (rejects unsigned - expected)
# 11. All existing user gateways respond
#
# Exit codes:
#   0 = all healthy
#   1 = issues found
#
# Output format: structured for cron job parsing

set -eo pipefail

BASE_URL="${AUTOMNA_BASE_URL:-https://automna.ai}"
ISSUES=""
WARNINGS=""
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNED=0

check() {
    local name="$1"
    local url="$2"
    local expected_status="$3"  # comma-separated acceptable statuses
    local timeout="${4:-10}"

    local actual_status
    local latency_ms
    local start_ns=$(date +%s%N)

    actual_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null || echo "000")

    local end_ns=$(date +%s%N)
    latency_ms=$(( (end_ns - start_ns) / 1000000 ))

    # Check if actual_status is in expected list
    local found=false
    IFS=',' read -ra EXPECTED <<< "$expected_status"
    for exp in "${EXPECTED[@]}"; do
        if [ "$actual_status" = "$exp" ]; then
            found=true
            break
        fi
    done

    if $found; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        echo "✅ $name (HTTP $actual_status, ${latency_ms}ms)"
    else
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
        ISSUES="$ISSUES\n❌ **$name**: expected HTTP $expected_status, got $actual_status (${latency_ms}ms)"
        echo "❌ $name (HTTP $actual_status, expected $expected_status, ${latency_ms}ms)"
    fi

    # Warn on slow responses (>5s)
    if [ "$latency_ms" -gt 5000 ] && $found; then
        CHECKS_WARNED=$((CHECKS_WARNED + 1))
        WARNINGS="$WARNINGS\n⚠️ **$name**: slow response (${latency_ms}ms)"
    fi
}

check_post() {
    local name="$1"
    local url="$2"
    local expected_status="$3"
    local timeout="${4:-10}"

    local actual_status
    local start_ns=$(date +%s%N)

    actual_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST --max-time "$timeout" \
        -H "Content-Type: application/json" -d '{}' "$url" 2>/dev/null || echo "000")

    local end_ns=$(date +%s%N)
    local latency_ms=$(( (end_ns - start_ns) / 1000000 ))

    local found=false
    IFS=',' read -ra EXPECTED <<< "$expected_status"
    for exp in "${EXPECTED[@]}"; do
        if [ "$actual_status" = "$exp" ]; then
            found=true
            break
        fi
    done

    if $found; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        echo "✅ $name (HTTP $actual_status, ${latency_ms}ms)"
    else
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
        ISSUES="$ISSUES\n❌ **$name**: expected HTTP $expected_status, got $actual_status (${latency_ms}ms)"
        echo "❌ $name (HTTP $actual_status, expected $expected_status, ${latency_ms}ms)"
    fi
}

echo "=== Automna Provisioning Canary ==="
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# --- Stage 1: Public pages ---
echo "--- Public Pages ---"
check "Landing page" "$BASE_URL" "200"
check "Sign-up page" "$BASE_URL/sign-up" "200"
check "Pricing page" "$BASE_URL/pricing" "200,307"
check "Setup/connect page" "$BASE_URL/setup/connect" "200,307"

# --- Stage 2: Auth-protected APIs (should reject unauthenticated) ---
echo ""
echo "--- Auth-Protected APIs ---"
# These should return 401 or 307 (redirect to sign-in) when unauthenticated
check_post "Checkout API" "$BASE_URL/api/checkout" "401,403,307"
check_post "Provision API" "$BASE_URL/api/user/provision" "401,403,307"
check "Provision Status API" "$BASE_URL/api/user/provision/status" "401,403,307"
check "BYOK Status API" "$BASE_URL/api/user/byok" "401,403,307"
check "User Health API" "$BASE_URL/api/user/health" "401,403,307"

# --- Stage 3: Webhook endpoints (should reject unsigned requests) ---
echo ""
echo "--- Webhook Endpoints ---"
check_post "Stripe webhook" "$BASE_URL/api/webhooks/stripe" "400"
check_post "Clerk webhook" "$BASE_URL/api/webhooks/clerk" "400"

# --- Stage 4: Proxy health ---
echo ""
echo "--- API Proxy ---"
check "Proxy health" "https://automna-proxy.fly.dev" "200,404"

# --- Stage 5: User gateway health (all active machines) ---
echo ""
echo "--- User Gateways ---"

TURSO_TOKEN=$(python3 -c "import json; print(json.load(open('/root/clawd/projects/automna/config/turso.json'))['token'])" 2>/dev/null || echo "")
TURSO_URL="https://automna-alexbbio.aws-us-west-2.turso.io"

if [ -n "$TURSO_TOKEN" ]; then
    GATEWAY_DATA=$(curl -s "$TURSO_URL/v2/pipeline" \
        -H "Authorization: Bearer $TURSO_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"requests":[{"type":"execute","stmt":{"sql":"SELECT app_name, gateway_token, status FROM machines WHERE app_name IS NOT NULL"}}]}' 2>/dev/null)

    echo "$GATEWAY_DATA" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    rows = d['results'][0]['response']['result']['rows']
    for row in rows:
        app = row[0].get('value','') if row[0]['type'] != 'null' else ''
        token = row[1].get('value','') if row[1]['type'] != 'null' else ''
        status = row[2].get('value','') if row[2]['type'] != 'null' else ''
        if app:
            print(f'{app}|{token}|{status}')
except Exception as e:
    print(f'ERROR|{e}|', file=sys.stderr)
" 2>/dev/null | while IFS='|' read -r app token db_status; do
        if [ -z "$app" ]; then continue; fi

        # Only check gateways for machines that should be running
        if [ "$db_status" = "stopped" ]; then
            echo "⏸️  $app (stopped - skipping)"
            continue
        fi

        gw_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
            -H "Authorization: Bearer $token" \
            "https://$app.fly.dev/api/v1/sessions" 2>/dev/null || echo "000")

        if [ "$gw_status" = "200" ]; then
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
            echo "✅ $app gateway (HTTP $gw_status)"
        else
            CHECKS_FAILED=$((CHECKS_FAILED + 1))
            ISSUES="$ISSUES\n❌ **$app gateway**: HTTP $gw_status"
            echo "❌ $app gateway (HTTP $gw_status)"
        fi
    done
else
    echo "⚠️  Turso token not available, skipping gateway checks"
    CHECKS_WARNED=$((CHECKS_WARNED + 1))
fi

# --- Summary ---
echo ""
echo "=== Summary ==="
echo "Passed: $CHECKS_PASSED | Failed: $CHECKS_FAILED | Warnings: $CHECKS_WARNED"

if [ $CHECKS_FAILED -gt 0 ]; then
    echo ""
    echo "ISSUES_FOUND"
    echo -e "$ISSUES"
    if [ -n "$WARNINGS" ]; then
        echo -e "$WARNINGS"
    fi
    exit 1
else
    if [ -n "$WARNINGS" ]; then
        echo ""
        echo "WARNINGS_ONLY"
        echo -e "$WARNINGS"
    else
        echo "ALL_HEALTHY"
    fi
    exit 0
fi
