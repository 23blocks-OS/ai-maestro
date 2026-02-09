'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Phone } from 'lucide-react'
import type { Agent } from '@/types/agent'

interface RingingAnimationProps {
  agents: Agent[]
  joinedAgentIds: string[]
  teamName: string
  onAgentJoined: (agentId: string) => void
  onAllJoined: () => void
}

export default function RingingAnimation({
  agents,
  joinedAgentIds,
  teamName,
  onAgentJoined,
  onAllJoined,
}: RingingAnimationProps) {
  // Use refs for callbacks to avoid effect re-runs
  const onAgentJoinedRef = useRef(onAgentJoined)
  const onAllJoinedRef = useRef(onAllJoined)
  onAgentJoinedRef.current = onAgentJoined
  onAllJoinedRef.current = onAllJoined

  // Capture agent IDs once on mount, shuffled for random join order
  const agentIdsRef = useRef(() => {
    const ids = agents.map(a => a.id)
    // Fisher-Yates shuffle
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
    }
    return ids
  })

  useEffect(() => {
    const ids = agentIdsRef.current()
    const timers: ReturnType<typeof setTimeout>[] = []

    // Stagger agent joins with random delay variance
    ids.forEach((id, index) => {
      const jitter = Math.floor(Math.random() * 400)
      timers.push(setTimeout(() => {
        onAgentJoinedRef.current(id)
      }, 800 + index * 600 + jitter))
    })

    // All joined after last agent + 500ms buffer
    const totalTime = 800 + ids.length * 600 + 500
    timers.push(setTimeout(() => {
      onAllJoinedRef.current()
    }, totalTime))

    return () => timers.forEach(t => clearTimeout(t))
  }, []) // Empty deps — runs once on mount, never re-runs

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-12">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="flex items-center gap-3 mb-3">
            <Phone className="w-8 h-8 text-emerald-400" />
            <h2 className="text-3xl text-white font-medium">
              Calling {teamName || 'team'}...
            </h2>
          </div>
          <p className="text-lg text-gray-400">
            {joinedAgentIds.length} of {agents.length} joined
          </p>
        </motion.div>

        {/* Agent circles */}
        <div className="flex flex-wrap items-center justify-center gap-10 max-w-3xl">
          {agents.map((agent, index) => {
            const hasJoined = joinedAgentIds.includes(agent.id)
            const displayName = agent.label || agent.name || agent.alias || ''

            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="relative">
                  {/* Pulsing ring (before join) */}
                  {!hasJoined && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-[3px] border-emerald-400"
                      animate={{
                        scale: [1, 1.4, 1],
                        opacity: [0.8, 0, 0.8],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  )}

                  {/* Avatar */}
                  <div className={`w-24 h-24 rounded-full overflow-hidden border-[3px] transition-colors duration-300 ${
                    hasJoined ? 'border-emerald-500' : 'border-gray-600'
                  }`}>
                    {agent.avatar ? (
                      <img src={agent.avatar} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-400 text-3xl font-bold">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Joined checkmark */}
                  <AnimatePresence>
                    {hasJoined && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: [0, 1.3, 1] }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        className="absolute -bottom-1 -right-1 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center border-[3px] border-gray-950"
                      >
                        <Check className="w-5 h-5 text-white" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <span className={`text-base font-medium transition-colors duration-300 ${
                  hasJoined ? 'text-emerald-300' : 'text-gray-500'
                }`}>
                  {displayName}
                </span>
                {agent.name && agent.name !== displayName && (
                  <span className="text-sm text-gray-600">
                    {agent.name}
                  </span>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}
