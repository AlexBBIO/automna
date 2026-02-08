FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

# Remove dev dependencies
RUN npm prune --production

EXPOSE 8080
CMD ["node", "dist/index.js"]
