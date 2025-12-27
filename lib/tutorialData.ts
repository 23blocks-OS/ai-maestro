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
  category: 'getting-started' | 'communication' | 'tools' | 'advanced'
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
]

export const categoryLabels: Record<string, string> = {
  'getting-started': 'Getting Started',
  'communication': 'Communication',
  'tools': 'Agent Tools',
  'advanced': 'Advanced',
}

export const categoryOrder = ['getting-started', 'communication', 'tools', 'advanced']
