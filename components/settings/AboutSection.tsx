'use client'

import { Heart, Github, Twitter, Package, Cpu, HardDrive, Globe } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function AboutSection() {
  const [systemInfo, setSystemInfo] = useState<{
    platform?: string
    nodeVersion?: string
    port?: string
  }>({})

  useEffect(() => {
    // Fetch system info from API
    const fetchInfo = async () => {
      try {
        const response = await fetch('/api/config')
        if (response.ok) {
          const data = await response.json()
          setSystemInfo(data)
        }
      } catch (error) {
        console.error('Failed to fetch system info:', error)
      }
    }
    fetchInfo()
  }, [])

  const team = [
    {
      name: 'Juan Peláez',
      role: 'Creator & Concept',
      twitter: 'jkpelaez',
      company: '23blocks',
      companyUrl: 'https://23blocks.com',
    },
  ]

  const technologies = [
    { name: 'Next.js 14', description: 'React framework with App Router' },
    { name: 'TypeScript', description: 'Type-safe development' },
    { name: 'xterm.js', description: 'Terminal emulation' },
    { name: 'WebSocket', description: 'Real-time communication' },
    { name: 'tmux', description: 'Terminal multiplexer' },
    { name: 'Tailwind CSS', description: 'Utility-first styling' },
  ]

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">AI Maestro</h1>
        <p className="text-lg text-blue-400 font-medium mb-1">Version 0.9.2</p>
        <p className="text-sm text-gray-400">
          A browser-based terminal dashboard for managing Claude Code sessions
        </p>
      </div>

      {/* Made with Love */}
      <div className="p-6 bg-gradient-to-br from-red-500/10 to-pink-500/10 border border-red-500/20 rounded-lg text-center">
        <div className="flex items-center justify-center gap-2 text-xl text-white mb-2">
          Made with <Heart className="w-6 h-6 text-red-500 animate-pulse" fill="currentColor" /> in Boulder, Colorado
        </div>
        <p className="text-sm text-gray-400">
          Crafted with passion for the AI coding community
        </p>
      </div>

      {/* Team */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-white">Team</h2>
        {team.map((member) => (
          <div
            key={member.name}
            className="p-5 bg-gray-800/30 border border-gray-700 rounded-lg"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{member.name}</h3>
                <p className="text-sm text-gray-400 mb-3">{member.role}</p>
                <div className="flex items-center gap-4">
                  <a
                    href={`https://x.com/${member.twitter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Twitter className="w-4 h-4" />
                    @{member.twitter}
                  </a>
                  <a
                    href={member.companyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors font-semibold"
                  >
                    <Globe className="w-4 h-4" />
                    {member.company}
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))}
        <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg text-center">
          <p className="text-sm text-gray-300 mb-1">
            <strong className="text-white">Coded by Claude</strong>
          </p>
          <p className="text-xs text-gray-500">
            AI Maestro was built collaboratively with Claude Code (Anthropic)
          </p>
        </div>
      </div>

      {/* System Info */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-white">System Information</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-gray-400">Platform</span>
            </div>
            <p className="text-lg font-semibold text-white">{systemInfo.platform || 'macOS'}</p>
          </div>
          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-gray-400">Node.js</span>
            </div>
            <p className="text-lg font-semibold text-white">{systemInfo.nodeVersion || 'v20.x'}</p>
          </div>
          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-gray-400">Port</span>
            </div>
            <p className="text-lg font-semibold text-white">{systemInfo.port || '23000'}</p>
          </div>
          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-gray-400">Manager/Worker</span>
            </div>
            <p className="text-lg font-semibold text-white">Phase 4</p>
          </div>
        </div>
      </div>

      {/* Technologies */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-white">Built With</h2>
        <div className="grid grid-cols-2 gap-3">
          {technologies.map((tech) => (
            <div
              key={tech.name}
              className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg hover:border-blue-500/50 transition-colors"
            >
              <h3 className="font-medium text-white mb-1">{tech.name}</h3>
              <p className="text-xs text-gray-400">{tech.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Links */}
      <div className="flex items-center justify-center gap-6 pt-4">
        <a
          href="https://github.com/23blocks-OS/ai-maestro"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <Github className="w-5 h-5" />
          <span className="text-sm font-medium">GitHub</span>
        </a>
        <a
          href="https://x.com/jkpelaez"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <Twitter className="w-5 h-5" />
          <span className="text-sm font-medium">Twitter</span>
        </a>
        <a
          href="https://23blocks.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <Globe className="w-5 h-5" />
          <span className="text-sm font-medium">23blocks</span>
        </a>
      </div>

      {/* License */}
      <div className="text-center pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-500">
          MIT License • © 2025 23blocks • Open Source Software
        </p>
      </div>
    </div>
  )
}
