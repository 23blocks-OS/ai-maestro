#!/bin/bash
set -e

# Log everything
exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "==================================="
echo "AI Maestro Agent Bootstrap"
echo "Agent: ${agent_name}"
echo "Time: $(date)"
echo "==================================="

# Update system
echo "[1/6] Updating system packages..."
dnf update -y

# Install Docker
echo "[2/6] Installing Docker..."
dnf install -y docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install AWS CLI v2 (if not already installed)
echo "[3/6] Installing AWS CLI..."
if ! command -v aws &> /dev/null; then
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip
    ./aws/install
    rm -rf aws awscliv2.zip
fi

# Login to ECR
echo "[4/6] Logging into ECR..."
aws ecr get-login-password --region ${aws_region} | docker login --username AWS --password-stdin $(echo ${ecr_image_url} | cut -d'/' -f1)

# Pull agent container image
echo "[5/6] Pulling agent container image..."
docker pull ${ecr_image_url}

# Run agent container
echo "[6/6] Starting agent container..."
docker run -d \
  --name aimaestro-agent \
  -p ${websocket_port}:23000 \
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

# Verify container is running
echo "==================================="
echo "Verifying container status..."
sleep 5
docker ps

echo "==================================="
echo "Agent bootstrap complete!"
echo "Container logs:"
docker logs aimaestro-agent
echo "==================================="
