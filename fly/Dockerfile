# Automna Gateway - Fly.io
# Runs OpenClaw with persistent storage

FROM node:22-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    rsync \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm and openclaw (pinned to stable version)
RUN npm install -g pnpm openclaw@2026.1.30

# Create directories
RUN mkdir -p /root/.openclaw \
    && mkdir -p /root/clawd \
    && mkdir -p /data

# Copy startup script and config
COPY start.sh /usr/local/bin/start.sh
COPY openclaw.json.template /root/.openclaw/openclaw.json.template

RUN chmod +x /usr/local/bin/start.sh

WORKDIR /root/clawd

EXPOSE 18789

CMD ["/usr/local/bin/start.sh"]
