'use client'

import { Box, Server, Cloud, Wifi, Network } from 'lucide-react'
import type { Agent } from '@/types/agent'

type InfraType = 'local' | 'remote' | 'docker' | 'ec2' | 'ecs' | 'cloud' | 'standalone'

export function getInfraType(agent: Agent): InfraType {
  if (agent.session?.standalone) return 'standalone'

  const deployment = agent.deployment
  if (deployment?.type === 'cloud') {
    const cloud = deployment.cloud
    if (!cloud) return isRemote(agent) ? 'remote' : 'local'

    if (cloud.provider === 'local-container') return 'docker'

    if (cloud.provider === 'aws') {
      if (cloud.runtime === 'ecs-fargate') return 'ecs'
      return 'ec2'
    }

    // Non-AWS cloud providers (gcp, azure, digitalocean)
    return 'cloud'
  }

  // No cloud deployment — check if it's a remote mesh agent
  if (isRemote(agent)) return 'remote'

  return 'local'
}

function isRemote(agent: Agent): boolean {
  return Boolean(agent.hostId && agent.hostId !== 'local')
}

const infraConfig: Record<InfraType, { icon: typeof Box; color: string; label: string }> = {
  local:      { icon: Server,  color: 'text-gray-500',   label: 'Local (tmux)' },
  remote:     { icon: Network, color: 'text-purple-400', label: 'Remote (mesh)' },
  docker:     { icon: Box,     color: 'text-blue-400',   label: 'Docker container' },
  ec2:        { icon: Server,  color: 'text-orange-400', label: 'AWS EC2' },
  ecs:        { icon: Cloud,   color: 'text-purple-400', label: 'AWS ECS/Fargate' },
  cloud:      { icon: Cloud,   color: 'text-sky-400',    label: 'Cloud' },
  standalone: { icon: Wifi,    color: 'text-teal-400',   label: 'Standalone agent' },
}

interface InfraIconProps {
  agent: Agent
  size?: number
  className?: string
  showLocal?: boolean // Whether to show icon for local agents (default: true)
}

export default function InfraIcon({ agent, size = 12, className = '', showLocal = true }: InfraIconProps) {
  const infraType = getInfraType(agent)

  const config = infraConfig[infraType]
  const Icon = config.icon

  return (
    <span className={`flex-shrink-0 ${className}`} title={config.label} aria-label={config.label}>
      <Icon style={{ width: size, height: size }} className={config.color} />
    </span>
  )
}
