#!/bin/bash
# build-and-push.sh — Build, tag, and push the Automna Docker image
# Usage: ./build-and-push.sh [--no-push] [--no-test]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_DIR/docker"
REGISTRY="registry.fly.io/automna-openclaw-image"
LOG_FILE="$PROJECT_DIR/deploy-log.jsonl"

NO_PUSH=false
NO_TEST=false
for arg in "$@"; do
    case "$arg" in
        --no-push) NO_PUSH=true ;;
        --no-test) NO_TEST=true ;;
    esac
done

# Get git SHA from the automna project dir
GIT_SHA=$(cd "$PROJECT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "╔══════════════════════════════════════╗"
echo "║  Automna Docker Build & Push         ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Registry: $REGISTRY"
echo "  SHA:      $GIT_SHA"
echo "  Time:     $TIMESTAMP"
echo ""

# Run entrypoint tests first
if [ "$NO_TEST" = false ] && [ -f "$DOCKER_DIR/test-entrypoint.sh" ]; then
    echo "▸ Running entrypoint tests..."
    bash "$DOCKER_DIR/test-entrypoint.sh"
    echo ""
fi

# Build
echo "▸ Building Docker image..."
docker build -t "$REGISTRY:latest" -t "$REGISTRY:$GIT_SHA" "$DOCKER_DIR"
echo "  Tagged: :latest and :$GIT_SHA"

# Push
if [ "$NO_PUSH" = false ]; then
    echo ""
    echo "▸ Pushing to registry..."
    docker push "$REGISTRY:latest"
    docker push "$REGISTRY:$GIT_SHA"
    echo "  Pushed both tags"
else
    echo ""
    echo "  (--no-push: skipping push)"
fi

# Log
echo "{\"timestamp\":\"$TIMESTAMP\",\"sha\":\"$GIT_SHA\",\"image\":\"$REGISTRY:$GIT_SHA\",\"action\":\"build\"}" >> "$LOG_FILE"

echo ""
echo "✅ Build complete: $REGISTRY:$GIT_SHA"
echo "   Deploy with: ./scripts/deploy-machines.sh $GIT_SHA"
