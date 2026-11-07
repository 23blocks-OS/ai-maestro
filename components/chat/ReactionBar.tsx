'use client'

import { useState } from 'react'
import { SmilePlus } from 'lucide-react'
import { REACTIONS, REACTION_EMOJIS, type Reaction, type ReactionEmoji } from '@/lib/chat-reactions'

function reactorName(r: Reaction): string {
  return r.byKind === 'operator' ? 'You' : r.byName || r.by
}

/** Reactions beside a message's copy icon, and the row of six to add one. Tapping your own takes it back. */
export default function ReactionBar({ reactions = [], onToggle }: {
  reactions?: Reaction[]
  onToggle: (emoji: ReactionEmoji) => void
}) {
  const [picking, setPicking] = useState(false)
  const shown = REACTION_EMOJIS.filter(e => reactions.some(r => r.emoji === e))

  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      {shown.map(emoji => {
        const who = reactions.filter(r => r.emoji === emoji)
        const mine = who.some(r => r.byKind === 'operator')
        return (
          <button
            key={emoji}
            onClick={() => onToggle(emoji)}
            aria-pressed={mine}
            aria-label={`${REACTIONS[emoji]}: ${who.length}`}
            title={who.map(reactorName).join(', ')}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
              mine ? 'bg-blue-600/30 border-blue-500/60 text-blue-100' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
            }`}
          >
            <span>{emoji}</span>
            {who.length > 1 && <span>{who.length}</span>}
          </button>
        )
      })}
      {picking && REACTION_EMOJIS.filter(e => !shown.includes(e)).map(emoji => (
        <button
          key={emoji}
          onClick={() => { setPicking(false); onToggle(emoji) }}
          aria-label={`React: ${REACTIONS[emoji]}`}
          title={REACTIONS[emoji]}
          className="px-1.5 py-0.5 rounded-full text-sm hover:bg-gray-700 transition-colors"
        >
          {emoji}
        </button>
      ))}
      <button
        onClick={() => setPicking(p => !p)}
        aria-expanded={picking}
        aria-label="Add a reaction"
        title="Add a reaction"
        className="p-1 rounded-full text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
      >
        <SmilePlus className="w-3 h-3" />
      </button>
    </div>
  )
}
