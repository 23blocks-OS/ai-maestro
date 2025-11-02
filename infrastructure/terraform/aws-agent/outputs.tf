output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.agent.id
}

output "public_ip" {
  description = "Public IP address of the agent instance"
  value       = aws_instance.agent.public_ip
}

output "websocket_url" {
  description = "Secure WebSocket URL for AI Maestro dashboard (wss://)"
  value       = "wss://${var.domain_name}/term"
}

output "health_check_url" {
  description = "HTTPS health check URL"
  value       = "https://${var.domain_name}/health"
}

output "http_url" {
  description = "HTTP URL (redirects to HTTPS)"
  value       = "http://${var.domain_name}"
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
        domain         = var.domain_name
        websocketUrl   = "wss://${var.domain_name}/term"
        healthCheckUrl = "https://${var.domain_name}/health"
        ssl            = "letsencrypt"
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

output "dns_instructions" {
  description = "DNS setup instructions"
  value       = <<-EOT

  ╔════════════════════════════════════════════════════════════╗
  ║  DNS SETUP REQUIRED - Add this A record to your DNS:      ║
  ╠════════════════════════════════════════════════════════════╣
  ║                                                            ║
  ║  Domain: ${var.domain_name}                                ║
  ║  Type:   A                                                 ║
  ║  Value:  ${aws_instance.agent.public_ip}                   ║
  ║  TTL:    300 (5 minutes)                                   ║
  ║                                                            ║
  ║  After adding the DNS record, wait 5-10 minutes for:      ║
  ║  1. DNS propagation                                        ║
  ║  2. Let's Encrypt to issue SSL certificate               ║
  ║                                                            ║
  ║  Then test: https://${var.domain_name}/health              ║
  ╚════════════════════════════════════════════════════════════╝

  EOT
}
