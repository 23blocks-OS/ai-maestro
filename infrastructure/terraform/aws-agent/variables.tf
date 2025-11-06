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

# EC2 Configuration
variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "key_name" {
  description = "Name of the SSH key pair (must already exist in AWS)"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to SSH (your IP)"
  type        = string
  default     = "0.0.0.0/0" # Change this to your IP for better security
}

# Network Configuration
variable "websocket_port" {
  description = "Port for WebSocket connections"
  type        = number
  default     = 46000
}

# Optional: Claude API Key
variable "anthropic_api_key" {
  description = "Anthropic API key for Claude"
  type        = string
  sensitive   = true
  default     = ""
}

# SSL Configuration
variable "domain_name" {
  description = "Domain name for the agent (e.g., agent1.aimaestro.com) - REQUIRED for SSL"
  type        = string
}

variable "ssl_email" {
  description = "Email for Let's Encrypt SSL certificate notifications"
  type        = string
}
