'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Package, Rocket, Home, Check, AlertCircle, GitBranch, Database, Mail, FileText } from 'lucide-react'

interface TransferAnimationProps {
  phase: 'packing' | 'traveling' | 'arriving' | 'ready' | 'error'
  agentName: string
  agentAvatar?: string
  sourceName: string
  targetName: string
  progress: number
  transferDetails?: {
    messagesImported?: number
    reposCloned?: number
    dbSize?: string
  }
}

const PHASE_CONFIG = {
  packing: {
    icon: Package,
    color: 'text-blue-400',
    bgGlow: 'bg-blue-500/20',
    messages: [
      "Backing up memories... 🧠",
      "Folding the git repos neatly...",
      "Did I pack my .env file?",
      "Making sure nothing gets lost...",
      "One last look around...",
    ]
  },
  traveling: {
    icon: Rocket,
    color: 'text-purple-400',
    bgGlow: 'bg-purple-500/20',
    messages: [
      "Zooming through the internet... 🚀",
      "Excuse me, coming through!",
      "Are we there yet?",
      "This is faster than npm install!",
      "Surfing the data streams...",
    ]
  },
  arriving: {
    icon: Home,
    color: 'text-green-400',
    bgGlow: 'bg-green-500/20',
    messages: [
      "New machine, who dis? 👀",
      "Checking out the new digs...",
      "Unpacking my favorite configs...",
      "Setting up my workspace...",
      "Almost ready!",
    ]
  },
  ready: {
    icon: Check,
    color: 'text-emerald-400',
    bgGlow: 'bg-emerald-500/20',
    messages: [
      "Home sweet /home 🏡",
      "Let's get to work! 💪",
      "All systems operational!",
      "Ready to ship some code!",
    ]
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-400',
    bgGlow: 'bg-red-500/20',
    messages: [
      "Oops, hit a snag! 😅",
      "This is awkward...",
      "Houston, we have a problem",
    ]
  }
}

const ITEMS_TO_PACK = [
  { icon: Database, label: 'Agent Memory', delay: 0 },
  { icon: Mail, label: 'Messages', delay: 0.2 },
  { icon: GitBranch, label: 'Git Repos', delay: 0.4 },
  { icon: FileText, label: 'Config Files', delay: 0.6 },
]

export default function TransferAnimation({
  phase,
  agentName,
  agentAvatar,
  sourceName,
  targetName,
  progress,
  transferDetails,
}: TransferAnimationProps) {
  const config = PHASE_CONFIG[phase]
  const Icon = config.icon

  // Cycle through messages based on progress
  const messageIndex = Math.floor((progress / 100) * config.messages.length)
  const currentMessage = config.messages[Math.min(messageIndex, config.messages.length - 1)]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        className="relative w-full max-w-2xl mx-4 bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 overflow-hidden"
      >
        {/* Animated glow background */}
        <motion.div
          className={`absolute inset-0 ${config.bgGlow} blur-3xl opacity-30`}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        <div className="relative p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mb-4"
            >
              <h2 className="text-2xl font-bold text-white mb-2">
                {phase === 'ready' ? 'Transfer Complete!' : 'Agent Transfer in Progress'}
              </h2>
              <p className="text-gray-400">
                Moving <span className="font-semibold text-white">{agentName}</span> from{' '}
                <span className="text-blue-400">{sourceName}</span> to{' '}
                <span className="text-purple-400">{targetName}</span>
              </p>
            </motion.div>
          </div>

          {/* Main Animation Area */}
          <div className="relative h-64 mb-8 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {phase === 'packing' && <PackingAnimation key="packing" />}
              {phase === 'traveling' && (
                <TravelingAnimation
                  key="traveling"
                  agentAvatar={agentAvatar}
                  agentName={agentName}
                />
              )}
              {phase === 'arriving' && (
                <ArrivingAnimation
                  key="arriving"
                  agentAvatar={agentAvatar}
                />
              )}
              {phase === 'ready' && (
                <ReadyAnimation
                  key="ready"
                  agentAvatar={agentAvatar}
                />
              )}
              {phase === 'error' && <ErrorAnimation key="error" />}
            </AnimatePresence>
          </div>

          {/* Status Message */}
          <motion.div
            key={currentMessage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center mb-6"
          >
            <div className={`inline-flex items-center gap-2 ${config.color} text-lg font-medium`}>
              <Icon className="w-5 h-5" />
              <span>{currentMessage}</span>
            </div>
          </motion.div>

          {/* Progress Bar */}
          {phase !== 'error' && phase !== 'ready' && (
            <div className="mb-6">
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <div className="mt-2 flex justify-between text-sm text-gray-500">
                <span>{progress}%</span>
                <span>
                  {phase === 'packing' && 'Preparing data...'}
                  {phase === 'traveling' && 'Transferring...'}
                  {phase === 'arriving' && 'Setting up...'}
                </span>
              </div>
            </div>
          )}

          {/* Transfer Details */}
          {transferDetails && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-3 gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700"
            >
              {transferDetails.messagesImported !== undefined && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">
                    {transferDetails.messagesImported}
                  </div>
                  <div className="text-xs text-gray-400">Messages</div>
                </div>
              )}
              {transferDetails.reposCloned !== undefined && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">
                    {transferDetails.reposCloned}
                  </div>
                  <div className="text-xs text-gray-400">Repositories</div>
                </div>
              )}
              {transferDetails.dbSize && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">
                    {transferDetails.dbSize}
                  </div>
                  <div className="text-xs text-gray-400">Data Size</div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// Packing Animation - Items flying into a suitcase
function PackingAnimation() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Suitcase */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="relative"
      >
        <Package className="w-32 h-32 text-blue-400" strokeWidth={1.5} />
      </motion.div>

      {/* Items flying into suitcase */}
      {ITEMS_TO_PACK.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{
            x: 150 * Math.cos((index * Math.PI * 2) / ITEMS_TO_PACK.length),
            y: 150 * Math.sin((index * Math.PI * 2) / ITEMS_TO_PACK.length),
            opacity: 0,
            scale: 0,
          }}
          animate={{
            x: 0,
            y: 0,
            opacity: [0, 1, 1, 0],
            scale: [0, 1, 1, 0.5],
          }}
          transition={{
            duration: 2,
            delay: item.delay,
            repeat: Infinity,
            repeatDelay: 1,
          }}
          className="absolute"
        >
          <item.icon className="w-8 h-8 text-gray-400" />
        </motion.div>
      ))}
    </div>
  )
}

// Traveling Animation - Agent flying across screen
function TravelingAnimation({ agentAvatar, agentName }: { agentAvatar?: string; agentName: string }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Stars background */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white rounded-full"
          initial={{
            x: Math.random() * 600 - 300,
            y: Math.random() * 300 - 150,
            opacity: 0,
          }}
          animate={{
            x: -400,
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 2,
            delay: Math.random() * 2,
            repeat: Infinity,
          }}
        />
      ))}

      {/* Agent character */}
      <motion.div
        animate={{
          x: [-200, 0, 200],
          y: [0, -30, 0],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="relative z-10"
      >
        <motion.div
          animate={{
            rotate: [0, -10, 0, 10, 0],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
          }}
          className="relative"
        >
          {/* Rocket flames */}
          <motion.div
            className="absolute -bottom-8 left-1/2 transform -translate-x-1/2"
            animate={{
              scaleY: [1, 1.3, 1],
              opacity: [0.8, 1, 0.8],
            }}
            transition={{
              duration: 0.3,
              repeat: Infinity,
            }}
          >
            <div className="text-4xl">🔥</div>
          </motion.div>

          {agentAvatar ? (
            <div className="text-6xl">{agentAvatar}</div>
          ) : (
            <Rocket className="w-24 h-24 text-purple-400" />
          )}

          {/* Trailing sparkles */}
          <motion.div
            className="absolute -left-16 top-1/2 transform -translate-y-1/2"
            animate={{
              opacity: [0, 1, 0],
              scale: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
            }}
          >
            ✨
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  )
}

// Arriving Animation - Agent unpacking and looking around
function ArrivingAnimation({ agentAvatar }: { agentAvatar?: string }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* House */}
      <motion.div
        initial={{ scale: 0, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 10 }}
      >
        <Home className="w-32 h-32 text-green-400" strokeWidth={1.5} />
      </motion.div>

      {/* Agent appearing */}
      <motion.div
        initial={{ scale: 0, y: 100, opacity: 0 }}
        animate={{
          scale: 1,
          y: 0,
          opacity: 1,
          rotate: [0, -5, 5, 0],
        }}
        transition={{
          delay: 0.3,
          rotate: {
            delay: 0.8,
            duration: 0.5,
            repeat: 3,
          }
        }}
        className="absolute text-5xl"
      >
        {agentAvatar || '🤖'}
      </motion.div>

      {/* Boxes unpacking */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 1, scale: 1 }}
          animate={{
            opacity: 0,
            scale: 0,
            y: -50,
          }}
          transition={{
            delay: 1 + i * 0.3,
            duration: 0.5,
          }}
          className="absolute text-3xl"
          style={{
            left: `${30 + i * 20}%`,
            top: '60%',
          }}
        >
          📦
        </motion.div>
      ))}
    </div>
  )
}

// Ready Animation - Agent giving thumbs up
function ReadyAnimation({ agentAvatar }: { agentAvatar?: string }) {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{
          type: 'spring',
          damping: 8,
          stiffness: 200,
        }}
        className="text-8xl mb-4"
      >
        {agentAvatar || '🤖'}
      </motion.div>

      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{
          scale: 1.5,
          rotate: 0,
        }}
        transition={{
          delay: 0.3,
          type: 'spring',
          damping: 10,
        }}
        className="text-5xl"
      >
        👍
      </motion.div>

      {/* Celebration confetti */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          initial={{
            x: 0,
            y: 0,
            opacity: 1,
            scale: 0,
          }}
          animate={{
            x: (Math.random() - 0.5) * 400,
            y: -200 - Math.random() * 100,
            opacity: 0,
            scale: 1,
            rotate: Math.random() * 360,
          }}
          transition={{
            delay: 0.5 + Math.random() * 0.3,
            duration: 1.5,
          }}
          className="absolute text-2xl"
        >
          {['🎉', '✨', '🎊', '⭐'][Math.floor(Math.random() * 4)]}
        </motion.div>
      ))}
    </div>
  )
}

// Error Animation - Agent looking confused
function ErrorAnimation() {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center">
      <motion.div
        animate={{
          rotate: [0, -10, 10, -10, 10, 0],
        }}
        transition={{
          duration: 0.5,
          repeat: Infinity,
          repeatDelay: 1,
        }}
        className="text-8xl mb-4"
      >
        🤖
      </motion.div>

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2 }}
        className="text-4xl"
      >
        ❌
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-4 text-gray-400 text-center"
      >
        Something went wrong during the transfer
      </motion.div>
    </div>
  )
}
