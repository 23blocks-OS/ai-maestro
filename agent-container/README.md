# AI Maestro Agent Container

**Portable agent container that runs anywhere - your laptop, AWS, or any cloud.**

## What's Inside

- **tmux session** - Persistent terminal session
- **Claude Code CLI** - AI coding assistant
- **WebSocket server** - Accepts connections from AI Maestro dashboard
- **node-pty bridge** - Connects WebSocket ↔ tmux

## Quick Start (Local)

```bash
# Build the container
docker build -t aimaestro-agent .

# Run it locally
docker run -d \
  --name my-agent \
  -p 23000:23000 \
  -v $(pwd)/workspace:/workspace \
  -e AGENT_ID=test-agent \
  -e TMUX_SESSION_NAME=test-session \
  aimaestro-agent

# Check it's running
curl http://localhost:23000/health

# Connect from AI Maestro dashboard
# WebSocket URL: ws://localhost:23000/term
```

## Test WebSocket Connection

```bash
# Install wscat for testing
npm install -g wscat

# Connect to agent
wscat -c ws://localhost:23000/term

# Type commands and see output from tmux/Claude
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_ID` | `agent-local` | Unique agent identifier |
| `TMUX_SESSION_NAME` | `agent-session` | Name of tmux session |
| `WORKSPACE` | `/workspace` | Working directory for agent |
| `AGENT_PORT` | `23000` | WebSocket server port |
| `ANTHROPIC_API_KEY` | - | Claude API key (required) |

## Deploy to AWS

### Option 1: EC2

```bash
# Build and push to Docker Hub
docker build -t yourusername/aimaestro-agent .
docker push yourusername/aimaestro-agent

# On EC2 instance:
docker pull yourusername/aimaestro-agent
docker run -d \
  --name agent-1 \
  -p 23000:23000 \
  -v /opt/workspace:/workspace \
  -e AGENT_ID=aws-agent-1 \
  -e ANTHROPIC_API_KEY=your-key \
  yourusername/aimaestro-agent

# Connect from dashboard
# WebSocket URL: wss://your-ec2-ip:23000/term
```

### Option 2: ECS Fargate

```bash
# Push to ECR
aws ecr create-repository --repository-name aimaestro-agent
docker tag aimaestro-agent:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/aimaestro-agent:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/aimaestro-agent:latest

# Create ECS task definition (see ecs-task-definition.json)
# Deploy via ECS service

# Connect from dashboard
# WebSocket URL: wss://agent.aimaestro.com/term (via ALB)
```

## Architecture

```
Browser (AI Maestro Dashboard)
    ↓ WebSocket
agent-server.js (this container)
    ↓ node-pty
tmux session
    ↓
Claude Code CLI
```

**Same container, different locations:**
- Local: `ws://localhost:23000/term`
- AWS: `wss://agent.cloud.com/term`
- Your friend's server: `wss://their-server.com:23000/term`

## Development

```bash
# Run with live code reload
docker run -it --rm \
  -p 23000:23000 \
  -v $(pwd)/agent-server.js:/app/agent-server.js \
  -v $(pwd)/workspace:/workspace \
  aimaestro-agent

# View logs
docker logs -f my-agent

# Exec into container
docker exec -it my-agent /bin/zsh

# Attach to tmux session directly
docker exec -it my-agent tmux attach-session -t agent-session
```

## Troubleshooting

### Container exits immediately

Check logs:
```bash
docker logs my-agent
```

Common issues:
- Missing `ANTHROPIC_API_KEY`
- Port 23000 already in use
- Insufficient memory

### Can't connect via WebSocket

1. Check container is running:
```bash
docker ps | grep my-agent
```

2. Check health endpoint:
```bash
curl http://localhost:23000/health
```

3. Check port mapping:
```bash
docker port my-agent
```

### tmux session not found

Exec into container and check:
```bash
docker exec -it my-agent tmux list-sessions
```

If missing, create manually:
```bash
docker exec -it my-agent tmux new-session -d -s agent-session
```

## Production Considerations

1. **Persistent Storage**: Mount volume for `/workspace` to persist agent work
2. **Secrets**: Use Docker secrets or AWS Secrets Manager for `ANTHROPIC_API_KEY`
3. **Resource Limits**: Set CPU/memory limits
4. **Restart Policy**: Use `--restart unless-stopped`
5. **Monitoring**: Add Prometheus metrics endpoint
6. **Logging**: Forward logs to CloudWatch/Elasticsearch

## Next Steps

1. ✅ Build and run locally
2. ✅ Connect AI Maestro dashboard to `ws://localhost:23000/term`
3. ✅ Verify you can control tmux/Claude through dashboard
4. 🎯 Deploy to AWS EC2
5. 🎯 Update dashboard URL to cloud instance
6. 🎯 Scale to multiple agents

## Cost Estimates

**Local**: Free (runs on your machine)

**AWS EC2** (t3.medium):
- Instance: $30/month
- Storage: $8/month (100GB)
- Data transfer: ~$1/month
- **Total: ~$39/agent/month**

**AWS ECS Fargate** (1 vCPU, 2GB):
- Compute: $29/month
- Data transfer: ~$1/month
- **Total: ~$30/agent/month**

**Shared EC2** (t3.large, 4 agents):
- Instance: $60/month ÷ 4 = $15/agent
- Storage: $2/agent
- **Total: ~$17/agent/month**
