'use client'

import { useState, useEffect } from 'react'
import { GitBranch, Folder, FileCode, Clock, Activity, RefreshCw, AlertCircle } from 'lucide-react'
import ConversationDetailPanel from './ConversationDetailPanel'

interface WorkTreeProps {
  sessionName: string
  agentId?: string
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

export default function WorkTree({ sessionName, agentId }: WorkTreeProps) {
  const [workData, setWorkData] = useState<AgentWork | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [selectedConversation, setSelectedConversation] = useState<{
    file: string
    projectPath: string
  } | null>(null)

  const fetchWorkTree = async (forceInitialize = false) => {
    if (!agentId) {
      setError('No agent ID available for this session')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch agent memory
      let response = await fetch(`/api/agents/${agentId}/memory`)
      let data = await response.json()

      // If memory doesn't exist yet, initialize it
      // OR if forceInitialize is true (user clicked retry)
      if (forceInitialize || !data.success || (!data.sessions?.length && !data.projects?.length)) {
        console.log('[WorkTree] Initializing agent database and scanning conversations...')

        const initResponse = await fetch(`/api/agents/${agentId}/memory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ populateFromSessions: true })
        })

        const initData = await initResponse.json()

        if (!initResponse.ok || !initData.success) {
          throw new Error(initData.error || `Database initialization failed (${initResponse.status})`)
        }

        console.log('[WorkTree] ✓ Database initialized successfully')

        // Fetch again after initialization
        response = await fetch(`/api/agents/${agentId}/memory`)
        data = await response.json()

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch memory after initialization')
        }
      }

      // Transform data to match component interface
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

      setWorkData({
        agent_id: agentId,
        sessions,
        projects
      })
    } catch (err) {
      console.error('[WorkTree] Error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkTree()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  const toggleProject = (projectId: string) => {
    const newExpanded = new Set(expandedProjects)
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId)
    } else {
      newExpanded.add(projectId)
    }
    setExpandedProjects(newExpanded)
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
  }

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'just now'
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-lg mb-2">Loading work history...</p>
          <p className="text-gray-500 text-sm">Initializing tracking if needed</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-900">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-gray-300 font-medium mb-2">Failed to load work tree</p>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button
            onClick={() => fetchWorkTree(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Initialize & Retry
          </button>
          <p className="text-gray-600 text-xs mt-2">This will create the agent database and scan for conversations</p>
        </div>
      </div>
    )
  }

  if (!workData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <GitBranch className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No work data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Work Tree</h2>
          <span className="text-sm text-gray-500">Agent: {agentId}</span>
        </div>
        <button
          onClick={() => fetchWorkTree()}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Sessions Section */}
        {workData.sessions.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Sessions ({workData.sessions.length})
            </h3>
            <div className="space-y-2">
              {workData.sessions.map((session) => (
                <div
                  key={session.session_id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:bg-gray-800/70 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="text-white font-medium">{session.session_name}</h4>
                      <p className="text-sm text-gray-400 mt-1">ID: {session.session_id}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      session.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {session.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mt-3">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatRelativeTime(session.started_at)}
                    </span>
                    <span>{session.total_messages} messages</span>
                    <span>{session.total_claude_sessions} conversations</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects Section */}
        {workData.projects.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Folder className="w-4 h-4" />
              Projects ({workData.projects.length})
            </h3>
            <div className="space-y-2">
              {workData.projects.map((project) => (
                <div
                  key={project.project_id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden"
                >
                  <div
                    className="p-4 hover:bg-gray-800/70 transition-colors cursor-pointer"
                    onClick={() => toggleProject(project.project_id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="text-white font-medium flex items-center gap-2">
                          <Folder className="w-4 h-4 text-blue-400" />
                          {project.project_name}
                        </h4>
                        <p className="text-sm text-gray-400 mt-1 font-mono text-xs">
                          {project.project_path}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatRelativeTime(project.last_seen)}
                      </span>
                      <span>{project.total_claude_sessions} conversations</span>
                    </div>
                  </div>

                  {/* Claude Sessions */}
                  {expandedProjects.has(project.project_id) && project.claude_sessions && (
                    <div className="border-t border-gray-700 bg-gray-900/50 p-4">
                      <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                        Claude Sessions ({project.claude_sessions.length})
                      </h5>
                      <div className="space-y-2">
                        {project.claude_sessions.map((claudeSession) => {
                          const duration = claudeSession.first_message_at && claudeSession.last_message_at
                            ? claudeSession.last_message_at - claudeSession.first_message_at
                            : 0
                          const durationHours = Math.floor(duration / 3600000)
                          const durationMinutes = Math.floor((duration % 3600000) / 60000)
                          const durationStr = durationHours > 0
                            ? `${durationHours}h ${durationMinutes}m`
                            : `${durationMinutes}m`

                          return (
                            <div
                              key={claudeSession.claude_session_id}
                              className="bg-gray-800/30 border border-gray-700/50 rounded p-3 hover:bg-gray-800/50 transition-colors cursor-pointer"
                              onClick={() => setSelectedConversation({
                                file: claudeSession.jsonl_file,
                                projectPath: project.project_path
                              })}
                            >
                              {/* Date and Models */}
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                  {claudeSession.first_message_at && (
                                    <span className="text-sm text-gray-300">
                                      {new Date(claudeSession.first_message_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: '2-digit'
                                      })}
                                    </span>
                                  )}
                                </div>
                                {claudeSession.model_names && (
                                  <span className="text-xs text-blue-400 font-medium">
                                    {claudeSession.model_names}
                                  </span>
                                )}
                              </div>

                              {/* Task Description */}
                              {claudeSession.first_user_message && (
                                <p className="text-sm text-gray-200 mb-2 line-clamp-2">
                                  &quot;{claudeSession.first_user_message}&quot;
                                </p>
                              )}

                              {/* Stats */}
                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span className="flex items-center gap-1">
                                  <FileCode className="w-3 h-3" />
                                  {claudeSession.message_count.toLocaleString()} msgs
                                </span>
                                {duration > 0 && (
                                  <span>⏱️ {durationStr}</span>
                                )}
                                {claudeSession.last_message_at && (
                                  <span>{formatRelativeTime(claudeSession.last_message_at)}</span>
                                )}
                              </div>

                              {/* File path - collapsed by default */}
                              <details className="mt-2">
                                <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-500">
                                  Show file path
                                </summary>
                                <p className="text-xs text-gray-600 mt-1 font-mono break-all">
                                  {claudeSession.jsonl_file}
                                </p>
                              </details>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {workData.sessions.length === 0 && workData.projects.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <GitBranch className="w-16 h-16 text-gray-700 mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">No work history yet</h3>
            <p className="text-sm text-gray-500 max-w-md">
              This agent hasn&apos;t tracked any sessions or projects yet. Start working with Claude Code to build your work tree.
            </p>
          </div>
        )}
      </div>

      {/* Conversation Detail Panel */}
      {selectedConversation && (
        <ConversationDetailPanel
          conversationFile={selectedConversation.file}
          projectPath={selectedConversation.projectPath}
          onClose={() => setSelectedConversation(null)}
        />
      )}
    </div>
  )
}
