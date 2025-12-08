'use client'

import { useState, useEffect } from 'react'
import {
  GitBranch,
  Folder,
  FileCode,
  Clock,
  Activity,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Calendar
} from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'

interface MobileWorkTreeProps {
  sessionName: string
  agentId?: string
  hostId?: string  // Agent-centric: pass hostId directly instead of looking up via sessions
  onConversationSelect: (file: string, projectPath: string) => void
}

interface AgentWork {
  agent_id: string
  sessions: SessionWork[]
  projects: ProjectWork[]
}

interface SessionWork {
  session_id: string
  session_name: string
  status: string
  started_at: number
  ended_at?: number
  log_file?: string
  total_claude_sessions: number
  total_messages: number
}

interface ProjectWork {
  project_id: string
  project_name: string
  project_path: string
  claude_config_dir: string
  total_sessions: number
  total_claude_sessions: number
  last_seen: number
  claude_sessions: ClaudeSessionWork[]
}

interface ClaudeSessionWork {
  claude_session_id: string
  session_type: string
  status: string
  message_count: number
  first_message_at?: number
  last_message_at?: number
  jsonl_file: string
  first_user_message?: string
  model_names?: string
  git_branch?: string
  claude_version?: string
}

export default function MobileWorkTree({
  sessionName,
  agentId,
  hostId,
  onConversationSelect
}: MobileWorkTreeProps) {
  const { hosts } = useHosts()
  const [workData, setWorkData] = useState<AgentWork | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  // Determine which host this agent is on - agent-centric: use hostId prop directly
  const getHostUrl = (): string => {
    // Local agent - use relative URL (works on mobile devices)
    if (!hostId || hostId === 'local') {
      return ''
    }

    // Remote agent - find host URL
    const host = hosts.find(h => h.id === hostId)
    if (host) {
      return host.url
    }

    // Fallback to local - use relative URL (works on mobile devices)
    return ''
  }

  const fetchWorkTree = async (forceInitialize = false) => {
    setLoading(true)
    setError(null)

    try {
      console.log('[MobileWorkTree] Starting fetch with:', { sessionName, agentId, forceInitialize })

      const hostUrl = getHostUrl()
      console.log('[MobileWorkTree] Host URL:', hostUrl)

      let currentAgentId = agentId

      if (!currentAgentId) {
        console.log('[MobileWorkTree] No agentId, creating from session:', sessionName)
        const createResponse = await fetch(`${hostUrl}/api/agents/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionName })
        })

        if (!createResponse.ok) {
          const errorText = await createResponse.text()
          console.error('[MobileWorkTree] Failed to create agent:', createResponse.status, errorText)
          throw new Error(`Failed to create agent: ${errorText}`)
        }

        const createData = await createResponse.json()
        currentAgentId = createData.agentId
        console.log('[MobileWorkTree] Created agentId:', currentAgentId)
      }

      if (forceInitialize) {
        console.log('[MobileWorkTree] Forcing initialization for agentId:', currentAgentId)
        await fetch(`${hostUrl}/api/agents/${currentAgentId}/memory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ populateFromSessions: true })
        })
      }

      console.log('[MobileWorkTree] Fetching work tree for agentId:', currentAgentId)
      const response = await fetch(`${hostUrl}/api/agents/${currentAgentId}/memory`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[MobileWorkTree] Failed to fetch work tree:', response.status, errorText)
        throw new Error(`Failed to fetch work tree: ${errorText}`)
      }

      const data = await response.json()
      console.log('[MobileWorkTree] Memory API response:', data)

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch memory')
      }

      // Transform data to match component interface (same as desktop WorkTree)
      const sessions: SessionWork[] = (data.sessions || []).map((row: any) => ({
        session_id: row[0],
        session_name: row[1],
        status: row[5],
        started_at: row[3],
        ended_at: row[4],
        total_claude_sessions: 0,
        total_messages: 0
      }))

      const projects: ProjectWork[] = (data.projects || []).map((item: any) => {
        const row = item.project
        const conversations = item.conversations || []

        return {
          project_id: row[0],
          project_name: row[1],
          project_path: row[0],
          claude_config_dir: row[2] || '',
          total_sessions: 0,
          total_claude_sessions: conversations.length,
          last_seen: row[4],
          claude_sessions: conversations.map((conv: any) => ({
            claude_session_id: conv[0],
            session_type: 'main',
            status: 'completed',
            message_count: conv[4],
            first_message_at: conv[2],
            last_message_at: conv[3],
            jsonl_file: conv[0],
            first_user_message: conv[5],
            model_names: conv[6],
            git_branch: conv[7],
            claude_version: conv[8]
          }))
        }
      })

      const transformedData: AgentWork = {
        agent_id: currentAgentId || agentId || '',
        sessions,
        projects
      }

      console.log('[MobileWorkTree] Transformed data:', transformedData)
      setWorkData(transformedData)

      // Auto-expand first project if exists
      if (transformedData.projects && transformedData.projects.length > 0 && expandedProjects.size === 0) {
        setExpandedProjects(new Set([transformedData.projects[0].project_id]))
      }
    } catch (err) {
      console.error('[MobileWorkTree] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkTree()
  }, [sessionName, agentId])

  const toggleProject = (projectId: string) => {
    const newExpanded = new Set(expandedProjects)
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId)
    } else {
      newExpanded.add(projectId)
    }
    setExpandedProjects(newExpanded)
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Unknown'
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const formatProjectName = (path: string) => {
    const parts = path.split('/')
    return parts[parts.length - 1] || path
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <RefreshCw className="w-12 h-12 text-blue-400 animate-spin mb-4" />
        <p className="text-sm text-gray-400">Loading work history...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-sm text-red-400 mb-4">{error}</p>
        <button
          onClick={() => fetchWorkTree(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Initialize & Retry
        </button>
      </div>
    )
  }

  if (!workData || (workData.projects.length === 0 && workData.sessions.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <Folder className="w-16 h-16 text-gray-600 mb-4" />
        <p className="text-lg font-medium text-gray-300 mb-2">No Work History</p>
        <p className="text-sm text-gray-500 mb-4">
          This agent hasn&apos;t worked on any projects yet
        </p>
        <button
          onClick={() => fetchWorkTree(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Initialize Agent
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Work History</h2>
          </div>
          <button
            onClick={() => fetchWorkTree()}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Projects Section */}
        {workData.projects.length > 0 && (
          <div className="p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Projects ({workData.projects.length})
            </h3>
            {workData.projects.map((project) => {
              const isExpanded = expandedProjects.has(project.project_id)
              return (
                <div key={project.project_id} className="bg-gray-800/50 rounded-lg overflow-hidden">
                  {/* Project Header */}
                  <button
                    onClick={() => toggleProject(project.project_id)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-800 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                    <Folder className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-white truncate">
                        {formatProjectName(project.project_path)}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-400">
                          {project.total_claude_sessions} conversation{project.total_claude_sessions !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs text-gray-500">
                          {formatDate(project.last_seen)}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Conversations List */}
                  {isExpanded && (
                    <div className="border-t border-gray-700">
                      {project.claude_sessions.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-gray-500 text-center">
                          No conversations yet
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-700">
                          {project.claude_sessions.map((conversation) => (
                            <button
                              key={conversation.claude_session_id}
                              onClick={() => onConversationSelect(conversation.jsonl_file, project.project_path)}
                              className="w-full px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
                            >
                              <div className="flex items-start gap-3">
                                <MessageSquare className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-white line-clamp-2 mb-1">
                                    {conversation.first_user_message || 'Untitled conversation'}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                    {conversation.git_branch && (
                                      <div className="flex items-center gap-1">
                                        <GitBranch className="w-3 h-3" />
                                        <span className="truncate max-w-[100px]">{conversation.git_branch}</span>
                                      </div>
                                    )}
                                    <span>{conversation.message_count} msgs</span>
                                    {conversation.last_message_at && (
                                      <>
                                        <span>•</span>
                                        <span>{formatDate(conversation.last_message_at)}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Sessions Section */}
        {workData.sessions.length > 0 && (
          <div className="p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Recent Sessions ({workData.sessions.length})
            </h3>
            {workData.sessions.map((session) => (
              <div key={session.session_id} className="bg-gray-800/50 rounded-lg px-4 py-3">
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {session.session_name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <span className={`px-2 py-0.5 rounded ${
                        session.status === 'active' ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'
                      }`}>
                        {session.status}
                      </span>
                      <span>•</span>
                      <span>{session.total_messages} msgs</span>
                      {session.started_at && (
                        <>
                          <span>•</span>
                          <span>{formatDate(session.started_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
