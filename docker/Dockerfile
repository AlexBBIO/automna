# Automna OpenClaw Image
# Extends the community phioranex image with:
# - Caddy reverse proxy (single entry point, internal routing)
# - Session key fixer (background process)
# - File server for uploads/downloads (internal only)
# - Default workspace files (AGENTS.md, HEARTBEAT.md, etc.)
#
# Architecture:
#   External :18789 → Caddy → /files/* → File server :8080
#                          → /*       → OpenClaw :18788
#
# The phioranex image runs as 'node' user with config at /home/node/.openclaw

FROM ghcr.io/phioranex/openclaw-docker:latest

# Switch to root to install components
USER root

# Install Caddy
RUN apt-get update && apt-get install -y --no-install-recommends \
    debian-keyring debian-archive-keyring apt-transport-https curl \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update \
    && apt-get install -y caddy \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy Caddy config
COPY Caddyfile /etc/caddy/Caddyfile

# Copy entrypoint script
COPY entrypoint.sh /usr/local/bin/automna-entrypoint.sh
RUN chmod +x /usr/local/bin/automna-entrypoint.sh

# Copy file server
COPY file-server.cjs /app/file-server.cjs

# Patch OpenClaw to support BRAVE_API_URL environment variable
# The original code hardcodes: const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
# We change it to: const BRAVE_SEARCH_ENDPOINT = process.env.BRAVE_API_URL ? `${process.env.BRAVE_API_URL}/res/v1/web/search` : "https://api.search.brave.com/res/v1/web/search";
RUN sed -i 's|const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";|const BRAVE_SEARCH_ENDPOINT = process.env.BRAVE_API_URL ? `${process.env.BRAVE_API_URL}/res/v1/web/search` : "https://api.search.brave.com/res/v1/web/search";|g' /app/dist/agents/tools/web-search.js

# Patch OpenClaw cron session to reuse existing sessionId (prevents transcript overwrite)
# Without this, every hooks/agent call creates a new transcript file and orphans the old one,
# making it look like chat history was "overwritten" when navigating back to the session.
RUN sed -i 's/const sessionId = crypto.randomUUID();/const sessionId = entry?.sessionId || crypto.randomUUID();/' /app/dist/cron/isolated-agent/session.js

# Copy default workspace files
COPY workspace/ /app/default-workspace/

# Install jq for JSON parsing in shell scripts (used by phone call polling)
RUN apt-get update && apt-get install -y --no-install-recommends jq \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install pip and Python packages for browser automation
# Playwright connects to Browserbase (remote Chrome), so we only need the library, not browsers
RUN apt-get update && apt-get install -y --no-install-recommends python3-pip \
    && pip3 install --no-cache-dir --break-system-packages playwright requests \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Only expose the proxy port (Caddy)
EXPOSE 18789

# Switch back to node user
USER node

# Use our entrypoint
ENTRYPOINT ["/usr/local/bin/automna-entrypoint.sh"]
