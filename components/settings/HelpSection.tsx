'use client'

import { Book, ExternalLink, Terminal, Server, MessageSquare, FileText } from 'lucide-react'

export default function HelpSection() {
  const guides = [
    {
      icon: Terminal,
      title: 'Getting Started',
      description: 'Learn how to create and manage AI agents with tmux sessions',
      topics: [
        'Creating your first agent',
        'Navigating the dashboard',
        'Understanding agent hierarchy',
        'Working with terminal sessions',
      ],
    },
    {
      icon: Server,
      title: 'Remote Hosts (Manager/Worker)',
      description: 'Configure AI Maestro to manage sessions across multiple machines',
      topics: [
        'What is the Manager/Worker pattern?',
        'Adding a remote host',
        'Testing host connectivity',
        'Creating sessions on remote hosts',
        'Network requirements (Tailscale, local network)',
      ],
    },
    {
      icon: MessageSquare,
      title: 'Inter-Agent Messaging',
      description: 'Enable agents to communicate asynchronously',
      topics: [
        'Sending messages between agents',
        'Reading and replying to messages',
        'Message priorities and status',
        'Using the messaging CLI scripts',
      ],
    },
    {
      icon: FileText,
      title: 'Agent Notes & Logging',
      description: 'Document your work and track agent activity',
      topics: [
        'Adding notes to agents',
        'Viewing agent logs',
        'Exporting terminal history',
        'Organizing agent workspaces',
      ],
    },
  ]

  const links = [
    {
      label: 'GitHub Repository',
      url: 'https://github.com/23blocks-OS/ai-maestro',
      description: 'View source code and contribute',
    },
    {
      label: 'Report an Issue',
      url: 'https://github.com/23blocks-OS/ai-maestro/issues',
      description: 'Found a bug? Let us know',
    },
    {
      label: 'Documentation',
      url: 'https://github.com/23blocks-OS/ai-maestro/blob/main/README.md',
      description: 'Full project documentation',
    },
  ]

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white mb-2">Help & Documentation</h1>
        <p className="text-sm text-gray-400">
          Learn how to use AI Maestro to manage your Claude Code sessions
        </p>
      </div>

      {/* Guides */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          <Book className="w-5 h-5 text-blue-400" />
          Guides
        </h2>
        <div className="grid gap-4">
          {guides.map((guide) => {
            const Icon = guide.icon
            return (
              <div
                key={guide.title}
                className="p-5 bg-gray-800/30 border border-gray-700 rounded-lg hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-start gap-4 mb-3">
                  <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <Icon className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-white mb-1">{guide.title}</h3>
                    <p className="text-sm text-gray-400">{guide.description}</p>
                  </div>
                </div>
                <ul className="ml-14 space-y-1.5">
                  {guide.topics.map((topic) => (
                    <li key={topic} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>{topic}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {/* External Links */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          <ExternalLink className="w-5 h-5 text-blue-400" />
          Resources
        </h2>
        <div className="grid gap-3">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 bg-gray-800/30 border border-gray-700 rounded-lg hover:bg-gray-800/50 hover:border-blue-500/50 transition-all group"
            >
              <div>
                <div className="font-medium text-white group-hover:text-blue-400 transition-colors">
                  {link.label}
                </div>
                <div className="text-sm text-gray-400">{link.description}</div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-blue-400 transition-colors" />
            </a>
          ))}
        </div>
      </div>

      {/* Quick Tips */}
      <div className="p-5 bg-blue-500/5 border border-blue-500/20 rounded-lg">
        <h3 className="text-lg font-medium text-blue-400 mb-3">💡 Quick Tips</h3>
        <ul className="space-y-2 text-sm text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>
              <strong>Keyboard shortcuts:</strong> Use Shift+PageUp/Down to scroll in the terminal
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>
              <strong>Naming convention:</strong> Use format level1-level2-name (e.g., apps-notify-batman) for automatic grouping
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>
              <strong>Agent notes:</strong> Click the notes section below the terminal to document your work
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>
              <strong>Remote hosts:</strong> Use Tailscale for secure remote access to workers across the internet
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
