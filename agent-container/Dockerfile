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
    wget \
    git \
    tmux \
    zsh \
    vim \
    nano \
    procps \
    ca-certificates \
    build-essential \
    python3 \
    python3-venv \
    jq \
    openssl \
    locales \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Generate the en_US.UTF-8 locale. Without this, the LANG/LC_ALL envs set
# below are advisory only — the locale data isn't installed, so every shell
# start emits `bash: warning: setlocale: LC_ALL: cannot change locale`.
RUN sed -i 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen \
    && locale-gen

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Yarn globally
RUN npm install -g yarn

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

# Install uv (Astral's Python tooling) as root so the binary lands at
# /usr/local/bin/uv. The naive path /home/claude/.local/bin/uv is overlaid
# at runtime by the AMP CLI bind-mount that buildAmpCommonMounts injects
# into every cloud-agent container (host's ~/.local/bin → /home/claude/
# .local/bin RO), which COMPLETELY shadows binaries placed there. Discovered
# post-PR #91 deploy by CelestIA on bananajr Hardin recreate; cross-host
# repro on Holmes Mason. /usr/local/bin is not a bind-mount target and
# survives the overlay.
RUN XDG_BIN_HOME=/usr/local/bin sh -c "$(curl -LsSf https://astral.sh/uv/install.sh)"

# Install GitHub CLI (gh) from the upstream apt repo. Debian's stock `gh`
# package is unreliably available across mirrors; the canonical install
# (https://github.com/cli/cli/blob/trunk/docs/install_linux.md) is keyring
# + dedicated apt source + apt install. Lands at /usr/bin/gh, system PATH,
# not bind-mount-shadowed (per the same /usr/local/bin reasoning above —
# only /home/claude/.local/bin gets overlaid). gh auth state lives in
# /home/claude/.config/gh and is bind-mounted per-agent at runtime so
# `gh auth login` survives /recreate.
RUN mkdir -p -m 755 /etc/apt/keyrings \
    && wget -nv -O /etc/apt/keyrings/githubcli-archive-keyring.gpg https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Install Oh My Zsh + uv-managed cpython 3.12 as the claude user. uv binary
# now lives at /usr/local/bin/uv (system PATH); cpython 3.12 lands under
# /home/claude/.local/share/uv/python/ via uv's default install-dir logic
# (path is NOT shadowed — only ~/.local/bin is bind-mounted, not the deeper
# share/ tree). Invoked via `uv run --python 3.12` or a uv-managed venv.
# uv was chosen over pyenv per KAI: no compile-from-source, no -dev header
# explosion in apt, single static binary covering pip/venv/poetry
# equivalents, prebuilt python-build-standalone tarballs.
USER claude
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended && \
    uv python install 3.12
USER root

# Create app directory for server code
WORKDIR /app

# Copy package.json and install Node.js dependencies
COPY package.json package-lock.json* ./
RUN npm install && npm cache clean --force

# Install agent runtime CLIs globally. The image is multi-runtime so the
# same `ai-maestro-agent:latest` can host Claude, Gemini, or Codex agents
# — which one launches at first start is determined by AI_TOOL (built from
# body.program in createDockerAgent). Without all three baked in, agents
# whose profile.runtime is anything other than `claude` silently fall back
# to a bare shell because tmux send-keys "${AI_TOOL}" hits command-not-found.
RUN npm install -g \
    @anthropic-ai/claude-code \
    @google/gemini-cli \
    @openai/codex

# Copy agent server code
COPY agent-server.js ./
RUN chmod +x agent-server.js

# Create workspace directory
RUN mkdir -p /workspace && \
    chown -R claude:claude /workspace

# Pre-create the dirs that bind mounts will land in, owned by claude. Without
# these, Docker auto-creates each parent of a per-UUID bind mount as root, and
# the claude user inside the container (uid 1000) hits EPERM trying to write
# siblings (e.g. ~/.aimaestro/chat-state for hook debug logs, ~/.claude for
# claude-code's first-run state). Same trap documented in PR #86.
#
# ~/.config/gh and ~/.local/share/aimaestro/shell-helpers are bind-mount
# targets added in the cloud-agent state-persistence pass: gh auth state
# (per-agent, RW) and the host's shell-helpers dir (shared, RO) respectively.
# Pre-creating them with claude ownership keeps Docker from racing in as root.
RUN mkdir -p /home/claude/.claude \
             /home/claude/.aimaestro/agents \
             /home/claude/.aimaestro/chat-state \
             /home/claude/.agent-messaging/agents \
             /home/claude/.config/gh \
             /home/claude/.local/share/aimaestro/shell-helpers \
             /home/claude/.gemini \
             /home/claude/.codex && \
    chown -R claude:claude /home/claude/.claude \
                           /home/claude/.aimaestro \
                           /home/claude/.agent-messaging \
                           /home/claude/.config \
                           /home/claude/.local \
                           /home/claude/.gemini \
                           /home/claude/.codex

# Switch to non-root user
USER claude

# Set environment variables (can be overridden at runtime)
ENV AGENT_ID=agent-local
ENV TMUX_SESSION_NAME=agent-session
ENV WORKSPACE=/workspace
ENV AGENT_PORT=23000

# Locale — paired with the locale-gen step above. Setting these without
# generating the locale data is what produced the setlocale warnings on
# every Mason/Optic shell start before this bake.
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV LANGUAGE=en_US:en

# Terminal — 256-color + 24-bit color baseline so CLIs (Claude Code, less,
# vim, tmux, fzf) render rich output without runtime overrides.
ENV TERM=xterm-256color
ENV COLORTERM=truecolor

# Login shell — matches the user's shell set on creation (-s /bin/zsh
# above). Tools that spawn subshells via $SHELL (git, tmux default-shell,
# less, $EDITOR openers) now stay consistent with what an interactive
# login gets.
ENV SHELL=/bin/zsh

# PATH — prepend the AMP CLI mount point so `which amp-send` resolves
# inside the container without the runtime -e PATH= override that
# createDockerAgent injects (v0.30.19). The runtime override still wins
# for operator-customized PATHs; this is the long-term default.
ENV PATH=/home/claude/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# CI=true — preempts the watch-mode trap class. Cloud-agent containers run
# automated agent code (vitest, nodemon, webpack-dev-server, vite preview,
# Playwright, etc.) where bare `vitest <file>` defaults to watch mode,
# never returns, and traps Gemini-class agents in a false-completion loop
# (Han stuck 16min before manual intervention 2026-04-29). vitest and most
# other watch-mode-defaulting tools auto-disable watch when CI is set;
# closes the entire trap class at the platform layer regardless of how
# the agent invokes the tool. Filed by Luke (dev-allianceos-luke), Iron
# Syndicate kanban 376265b9.
ENV CI=true

# Git configuration (will use token at runtime)
# Note: GITHUB_TOKEN should be passed as environment variable at runtime, not baked into image
ENV GIT_USER_NAME="AI Maestro Agent"
ENV GIT_USER_EMAIL="agent@23blocks.com"

# Expose WebSocket port
EXPOSE 23000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:23000/health || exit 1

# Start agent server
CMD ["node", "/app/agent-server.js"]
