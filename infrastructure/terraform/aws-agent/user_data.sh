#!/bin/bash
set -e

# Log everything
exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "==================================="
echo "AI Maestro Agent Bootstrap with SSL"
echo "Agent: ${agent_name}"
echo "Domain: ${domain_name}"
echo "Time: $(date)"
echo "==================================="

# Update system
echo "[1/9] Updating system packages..."
dnf update -y

# Install Docker
echo "[2/9] Installing Docker..."
dnf install -y docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Nginx
echo "[3/9] Installing Nginx..."
dnf install -y nginx
systemctl enable nginx

# Install Certbot for Let's Encrypt
echo "[4/9] Installing Certbot..."
dnf install -y python3 python3-pip augeas-libs
# Skip pip upgrade on Amazon Linux (rpm-managed pip causes conflicts)
python3 -m pip install --user certbot certbot-nginx
# Add local bin to PATH for certbot
export PATH="/root/.local/bin:$PATH"

# Install AWS CLI v2 (if not already installed)
echo "[5/9] Installing AWS CLI..."
if ! command -v aws &> /dev/null; then
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip
    ./aws/install
    rm -rf aws awscliv2.zip
fi

# Login to ECR and pull agent container
echo "[6/9] Logging into ECR and pulling container..."
aws ecr get-login-password --region ${aws_region} | docker login --username AWS --password-stdin $(echo ${ecr_image_url} | cut -d'/' -f1)
docker pull ${ecr_image_url}

# Run agent container (localhost only - nginx will proxy)
echo "[7/9] Starting agent container..."
docker run -d \
  --name aimaestro-agent \
  -p 127.0.0.1:23000:23000 \
  --restart unless-stopped \
  -e AGENT_ID=${agent_name} \
  -e TMUX_SESSION_NAME=${agent_name} \
  -e GITHUB_TOKEN='${github_token}' \
  -e ANTHROPIC_API_KEY='${anthropic_api_key}' \
  -e GIT_USER_NAME="AI Maestro Agent" \
  -e GIT_USER_EMAIL="agent@23blocks.com" \
  -v /opt/workspace:/workspace \
  --health-cmd="curl -f http://localhost:23000/health || exit 1" \
  --health-interval=30s \
  ${ecr_image_url}

# Wait for container to be healthy
echo "Waiting for container to be healthy..."
sleep 10

# Configure temporary nginx for Let's Encrypt
echo "[8/9] Configuring Nginx (temporary for Let's Encrypt)..."
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

# Create directory for Let's Encrypt challenges
mkdir -p /var/www/html/.well-known/acme-challenge

# Start nginx
systemctl start nginx

# Obtain SSL certificate from Let's Encrypt (fully automated, non-interactive)
echo "[9/9] Obtaining SSL certificate from Let's Encrypt..."
certbot certonly \
  --nginx \
  --non-interactive \
  --agree-tos \
  --email ${ssl_email} \
  --domains ${domain_name} \
  --keep-until-expiring

# Remove temporary nginx config
rm -f /etc/nginx/conf.d/aimaestro-temp.conf

# Install production nginx config with SSL
echo "Installing production Nginx configuration..."
cat > /etc/nginx/conf.d/aimaestro-agent.conf <<'NGINX_PROD'
${nginx_config}
NGINX_PROD

# Test nginx config
nginx -t

# Reload nginx with SSL configuration
systemctl reload nginx

# Setup automatic certificate renewal
echo "Setting up automatic SSL renewal..."
(crontab -l 2>/dev/null; echo "0 0,12 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | crontab -

echo "==================================="
echo "Bootstrap Complete!"
echo "==================================="
echo "Agent: ${agent_name}"
echo "Domain: ${domain_name}"
echo "WebSocket URL: wss://${domain_name}/term"
echo "Health Check: https://${domain_name}/health"
echo ""
echo "Container Status:"
docker ps
echo ""
echo "Container Logs:"
docker logs aimaestro-agent
echo ""
echo "Nginx Status:"
systemctl status nginx --no-pager
echo ""
echo "SSL Certificate:"
certbot certificates
echo "==================================="
