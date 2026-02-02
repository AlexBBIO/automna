# Automna OpenClaw Image
# Extends the community phioranex image with:
# - Session key fixer (background process)
# - File server for robust uploads/downloads (port 8080)
#
# The phioranex image runs as 'node' user with config at /home/node/.openclaw

FROM ghcr.io/phioranex/openclaw-docker:latest

# Switch to root to install our components
USER root

# Copy entrypoint script (starts fixer + file server + gateway)
COPY entrypoint.sh /usr/local/bin/automna-entrypoint.sh
RUN chmod +x /usr/local/bin/automna-entrypoint.sh

# Copy file server
COPY file-server.js /app/file-server.js

# Expose file server port (internal, not public)
EXPOSE 8080

# Switch back to node user
USER node

# Use our entrypoint
ENTRYPOINT ["/usr/local/bin/automna-entrypoint.sh"]
