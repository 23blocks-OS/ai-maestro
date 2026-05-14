output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.agent.dns_name
}

output "cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.agent.arn
}

output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.agent.name
}

output "websocket_url" {
  description = "WebSocket URL for AI Maestro dashboard"
  value       = var.domain_name != "" ? "wss://${var.domain_name}/term" : "ws://${aws_lb.agent.dns_name}/term"
}

output "health_check_url" {
  description = "Health check URL"
  value       = var.domain_name != "" ? "https://${var.domain_name}/health" : "http://${aws_lb.agent.dns_name}/health"
}

output "agent_registry_json" {
  description = "JSON snippet to add to ~/.aimaestro/agents/registry.json"
  value = jsonencode({
    id          = var.agent_name
    alias       = var.agent_name
    displayName = "ECS Agent - ${var.agent_name}"
    avatar      = "☁️"
    program     = "Claude Code"
    model       = "Sonnet 4.5"
    deployment = {
      type = "cloud"
      cloud = {
        provider       = "aws"
        runtime        = "ecs-fargate"
        region         = var.aws_region
        clusterArn     = aws_ecs_cluster.agent.arn
        serviceName    = aws_ecs_service.agent.name
        albDnsName     = aws_lb.agent.dns_name
        domain         = var.domain_name
        websocketUrl   = var.domain_name != "" ? "wss://${var.domain_name}/term" : "ws://${aws_lb.agent.dns_name}/term"
        healthCheckUrl = var.domain_name != "" ? "https://${var.domain_name}/health" : "http://${aws_lb.agent.dns_name}/health"
        ssl            = var.domain_name != "" ? "acm" : "none"
        cpu            = var.cpu
        memory         = var.memory
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
  description = "DNS setup instructions (only relevant when domain_name is set)"
  value = var.domain_name != "" ? <<-EOT

  ╔═══════════════════════════════════════════════════════════════╗
  ║  DNS SETUP REQUIRED                                          ║
  ╠═══════════════════════════════════════════════════════════════╣
  ║                                                               ║
  ║  Add a CNAME record to your DNS:                             ║
  ║                                                               ║
  ║  Domain: ${var.domain_name}
  ║  Type:   CNAME                                               ║
  ║  Value:  ${aws_lb.agent.dns_name}
  ║  TTL:    300 (5 minutes)                                     ║
  ║                                                               ║
  ║  After adding the DNS record, wait for:                      ║
  ║  1. DNS propagation (5-10 min)                               ║
  ║  2. ACM certificate validation (up to 30 min)               ║
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝

  EOT
  : <<-EOT

  No custom domain configured. Use ALB DNS directly:
  ${aws_lb.agent.dns_name}

  EOT
}
