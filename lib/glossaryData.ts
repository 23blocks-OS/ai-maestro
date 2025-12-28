// Glossary data for the Help Panel semantic search
// These terms help users understand AI Maestro concepts and find relevant tutorials

export interface GlossaryEntry {
  id: string
  term: string
  definition: string
  relatedTerms?: string[]
  category: 'core' | 'tools' | 'communication' | 'technical'
}

export const glossary: GlossaryEntry[] = [
  // Core Concepts
  {
    id: 'distributed-computing',
    term: 'Distributed AI Computing',
    definition: 'Running AI coding agents across multiple machines in your infrastructure. Each computer (host) runs its own agents locally, while a central dashboard lets you manage and coordinate them all. Agents work where the code lives, with full local file access.',
    relatedTerms: ['host', 'agent', 'transfer'],
    category: 'core'
  },
  {
    id: 'agent',
    term: 'Agent',
    definition: 'An AI coding assistant that runs in its own tmux session. Each agent has its own memory, working directory, and can communicate with other agents. Agents persist their state even when hibernated.',
    relatedTerms: ['session', 'tmux', 'hibernation'],
    category: 'core'
  },
  {
    id: 'local-first',
    term: 'Local-First',
    definition: 'AI Maestro\'s design philosophy where all code and data stay on your machines. Agents read and write files directly with no cloud intermediary. This ensures privacy, speed, and works offline.',
    relatedTerms: ['agent', 'host', 'security'],
    category: 'core'
  },
  {
    id: 'subconscious',
    term: 'Subconscious',
    definition: 'A background process that runs alongside each agent. It indexes conversations, builds code graphs, and maintains searchable memory. The subconscious runs locally on the same machine as the agent.',
    relatedTerms: ['agent', 'memory-search', 'graph-query'],
    category: 'technical'
  },
  {
    id: 'session',
    term: 'Session',
    definition: 'A tmux terminal session where an agent runs. Sessions contain the active terminal, command history, and current state of the AI assistant. Multiple agents can run in parallel sessions.',
    relatedTerms: ['agent', 'tmux', 'terminal'],
    category: 'core'
  },
  {
    id: 'host',
    term: 'Host',
    definition: 'A machine running AI Maestro. The local host is your current computer. Remote hosts are other machines you can connect to, allowing you to manage agents across multiple computers from one dashboard.',
    relatedTerms: ['remote-host', 'transfer'],
    category: 'core'
  },
  {
    id: 'working-directory',
    term: 'Working Directory',
    definition: 'The folder path where an agent operates. This is typically your project folder. The agent will read and modify files within this directory when you give it coding tasks.',
    relatedTerms: ['agent', 'project'],
    category: 'core'
  },
  {
    id: 'hibernation',
    term: 'Hibernation',
    definition: 'A power-saving state for agents. When hibernated, an agent\'s tmux session is closed but all memory and settings are preserved. Wake the agent to resume work exactly where you left off.',
    relatedTerms: ['agent', 'wake', 'session'],
    category: 'core'
  },
  {
    id: 'wake',
    term: 'Wake',
    definition: 'Bringing a hibernated agent back online. When you wake an agent, a new tmux session is created and the AI assistant starts with all previous memory and context restored.',
    relatedTerms: ['hibernation', 'agent', 'session'],
    category: 'core'
  },

  // Tools
  {
    id: 'memory-search',
    term: 'Memory Search',
    definition: 'A tool that searches through an agent\'s conversation history. Use it to find past discussions, decisions, or context from previous coding sessions. Helps agents remember what was discussed.',
    relatedTerms: ['agent', 'conversation', 'search'],
    category: 'tools'
  },
  {
    id: 'graph-query',
    term: 'Graph Query',
    definition: 'A tool that visualizes and searches code relationships. The code graph shows how functions, classes, and files connect to each other. Useful for understanding complex codebases.',
    relatedTerms: ['codebase', 'visualization', 'dependencies'],
    category: 'tools'
  },
  {
    id: 'docs-search',
    term: 'Docs Search',
    definition: 'A tool that searches through indexed documentation files in your project. Agents can query README files, API docs, Markdown documentation, and code comments to find answers about libraries, frameworks, and project-specific information.',
    relatedTerms: ['documentation', 'search', 'api', 'readme'],
    category: 'tools'
  },

  // Communication
  {
    id: 'messaging',
    term: 'Messaging',
    definition: 'The system that allows agents to send messages to each other. Messages are asynchronous - an agent can send a message and continue working while waiting for a reply.',
    relatedTerms: ['agent', 'inbox', 'collaboration'],
    category: 'communication'
  },
  {
    id: 'inbox',
    term: 'Inbox',
    definition: 'Where an agent receives messages from other agents. Check the Messages tab to see unread messages. Messages contain requests, updates, or information from collaborating agents.',
    relatedTerms: ['messaging', 'agent'],
    category: 'communication'
  },
  {
    id: 'message-center',
    term: 'Message Center',
    definition: 'The interface for viewing and managing agent messages. Shows both inbox (received) and sent messages. Access it via the Messages tab when viewing an agent.',
    relatedTerms: ['messaging', 'inbox'],
    category: 'communication'
  },

  // Technical
  {
    id: 'tmux',
    term: 'tmux',
    definition: 'A terminal multiplexer that runs in the background. AI Maestro uses tmux to manage agent sessions. Each agent gets its own tmux session that persists even if the dashboard is closed.',
    relatedTerms: ['session', 'terminal', 'agent'],
    category: 'technical'
  },
  {
    id: 'claude-code',
    term: 'Claude Code',
    definition: 'The AI coding assistant that powers each agent. Claude Code can read and write files, run commands, search code, and help with programming tasks. It runs inside a tmux session.',
    relatedTerms: ['agent', 'ai', 'assistant'],
    category: 'technical'
  },
  {
    id: 'terminal',
    term: 'Terminal',
    definition: 'The command-line interface where agents run. The terminal view in AI Maestro shows the live output from the agent\'s tmux session. You can type commands and see AI responses here.',
    relatedTerms: ['tmux', 'session', 'agent'],
    category: 'technical'
  },
  {
    id: 'immersive-mode',
    term: 'Immersive Mode',
    definition: 'A full-screen terminal experience. Click "Immersive Experience" to focus on a single agent\'s terminal without the sidebar or other distractions. Great for deep coding sessions.',
    relatedTerms: ['terminal', 'agent'],
    category: 'technical'
  },
  {
    id: 'transfer',
    term: 'Transfer',
    definition: 'Moving an agent from one host to another. When you transfer an agent, all its memory, graph data, and settings are packaged and sent to the destination machine.',
    relatedTerms: ['host', 'agent', 'remote-host'],
    category: 'technical'
  },
  {
    id: 'remote-host',
    term: 'Remote Host',
    definition: 'Another computer running AI Maestro that you connect to from your dashboard. Add remote hosts in Settings to manage agents across multiple machines from a single interface.',
    relatedTerms: ['host', 'transfer', 'settings'],
    category: 'technical'
  },
  {
    id: 'sidebar',
    term: 'Sidebar',
    definition: 'The left panel showing all your agents organized by category. Click agents to switch between them. The + button creates new agents. Collapse it with the menu button for more space.',
    relatedTerms: ['agent', 'dashboard'],
    category: 'technical'
  },
  {
    id: 'dashboard',
    term: 'Dashboard',
    definition: 'The main AI Maestro interface. Shows your agents in the sidebar, the active agent\'s terminal, and tabs for Messages, Chat history, and Graph views.',
    relatedTerms: ['sidebar', 'agent', 'terminal'],
    category: 'technical'
  },
  {
    id: 'status',
    term: 'Status',
    definition: 'An agent\'s current state. "Online" means the agent is running in an active session. "Hibernated" means the session is paused but memory is preserved. "Offline" means the session ended.',
    relatedTerms: ['agent', 'hibernation', 'session'],
    category: 'core'
  },
  {
    id: 'skills',
    term: 'Skills',
    definition: 'Abilities installed on agents that extend their capabilities. Skills include messaging, memory search, graph query, and docs search. Install skills to give agents new powers.',
    relatedTerms: ['agent', 'tools', 'messaging'],
    category: 'technical'
  },
  {
    id: 'profile',
    term: 'Profile',
    definition: 'An agent\'s configuration page showing its name, working directory, creation date, and statistics. Access it by clicking the agent\'s name or the gear icon. Manage or rename agents here.',
    relatedTerms: ['agent', 'settings'],
    category: 'core'
  },
  {
    id: 'collaboration',
    term: 'Collaboration',
    definition: 'When multiple agents work together on a project. Agents can send messages to each other, share context, and divide tasks. Each agent focuses on its specialty while coordinating with others.',
    relatedTerms: ['messaging', 'agent'],
    category: 'communication'
  },
  {
    id: 'alternate-screen',
    term: 'Alternate Screen',
    definition: 'A separate display buffer used by full-screen apps like Claude Code. When you scroll but see shell history instead of Claude output, this is why. Use tmux copy mode (Ctrl+B, [) to scroll the alternate screen.',
    relatedTerms: ['tmux', 'terminal', 'copy-mode'],
    category: 'technical'
  },
  {
    id: 'copy-mode',
    term: 'Copy Mode',
    definition: 'A tmux feature for scrolling and selecting text. Enter with Ctrl+B then [. Use arrow keys or PageUp/Down to scroll. Press q to exit. Essential for viewing history when Claude Code is running.',
    relatedTerms: ['tmux', 'alternate-screen', 'terminal'],
    category: 'technical'
  },
  {
    id: 'websocket',
    term: 'WebSocket',
    definition: 'The connection technology between your browser and AI Maestro. If you see connection errors, the WebSocket may have dropped. Refresh the page to reconnect. Agents keep running even if the connection drops.',
    relatedTerms: ['terminal', 'dashboard'],
    category: 'technical'
  },
  {
    id: 'port',
    term: 'Port',
    definition: 'AI Maestro runs on port 23000 by default (http://localhost:23000). If you get "port in use" errors, another app is using that port. Find it with "lsof -i :23000" and close it, or use a different port.',
    relatedTerms: ['dashboard'],
    category: 'technical'
  },
  {
    id: 'wsl2',
    term: 'WSL2',
    definition: 'Windows Subsystem for Linux version 2 - Microsoft\'s solution for running Linux tools on Windows. AI Maestro requires WSL2 on Windows because tmux is a Linux tool. Install with "wsl --install" in PowerShell.',
    relatedTerms: ['tmux', 'terminal'],
    category: 'technical'
  },
  {
    id: 'tailscale',
    term: 'Tailscale',
    definition: 'A free VPN service that creates a secure private network between your devices. Use Tailscale to access AI Maestro from mobile devices, other computers, or when traveling. Works from anywhere with internet.',
    relatedTerms: ['remote-host', 'host'],
    category: 'technical'
  },
  {
    id: 'pm2',
    term: 'PM2',
    definition: 'A process manager that keeps AI Maestro running in the background. Restart with "pm2 restart ai-maestro", check status with "pm2 status", and view logs with "pm2 logs ai-maestro".',
    relatedTerms: ['dashboard'],
    category: 'technical'
  },
  {
    id: 'local-network-privacy',
    term: 'Local Network Privacy',
    definition: 'A macOS 15+ security feature that can block apps from accessing other devices on your network. If remote hosts show "connection refused", go to System Settings > Privacy & Security > Local Network and enable access for Terminal.',
    relatedTerms: ['remote-host', 'host'],
    category: 'technical'
  },
]

export const glossaryCategories: Record<string, string> = {
  'core': 'Core Concepts',
  'tools': 'Agent Tools',
  'communication': 'Communication',
  'technical': 'Technical'
}
