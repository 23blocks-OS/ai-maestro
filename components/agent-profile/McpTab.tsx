'use client'

import type { AgentLocalConfig } from '@/types/agent-local-config'
import { EmptyState } from './shared'

export default function McpTab({ config }: { config: AgentLocalConfig }) {
  if (config.mcpServers.length === 0) {
    return <EmptyState text="No MCP servers configured" hint="No MCP servers detected from installed plugins or local config." />
  }

  return (
    <div className="space-y-2">
      {config.mcpServers.map((mcp) => (
        <div
          key={mcp.name}
          className="px-2.5 py-2 rounded-lg border border-purple-500/20 bg-purple-500/5"
        >
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-purple-300 truncate flex-1">{mcp.name}</p>
            {mcp.sourcePlugin && (
              <span className="text-[9px] text-blue-400/70 bg-blue-500/10 border border-blue-500/15 rounded px-1.5 py-0.5 flex-shrink-0 truncate max-w-[120px]">
                plugin: {mcp.sourcePlugin}
              </span>
            )}
          </div>
          {mcp.command && (
            <p className="text-[10px] text-gray-500 truncate mt-0.5">
              {mcp.command} {mcp.args?.join(' ')}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
