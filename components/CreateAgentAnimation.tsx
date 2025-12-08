'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Star, Cpu, Terminal, Zap, Heart, Code, Folder, GitBranch } from 'lucide-react'

interface CreateAgentAnimationProps {
  phase: 'naming' | 'preparing' | 'creating' | 'ready' | 'error'
  agentName: string
  progress?: number
}

const PHASE_CONFIG = {
  naming: {
    color: 'text-blue-400',
    bgGlow: 'bg-blue-500/20',
    messages: [
      "Choosing the perfect name... ✨",
      "Names have power...",
      "A star is born...",
    ]
  },
  preparing: {
    color: 'text-purple-400',
    bgGlow: 'bg-purple-500/20',
    messages: [
      "Preparing the workspace... 🏗️",
      "Setting up the tools...",
      "Making everything cozy...",
      "Almost ready for move-in...",
    ]
  },
  creating: {
    color: 'text-cyan-400',
    bgGlow: 'bg-cyan-500/20',
    messages: [
      "Bringing your agent to life... ⚡",
      "Assembling neural pathways...",
      "Loading creativity modules...",
      "Installing curiosity...",
      "Adding a dash of personality...",
    ]
  },
  ready: {
    color: 'text-green-400',
    bgGlow: 'bg-green-500/20',
    messages: [
      "Hello, World! 👋",
      "Ready to help!",
      "Let's build something amazing!",
    ]
  },
  error: {
    color: 'text-red-400',
    bgGlow: 'bg-red-500/20',
    messages: [
      "Oops, something went wrong...",
      "Don't worry, we can try again!",
    ]
  }
}

export default function CreateAgentAnimation({
  phase,
  agentName,
  progress = 0,
}: CreateAgentAnimationProps) {
  const config = PHASE_CONFIG[phase]
  const messageIndex = Math.floor((progress / 100) * config.messages.length)
  const currentMessage = config.messages[Math.min(messageIndex, config.messages.length - 1)]

  return (
    <div className="relative flex flex-col items-center justify-center py-8">
      {/* Animated glow background */}
      <motion.div
        className={`absolute inset-0 ${config.bgGlow} blur-3xl opacity-30 rounded-full`}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Main Animation Area */}
      <div className="relative h-48 w-full flex items-center justify-center mb-6">
        <AnimatePresence mode="wait">
          {phase === 'naming' && <NamingAnimation key="naming" agentName={agentName} />}
          {phase === 'preparing' && <PreparingAnimation key="preparing" />}
          {phase === 'creating' && <CreatingAnimation key="creating" />}
          {phase === 'ready' && <ReadyAnimation key="ready" agentName={agentName} />}
          {phase === 'error' && <ErrorAnimation key="error" />}
        </AnimatePresence>
      </div>

      {/* Status Message */}
      <motion.div
        key={currentMessage}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="text-center"
      >
        <span className={`text-lg font-medium ${config.color}`}>
          {currentMessage}
        </span>
      </motion.div>

      {/* Progress indicator for creating phase */}
      {phase === 'creating' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 w-48"
        >
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </motion.div>
      )}
    </div>
  )
}

// Naming Animation - Stars forming a constellation with the agent's name
function NamingAnimation({ agentName }: { agentName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex flex-col items-center"
    >
      {/* Floating stars */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute text-yellow-400"
          initial={{
            x: (Math.random() - 0.5) * 200,
            y: (Math.random() - 0.5) * 150,
            opacity: 0,
            scale: 0,
          }}
          animate={{
            opacity: [0, 1, 0.7, 1],
            scale: [0, 1, 0.8, 1],
          }}
          transition={{
            duration: 2,
            delay: i * 0.15,
            repeat: Infinity,
            repeatType: 'reverse',
          }}
        >
          <Star className="w-4 h-4" fill="currentColor" />
        </motion.div>
      ))}

      {/* Central name display */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: 'spring', damping: 10 }}
        className="relative z-10 px-6 py-3 bg-gray-800/80 rounded-xl border border-blue-500/30"
      >
        <motion.span
          className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
          animate={{
            backgroundPosition: ['0%', '100%', '0%'],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          {agentName || 'new-agent'}
        </motion.span>
      </motion.div>

      {/* Sparkle effect */}
      <motion.div
        className="absolute"
        animate={{
          rotate: 360,
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <Sparkles className="w-32 h-32 text-blue-400/20" />
      </motion.div>
    </motion.div>
  )
}

// Preparing Animation - Workspace and tools materializing
function PreparingAnimation() {
  const tools = [
    { icon: Terminal, label: 'Terminal', delay: 0 },
    { icon: Code, label: 'Editor', delay: 0.2 },
    { icon: Folder, label: 'Files', delay: 0.4 },
    { icon: GitBranch, label: 'Git', delay: 0.6 },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex items-center justify-center"
    >
      {/* Central workspace icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 10 }}
        className="relative z-10"
      >
        <Cpu className="w-20 h-20 text-purple-400" strokeWidth={1.5} />
      </motion.div>

      {/* Tools appearing around */}
      {tools.map((tool, index) => {
        const angle = (index * Math.PI * 2) / tools.length - Math.PI / 2
        const radius = 70
        return (
          <motion.div
            key={tool.label}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              x: Math.cos(angle) * radius,
              y: Math.sin(angle) * radius,
            }}
            transition={{
              delay: tool.delay,
              type: 'spring',
              damping: 12,
            }}
            className="absolute"
          >
            <motion.div
              animate={{
                y: [0, -5, 0],
              }}
              transition={{
                duration: 2,
                delay: tool.delay,
                repeat: Infinity,
              }}
              className="p-2 bg-gray-800 rounded-lg border border-purple-500/30"
            >
              <tool.icon className="w-6 h-6 text-purple-300" />
            </motion.div>
          </motion.div>
        )
      })}

      {/* Connection lines */}
      <svg className="absolute w-full h-full" style={{ zIndex: 0 }}>
        {tools.map((_, index) => {
          const angle = (index * Math.PI * 2) / tools.length - Math.PI / 2
          const radius = 70
          const x = Math.cos(angle) * radius + 100
          const y = Math.sin(angle) * radius + 100
          return (
            <motion.line
              key={index}
              x1="100"
              y1="100"
              x2={x}
              y2={y}
              stroke="rgb(168, 85, 247)"
              strokeWidth="1"
              strokeOpacity="0.3"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
            />
          )
        })}
      </svg>
    </motion.div>
  )
}

// Creating Animation - Energy coalescing, the "birth"
function CreatingAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex items-center justify-center"
    >
      {/* Energy rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border-2 border-cyan-400/30"
          style={{
            width: 80 + i * 40,
            height: 80 + i * 40,
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
            rotate: i % 2 === 0 ? 360 : -360,
          }}
          transition={{
            duration: 3 - i * 0.5,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}

      {/* Central forming agent */}
      <motion.div
        animate={{
          scale: [0.9, 1.1, 0.9],
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
        }}
        className="relative z-10 text-6xl"
      >
        🤖
      </motion.div>

      {/* Lightning bolts */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute"
          initial={{
            x: (Math.random() - 0.5) * 150,
            y: (Math.random() - 0.5) * 150,
            opacity: 0,
            scale: 0,
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: 0.8,
            delay: i * 0.3,
            repeat: Infinity,
          }}
        >
          <Zap className="w-6 h-6 text-yellow-400" fill="currentColor" />
        </motion.div>
      ))}

      {/* Particle effects */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={`particle-${i}`}
          className="absolute w-2 h-2 rounded-full bg-cyan-400"
          initial={{
            x: 0,
            y: 0,
            opacity: 0,
          }}
          animate={{
            x: Math.cos((i * Math.PI * 2) / 12) * 80,
            y: Math.sin((i * Math.PI * 2) / 12) * 80,
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 1.5,
            delay: i * 0.1,
            repeat: Infinity,
          }}
        />
      ))}
    </motion.div>
  )
}

// Ready Animation - Agent comes to life!
function ReadyAnimation({ agentName }: { agentName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex flex-col items-center"
    >
      {/* Agent avatar with bounce */}
      <motion.div
        initial={{ scale: 0, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        transition={{
          type: 'spring',
          damping: 8,
          stiffness: 200,
        }}
        className="relative"
      >
        <motion.div
          animate={{
            y: [0, -10, 0],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="text-7xl"
        >
          🤖
        </motion.div>

        {/* Heart pulse */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0.8, 1.2, 0.8],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            delay: 0.5,
            duration: 1,
            repeat: Infinity,
          }}
          className="absolute -top-2 -right-2"
        >
          <Heart className="w-6 h-6 text-red-400" fill="currentColor" />
        </motion.div>
      </motion.div>

      {/* Wave emoji */}
      <motion.div
        initial={{ scale: 0, rotate: -45 }}
        animate={{
          scale: 1,
          rotate: [0, 20, 0, 20, 0],
        }}
        transition={{
          scale: { delay: 0.3, type: 'spring' },
          rotate: { delay: 0.5, duration: 1.5, repeat: 2 },
        }}
        className="text-4xl mt-2"
      >
        👋
      </motion.div>

      {/* Name badge */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="mt-4 px-4 py-2 bg-green-500/20 rounded-full border border-green-500/30"
      >
        <span className="text-green-400 font-medium">{agentName}</span>
      </motion.div>

      {/* Celebration confetti */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ y: 0, opacity: 1, scale: 0 }}
          animate={{
            y: -150 - Math.random() * 50,
            x: (Math.random() - 0.5) * 200,
            opacity: 0,
            scale: 1,
            rotate: Math.random() * 360,
          }}
          transition={{
            duration: 1.5,
            delay: 0.3 + Math.random() * 0.3,
          }}
          className="absolute text-xl"
        >
          {['🎉', '✨', '🎊', '⭐', '🌟', '💫'][Math.floor(Math.random() * 6)]}
        </motion.div>
      ))}
    </motion.div>
  )
}

// Error Animation
function ErrorAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center"
    >
      <motion.div
        animate={{
          rotate: [0, -10, 10, -10, 0],
        }}
        transition={{
          duration: 0.5,
          repeat: Infinity,
          repeatDelay: 1,
        }}
        className="text-6xl mb-4"
      >
        😅
      </motion.div>
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="text-red-400"
      >
        <Zap className="w-8 h-8" />
      </motion.div>
    </motion.div>
  )
}
