FROM node:22-slim

RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*
RUN npm install -g clawdbot

WORKDIR /root/clawd
RUN mkdir -p /root/.clawdbot

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD curl -f http://localhost:3000/ || exit 1

# Run gateway in foreground, bind to all interfaces, allow start without full config
CMD ["clawdbot", "gateway", "run", "--bind", "lan", "--allow-unconfigured"]
