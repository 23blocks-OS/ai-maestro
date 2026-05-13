#!/bin/bash
set -e

# Log everything
exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "==================================="
echo "AI Maestro Agent Bootstrap (Native)"
echo "Agent: ${agent_name}"
echo "Domain: ${domain_name}"
echo "AI Tool: ${ai_tool}"
echo "Time: $(date)"
echo "==================================="

# ── 1. Update system ──────────────────────────────────────────────────────────
echo "[1/10] Updating system packages..."
dnf update -y

# ── 2. Install Node.js 20 + build tools ──────────────────────────────────────
echo "[2/10] Installing Node.js 20, build tools, tmux, git..."
dnf install -y nodejs20 npm gcc gcc-c++ make python3 tmux git jq zsh

# ── 3. Install AI CLIs ───────────────────────────────────────────────────────
echo "[3/10] Installing AI CLIs..."
if [[ -n "${ai_tool}" ]]; then
  case "${ai_tool}" in
    claude)  npm install -g @anthropic-ai/claude-code ;;
    gemini)  npm install -g @google/gemini-cli ;;
    codex)   npm install -g @openai/codex ;;
    *)       echo "Unknown AI tool: ${ai_tool}, skipping CLI install" ;;
  esac
fi

# ── 4. Write agent-server.js and package.json ────────────────────────────────
echo "[4/10] Writing agent-server.js and package.json..."
mkdir -p /app
cat > /app/agent-server.js << 'AGENTSERVEREOF'
${agent_server_js}
AGENTSERVEREOF

cat > /app/package.json << 'PACKAGEJSONEOF'
${agent_package_json}
PACKAGEJSONEOF

# ── 5. Install Node.js dependencies ──────────────────────────────────────────
echo "[5/10] Installing Node.js dependencies (ws, node-pty)..."
cd /app && npm install --production
cd /

# ── 6. Create user and workspace ─────────────────────────────────────────────
echo "[6/10] Creating agentuser and /workspace..."
useradd -r -m -s /bin/bash agentuser || true
mkdir -p /workspace
chown agentuser:agentuser /workspace

# ── 7. Create systemd service ────────────────────────────────────────────────
echo "[7/10] Creating systemd service..."
cat > /etc/systemd/system/aimaestro-agent.service << 'SERVICEEOF'
[Unit]
Description=AI Maestro Agent Server
After=network.target

[Service]
Type=simple
User=agentuser
WorkingDirectory=/app
ExecStart=/usr/bin/node /app/agent-server.js
Restart=always
RestartSec=5
Environment=PORT=23000
Environment=AGENT_ID=${agent_name}
Environment=TMUX_SESSION_NAME=${agent_name}
Environment=AI_TOOL=${ai_tool}
Environment=GITHUB_TOKEN=${github_token}
Environment=ANTHROPIC_API_KEY=${anthropic_api_key}
Environment=GIT_USER_NAME=AI Maestro Agent
Environment=GIT_USER_EMAIL=agent@23blocks.com
Environment=WORKSPACE=/workspace

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable aimaestro-agent
systemctl start aimaestro-agent

# Wait for agent server to be ready
echo "Waiting for agent server to start..."
sleep 5

# ── 8. Install Nginx ─────────────────────────────────────────────────────────
echo "[8/10] Installing Nginx..."
dnf install -y nginx
systemctl enable nginx

# ── 9. Install Certbot ───────────────────────────────────────────────────────
echo "[9/10] Installing Certbot..."
dnf install -y python3-pip augeas-libs cronie
python3 -m pip install --user certbot certbot-nginx
export PATH="/root/.local/bin:$PATH"
systemctl enable crond
systemctl start crond

# Configure temporary nginx for Let's Encrypt
cat > /etc/nginx/conf.d/aimaestro-temp.conf <<'NGINX_TEMP'
server {
    listen 80;
    server_name ${domain_name};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 200 "AI Maestro Agent - Configuring SSL...\n";
        add_header Content-Type text/plain;
    }
}
NGINX_TEMP

mkdir -p /var/www/html/.well-known/acme-challenge
systemctl start nginx

# ── 10. Obtain SSL certificate ───────────────────────────────────────────────
echo "[10/10] Obtaining SSL certificate from Let's Encrypt..."
MAX_RETRIES=5
RETRY_DELAY=30
for i in $(seq 1 $MAX_RETRIES); do
  echo "Attempt $i of $MAX_RETRIES..."

  if certbot certonly \
    --nginx \
    --non-interactive \
    --agree-tos \
    --email ${ssl_email} \
    --domains ${domain_name} \
    --keep-until-expiring; then
    echo "SSL certificate obtained successfully!"
    break
  else
    if [ $i -lt $MAX_RETRIES ]; then
      echo "Certificate acquisition failed. Waiting $RETRY_DELAY seconds for DNS propagation..."
      sleep $RETRY_DELAY
    else
      echo "ERROR: Failed to obtain SSL certificate after $MAX_RETRIES attempts."
      echo "Please check:"
      echo "  1. DNS A record points to this instance IP"
      echo "  2. Port 80 is accessible from the internet"
      echo "  3. Domain name is correct: ${domain_name}"
      exit 1
    fi
  fi
done

# Remove temporary nginx config
rm -f /etc/nginx/conf.d/aimaestro-temp.conf

# Install production nginx config with SSL
echo "Installing production Nginx configuration..."
cat > /etc/nginx/conf.d/aimaestro-agent.conf <<'NGINX_PROD'
${nginx_config}
NGINX_PROD

nginx -t
systemctl reload nginx

# Setup automatic certificate renewal
echo "Setting up automatic SSL renewal..."
(crontab -l 2>/dev/null; echo "0 0,12 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | crontab -

echo "==================================="
echo "Bootstrap Complete!"
echo "==================================="
echo "Agent: ${agent_name}"
echo "Domain: ${domain_name}"
echo "AI Tool: ${ai_tool}"
echo "WebSocket URL: wss://${domain_name}/term"
echo "Health Check: https://${domain_name}/health"
echo ""
echo "Agent Service Status:"
systemctl status aimaestro-agent --no-pager
echo ""
echo "Nginx Status:"
systemctl status nginx --no-pager
echo ""
echo "SSL Certificate:"
certbot certificates
echo "==================================="
