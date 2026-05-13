terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

# Get latest Amazon Linux 2023 AMI (ARM64 for Graviton instances)
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Security Group for Agent
resource "aws_security_group" "agent" {
  name        = "aimaestro-agent-${var.agent_name}"
  description = "Security group for AI Maestro agent ${var.agent_name}"

  # SSH access
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
    description = "SSH access"
  }

  # HTTP (for LetsEncrypt ACME challenge)
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP for LetsEncrypt"
  }

  # HTTPS (secure WebSocket - wss://)
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS/WSS for secure WebSocket connections"
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name    = "aimaestro-agent-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

# EC2 Instance — native install (no Docker, no ECR)
resource "aws_instance" "agent" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.agent.id]

  # User data script installs Node.js, tmux, AI CLI natively
  user_data = templatefile("${path.module}/user_data.sh", {
    agent_name         = var.agent_name
    ai_tool            = var.ai_tool
    github_token       = var.github_token
    websocket_port     = var.websocket_port
    anthropic_api_key  = var.anthropic_api_key
    aws_region         = var.aws_region
    domain_name        = var.domain_name
    ssl_email          = var.ssl_email
    agent_server_js    = file("${path.module}/agent-server.js")
    agent_package_json = file("${path.module}/agent-package.json")
    nginx_config       = templatefile("${path.module}/nginx.conf.tpl", {
      domain_name = var.domain_name
      agent_name  = var.agent_name
    })
  })

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name    = "aimaestro-agent-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }

  # Wait for instance to be ready
  provisioner "local-exec" {
    command = "echo 'Waiting for instance to be ready...'"
  }
}
