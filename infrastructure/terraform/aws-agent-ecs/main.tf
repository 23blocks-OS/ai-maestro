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

# Default VPC and subnets
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "agent" {
  name              = "/ecs/aimaestro-${var.agent_name}"
  retention_in_days = 30

  tags = {
    Name    = "aimaestro-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "agent" {
  name = "aimaestro-${var.agent_name}"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = {
    Name    = "aimaestro-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

# IAM Role - ECS Task Execution (pull images, write logs)
resource "aws_iam_role" "ecs_execution" {
  name = "aimaestro-exec-${var.agent_name}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name    = "aimaestro-exec-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# IAM Role - ECS Task (empty, extensible)
resource "aws_iam_role" "ecs_task" {
  name = "aimaestro-task-${var.agent_name}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name    = "aimaestro-task-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

# Security Group - ALB
resource "aws_security_group" "alb" {
  name        = "aimaestro-alb-${var.agent_name}"
  description = "ALB security group for AI Maestro agent ${var.agent_name}"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name    = "aimaestro-alb-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

# Security Group - ECS Tasks
resource "aws_security_group" "ecs_tasks" {
  name        = "aimaestro-ecs-${var.agent_name}"
  description = "ECS tasks security group for AI Maestro agent ${var.agent_name}"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "From ALB only"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name    = "aimaestro-ecs-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

# Application Load Balancer
resource "aws_lb" "agent" {
  name               = "aimaestro-${var.agent_name}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids

  tags = {
    Name    = "aimaestro-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

# Target Group
resource "aws_lb_target_group" "agent" {
  name        = "aimaestro-${var.agent_name}"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    protocol            = "HTTP"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 10
    interval            = 30
    matcher             = "200"
  }

  stickiness {
    type    = "lb_cookie"
    enabled = true
  }

  tags = {
    Name    = "aimaestro-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

# ACM Certificate (conditional - only if domain_name is set)
resource "aws_acm_certificate" "agent" {
  count             = var.domain_name != "" ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name    = "aimaestro-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

resource "aws_acm_certificate_validation" "agent" {
  count           = var.domain_name != "" ? 1 : 0
  certificate_arn = aws_acm_certificate.agent[0].arn
}

# ALB Listener - HTTPS (when domain + cert available)
resource "aws_lb_listener" "https" {
  count             = var.domain_name != "" ? 1 : 0
  load_balancer_arn = aws_lb.agent.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.agent[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.agent.arn
  }
}

# ALB Listener - HTTP redirect to HTTPS (when domain available)
resource "aws_lb_listener" "http_redirect" {
  count             = var.domain_name != "" ? 1 : 0
  load_balancer_arn = aws_lb.agent.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ALB Listener - HTTP only (when no domain — ALB DNS only)
resource "aws_lb_listener" "http_only" {
  count             = var.domain_name == "" ? 1 : 0
  load_balancer_arn = aws_lb.agent.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.agent.arn
  }
}

# ECS Task Definition
resource "aws_ecs_task_definition" "agent" {
  family                   = "aimaestro-${var.agent_name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = "agent"
      image     = var.ecr_image_url
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "AGENT_NAME", value = var.agent_name },
        { name = "PORT", value = tostring(var.container_port) },
        { name = "GITHUB_TOKEN", value = var.github_token },
        { name = "ANTHROPIC_API_KEY", value = var.anthropic_api_key },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.agent.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "agent"
        }
      }
    }
  ])

  tags = {
    Name    = "aimaestro-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}

# ECS Service
resource "aws_ecs_service" "agent" {
  name            = "aimaestro-${var.agent_name}"
  cluster         = aws_ecs_cluster.agent.id
  task_definition = aws_ecs_task_definition.agent.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.agent.arn
    container_name   = "agent"
    container_port   = var.container_port
  }

  depends_on = [
    aws_lb_listener.https,
    aws_lb_listener.http_redirect,
    aws_lb_listener.http_only,
  ]

  tags = {
    Name    = "aimaestro-${var.agent_name}"
    Project = "AI Maestro"
    Agent   = var.agent_name
  }
}
