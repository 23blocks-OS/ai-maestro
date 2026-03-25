'use client'

import { useState } from 'react'
import { Server, Loader2 } from 'lucide-react'
import type { AgentLocalConfig } from '@/types/agent-local-config'
import { ExpandableElementCard, EmptyState } from './shared'

interface McpTabProps {
  config: AgentLocalConfig
  agentId: string
  onRefresh?: () => void
}

export default function McpTab({ config, agentId, onRefresh }: McpTabProps) {
  const [mcpTools, setMcpTools] = useState<Record<string, { tools: { name: string; description: string }[]; serverInfo?: { name: string; version: string } }>>({})
  const [loadingTools, setLoadingTools] = useState<string | null>(null)

  const discoverTools = async (serverName: string) => {
    setLoadingTools(serverName)
    try {
      const res = await fetch('/api/settings/mcp-discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverName, format: 'json' }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.tools) {
          setMcpTools(prev => ({ ...prev, [serverName]: { tools: data.tools, serverInfo: data.serverInfo } }))
        }
      }
    } catch { /* ignore */ }
    setLoadingTools(null)
  }

  if (config.mcpServers.length === 0) {
    return <EmptyState text="No MCP servers configured" hint="Use `claude mcp add --scope local` to add servers." />
  }

  return (
    <div className="space-y-1.5">
      {config.mcpServers.map((mcp) => {
        const cmdLine = mcp.command ? `${mcp.command} ${mcp.args?.join(' ') || ''}`.trim() : undefined
        const toolsData = mcpTools[mcp.name]

        return (
          <ExpandableElementCard
            key={mcp.name}
            name={mcp.name}
            elementType="mcp"
            detail={cmdLine}
            sourcePlugin={mcp.sourcePlugin}
            agentId={agentId}
            workDir={config.workingDirectory}
            onRemoved={onRefresh}
            jsonContent={JSON.stringify({ name: mcp.name, command: mcp.command, args: mcp.args }, null, 2)}
          >
            {/* MCP tools discovery */}
            <div className="pt-1">
              {!toolsData && (
                <button
                  onClick={(e) => { e.stopPropagation(); discoverTools(mcp.name) }}
                  disabled={loadingTools === mcp.name}
                  className="flex items-center gap-1.5 text-[10px] text-green-400/80 hover:text-green-300 px-2 py-1 rounded bg-green-500/10 hover:bg-green-500/15 border border-green-500/20 transition-colors disabled:opacity-50"
                >
                  {loadingTools === mcp.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <Server className="w-3 h-3" />}
                  Discover Tools
                </button>
              )}
              {toolsData && (
                <div className="space-y-1">
                  <p className="text-[9px] text-gray-500 font-medium uppercase tracking-wider">
                    {toolsData.tools.length} tools{toolsData.serverInfo ? ` — ${toolsData.serverInfo.name} v${toolsData.serverInfo.version}` : ''}
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {toolsData.tools.map((tool) => (
                      <div key={tool.name} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-900/50 border border-gray-800/30">
                        <span className="text-green-400/80 font-medium">{tool.name}</span>
                        {tool.description && <span className="text-gray-600 ml-1.5">{tool.description}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ExpandableElementCard>
        )
      })}
    </div>
  )
}
