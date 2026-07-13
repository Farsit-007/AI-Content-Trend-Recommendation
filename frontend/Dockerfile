# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim

RUN apt-get update -qq && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*

# Install deps into /deps — completely separate from /app.
# The bind mount (./frontend:/app) can never shadow or stale these.
WORKDIR /deps
COPY package*.json ./
RUN npm install --no-audit --no-fund

WORKDIR /app

# Tell Node and npm scripts to find modules in /deps
ENV NODE_PATH=/deps/node_modules
ENV PATH=/deps/node_modules/.bin:$PATH

EXPOSE 3000

CMD ["next", "dev"]
