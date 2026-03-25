'use client'

import type { AgentLocalConfig } from '@/types/agent-local-config'
import { ExpandableElementCard, ListTab, EmptyState, type TabId, type AgentInfo } from './shared'
import RoleTab from './RoleTab'
import PluginsTab from './PluginsTab'
import McpTab from './McpTab'

export default function TabContent({
  tab,
  config,
  agentId,
  agentInfo,
  onEditInHaephestos,
  onBrowse,
  onRefresh,
  onSwitchTab,
}: {
  tab: TabId
  config: AgentLocalConfig
  agentId: string
  agentInfo?: AgentInfo
  onEditInHaephestos?: (profilePath: string) => void
  onBrowse?: (path: string) => void
  onRefresh?: () => void
  onSwitchTab?: (tab: TabId) => void
}) {
  // Clicking "plugin: xxx" badge switches to the Plugins tab
  const handlePluginClick = onSwitchTab ? () => onSwitchTab('plugins') : undefined
  const rpName = config.rolePlugin?.name
  switch (tab) {
    case 'role': return <RoleTab config={config} onEditInHaephestos={onEditInHaephestos} onBrowse={onBrowse} />
    case 'plugins': return <PluginsTab config={config} />
    case 'skills': return (
      <ListTab items={config.skills} emptyText="No skills installed" emptyHint="Add skills to .claude/skills/ or install a plugin that bundles them." renderItem={(s) => (
        <ExpandableElementCard key={s.name} name={s.name} elementType="skill" detail={s.description} sourcePlugin={s.sourcePlugin} path={s.path} agentId={agentId} onRemoved={onRefresh} onPluginClick={handlePluginClick} rolePluginName={rpName} />
      )} />
    )
    case 'agents': return (
      <ListTab items={config.agents} emptyText="No subagents defined" emptyHint="Add agent .md files to .claude/agents/ or install a plugin." renderItem={(a) => (
        <ExpandableElementCard key={a.name} name={a.name} elementType="agent" detail={a.description} sourcePlugin={a.sourcePlugin} path={a.path} agentId={agentId} onRemoved={onRefresh} onPluginClick={handlePluginClick} rolePluginName={rpName} />
      )} />
    )
    case 'hooks': return (
      <ListTab items={config.hooks} emptyText="No hooks installed" emptyHint="Hooks are defined in settings.json or plugin hooks.json." renderItem={(h) => (
        <ExpandableElementCard key={`${h.name}-${h.eventType}`} name={h.name} elementType="hook" detail={h.eventType ? `Event: ${h.eventType}` : undefined} sourcePlugin={h.sourcePlugin} path={h.path} onPluginClick={handlePluginClick} rolePluginName={rpName} />
      )} />
    )
    case 'rules': return (
      <ListTab items={config.rules} emptyText="No rules installed" emptyHint="Add rule .md files to .claude/rules/ or install a plugin." renderItem={(r) => (
        <ExpandableElementCard key={r.name} name={r.name} elementType="rule" detail={r.preview} sourcePlugin={r.sourcePlugin} path={r.path} agentId={agentId} onRemoved={onRefresh} onPluginClick={handlePluginClick} rolePluginName={rpName} />
      )} />
    )
    case 'commands': return (
      <ListTab items={config.commands} emptyText="No commands installed" emptyHint="Add command .md files to .claude/commands/ for /slash commands." renderItem={(c) => (
        <ExpandableElementCard key={c.name} name={c.name} elementType="command" detail={c.trigger} sourcePlugin={c.sourcePlugin} path={c.path} agentId={agentId} onRemoved={onRefresh} onPluginClick={handlePluginClick} rolePluginName={rpName} />
      )} />
    )
    case 'mcps': return <McpTab config={config} agentId={agentId} onRefresh={onRefresh} />
    case 'outputStyles': return (
      <ListTab items={config.outputStyles} emptyText="No output styles" emptyHint="Add output style files to .claude/output-styles/ or install a plugin." renderItem={(o) => (
        <ExpandableElementCard key={o.name} name={o.name} elementType="outputStyle" sourcePlugin={o.sourcePlugin} path={o.path} agentId={agentId} onRemoved={onRefresh} onPluginClick={handlePluginClick} rolePluginName={rpName} />
      )} />
    )
  }
}
