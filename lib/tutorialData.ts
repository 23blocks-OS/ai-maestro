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
    description: 'Learn how to spin up an AI coding agent in a tmux session',
    icon: 'Sparkles',
    category: 'getting-started',
    estimatedTime: '3 min',
    steps: [
      {
        title: 'Open a terminal',
        description: 'You can use the built-in terminal or any terminal app on your machine.',
      },
      {
        title: 'Create a tmux session',
        description: 'Run the following command to create a named tmux session:',
        tip: 'tmux new-session -s my-agent',
      },
      {
        title: 'Start your AI tool',
        description: 'Inside the tmux session, start Claude Code, Aider, or your preferred AI coding assistant:',
        tip: 'claude',
      },
      {
        title: 'Check the sidebar',
        description: 'Your new agent should appear in the left sidebar within a few seconds. AI Maestro auto-discovers tmux sessions.',
      },
      {
        title: 'Click to connect',
        description: 'Click on your agent in the sidebar to view its terminal output and interact with it through the dashboard.',
      },
    ],
  },
  {
    id: 'send-messages',
    title: 'Send Messages Between Agents',
    description: 'Enable your agents to communicate and collaborate asynchronously',
    icon: 'Mail',
    category: 'communication',
    estimatedTime: '4 min',
    steps: [
      {
        title: 'Understand agent messaging',
        description: 'Agents can send messages to each other even when working on different tasks. Messages are stored and delivered when the recipient is ready.',
      },
      {
        title: 'Open Message Center',
        description: 'Click the "Messages" tab in the main panel to see your inbox and sent messages.',
      },
      {
        title: 'Send via CLI (agent terminal)',
        description: 'From inside an agent\'s tmux session, use the messaging script:',
        tip: 'send-aimaestro-message.sh backend-api "Need API docs" "Please share the auth endpoint docs"',
      },
      {
        title: 'Check for messages',
        description: 'Agents can check their inbox with:',
        tip: 'check-aimaestro-messages.sh',
      },
      {
        title: 'Use natural language (with skill)',
        description: 'If the agent-messaging skill is installed, agents can simply say "send a message to backend-api about the auth endpoint" in conversation.',
      },
    ],
  },
  {
    id: 'memory-search',
    title: 'Use the Memory Search Tool',
    description: 'Search through past conversations to find context and decisions',
    icon: 'Brain',
    category: 'tools',
    estimatedTime: '3 min',
    steps: [
      {
        title: 'What is Memory Search?',
        description: 'Memory Search indexes all your agent conversations, allowing semantic search across past discussions, decisions, and code changes.',
      },
      {
        title: 'Open the Memory tab',
        description: 'Select an agent and click the "Memory" or search icon to access conversation search.',
      },
      {
        title: 'Search via CLI',
        description: 'From an agent\'s terminal, search past conversations:',
        tip: 'memory-search.sh "authentication implementation"',
      },
      {
        title: 'Use natural language',
        description: 'With the memory-search skill installed, agents can say "search my memory for when we discussed database schemas".',
      },
      {
        title: 'Review results',
        description: 'Results show relevant conversation snippets with timestamps. Click to view full context.',
      },
    ],
  },
  {
    id: 'graph-query',
    title: 'Use the Graph Query Tool',
    description: 'Explore code relationships, dependencies, and call paths',
    icon: 'Share2',
    category: 'tools',
    estimatedTime: '4 min',
    steps: [
      {
        title: 'What is Graph Query?',
        description: 'The code graph indexes your codebase structure - functions, classes, imports, and their relationships. Query it to understand impact and dependencies.',
      },
      {
        title: 'Index your codebase',
        description: 'The graph is built automatically when you run index-delta. Ensure your agent has a working directory set.',
      },
      {
        title: 'Find callers of a function',
        description: 'Discover what calls a specific function:',
        tip: 'graph-find-callers.sh authenticate',
      },
      {
        title: 'Find related components',
        description: 'See what\'s connected to a component:',
        tip: 'graph-find-related.sh UserService',
      },
      {
        title: 'Describe a component',
        description: 'Get a full description of a class or function:',
        tip: 'graph-describe.sh PaymentController',
      },
      {
        title: 'Use the Graph tab',
        description: 'Click the "Graph" tab to visually explore relationships in your codebase.',
      },
    ],
  },
  {
    id: 'move-agent',
    title: 'Move an Agent to Another Host',
    description: 'Transfer agents between machines while preserving their memory',
    icon: 'ArrowRightLeft',
    category: 'advanced',
    estimatedTime: '5 min',
    steps: [
      {
        title: 'Prerequisites',
        description: 'Both hosts must have AI Maestro installed and be able to reach each other (same network or Tailscale).',
      },
      {
        title: 'Register the remote host',
        description: 'Go to Settings > Hosts and add the remote host\'s URL (e.g., http://192.168.1.50:23000 or http://macbook.tail1234.ts.net:23000).',
      },
      {
        title: 'Open agent profile',
        description: 'Click the agent you want to transfer in the sidebar, then click the agent name or gear icon to open its profile.',
      },
      {
        title: 'Find Transfer option',
        description: 'Scroll to the "Danger Zone" section and click "Transfer to Another Host".',
      },
      {
        title: 'Select destination',
        description: 'Choose the target host from the dropdown. The agent\'s memory, graph, and docs will be packaged and sent.',
      },
      {
        title: 'Complete on remote',
        description: 'On the destination host, create a tmux session with the same name to activate the transferred agent.',
      },
    ],
  },
  {
    id: 'configure-hosts',
    title: 'Configure Remote Hosts',
    description: 'Connect multiple AI Maestro instances for distributed agent management',
    icon: 'Server',
    category: 'advanced',
    estimatedTime: '4 min',
    steps: [
      {
        title: 'Why remote hosts?',
        description: 'AI Maestro can connect to other instances running on different machines, letting you view and manage all your agents from one dashboard.',
      },
      {
        title: 'Open Settings',
        description: 'Click the gear icon or navigate to Settings in the sidebar.',
      },
      {
        title: 'Go to Hosts section',
        description: 'Find the "Hosts" tab to see your current host and add new ones.',
      },
      {
        title: 'Add a remote host',
        description: 'Click "Add Host" and enter the remote instance\'s URL:',
        tip: 'http://remote-machine:23000',
      },
      {
        title: 'Verify connection',
        description: 'The host card will show "Online" with a green indicator if connected successfully.',
      },
      {
        title: 'View remote agents',
        description: 'Remote agents appear in your sidebar with a host badge. Click to interact just like local agents.',
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
