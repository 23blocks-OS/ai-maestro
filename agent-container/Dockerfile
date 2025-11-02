# AI Maestro Agent Container
#
# This container runs a single agent with:
# - tmux session
# - Claude Code CLI
# - WebSocket server for browser connections
#
# Can run locally or on AWS/cloud with same image

FROM debian:bookworm-slim

# Install base dependencies and build tools for node-pty
RUN apt-get update && apt-get install -y \
    curl \
    git \
    tmux \
    zsh \
    vim \
    nano \
    procps \
    ca-certificates \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
ARG USER_ID=1000
ARG GROUP_ID=1000
RUN groupadd -g ${GROUP_ID} claude && \
    useradd -m -u ${USER_ID} -g claude -s /bin/zsh claude && \
    echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Configure tmux for better UX
RUN mkdir -p /home/claude && \
    echo "set -g mouse on" >> /home/claude/.tmux.conf && \
    echo "set -g history-limit 50000" >> /home/claude/.tmux.conf && \
    echo "set -g status-bg colour235" >> /home/claude/.tmux.conf && \
    echo "set -g status-fg colour136" >> /home/claude/.tmux.conf && \
    chown -R claude:claude /home/claude

# Install Oh My Zsh for better shell experience
USER claude
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
USER root

# Create app directory for server code
WORKDIR /app

# Copy package.json and install Node.js dependencies
COPY package.json package-lock.json* ./
RUN npm install && npm cache clean --force

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Copy agent server code
COPY agent-server.js ./
RUN chmod +x agent-server.js

# Create workspace directory
RUN mkdir -p /workspace && \
    chown -R claude:claude /workspace

# Switch to non-root user
USER claude

# Set environment variables (can be overridden at runtime)
ENV AGENT_ID=agent-local
ENV TMUX_SESSION_NAME=agent-session
ENV WORKSPACE=/workspace
ENV AGENT_PORT=23000

# Expose WebSocket port
EXPOSE 23000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:23000/health || exit 1

# Start agent server
CMD ["node", "/app/agent-server.js"]
