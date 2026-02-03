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

# Copy default workspace files
COPY workspace/ /app/default-workspace/

# Only expose the proxy port (Caddy)
EXPOSE 18789

# Switch back to node user
USER node

# Use our entrypoint
ENTRYPOINT ["/usr/local/bin/automna-entrypoint.sh"]
