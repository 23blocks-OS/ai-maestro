/**
 * AI Maestro Transfer Animation Delight
 *
 * Witty, memorable content for the agent transfer experience.
 * Makes moving agents between computers feel like a Pixar short film.
 */

export interface TransferPhaseContent {
  icon: string              // Emoji or icon identifier
  messages: string[]        // Rotating status messages
  visualGags: VisualGag[]   // Small visual jokes/details
  soundEffect?: string      // Suggested sound (CSS animation hint)
  color: string             // Theme color for this phase
}

export interface VisualGag {
  element: string           // What element to show
  timing: string            // When to show it (start, middle, end)
  description: string       // What it does/looks like
  cssHint: string           // Animation class name hint
}

export interface EasterEgg {
  trigger: string           // What triggers it
  effect: string            // What happens
  rarity: 'common' | 'rare' | 'legendary'
}

/**
 * Agent Personality Trait
 * Determines how the agent "acts" during transfer
 */
export type AgentPersonality =
  | 'meticulous'      // Super organized, checks everything twice
  | 'speedrunner'     // Gotta go fast
  | 'anxious'         // Nervous but excited
  | 'zen'             // Calm and philosophical
  | 'chaotic'         // Barely organized mess that somehow works

/**
 * Witty status messages for each transfer phase
 */
export const TRANSFER_MESSAGES: Record<string, TransferPhaseContent> = {
  PACKING: {
    icon: '🎒',
    color: 'blue',
    messages: [
      'Packing memories and git stashes...',
      'Folding code, rolling up dependencies...',
      'Checking under the couch for lost commits...',
      'Saving all the good Stack Overflow links...',
      'Triple-checking the .gitignore packing list...',
      'Compressing 47 node_modules folders... this may take a while...',
      'Packing conversation history (and the embarrassing bugs)...',
      'Rolling up terminal scrollback like a sleeping bag...',
      'Stuffing environment variables into a bindle...',
      'Zipping up unfinished TODOs and broken promises...',
    ],
    visualGags: [
      {
        element: '📦 Box',
        timing: 'start',
        description: 'Empty moving box appears and items drop into it',
        cssHint: 'slide-in-box'
      },
      {
        element: '📚 Git repos',
        timing: 'middle',
        description: 'Small book icons fall into the box',
        cssHint: 'falling-items'
      },
      {
        element: '💭 Memory bubbles',
        timing: 'middle',
        description: 'Thought bubbles with code snippets float by',
        cssHint: 'float-memories'
      },
      {
        element: '✅ Checklist',
        timing: 'end',
        description: 'Checklist appears with items checking off rapidly',
        cssHint: 'check-off-items'
      }
    ],
    soundEffect: 'rustle-zip'
  },

  TRAVELING: {
    icon: '🚀',
    color: 'purple',
    messages: [
      'Yeeting through the network at light speed...',
      'Taking the scenic route through 47 routers...',
      'Experiencing mild TCP turbulence...',
      'Admiring the internet tubes on the way...',
      'Catching a ride on a friendly data packet...',
      'Avoiding CORS errors and firewall dragons...',
      'Tunneling through SSH like a digital gopher...',
      'Making friends with DNS servers along the way...',
      'Surfing the information superhighway (very cool, much rad)...',
      'Hitching a ride on the electron express...',
      'Teleporting through the wires... almost there!',
      'Dodging spam bots and malware on route 443...',
    ],
    visualGags: [
      {
        element: '🚀 Rocket ship',
        timing: 'start',
        description: 'Box transforms into rocket, blasts off',
        cssHint: 'rocket-launch'
      },
      {
        element: '⭐ Stars',
        timing: 'middle',
        description: 'Streaming star field like hyperspace',
        cssHint: 'star-stream'
      },
      {
        element: '🌐 Network nodes',
        timing: 'middle',
        description: 'Connection lines between network nodes',
        cssHint: 'network-traverse'
      },
      {
        element: '📡 Signal waves',
        timing: 'end',
        description: 'Radio waves emanating as it approaches destination',
        cssHint: 'signal-pulse'
      }
    ],
    soundEffect: 'whoosh-beep'
  },

  ARRIVING: {
    icon: '🎉',
    color: 'green',
    messages: [
      'Sticking the landing like a git merge...',
      'Unpacking in the new /home/sweet/home...',
      'Shaking hands with the local package manager...',
      'Checking WiFi signal... Excellent!',
      'Introducing self to resident processes...',
      'Sniffing around the new working directory...',
      'Testing the coffee machine (critical infrastructure)...',
      'Making friends with localhost:23000...',
      'Getting the keys to /etc/hosts...',
      'Settling into the new tmux session neighborhood...',
      'Hanging code review certificates on the wall...',
    ],
    visualGags: [
      {
        element: '🎊 Confetti',
        timing: 'start',
        description: 'Confetti burst on landing',
        cssHint: 'confetti-explosion'
      },
      {
        element: '🏠 House',
        timing: 'start',
        description: 'Cute house icon with door opening',
        cssHint: 'door-open'
      },
      {
        element: '📦 Box unpacking',
        timing: 'middle',
        description: 'Box opens and items float up to their spots',
        cssHint: 'unpack-items'
      },
      {
        element: '👋 Welcome banner',
        timing: 'middle',
        description: 'Welcome banner unfurls at top',
        cssHint: 'banner-unfurl'
      },
      {
        element: '✨ Sparkles',
        timing: 'end',
        description: 'Gentle sparkle effect around completed setup',
        cssHint: 'sparkle-finish'
      }
    ],
    soundEffect: 'tada-chime'
  },

  READY: {
    icon: '✅',
    color: 'emerald',
    messages: [
      'All systems operational. Coffee optional but recommended.',
      'Ready to ship bugs... er, features!',
      'Prepared to accept git blame with dignity.',
      'Warmed up and ready to turn coffee into code.',
      'Standing by to make computers do the thing.',
      'Locked, loaded, and fully linted.',
      'Dependencies installed, hopes and dreams intact.',
      'Ready to Stack Overflow with the best of them.',
      'Prepared to git commit -m "fix stuff"',
      'All tests passing (narrator: they were not passing).',
    ],
    visualGags: [
      {
        element: '🎯 Target locked',
        timing: 'start',
        description: 'Targeting reticle focusing on "ready" state',
        cssHint: 'target-lock'
      },
      {
        element: '💚 Health bar',
        timing: 'start',
        description: 'RPG-style health/status bars fill up',
        cssHint: 'status-bars-fill'
      },
      {
        element: '⚡ Power-up',
        timing: 'middle',
        description: 'Video game power-up effect',
        cssHint: 'power-up-glow'
      },
      {
        element: '🎮 Ready player one',
        timing: 'end',
        description: 'Classic "Press Start" button pulses',
        cssHint: 'press-start'
      }
    ],
    soundEffect: 'power-up'
  },

  ERROR: {
    icon: '😅',
    color: 'orange',
    messages: [
      'Oops! Agent got distracted by a cat video...',
      'The internet hamsters are on strike. Retrying...',
      'Got lost in a DNS maze. Asking for directions...',
      'Agent stubbed its toe on a 404. Minor setback.',
      'Encountered a wild CORS error. It was super effective!',
      'The moving truck hit traffic (network timeout).',
      'Agent forgot to pack the authentication tokens. Face palm.',
      'Destination host playing hard to get. Trying sweet talk...',
      'SSH keys locked in the car. Calling a locksmith...',
      'Transfer wizard accidentally turned agent into a newt... it got better.',
      'Ran into a firewall. Literal wall. Should have made a left.',
      'Agent needed a coffee break. Very relatable.',
    ],
    visualGags: [
      {
        element: '🤕 Band-aid',
        timing: 'start',
        description: 'Cute band-aid appears on the box',
        cssHint: 'band-aid-appear'
      },
      {
        element: '❓ Question marks',
        timing: 'start',
        description: 'Confused question marks float around',
        cssHint: 'confused-float'
      },
      {
        element: '🔧 Tool kit',
        timing: 'middle',
        description: 'Wrench and screwdriver trying to fix things',
        cssHint: 'repair-attempt'
      },
      {
        element: '☕ Coffee cup',
        timing: 'middle',
        description: 'Agent taking a stress coffee break',
        cssHint: 'coffee-sip'
      },
      {
        element: '🔄 Retry button',
        timing: 'end',
        description: 'Big friendly retry button with bounce',
        cssHint: 'retry-bounce'
      }
    ],
    soundEffect: 'bonk-recovery'
  }
}

/**
 * Random item names for packing phase
 */
export const PACKING_ITEMS = [
  'git commit messages',
  'TODO comments from 2019',
  'Stack Overflow bookmarks',
  'crusty env variables',
  'half-finished refactors',
  'optimistic test cases',
  'deprecated dependencies',
  'commented-out code (just in case)',
  'unused imports',
  'console.log statements',
  'merge conflict scars',
  'production hotfixes',
  'shameful workarounds',
  'brilliant 3am ideas',
  'unread Slack threads',
]

/**
 * Easter eggs to discover
 */
export const EASTER_EGGS: EasterEgg[] = [
  {
    trigger: 'Transfer on Friday after 4pm',
    effect: 'Agent nervously asks "Are you SURE? It\'s Friday afternoon..."',
    rarity: 'common'
  },
  {
    trigger: 'Transfer fails 3 times in a row',
    effect: 'Agent suggests "Have you tried turning it off and on again?"',
    rarity: 'common'
  },
  {
    trigger: 'Transfer during midnight-2am',
    effect: 'Agent whispers "Why are we still up? Bad life choices were made."',
    rarity: 'common'
  },
  {
    trigger: 'Agent named "production" or "prod"',
    effect: 'Extra scary warning: "PRODUCTION?! 😱 Better test this first..."',
    rarity: 'rare'
  },
  {
    trigger: 'Transfer completes in under 5 seconds',
    effect: 'Agent: "That was... suspiciously fast. Did we forget something?"',
    rarity: 'rare'
  },
  {
    trigger: 'Transfer on the 42nd minute of any hour',
    effect: 'Agent references Hitchhiker\'s Guide: "Don\'t panic! Bringing towel..."',
    rarity: 'rare'
  },
  {
    trigger: 'Agent alias contains "test"',
    effect: 'Agent jokes: "Good thing we\'re just testing... right? ...RIGHT?"',
    rarity: 'common'
  },
  {
    trigger: '10th successful transfer (tracked in localStorage)',
    effect: 'Achievement unlocked: "Frequent Flyer" with airline miles visual',
    rarity: 'legendary'
  },
  {
    trigger: 'Transfer on user\'s birthday (if set in preferences)',
    effect: '🎂 Birthday cake appears: "Happy birthday! Want to celebrate by... moving agents?"',
    rarity: 'legendary'
  },
  {
    trigger: 'Konami code entered during transfer',
    effect: 'Agent travels in 8-bit pixel art style with retro game music indicator',
    rarity: 'legendary'
  }
]

/**
 * Agent personality traits affect behavior during transfer
 */
export const PERSONALITY_BEHAVIORS: Record<AgentPersonality, {
  packingStyle: string
  travelStyle: string
  arrivalStyle: string
  errorResponse: string
}> = {
  meticulous: {
    packingStyle: 'Checking list... checking it twice... checking the checkist for the checklist...',
    travelStyle: 'Proceeding at safe and responsible network speeds...',
    arrivalStyle: 'Everything has a place. Everything IN its place. Perfection.',
    errorResponse: 'This is fine. We have a contingency plan. And a backup contingency plan.'
  },
  speedrunner: {
    packingStyle: 'Throwing everything in box. WE GOTTA GO FAST!',
    travelStyle: 'NYOOOOM 💨 (that\'s the sound of speed)',
    arrivalStyle: 'First try! New personal best!',
    errorResponse: 'Quick reset! No cutscene! Frame-perfect retry!'
  },
  anxious: {
    packingStyle: 'Did I pack the SSH keys? Better check 17 more times.',
    travelStyle: 'Is that normal network latency or should I be worried?',
    arrivalStyle: 'We made it! *nervous laughter* I had doubts but here we are!',
    errorResponse: 'I KNEW IT. I KNEW something would go wrong. It\'s fine. We\'re fine.'
  },
  zen: {
    packingStyle: 'The code that can be packed is not the true code...',
    travelStyle: 'The journey is the destination. Or was it the other way?',
    arrivalStyle: 'We have arrived, yet we never truly left. Deep.',
    errorResponse: 'Error is but success\'s teacher. Or something. Let\'s try again calmly.'
  },
  chaotic: {
    packingStyle: 'Stuffing random stuff in box. If it fits, it ships!',
    travelStyle: 'Wheeeee! Look ma, no routing table!',
    arrivalStyle: 'Can\'t believe that actually worked lmao',
    errorResponse: 'Honestly this tracks. Let\'s chaos our way through a retry!'
  }
}

/**
 * Get a random message from a phase
 */
export function getRandomMessage(phase: keyof typeof TRANSFER_MESSAGES): string {
  const messages = TRANSFER_MESSAGES[phase].messages
  return messages[Math.floor(Math.random() * messages.length)]
}

/**
 * Get a random packing item
 */
export function getRandomPackingItem(): string {
  return PACKING_ITEMS[Math.floor(Math.random() * PACKING_ITEMS.length)]
}

/**
 * Check for easter eggs based on context
 */
export function checkEasterEggs(context: {
  attemptCount?: number
  agentAlias?: string
  timeOfDay?: Date
  transferCount?: number
}): EasterEgg | null {
  const now = context.timeOfDay || new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const day = now.getDay()

  // Friday afternoon warning
  if (day === 5 && hour >= 16) {
    return EASTER_EGGS.find(e => e.trigger.includes('Friday'))!
  }

  // Midnight coding session
  if (hour >= 0 && hour < 2) {
    return EASTER_EGGS.find(e => e.trigger.includes('midnight'))!
  }

  // Multiple failures
  if (context.attemptCount && context.attemptCount >= 3) {
    return EASTER_EGGS.find(e => e.trigger.includes('3 times'))!
  }

  // Production warning
  if (context.agentAlias && /prod/i.test(context.agentAlias)) {
    return EASTER_EGGS.find(e => e.trigger.includes('production'))!
  }

  // The answer to everything
  if (minute === 42) {
    return EASTER_EGGS.find(e => e.trigger.includes('42nd'))!
  }

  // Test agent
  if (context.agentAlias && /test/i.test(context.agentAlias)) {
    return EASTER_EGGS.find(e => e.trigger.includes('test'))!
  }

  // Frequent flyer
  if (context.transferCount && context.transferCount >= 10) {
    return EASTER_EGGS.find(e => e.trigger.includes('10th'))!
  }

  return null
}

/**
 * Personality-aware message generator
 */
export function getPersonalityMessage(
  phase: keyof typeof TRANSFER_MESSAGES,
  personality: AgentPersonality = 'meticulous'
): string {
  const baseMessage = getRandomMessage(phase)
  const behavior = PERSONALITY_BEHAVIORS[personality]

  // Occasionally inject personality-specific message
  if (Math.random() < 0.3) {
    switch (phase) {
      case 'PACKING':
        return behavior.packingStyle
      case 'TRAVELING':
        return behavior.travelStyle
      case 'ARRIVING':
        return behavior.arrivalStyle
      case 'ERROR':
        return behavior.errorResponse
    }
  }

  return baseMessage
}

/**
 * Progress bar "tips" that show during transfer
 * Like game loading screens
 */
export const LOADING_TIPS = [
  'Tip: Agents love being organized in categories. They\'re neat freaks.',
  'Tip: You can message agents even when they\'re on different computers!',
  'Tip: Press Cmd+K to quick-switch between agents. Try it!',
  'Tip: Agent notes auto-save. You can\'t lose them even if you tried.',
  'Tip: Transferring git repos? They\'ll clone to the same path on the new host.',
  'Fun fact: This animation has 12 different personality variants.',
  'Fun fact: The first agent transfer ever was in 2025. You\'re living history!',
  'Fun fact: Agents are just fancy folders with trust issues.',
  'Did you know? You can name agents anything. Even "Gerald". Don\'t ask why.',
  'Did you know? Move mode deletes the source. Clone mode doesn\'t. Choose wisely!',
  'Pro tip: Transfer on Friday afternoon for an extra easter egg. 😏',
  'Pro tip: The konami code does... something. We won\'t tell you what.',
  'Remember: With great agent power comes great agent responsibility.',
  'Reminder: Breathe. It\'s just a computer moving data to another computer.',
  'Reminder: Your agent misses you when you\'re not working. Probably.',
]

/**
 * Get a random loading tip
 */
export function getRandomLoadingTip(): string {
  return LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]
}

/**
 * Visual treatment suggestions for different phases
 */
export const VISUAL_TREATMENTS = {
  PACKING: {
    background: 'Subtle pulsing gradient (blue to indigo)',
    animation: 'Items dropping into box with spring physics',
    particles: 'Occasional sparkles when important items pack',
    timing: '300ms spring easing for each item'
  },
  TRAVELING: {
    background: 'Animated star field or network visualization',
    animation: 'Rocket/box moving right with trail effect',
    particles: 'Speed lines, star streaks, data packets',
    timing: '2s continuous motion with occasional turbulence'
  },
  ARRIVING: {
    background: 'Warm gradient (green to emerald)',
    animation: 'Gentle landing with bounce, items unpacking',
    particles: 'Confetti burst, sparkles, celebration',
    timing: '600ms bounce easing on landing'
  },
  READY: {
    background: 'Solid emerald with subtle pulse',
    animation: 'Status indicators lighting up one by one',
    particles: 'Success checkmarks, power-up glow',
    timing: '100ms stagger for each indicator'
  },
  ERROR: {
    background: 'Warm orange (not scary red)',
    animation: 'Gentle shake, confused wobble',
    particles: 'Sweat drops, question marks, helpful tools',
    timing: '400ms wobble with sympathetic bounce'
  }
}

/**
 * Accessibility considerations
 */
export const A11Y_NOTES = {
  reducedMotion: 'If prefers-reduced-motion, show phase changes without particles/animation',
  screenReader: 'Announce phase changes with aria-live="polite"',
  colorBlind: 'Icons and text reinforce phase, not just color',
  keyboard: 'Cancel/retry buttons always keyboard accessible',
  timing: 'No time-based easter eggs that pressure users'
}
