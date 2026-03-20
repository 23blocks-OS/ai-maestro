# AI Maestro Dev Container
# Build: podman build -t ai-maestro-dev -f Containerfile .
# Test:  podman run --rm ai-maestro-dev yarn test

FROM docker.io/library/node:20.19.2-bookworm-slim

# Install system deps for native modules (node-pty, cozo-node)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json yarn.lock ./

# Install dependencies as root (native modules need build tools)
RUN yarn install --frozen-lockfile && yarn cache clean

# Copy full source
COPY . .

# Ensure non-root user owns the workspace
RUN chown -R node:node /app

USER node

# Ensure enough heap for Next.js builds
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Default command: run tests
CMD ["yarn", "test"]
