'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import type { ToolBurst } from '@/lib/chat-utils'
import { getToolPreviewText } from '@/lib/chat-utils'

interface MobileToolBurstGroupProps {
  burst: ToolBurst
}

export default function MobileToolBurstGroup({ burst }: MobileToolBurstGroupProps) {
  const [expanded, setExpanded] = useState(false)

  const summaryParts = burst.tools.map(t =>
    t.count > 1 ? `${t.count} ${t.name}` : t.name
  )

  // Collect all tool names + previews from burst messages
  const allTools: { name: string; preview: string }[] = []
  burst.messages.forEach(msg => {
    const content = msg.message?.content
    if (!Array.isArray(content)) return
    content
      .filter((b: any) => b.type === 'tool_use' && b.name)
      .forEach((b: any) => {
        allTools.push({
          name: b.name,
          preview: getToolPreviewText(b.name, b.input),
        })
      })
  })

  return (
    <div className="mx-3 my-1">
      <div
        className="flex items-center gap-1.5 text-xs text-gray-500 italic py-0.5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
        )}
        <Wrench className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">
          <span className="text-gray-400">{burst.totalCount} tools</span>
          <span className="text-gray-600"> {summaryParts.join(', ')}</span>
        </span>
      </div>

      {expanded && (
        <div className="ml-4 mt-0.5">
          {allTools.map((tool, j) => (
            <div key={j} className="flex items-center gap-1.5 text-xs text-gray-500 italic py-0.5">
              <Wrench className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">
                <span className="text-gray-400">{tool.name}</span>
                {tool.preview && <span className="text-gray-600 font-mono"> {tool.preview}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
