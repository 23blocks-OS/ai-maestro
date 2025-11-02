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

# Get latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
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

  # WebSocket access
  ingress {
    from_port   = var.websocket_port
    to_port     = var.websocket_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "WebSocket access for AI Maestro dashboard"
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

# IAM Role for EC2 to access ECR
resource "aws_iam_role" "agent_ec2" {
  name = "aimaestro-agent-ec2-${var.agent_name}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name    = "aimaestro-agent-ec2-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

# Attach ECR read-only policy
resource "aws_iam_role_policy_attachment" "ecr_readonly" {
  role       = aws_iam_role.agent_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# Instance profile
resource "aws_iam_instance_profile" "agent" {
  name = "aimaestro-agent-${var.agent_name}"
  role = aws_iam_role.agent_ec2.name
}

# EC2 Instance
resource "aws_instance" "agent" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.agent.id]
  iam_instance_profile   = aws_iam_instance_profile.agent.name

  # User data script to install Docker and run agent
  user_data = templatefile("${path.module}/user_data.sh", {
    ecr_image_url      = var.ecr_image_url
    agent_name         = var.agent_name
    github_token       = var.github_token
    websocket_port     = var.websocket_port
    anthropic_api_key  = var.anthropic_api_key
    aws_region         = var.aws_region
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
