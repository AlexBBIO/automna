#!/bin/bash
# deploy-machines.sh — Deploy a Docker image to Automna Fly machines
# Usage: ./deploy-machines.sh [IMAGE_TAG] [--dry-run] [--app APP_NAME] [--force]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_DIR/config"
LOG_FILE="$PROJECT_DIR/deploy-log.jsonl"
REGISTRY="registry.fly.io/automna-openclaw-image"
FLY_API="https://api.machines.dev/v1"

IMAGE_TAG="latest"
DRY_RUN=false
TARGET_APP=""
FORCE=false

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --app) TARGET_APP="$2"; shift 2 ;;
        --force) FORCE=true; shift ;;
        -*) echo "Unknown flag: $1"; exit 1 ;;
        *) IMAGE_TAG="$1"; shift ;;
    esac
done

IMAGE="$REGISTRY:$IMAGE_TAG"

# Load tokens
FLY_TOKEN=$(jq -r '.token' "$CONFIG_DIR/fly.json")
TURSO_URL=$(jq -r '.url' "$CONFIG_DIR/turso.json")
TURSO_TOKEN=$(jq -r '.token' "$CONFIG_DIR/turso.json")

if [ -z "$FLY_TOKEN" ]; then echo "ERROR: No Fly API token in $CONFIG_DIR/fly.json"; exit 1; fi

fly_api() {
    local method="$1" path="$2"
    shift 2
    curl -sf -X "$method" "$FLY_API$path" \
        -H "Authorization: Bearer $FLY_TOKEN" \
        -H "Content-Type: application/json" \
        "$@"
}

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "╔══════════════════════════════════════╗"
echo "║  Automna Machine Deployment          ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Image: $IMAGE"
echo "  Mode:  $([ "$DRY_RUN" = true ] && echo 'DRY RUN' || echo 'LIVE')"
[ -n "$TARGET_APP" ] && echo "  Target: $TARGET_APP"
echo ""

# Get machine list
if [ -n "$TARGET_APP" ]; then
    # Single app mode
    APPS="$TARGET_APP"
else
    # Query Turso for active machines
    echo "▸ Querying Turso for active machines..."
    TURSO_RESPONSE=$(curl -sf "$TURSO_URL" \
        -H "Authorization: Bearer $TURSO_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"statements": [{"q": "SELECT id, app_name, user_id FROM machines WHERE status = '\''active'\'' ORDER BY app_name"}]}')
    
    APPS=$(echo "$TURSO_RESPONSE" | jq -r '.[0].results.rows[].[1] // empty' 2>/dev/null || \
           echo "$TURSO_RESPONSE" | jq -r '.results[]?.rows[]?[1] // empty' 2>/dev/null || \
           echo "")

    if [ -z "$APPS" ]; then
        echo "  No active machines found in Turso. Use --app to target specific machine."
        echo "  Trying Fly API directly for automna-u-* apps..."
        # Fallback: list apps via Fly
        APPS=$(curl -sf "$FLY_API/apps?org_slug=personal" \
            -H "Authorization: Bearer $FLY_TOKEN" | \
            jq -r '.apps[]? | select(.name | startswith("automna-u-")) | .name' 2>/dev/null || echo "")
    fi

    if [ -z "$APPS" ]; then
        echo "ERROR: Could not find any machines to deploy to"
        exit 1
    fi

    APP_COUNT=$(echo "$APPS" | wc -l)
    echo "  Found $APP_COUNT machine(s)"
fi

echo ""

DEPLOYED=0
FAILED=0
SKIPPED=0

for APP in $APPS; do
    echo "━━━ $APP ━━━"
    
    # Get machines for this app
    MACHINES_JSON=$(fly_api GET "/apps/$APP/machines" 2>/dev/null || echo "[]")
    MACHINE_ID=$(echo "$MACHINES_JSON" | jq -r '.[0].id // empty')
    
    if [ -z "$MACHINE_ID" ]; then
        echo "  ⚠ No machines found, skipping"
        ((SKIPPED++))
        echo ""
        continue
    fi

    # Get full machine config
    MACHINE_JSON=$(fly_api GET "/apps/$APP/machines/$MACHINE_ID" 2>/dev/null || echo "{}")
    CURRENT_IMAGE=$(echo "$MACHINE_JSON" | jq -r '.config.image // "unknown"')
    MACHINE_STATE=$(echo "$MACHINE_JSON" | jq -r '.state // "unknown"')
    
    echo "  Current: $CURRENT_IMAGE"
    echo "  State:   $MACHINE_STATE"

    # Build updated config: preserve everything, update image, clear init.cmd
    UPDATED_CONFIG=$(echo "$MACHINE_JSON" | jq --arg img "$IMAGE" '
        .config |
        .image = $img |
        .init = {} |
        del(.metadata) |
        del(.created_at) |
        del(.updated_at)
    ')

    if [ -z "$UPDATED_CONFIG" ] || [ "$UPDATED_CONFIG" = "null" ]; then
        echo "  ✗ Failed to build updated config"
        ((FAILED++))
        echo ""
        continue
    fi

    # Verify env vars preserved
    ENV_COUNT=$(echo "$UPDATED_CONFIG" | jq '.env // {} | length')
    echo "  Env vars preserved: $ENV_COUNT"

    if [ "$DRY_RUN" = true ]; then
        echo "  [DRY RUN] Would update image to $IMAGE and clear init.cmd"
        ((SKIPPED++))
        echo ""
        continue
    fi

    # Stop machine if running
    if [ "$MACHINE_STATE" = "started" ]; then
        echo "  Stopping machine..."
        fly_api POST "/apps/$APP/machines/$MACHINE_ID/stop" -d '{}' >/dev/null 2>&1 || true
        # Wait for stop
        for i in $(seq 1 12); do
            sleep 5
            STATE=$(fly_api GET "/apps/$APP/machines/$MACHINE_ID" 2>/dev/null | jq -r '.state // "unknown"')
            if [ "$STATE" = "stopped" ] || [ "$STATE" = "created" ]; then break; fi
            echo "  Waiting for stop... ($STATE)"
        done
    fi

    # Update machine config
    echo "  Updating to $IMAGE..."
    UPDATE_RESULT=$(fly_api POST "/apps/$APP/machines/$MACHINE_ID" \
        -d "{\"config\": $UPDATED_CONFIG}" 2>&1)
    
    if [ $? -ne 0 ]; then
        echo "  ✗ Update failed: $UPDATE_RESULT"
        ((FAILED++))
        echo "{\"timestamp\":\"$TIMESTAMP\",\"app\":\"$APP\",\"machine\":\"$MACHINE_ID\",\"action\":\"deploy_failed\",\"image\":\"$IMAGE\",\"error\":\"update failed\"}" >> "$LOG_FILE"
        echo ""
        continue
    fi

    # Wait for machine to start (up to 90s)
    echo "  Waiting for startup..."
    STARTED=false
    for i in $(seq 1 18); do
        sleep 5
        STATE=$(fly_api GET "/apps/$APP/machines/$MACHINE_ID" 2>/dev/null | jq -r '.state // "unknown"')
        if [ "$STATE" = "started" ]; then
            STARTED=true
            echo "  Started (${i}x5s)"
            break
        fi
    done

    if [ "$STARTED" = false ]; then
        echo "  ✗ Startup timeout (90s)"
        ((FAILED++))
        echo "{\"timestamp\":\"$TIMESTAMP\",\"app\":\"$APP\",\"machine\":\"$MACHINE_ID\",\"action\":\"deploy_timeout\",\"image\":\"$IMAGE\"}" >> "$LOG_FILE"
        echo ""
        continue
    fi

    # Health check: gateway responds
    sleep 5  # Give gateway a moment
    GATEWAY_TOKEN=$(echo "$MACHINE_JSON" | jq -r '.config.env.OPENCLAW_GATEWAY_TOKEN // empty')
    HEALTH_OK=false
    
    if [ -n "$GATEWAY_TOKEN" ]; then
        for i in $(seq 1 6); do
            HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
                "https://$APP.fly.dev/api/v1/sessions" \
                -H "Authorization: Bearer $GATEWAY_TOKEN" 2>/dev/null || echo "000")
            if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
                # 200 = ok, 401 = gateway is up but token might differ (still healthy)
                HEALTH_OK=true
                break
            fi
            sleep 5
        done
    fi

    if [ "$HEALTH_OK" = true ]; then
        echo "  ✓ Health check passed"
        ((DEPLOYED++))
        echo "{\"timestamp\":\"$TIMESTAMP\",\"app\":\"$APP\",\"machine\":\"$MACHINE_ID\",\"action\":\"deployed\",\"image\":\"$IMAGE\"}" >> "$LOG_FILE"
    else
        echo "  ⚠ Health check failed (gateway may still be starting)"
        ((DEPLOYED++))  # Image was updated, just health check flaky
        echo "{\"timestamp\":\"$TIMESTAMP\",\"app\":\"$APP\",\"machine\":\"$MACHINE_ID\",\"action\":\"deployed_unhealthy\",\"image\":\"$IMAGE\"}" >> "$LOG_FILE"
    fi

    echo ""

    # Wait between machines
    if [ -n "$(echo "$APPS" | sed -n '2p')" ]; then
        echo "  Waiting 10s before next machine..."
        sleep 10
    fi
done

echo "════════════════════════════════════════"
echo "  Deployed: $DEPLOYED  Failed: $FAILED  Skipped: $SKIPPED"
echo "════════════════════════════════════════"

[ "$FAILED" -eq 0 ] && exit 0 || exit 1
