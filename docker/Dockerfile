# Automna OpenClaw Image
# Extends the community phioranex image with session key fix
#
# The phioranex image runs as 'node' user with config at /home/node/.openclaw
# We add an entrypoint script that fixes the OpenClaw session key bug
# where sessions are stored as "main" but looked up as "agent:main:main"

FROM ghcr.io/phioranex/openclaw-docker:latest

# Switch to root to install our entrypoint
USER root

# Create the entrypoint script
COPY entrypoint.sh /usr/local/bin/automna-entrypoint.sh
RUN chmod +x /usr/local/bin/automna-entrypoint.sh

# Switch back to node user
USER node

# Use our entrypoint which fixes session keys then starts gateway
ENTRYPOINT ["/usr/local/bin/automna-entrypoint.sh"]
