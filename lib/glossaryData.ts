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
    id: 'agent',
    term: 'Agent',
    definition: 'An AI coding assistant that runs in its own tmux session. Each agent has its own memory, working directory, and can communicate with other agents. Agents persist their state even when hibernated.',
    relatedTerms: ['session', 'tmux', 'hibernation'],
    category: 'core'
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
    definition: 'A tool that searches through indexed documentation. Agents can query API docs, README files, and other documentation to understand how to use libraries and frameworks.',
    relatedTerms: ['documentation', 'search', 'api'],
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
]

export const glossaryCategories: Record<string, string> = {
  'core': 'Core Concepts',
  'tools': 'Agent Tools',
  'communication': 'Communication',
  'technical': 'Technical'
}
