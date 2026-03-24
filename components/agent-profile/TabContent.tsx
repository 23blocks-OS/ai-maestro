'use client'

import type { AgentLocalConfig } from '@/types/agent-local-config'
import { ItemRow, ListTab, type TabId, type AgentInfo } from './shared'
import SettingsTab from './SettingsTab'
import RoleTab from './RoleTab'
import PluginsTab from './PluginsTab'
import McpTab from './McpTab'

export default function TabContent({
  tab,
  config,
  agentInfo,
  onEditInHaephestos,
  onBrowse,
}: {
  tab: TabId
  config: AgentLocalConfig
  agentInfo?: AgentInfo
  onEditInHaephestos?: (profilePath: string) => void
  onBrowse?: (path: string) => void
}) {
  switch (tab) {
    case 'settings': return <SettingsTab config={config} agentInfo={agentInfo} />
    case 'role': return <RoleTab config={config} onEditInHaephestos={onEditInHaephestos} onBrowse={onBrowse} />
    case 'plugins': return <PluginsTab config={config} />
    case 'skills': return <ListTab items={config.skills} emptyText="No skills installed" emptyHint="No skills detected from installed plugins or local config." renderItem={(s) => <ItemRow key={s.name} name={s.name} detail={s.description} sourcePlugin={s.sourcePlugin} />} />
    case 'agents': return <ListTab items={config.agents} emptyText="No subagents defined" emptyHint="No subagents detected from installed plugins or local config." renderItem={(a) => <ItemRow key={a.name} name={a.name} detail={a.description} sourcePlugin={a.sourcePlugin} />} />
    case 'hooks': return <ListTab items={config.hooks} emptyText="No hooks installed" emptyHint="No hooks detected from installed plugins or local config." renderItem={(h) => <ItemRow key={`${h.name}-${h.eventType}`} name={h.name} detail={h.eventType} sourcePlugin={h.sourcePlugin} />} />
    case 'rules': return <ListTab items={config.rules} emptyText="No rules installed" emptyHint="No rules detected from installed plugins or local config." renderItem={(r) => <ItemRow key={r.name} name={r.name} detail={r.preview} sourcePlugin={r.sourcePlugin} />} />
    case 'commands': return <ListTab items={config.commands} emptyText="No commands installed" emptyHint="No commands detected from installed plugins or local config." renderItem={(c) => <ItemRow key={c.name} name={c.name} detail={c.trigger} sourcePlugin={c.sourcePlugin} />} />
    case 'mcps': return <McpTab config={config} />
  }
}
