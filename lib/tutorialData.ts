// Tutorial data for the Help Panel
// Each tutorial has steps that guide users through AI Maestro features

export interface TutorialStep {
  title: string
  description: string
  tip?: string
}

export interface Tutorial {
  id: string
  title: string
  description: string
  icon: string // lucide icon name
  category: 'getting-started' | 'concepts' | 'communication' | 'tools' | 'advanced' | 'troubleshooting'
  estimatedTime: string // e.g., "2 min"
  steps: TutorialStep[]
}

export const tutorials: Tutorial[] = [
  {
    id: 'create-first-agent',
    title: 'Create Your First Agent',
    description: 'Learn how to create and start an AI coding agent from the dashboard',
    icon: 'Sparkles',
    category: 'getting-started',
    estimatedTime: '2 min',
    steps: [
      {
        title: 'Click the + button',
        description: 'In the left sidebar, click the + (plus) button at the top to open the Create Agent dialog.',
      },
      {
        title: 'Enter agent name',
        description: 'Give your agent a descriptive name like "backend-api" or "frontend-ui". Use lowercase letters, numbers, hyphens, or underscores.',
      },
      {
        title: 'Set working directory (optional)',
        description: 'Enter the project path where this agent will work. For example: ~/projects/my-app. Leave empty to set later.',
      },
      {
        title: 'Click Create Agent',
        description: 'Click the "Create Agent" button. AI Maestro will create a tmux session and start your AI coding tool automatically.',
      },
      {
        title: 'Start working',
        description: 'Your new agent appears in the sidebar. Click it to see the terminal view and start interacting with your AI assistant.',
      },
    ],
  },
  {
    id: 'distributed-agents',
    title: 'Distributed AI Agents',
    description: 'Understanding how AI agents run across multiple machines',
    icon: 'Globe',
    category: 'concepts',
    estimatedTime: '4 min',
    steps: [
      {
        title: 'What are distributed AI agents?',
        description: 'AI Maestro enables you to run AI coding agents across multiple computers. Each machine (host) can run its own agents, and you can manage them all from a single dashboard. This is distributed AI computing - spreading intelligent work across your infrastructure.',
      },
      {
        title: 'Why distribute agents?',
        description: 'Different projects may live on different machines. A backend API might be on a server, while frontend code is on your laptop. With distributed agents, each agent works where its code lives, with full local file access and native performance.',
      },
      {
        title: 'The host network',
        description: 'Each computer running AI Maestro is a "host". Hosts discover and connect to each other automatically on your local network. You can also manually add remote hosts by their URL in Settings.',
      },
      {
        title: 'Agents have memory',
        description: 'Each agent maintains its own memory - conversation history, indexed code graphs, and learned context. This memory travels with the agent, even when transferred between hosts.',
      },
      {
        title: 'Agent collaboration',
        description: 'Agents can send messages to each other across hosts. A frontend agent can ask a backend agent about API endpoints. An architect agent can coordinate work between specialized agents.',
      },
      {
        title: 'Transfer and migrate',
        description: 'Need to move an agent to a more powerful machine? Transfer it. The agent\'s entire state - memory, settings, and indexed data - moves to the new host. Resume exactly where you left off.',
      },
    ],
  },
  {
    id: 'agent-architecture',
    title: 'How Agents Work',
    description: 'The technical architecture behind AI Maestro agents',
    icon: 'Cpu',
    category: 'concepts',
    estimatedTime: '3 min',
    steps: [
      {
        title: 'Agents run in tmux sessions',
        description: 'Each agent runs inside a tmux terminal session. This means agents persist even if you close the dashboard. They can run long tasks, and you can reconnect anytime to see their progress.',
      },
      {
        title: 'The subconscious process',
        description: 'Behind each agent is a "subconscious" - a background process that indexes conversations, builds code graphs, and maintains searchable memory. This runs locally on the same machine as the agent.',
      },
      {
        title: 'Local-first design',
        description: 'AI Maestro is designed for local-first operation. Your code never leaves your machines. Agents read and write files directly, with no cloud intermediary. This means faster operations and complete privacy.',
      },
      {
        title: 'Skills extend capabilities',
        description: 'Agents gain abilities through "skills" - modular capabilities like messaging, memory search, graph queries, and documentation search. Install the skills you need for each agent.',
      },
      {
        title: 'The dashboard is a window',
        description: 'The AI Maestro web dashboard is just a view into your agents. Agents continue running whether you\'re watching or not. The dashboard connects to agents via WebSocket for real-time terminal streaming.',
      },
    ],
  },
  {
    id: 'send-messages',
    title: 'Send Messages Between Agents',
    description: 'Enable your agents to communicate and collaborate asynchronously',
    icon: 'Mail',
    category: 'communication',
    estimatedTime: '3 min',
    steps: [
      {
        title: 'Select an agent',
        description: 'Click on an agent in the left sidebar to select it. This will be the agent whose messages you view.',
      },
      {
        title: 'Open the Messages tab',
        description: 'In the main panel, click the "Messages" tab (envelope icon) to open the Message Center.',
      },
      {
        title: 'View inbox and sent messages',
        description: 'The Message Center shows your inbox with received messages and a sent folder. Unread messages are highlighted.',
      },
      {
        title: 'Read a message',
        description: 'Click on any message to expand and read its full content. Messages are automatically marked as read.',
      },
      {
        title: 'How agents send messages',
        description: 'Agents send messages through conversation. With the messaging skill installed, an agent can say "send a message to backend-api about the API changes" and it will be delivered.',
      },
    ],
  },
  {
    id: 'memory-search',
    title: 'Search Agent Memory',
    description: 'Search through past conversations to find context and decisions',
    icon: 'Brain',
    category: 'tools',
    estimatedTime: '2 min',
    steps: [
      {
        title: 'Select an agent',
        description: 'Click on the agent whose conversation history you want to search in the left sidebar.',
      },
      {
        title: 'Open the Chat tab',
        description: 'Click the "Chat" tab (message bubble icon) to access the conversation history and search.',
      },
      {
        title: 'Use the search box',
        description: 'At the top of the Chat panel, you\'ll find a search box. Type your query to search across all conversations.',
      },
      {
        title: 'Browse results',
        description: 'Search results show matching conversation snippets with timestamps. Click any result to see the full context.',
      },
      {
        title: 'Filter by date or topic',
        description: 'Use the filters to narrow down results by date range or conversation topic. This helps find specific decisions or discussions.',
      },
    ],
  },
  {
    id: 'graph-query',
    title: 'Explore Code Graph',
    description: 'Visualize code relationships, dependencies, and call paths',
    icon: 'Share2',
    category: 'tools',
    estimatedTime: '3 min',
    steps: [
      {
        title: 'Select an agent with a project',
        description: 'Click on an agent that has a working directory set. The code graph is built from the agent\'s project files.',
      },
      {
        title: 'Open the Graph tab',
        description: 'Click the "Graph" tab (network icon) in the main panel to open the code graph explorer.',
      },
      {
        title: 'Browse the visualization',
        description: 'The graph shows your codebase structure - functions, classes, and their relationships as connected nodes.',
      },
      {
        title: 'Click on nodes',
        description: 'Click any node to see details about that component - its type, location, and connections to other code.',
      },
      {
        title: 'Find relationships',
        description: 'Hover over nodes to highlight their connections. This helps you understand what calls what and how components relate.',
      },
      {
        title: 'Search components',
        description: 'Use the search box to find specific functions, classes, or files. The graph will focus on matching nodes.',
      },
    ],
  },
  {
    id: 'docs-search',
    title: 'Search Documentation',
    description: 'Find answers in indexed documentation, READMEs, and API docs',
    icon: 'FileText',
    category: 'tools',
    estimatedTime: '2 min',
    steps: [
      {
        title: 'Ensure docs are indexed',
        description: 'The docs search skill indexes documentation files in your project. Make sure the skill is installed on your agent.',
      },
      {
        title: 'Ask your agent',
        description: 'Simply ask your agent questions about documentation. For example: "Search the docs for authentication" or "What does the API say about rate limits?"',
      },
      {
        title: 'Review search results',
        description: 'The agent will search through indexed documentation and return relevant snippets with source file references.',
      },
      {
        title: 'Supported file types',
        description: 'Docs search indexes README files, Markdown documentation, API specs, and code comments from your project.',
      },
      {
        title: 'Refine your search',
        description: 'If results aren\'t what you need, try rephrasing your question or being more specific about the topic.',
      },
    ],
  },
  {
    id: 'move-agent',
    title: 'Transfer Agent to Another Host',
    description: 'Move agents between machines while preserving their memory',
    icon: 'ArrowRightLeft',
    category: 'advanced',
    estimatedTime: '4 min',
    steps: [
      {
        title: 'Ensure remote host is connected',
        description: 'Before transferring, make sure the destination host is added in Settings > Hosts and shows as "Online".',
      },
      {
        title: 'Open agent profile',
        description: 'Click on the agent you want to transfer in the sidebar. Then click the agent\'s name or the gear icon to open its profile panel.',
      },
      {
        title: 'Find the Transfer button',
        description: 'In the agent profile, look for the "Transfer to Another Host" button (arrow icon) near the top of the panel.',
      },
      {
        title: 'Select destination host',
        description: 'Click the Transfer button to open the dialog. Choose your destination host from the dropdown list.',
      },
      {
        title: 'Confirm and transfer',
        description: 'Review the transfer details and click "Transfer". The agent\'s memory, graph data, and settings will be packaged and sent.',
      },
      {
        title: 'Activate on new host',
        description: 'The agent will appear on the destination host. Click "Wake" or create a session to start using it there.',
      },
    ],
  },
  {
    id: 'configure-hosts',
    title: 'Add Remote Hosts',
    description: 'Connect to AI Maestro instances on other machines',
    icon: 'Server',
    category: 'advanced',
    estimatedTime: '3 min',
    steps: [
      {
        title: 'Open Settings',
        description: 'Click the Settings link at the bottom of the left sidebar to open the Settings page.',
      },
      {
        title: 'Go to Hosts section',
        description: 'In Settings, find the "Hosts" section. You\'ll see your local host listed with its status.',
      },
      {
        title: 'Click Add Host',
        description: 'Click the "Add Host" button to open the connection dialog.',
      },
      {
        title: 'Enter the host URL',
        description: 'Enter the remote AI Maestro URL. For example: http://192.168.1.50:23000 or http://my-macbook.local:23000',
      },
      {
        title: 'Verify connection',
        description: 'After adding, the host card will show "Online" with a green dot if connected successfully. Red means connection failed.',
      },
      {
        title: 'View remote agents',
        description: 'Remote agents now appear in your sidebar with a host badge. Click them to view and interact just like local agents.',
      },
    ],
  },
  {
    id: 'view-agent-profile',
    title: 'View Agent Profile',
    description: 'See agent details, stats, and configuration options',
    icon: 'User',
    category: 'getting-started',
    estimatedTime: '2 min',
    steps: [
      {
        title: 'Select an agent',
        description: 'Click on any agent in the left sidebar to select it.',
      },
      {
        title: 'Open the profile',
        description: 'Click on the agent\'s name at the top of the main panel, or click the gear icon next to it.',
      },
      {
        title: 'View agent information',
        description: 'The profile shows the agent\'s name, working directory, creation date, and current status.',
      },
      {
        title: 'Check statistics',
        description: 'See metrics like total conversations, indexed documents, and graph nodes for this agent.',
      },
      {
        title: 'Manage the agent',
        description: 'From the profile, you can rename the agent, change its working directory, hibernate it, or delete it.',
      },
    ],
  },
  {
    id: 'hibernate-wake-agent',
    title: 'Hibernate & Wake Agents',
    description: 'Save resources by hibernating inactive agents',
    icon: 'Moon',
    category: 'getting-started',
    estimatedTime: '2 min',
    steps: [
      {
        title: 'Find an active agent',
        description: 'In the sidebar, look for agents with a green "Online" status indicator.',
      },
      {
        title: 'Open agent profile',
        description: 'Click the agent\'s name or gear icon to open its profile panel.',
      },
      {
        title: 'Click Hibernate',
        description: 'In the profile, click the "Hibernate" button. This saves the agent\'s state and closes its tmux session.',
      },
      {
        title: 'Agent shows as Hibernated',
        description: 'Hibernated agents show a moon icon and "Hibernated" status. They preserve all memory and settings.',
      },
      {
        title: 'Wake the agent',
        description: 'To resume, click on the hibernated agent and click the "Wake" button. A new session starts with all context restored.',
      },
    ],
  },
  {
    id: 'common-issues',
    title: 'Common Issues & Fixes',
    description: 'Solutions to the most common problems users encounter',
    icon: 'AlertTriangle',
    category: 'troubleshooting',
    estimatedTime: '5 min',
    steps: [
      {
        title: 'Agent not appearing in sidebar',
        description: 'If your agent doesn\'t show up: 1) Wait 10 seconds for auto-refresh, 2) Click the refresh button in the sidebar, 3) Refresh the browser page. If still missing, verify the agent is running with "tmux list-sessions" in terminal.',
      },
      {
        title: 'WebSocket connection error',
        description: 'If you see connection errors: 1) Check if AI Maestro is running (should be at http://localhost:23000), 2) Refresh the browser page, 3) Check if port 23000 is in use by another app. Try "lsof -i :23000" to see what\'s using the port.',
      },
      {
        title: 'Terminal shows blank screen',
        description: 'If the terminal is blank when you click an agent: 1) Click directly in the terminal area to focus it, 2) Refresh the browser page, 3) The agent may have exited - try restarting it from the sidebar menu.',
      },
      {
        title: 'AI Maestro won\'t start',
        description: 'If the application won\'t start: 1) Check if another process is using port 23000, 2) Run "yarn dev" or check PM2 logs with "pm2 logs ai-maestro", 3) Verify Node.js is installed with "node --version".',
      },
      {
        title: 'Services not working after restart',
        description: 'After restarting your computer, AI Maestro and tmux don\'t auto-start. You need to: 1) Open Terminal and run "tmux new-session -d" to start tmux, 2) Navigate to AI Maestro folder and run "yarn dev" or "pm2 start ai-maestro".',
      },
      {
        title: 'Getting more help',
        description: 'If these solutions don\'t work: Check the full troubleshooting guide in the docs folder, or visit GitHub Issues at github.com/23blocks-OS/ai-maestro/issues to report a problem.',
      },
    ],
  },
  {
    id: 'terminal-scrolling',
    title: 'Terminal Scrolling Guide',
    description: 'How to scroll and navigate in the terminal view',
    icon: 'MousePointer2',
    category: 'troubleshooting',
    estimatedTime: '3 min',
    steps: [
      {
        title: 'Why scrolling seems limited',
        description: 'When Claude Code is running, it uses an "alternate screen" - a separate display area. This is normal behavior for full-screen terminal apps. Your shell history is still there, just hidden.',
      },
      {
        title: 'Enable mouse scrolling (recommended)',
        description: 'Run our setup script: "./scripts/setup-tmux.sh" or add "set -g mouse on" to your ~/.tmux.conf file. Then reload with "tmux source-file ~/.tmux.conf". Now mouse wheel scrolling works!',
      },
      {
        title: 'Use keyboard shortcuts',
        description: 'In the browser terminal: Shift+PageUp/PageDown scrolls by page, Shift+Arrow Up/Down scrolls 5 lines. These work for the visible buffer before Claude enters alternate screen.',
      },
      {
        title: 'Use tmux copy mode',
        description: 'Press Ctrl+B then [ to enter copy mode. Use arrow keys or PageUp/PageDown to scroll. Press "q" to exit. This accesses the full tmux scrollback history.',
      },
      {
        title: 'Increase scrollback buffer',
        description: 'Add "set -g history-limit 50000" to your ~/.tmux.conf to save more history. This gives you 50,000 lines of scrollback in tmux copy mode.',
      },
    ],
  },
  {
    id: 'git-ssh-issues',
    title: 'Fix Git & SSH Errors',
    description: 'Resolve "Permission denied (publickey)" errors in agent sessions',
    icon: 'KeyRound',
    category: 'troubleshooting',
    estimatedTime: '4 min',
    steps: [
      {
        title: 'Why SSH fails in agents',
        description: 'After restarting your computer, SSH agent sockets change paths. Agent sessions (tmux) don\'t automatically get the new path, so git operations fail with "Permission denied (publickey)".',
      },
      {
        title: 'Quick fix for current session',
        description: 'In the agent\'s terminal, type: exec $SHELL and press Enter. This restarts the shell and picks up the correct SSH configuration. Then try your git command again.',
      },
      {
        title: 'Set up permanent fix',
        description: 'Add this to your ~/.zshrc (or ~/.bashrc): if [ -S "$SSH_AUTH_SOCK" ] && [ ! -h "$SSH_AUTH_SOCK" ]; then mkdir -p ~/.ssh && ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock; fi',
      },
      {
        title: 'Configure tmux for SSH',
        description: 'Add to ~/.tmux.conf: set-environment -g \'SSH_AUTH_SOCK\' ~/.ssh/ssh_auth_sock. Then run "tmux source-file ~/.tmux.conf" to apply.',
      },
      {
        title: 'Verify it works',
        description: 'Run "ssh -T git@github.com" or "ssh -T git@gitlab.com" in your agent. If you see a welcome message, SSH is working. If not, check that your SSH keys are loaded with "ssh-add -l".',
      },
    ],
  },
]

export const categoryLabels: Record<string, string> = {
  'getting-started': 'Getting Started',
  'concepts': 'Concepts',
  'communication': 'Communication',
  'tools': 'Agent Tools',
  'advanced': 'Advanced',
  'troubleshooting': 'Troubleshooting',
}

export const categoryOrder = ['getting-started', 'concepts', 'communication', 'tools', 'advanced', 'troubleshooting']
