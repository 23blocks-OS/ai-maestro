# AWS Configuration
variable "aws_region" {
  description = "AWS region to deploy the agent"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "default"
}

# Agent Configuration
variable "agent_name" {
  description = "Name of the agent (used for tagging and identification)"
  type        = string
}

variable "ecr_image_url" {
  description = "Full ECR image URL (e.g., 123456789.dkr.ecr.us-east-1.amazonaws.com/aimaestro-agent:latest)"
  type        = string
}

variable "github_token" {
  description = "GitHub Personal Access Token for git push"
  type        = string
  sensitive   = true
}

# Optional: Claude API Key
variable "anthropic_api_key" {
  description = "Anthropic API key for Claude"
  type        = string
  sensitive   = true
  default     = ""
}

# Networking
variable "domain_name" {
  description = "Domain name for the agent (optional for ECS — uses ALB DNS if empty)"
  type        = string
  default     = ""
}

# ECS Configuration
variable "cpu" {
  description = "Fargate CPU units (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate memory in MB (must match CPU constraints)"
  type        = number
  default     = 1024
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 23000
}
