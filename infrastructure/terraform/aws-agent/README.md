# AI Maestro Agent - AWS Deployment

Terraform configuration to deploy AI Maestro agents to AWS EC2.

## Prerequisites

1. **AWS Account** with admin access
2. **AWS CLI** configured with profile
3. **Terraform** installed (v1.0+)
4. **SSH Key Pair** created in AWS
5. **ECR Repository** with aimaestro-agent image
6. **GitHub Token** for git push
7. **Domain Name** with DNS access (required for SSL)

## Quick Start

### 1. Push Container to ECR

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

# Create ECR repository (if doesn't exist)
aws ecr create-repository --repository-name aimaestro-agent --region us-east-1

# Tag and push
docker tag aimaestro-agent:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/aimaestro-agent:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/aimaestro-agent:latest
```

### 2. Configure Terraform

```bash
cd infrastructure/terraform/aws-agent

# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars with your values
nano terraform.tfvars
```

### 3. Deploy

```bash
# Initialize Terraform
terraform init

# Preview changes
terraform plan

# Deploy
terraform apply
```

### 4. Configure DNS

After deployment, Terraform will show DNS instructions. Add an A record to your DNS:

```
Domain: agent1.yourdomain.com
Type:   A
Value:  [EC2 PUBLIC IP from terraform output]
TTL:    300
```

**Wait 5-10 minutes for:**
1. DNS propagation
2. Let's Encrypt SSL certificate issuance (fully automated)

Verify SSL is working:
```bash
curl https://agent1.yourdomain.com/health
```

### 5. Get Agent URL

```bash
# Get secure WebSocket URL (wss://)
terraform output websocket_url

# Get full agent config JSON
terraform output -json agent_registry_json
```

### 6. Add to AI Maestro

Copy the agent JSON from output and add to `~/.aimaestro/agents/registry.json`:

```bash
# Get the JSON
terraform output -json agent_registry_json | jq '.' > ~/aimaestro-agent.json

# Manually add to registry, or:
# Edit ~/.aimaestro/agents/registry.json and append the agent object
```

## Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `agent_name` | Unique agent name | `cloud-agent-1` |
| `ecr_image_url` | Full ECR image URL | `123456789012.dkr.ecr.us-east-1.amazonaws.com/aimaestro-agent:latest` |
| `github_token` | GitHub Personal Access Token | `ghp_xxxxx` |
| `key_name` | SSH key pair name in AWS | `my-key` |
| `domain_name` | Domain for SSL certificate | `agent1.yourdomain.com` |
| `ssl_email` | Email for Let's Encrypt | `you@example.com` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `aws_region` | `us-east-1` | AWS region |
| `aws_profile` | `default` | AWS CLI profile |
| `instance_type` | `t3.small` | EC2 instance type |
| `allowed_ssh_cidr` | `0.0.0.0/0` | SSH access CIDR |
| `anthropic_api_key` | - | Claude API key |

## What Gets Created

- **EC2 Instance** (Amazon Linux 2023)
- **Security Group** (ports 22, 80, 443)
- **IAM Role** (ECR read access)
- **Nginx** reverse proxy with SSL termination
- **Let's Encrypt SSL certificate** (automatically obtained and renewed)
- **Docker container** running aimaestro-agent (localhost only)

## Costs

**t3.small** (~$15/month):
- Instance: $0.0208/hour × 730 hours = ~$15
- Storage (30GB): ~$3
- **Total: ~$18/month**

**t3.medium** (~$30/month):
- Instance: $0.0416/hour × 730 hours = ~$30
- Storage (30GB): ~$3
- **Total: ~$33/month**

## Management

### SSH into instance

```bash
terraform output ssh_command
# Copy and run the command
```

### View container logs

```bash
ssh -i ~/.ssh/your-key.pem ec2-user@INSTANCE_IP
docker logs -f aimaestro-agent
```

### Restart agent

```bash
ssh -i ~/.ssh/your-key.pem ec2-user@INSTANCE_IP
docker restart aimaestro-agent
```

### Destroy infrastructure

```bash
terraform destroy
```

## Troubleshooting

### Container not starting

SSH into instance and check:
```bash
sudo cat /var/log/user-data.log
docker logs aimaestro-agent
```

### Can't connect via WebSocket

1. Verify DNS is pointing to correct IP: `dig agent1.yourdomain.com`
2. Check SSL certificate is valid: `curl -v https://agent1.yourdomain.com/health`
3. View Nginx logs: `ssh ... "sudo tail -f /var/log/nginx/error.log"`
4. Check container health: `ssh ... "docker exec aimaestro-agent curl http://localhost:23000/health"`

### ECR pull fails

1. Verify IAM role has ECR permissions
2. Check image exists: `aws ecr describe-images --repository-name aimaestro-agent`
3. Verify region matches

## Security Features

### SSL/TLS (Automatic)
- **Let's Encrypt** certificates (free, trusted by all browsers)
- **Automatic issuance** during deployment (no manual steps)
- **Automatic renewal** via cron (every 12 hours check)
- **Strong ciphers** (Mozilla Intermediate configuration)
- **HSTS** and security headers enabled

### Network Security
- Container binds to **localhost only** (127.0.0.1:23000)
- Nginx reverse proxy handles all external traffic
- HTTPS/WSS encryption for all connections
- HTTP automatically redirects to HTTPS

### Best Practices

1. **Restrict SSH access**: Set `allowed_ssh_cidr` to your IP only
2. **Use Secrets Manager**: Store GitHub token in AWS Secrets Manager (not implemented yet)
3. **Enable CloudWatch**: Add logging and monitoring
4. **Use private subnets**: Deploy in VPC with private subnets (requires NAT gateway)

## Next Steps

1. ✅ Deploy one agent
2. Test connection from AI Maestro dashboard
3. Deploy multiple agents (copy .tfvars, change agent_name)
4. Add monitoring/alerting
5. Set up auto-scaling (future)
