output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.agent.id
}

output "public_ip" {
  description = "Public IP address of the agent instance"
  value       = aws_instance.agent.public_ip
}

output "websocket_url" {
  description = "WebSocket URL for AI Maestro dashboard"
  value       = "ws://${aws_instance.agent.public_ip}:${var.websocket_port}/term"
}

output "health_check_url" {
  description = "Health check URL"
  value       = "http://${aws_instance.agent.public_ip}:${var.websocket_port}/health"
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ~/.ssh/${var.key_name}.pem ec2-user@${aws_instance.agent.public_ip}"
}

output "agent_registry_json" {
  description = "JSON snippet to add to ~/.aimaestro/agents/registry.json"
  value = jsonencode({
    id          = var.agent_name
    alias       = var.agent_name
    displayName = "AWS Agent - ${var.agent_name}"
    avatar      = "☁️"
    program     = "Claude Code"
    model       = "Sonnet 4.5"
    deployment = {
      type = "cloud"
      cloud = {
        provider       = "aws"
        region         = var.aws_region
        instanceType   = var.instance_type
        instanceId     = aws_instance.agent.id
        publicIp       = aws_instance.agent.public_ip
        websocketUrl   = "ws://${aws_instance.agent.public_ip}:${var.websocket_port}/term"
        healthCheckUrl = "http://${aws_instance.agent.public_ip}:${var.websocket_port}/health"
        status         = "running"
      }
    }
    tools = {
      session = {
        tmuxSessionName  = var.agent_name
        workingDirectory = "/workspace"
        status           = "running"
        createdAt        = timestamp()
      }
    }
    status    = "active"
    createdAt = timestamp()
  })
}
