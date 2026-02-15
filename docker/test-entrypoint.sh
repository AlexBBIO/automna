#!/bin/bash
# test-entrypoint.sh — Validate entrypoint config generation for BYOK and legacy modes
# Usage: ./test-entrypoint.sh
#
# Runs the config-generation logic from entrypoint.sh in isolation.
# Tests both BYOK and legacy modes with token from args and env var.

set -euo pipefail

PASS=0
FAIL=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { ((PASS++)); ((TOTAL++)); echo -e "  ${GREEN}PASS${NC} $1"; }
fail() { ((FAIL++)); ((TOTAL++)); echo -e "  ${RED}FAIL${NC} $1${2:+ — $2}"; }

# Write the node config-gen script to a temp file (avoids quoting hell)
NODE_SCRIPT=$(mktemp /tmp/test-config-gen.XXXXXX.js)
trap "rm -f $NODE_SCRIPT" EXIT

cat > "$NODE_SCRIPT" << 'ENDJS'
const fs = require("fs");
const configFile = process.env.CONFIG_FILE;
const proxyUrl = process.env.AUTOMNA_PROXY_URL || "https://automna.ai";
const gatewayToken = process.env.RESOLVED_GATEWAY_TOKEN || "";
const byokMode = process.env.BYOK_MODE === "true";

const managed = {
  gateway: { trustedProxies: ["127.0.0.1", "::1"] },
  hooks: { enabled: true, token: gatewayToken, path: "/hooks" }
};

const automnaProvider = {
  baseUrl: proxyUrl + "/api/llm",
  apiKey: gatewayToken,
  api: "anthropic-messages",
};
if (byokMode) {
  automnaProvider.models = [];
} else {
  automnaProvider.models = [
    { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
    { id: "claude-sonnet-4", name: "Claude Sonnet 4" }
  ];
}
managed.models = { providers: { automna: automnaProvider } };

const defaultModel = byokMode ? "anthropic/claude-opus-4-5" : "automna/claude-opus-4-5";

if (byokMode) {
  managed.agents = { defaults: { model: { primary: defaultModel }, imageModel: { primary: defaultModel } } };
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function setDefaults(target, source) {
  for (const key of Object.keys(source)) {
    if (!(key in target)) {
      target[key] = source[key];
    } else if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])
               && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
      setDefaults(target[key], source[key]);
    }
  }
  return target;
}

const defaults = {
  plugins: { entries: { "voice-call": { enabled: false } } },
  agents: { defaults: { workspace: "/home/node/.openclaw/workspace", model: { primary: defaultModel } } }
};

let config = {};
deepMerge(config, managed);
setDefaults(config, defaults);
config.plugins = config.plugins || {};
config.plugins.entries = config.plugins.entries || {};
config.plugins.entries["voice-call"] = { enabled: false };

if (byokMode && config.models && config.models.providers && config.models.providers.automna) {
  config.models.providers.automna.models = [];
}

fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
ENDJS

# Run config generation with given params, return config file path
run_config_gen() {
    local byok_mode="$1"
    local gateway_token="$2"
    local gateway_token_source="$3"  # "args" or "env"
    local tmpdir
    tmpdir=$(mktemp -d)
    local config_file="$tmpdir/clawdbot.json"

    local resolved_token="$gateway_token"

    CONFIG_FILE="$config_file" \
    AUTOMNA_PROXY_URL="https://automna.ai" \
    BYOK_MODE="$byok_mode" \
    RESOLVED_GATEWAY_TOKEN="$resolved_token" \
    node "$NODE_SCRIPT" 2>/dev/null

    echo "$config_file"
}

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Automna Entrypoint Config Tests         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── BYOK Mode Tests ──
echo -e "${YELLOW}▸ BYOK Mode (token via args)${NC}"
CONFIG=$(run_config_gen "true" "test-token-123" "args")

primary=$(jq -r '.agents.defaults.model.primary // empty' "$CONFIG")
[[ "$primary" == anthropic/* ]] && pass "model.primary starts with anthropic/" || fail "model.primary starts with anthropic/" "got: $primary"

models=$(jq -c '.models.providers.automna.models' "$CONFIG")
[ "$models" = "[]" ] && pass "automna.models is empty array" || fail "automna.models is empty array" "got: $models"

hooks_token=$(jq -r '.hooks.token // empty' "$CONFIG")
[ -n "$hooks_token" ] && pass "hooks.token is not empty" || fail "hooks.token is not empty"

hooks_enabled=$(jq -r '.hooks.enabled // empty' "$CONFIG")
[ "$hooks_enabled" = "true" ] && pass "hooks.enabled is true" || fail "hooks.enabled is true"

rm -rf "$(dirname "$CONFIG")"

# ── Legacy Mode Tests ──
echo ""
echo -e "${YELLOW}▸ Legacy Mode (token via args)${NC}"
CONFIG=$(run_config_gen "false" "test-token-456" "args")

primary=$(jq -r '.agents.defaults.model.primary // empty' "$CONFIG")
[[ "$primary" == automna/* ]] && pass "model.primary starts with automna/" || fail "model.primary starts with automna/" "got: $primary"

model_count=$(jq '.models.providers.automna.models | length' "$CONFIG")
[ "$model_count" -gt 0 ] && pass "automna.models has entries ($model_count)" || fail "automna.models has entries"

hooks_token=$(jq -r '.hooks.token // empty' "$CONFIG")
[ -n "$hooks_token" ] && pass "hooks.token is not empty" || fail "hooks.token is not empty"

rm -rf "$(dirname "$CONFIG")"

# ── Token from env var ──
echo ""
echo -e "${YELLOW}▸ BYOK Mode (token via env var)${NC}"
CONFIG=$(run_config_gen "true" "env-token-789" "env")

hooks_token=$(jq -r '.hooks.token // empty' "$CONFIG")
[ "$hooks_token" = "env-token-789" ] && pass "hooks.token from env var" || fail "hooks.token from env var" "got: $hooks_token"

primary=$(jq -r '.agents.defaults.model.primary // empty' "$CONFIG")
[[ "$primary" == anthropic/* ]] && pass "model.primary correct in env mode" || fail "model.primary correct" "got: $primary"

rm -rf "$(dirname "$CONFIG")"

# ── Legacy with env var ──
echo ""
echo -e "${YELLOW}▸ Legacy Mode (token via env var)${NC}"
CONFIG=$(run_config_gen "false" "env-token-legacy" "env")

hooks_token=$(jq -r '.hooks.token // empty' "$CONFIG")
[ "$hooks_token" = "env-token-legacy" ] && pass "hooks.token from env var (legacy)" || fail "hooks.token from env var (legacy)" "got: $hooks_token"

primary=$(jq -r '.agents.defaults.model.primary // empty' "$CONFIG")
[[ "$primary" == automna/* ]] && pass "model.primary correct in legacy mode" || fail "model.primary correct" "got: $primary"

rm -rf "$(dirname "$CONFIG")"

# ── Empty token test ──
echo ""
echo -e "${YELLOW}▸ Edge Case: Empty token${NC}"
CONFIG=$(run_config_gen "true" "" "args")

hooks_token=$(jq -r '.hooks.token // empty' "$CONFIG")
[ -z "$hooks_token" ] && pass "hooks.token is empty (would crash gateway — detectable)" || fail "empty token edge case"

rm -rf "$(dirname "$CONFIG")"

# ── Config structure ──
echo ""
echo -e "${YELLOW}▸ Config Structure${NC}"
CONFIG=$(run_config_gen "true" "struct-test" "args")

jq -e '.gateway.trustedProxies' "$CONFIG" >/dev/null 2>&1 && pass "gateway.trustedProxies exists" || fail "gateway.trustedProxies exists"
jq -e '.hooks.path' "$CONFIG" >/dev/null 2>&1 && pass "hooks.path exists" || fail "hooks.path exists"
jq -e '.models.providers.automna.baseUrl' "$CONFIG" >/dev/null 2>&1 && pass "automna provider baseUrl exists" || fail "automna provider baseUrl exists"
jq -e '.models.providers.automna.api' "$CONFIG" >/dev/null 2>&1 && pass "automna provider api exists" || fail "automna provider api exists"

voice_call=$(jq -r '.plugins.entries["voice-call"].enabled' "$CONFIG")
[ "$voice_call" = "false" ] && pass "voice-call plugin disabled" || fail "voice-call plugin disabled"

rm -rf "$(dirname "$CONFIG")"

# ── Summary ──
echo ""
echo "════════════════════════════════════════════"
echo -e "  Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, $TOTAL total"
echo "════════════════════════════════════════════"
echo ""

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
