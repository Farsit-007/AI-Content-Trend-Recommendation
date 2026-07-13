# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim

WORKDIR /app

# Copy manifests first — this layer is cached unless package.json changes
COPY package*.json ./

# All deps needed (including devDependencies for ts-node-dev)
# BuildKit cache mount keeps npm cache between builds for faster rebuilds
RUN npm install --no-audit --no-fund

# Source is mounted via docker-compose volume — not copied here.
# ts-node-dev watches the mount and hot-reloads on every .ts save.

EXPOSE 5000

CMD ["npm", "run", "dev"]
