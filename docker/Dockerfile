FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install Clawdbot
RUN npm install -g clawdbot

# Install Python packages for agent skills
RUN pip3 install --break-system-packages agentmail

WORKDIR /root/clawd
RUN mkdir -p /root/.clawdbot

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD curl -f http://localhost:3000/ || exit 1

# Run gateway in foreground, bind to all interfaces, allow start without full config
CMD ["clawdbot", "gateway", "run", "--bind", "lan", "--allow-unconfigured"]
