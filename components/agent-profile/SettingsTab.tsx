'use client'

import type { AgentLocalConfig } from '@/types/agent-local-config'
import { ItemRow, InfoRow, SectionLabel, type AgentInfo } from './shared'

const TITLE_LABELS: Record<string, string> = {
  manager: 'Manager',
  'chief-of-staff': 'Chief of Staff',
  member: 'Member',
}

export default function SettingsTab({ config, agentInfo }: { config: AgentLocalConfig; agentInfo?: AgentInfo }) {
  const settings = config.settings || {}
  const entries = Object.entries(settings).filter(([k]) =>
    k !== 'plugins' && k !== 'lspServers' && k !== 'agent'
  )

  return (
    <div className="space-y-4">
      {/* Identity section */}
      <div>
        <SectionLabel text="Identity" />
        <div className="rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2 space-y-0.5">
          <InfoRow label="Name" value={agentInfo?.name} />
          <InfoRow label="Title" value={agentInfo?.title ? TITLE_LABELS[agentInfo.title] : undefined} />
          <InfoRow label="Role" value={config.rolePlugin?.name} />
          <InfoRow label="Working Dir" value={config.workingDirectory} />
        </div>
      </div>

      {/* Runtime section */}
      <div>
        <SectionLabel text="Runtime" />
        <div className="rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2 space-y-0.5">
          <InfoRow label="Program" value={agentInfo?.program || 'claude'} />
          <InfoRow label="Model" value={agentInfo?.model} />
          {agentInfo?.programArgs && <InfoRow label="Args" value={agentInfo.programArgs} />}
        </div>
      </div>

      {/* Tags */}
      {agentInfo?.tags && agentInfo.tags.length > 0 && (
        <div>
          <SectionLabel text="Tags" />
          <div className="flex flex-wrap gap-1">
            {agentInfo.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-cyan-300/80 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* LSP Servers */}
      {config.lspServers.length > 0 && (
        <div>
          <SectionLabel text="LSP Servers" />
          <div className="space-y-1.5">
            {config.lspServers.map((lsp) => (
              <ItemRow key={lsp.name} name={lsp.name} detail={`${lsp.command} (${lsp.languages.join(', ')})`} sourcePlugin={lsp.sourcePlugin} />
            ))}
          </div>
        </div>
      )}

      {/* Advanced: raw settings (collapsed) */}
      {entries.length > 0 && (
        <details className="mt-2">
          <summary className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 cursor-pointer hover:text-gray-400 transition-colors">
            Advanced Settings
          </summary>
          <div className="mt-2 space-y-1">
            {entries.map(([key, value]) => (
              <InfoRow key={key} label={key} value={typeof value === 'string' ? value : JSON.stringify(value)} />
            ))}
          </div>
        </details>
      )}

      <div className="pt-2 border-t border-gray-800/50">
        <InfoRow label="Last Scan" value={new Date(config.lastScanned).toLocaleTimeString()} />
      </div>
    </div>
  )
}
