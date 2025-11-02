# AI Maestro Agent - AWS Deployment

Terraform configuration to deploy AI Maestro agents to AWS EC2.

## Prerequisites

1. **AWS Account** with admin access
2. **AWS CLI** configured with profile
3. **Terraform** installed (v1.0+)
4. **SSH Key Pair** created in AWS
5. **ECR Repository** with aimaestro-agent image
6. **GitHub Token** for git push

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

### 4. Get Agent URL

```bash
# Get WebSocket URL
terraform output websocket_url

# Get full agent config JSON
terraform output -json agent_registry_json
```

### 5. Add to AI Maestro

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

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `aws_region` | `us-east-1` | AWS region |
| `aws_profile` | `default` | AWS CLI profile |
| `instance_type` | `t3.small` | EC2 instance type |
| `allowed_ssh_cidr` | `0.0.0.0/0` | SSH access CIDR |
| `websocket_port` | `46000` | WebSocket port |
| `anthropic_api_key` | - | Claude API key |

## What Gets Created

- **EC2 Instance** (Amazon Linux 2023)
- **Security Group** (ports 22, 46000)
- **IAM Role** (ECR read access)
- **Docker container** running aimaestro-agent

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

1. Check security group allows port 46000
2. Check instance is running: `terraform output instance_id`
3. Check container health: `curl http://INSTANCE_IP:46000/health`

### ECR pull fails

1. Verify IAM role has ECR permissions
2. Check image exists: `aws ecr describe-images --repository-name aimaestro-agent`
3. Verify region matches

## Security Best Practices

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
