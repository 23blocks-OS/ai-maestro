'use client'

import { useState, useEffect, useCallback } from 'react'
import { GitBranch, ExternalLink, Copy, FolderGit2, Loader2, RefreshCw, Check } from 'lucide-react'

interface GitHubProject {
  owner: string
  repo: string
  number: number
}

interface RepoItem {
  name: string
  url: string
  cloneUrl: string
  status?: string
}

interface TeamReposSectionProps {
  teamId: string
  githubProject?: GitHubProject
}

export default function TeamReposSection({ teamId, githubProject }: TeamReposSectionProps) {
  const [repos, setRepos] = useState<RepoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const fetchRepos = useCallback(async () => {
    if (!githubProject) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/teams/${teamId}/repos`)
      if (!res.ok) throw new Error(`Failed to fetch repos (${res.status})`)
      const data = await res.json()
      setRepos(data.repos ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repos')
    } finally {
      setLoading(false)
    }
  }, [teamId, githubProject])

  // Fetch repos on mount when a GitHub project is linked
  useEffect(() => {
    fetchRepos()
  }, [fetchRepos])

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  // No GitHub project linked — show placeholder
  if (!githubProject) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Repositories</h2>
        <div className="text-center py-12">
          <FolderGit2 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No GitHub project linked</p>
          <p className="text-xs text-gray-600 mt-1">Link a GitHub project in team settings to see repositories</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Repositories</h2>
          <p className="text-xs text-gray-500">
            {githubProject.owner}/{githubProject.repo} &middot; Project #{githubProject.number}
          </p>
        </div>
        <button
          onClick={fetchRepos}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Loading state */}
      {loading && repos.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-red-400 mb-2">{error}</p>
          <button onClick={fetchRepos} className="text-xs text-gray-400 hover:text-white underline">
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && repos.length === 0 && (
        <div className="text-center py-12">
          <FolderGit2 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No repositories found</p>
          <p className="text-xs text-gray-600 mt-1">Add repositories to the linked GitHub project</p>
        </div>
      )}

      {/* Repo list */}
      {repos.length > 0 && (
        <div className="space-y-2">
          {repos.map((repo, idx) => (
            <div
              key={repo.name}
              className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 hover:border-gray-600 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <GitBranch className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-400 hover:text-blue-300 truncate"
                  >
                    {repo.name}
                    <ExternalLink className="w-3 h-3 inline ml-1 opacity-60" />
                  </a>
                  {repo.status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 flex-shrink-0">
                      {repo.status}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleCopy(repo.cloneUrl, idx)}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-gray-700/60 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                  title="Copy clone command"
                >
                  {copiedIdx === idx ? (
                    <><Check className="w-3 h-3 text-emerald-400" /> Copied</>
                  ) : (
                    <><Copy className="w-3 h-3" /> Clone</>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mt-1.5 font-mono truncate pl-6">
                git clone {repo.cloneUrl}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
