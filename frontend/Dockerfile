# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim

WORKDIR /app

# Copy manifests first — this layer is cached unless package.json changes
COPY package*.json ./

# BuildKit cache mount keeps npm cache between builds for faster rebuilds
RUN npm install --no-audit --no-fund

# Source is mounted via docker-compose volume — not copied here.
# WATCHPACK_POLLING=true (set in docker-compose) keeps hot reload working
# across Docker volume mounts on all platforms.

EXPOSE 3000

CMD ["npm", "run", "dev"]
