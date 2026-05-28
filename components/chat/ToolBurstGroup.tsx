'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import type { ToolBurst } from '@/lib/chat-utils'
import { getToolPreview } from '@/lib/chat-utils'

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: any
  id?: string
  [key: string]: any
}

interface ToolBurstGroupProps {
  burst: ToolBurst
  expandedTools: Set<string>
  onToggleTool: (id: string) => void
  renderToolExpanded: (tool: ContentBlock) => React.ReactNode
}

export default function ToolBurstGroup({ burst, expandedTools, onToggleTool, renderToolExpanded }: ToolBurstGroupProps) {
  const [expanded, setExpanded] = useState(false)

  const summaryParts = burst.tools.map(t =>
    t.count > 1 ? `${t.count} ${t.name}` : t.name
  )

  const timestamp = burst.startTimestamp
    ? new Date(burst.startTimestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : ''

  // Collect all tool ContentBlocks from burst messages for expanded view
  const allTools: { tool: ContentBlock; msgIdx: number; toolIdx: number }[] = []
  burst.messages.forEach((msg, mi) => {
    const content = msg.message?.content
    if (!Array.isArray(content)) return
    content
      .filter((b: ContentBlock) => b.type === 'tool_use')
      .forEach((tool: ContentBlock, ti: number) => {
        allTools.push({ tool, msgIdx: mi, toolIdx: ti })
      })
  })

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] w-full">
        <div className="rounded-2xl bg-orange-900/20 border border-orange-800/40 overflow-hidden">
          {/* Summary header — always visible */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-orange-900/20 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
            )}
            <Wrench className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
            <span className="text-xs text-orange-300 font-medium">
              {burst.totalCount} tool {burst.totalCount === 1 ? 'call' : 'calls'}
            </span>
            <span className="text-xs text-orange-400/60 truncate flex-1">
              {summaryParts.join(', ')}
            </span>
            {timestamp && (
              <span className="text-xs text-orange-400/40 flex-shrink-0 ml-2">
                {timestamp}
              </span>
            )}
          </button>

          {/* Expanded: individual tools */}
          {expanded && (
            <div className="border-t border-orange-800/30 px-2 py-1.5 space-y-1">
              {allTools.map(({ tool, msgIdx, toolIdx }) => {
                const toolId = `burst-${burst.startTimestamp}-${msgIdx}-${toolIdx}`
                const isToolExpanded = expandedTools.has(toolId)
                const preview = getToolPreview(tool)

                return (
                  <div
                    key={toolId}
                    className="bg-orange-900/30 rounded-lg border border-orange-800/50"
                  >
                    <button
                      onClick={() => onToggleTool(toolId)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-orange-900/20 transition-colors rounded-lg"
                    >
                      <Wrench className="w-3 h-3 text-orange-400 flex-shrink-0" />
                      <span className="text-xs text-orange-300 font-medium">
                        {tool.name || 'Tool'}
                      </span>
                      {preview && !isToolExpanded && (
                        <span className="text-xs text-orange-400/60 font-mono truncate flex-1 ml-1">
                          {preview}
                        </span>
                      )}
                      {!preview && <span className="flex-1" />}
                      {isToolExpanded ? (
                        <ChevronDown className="w-3 h-3 text-orange-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-orange-400 flex-shrink-0" />
                      )}
                    </button>
                    {isToolExpanded && tool.input && renderToolExpanded(tool)}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
