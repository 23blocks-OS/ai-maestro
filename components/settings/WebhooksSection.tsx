'use client'

import React, { useState, useEffect } from 'react'
import {
  Webhook, Plus, Trash2, RefreshCw, X, AlertCircle,
  Check, Copy, PlayCircle, CheckCircle, XCircle, Clock
} from 'lucide-react'
import type { WebhookSubscription, CreateWebhookRequest, WebhookEventType } from '@/types/agent'

const VALID_EVENTS: { id: WebhookEventType; label: string; description: string }[] = [
  { id: 'agent.email.changed', label: 'Email Changed', description: 'When an agent adds or removes email addresses' },
  { id: 'agent.created', label: 'Agent Created', description: 'When a new agent is registered' },
  { id: 'agent.deleted', label: 'Agent Deleted', description: 'When an agent is removed' },
  { id: 'agent.updated', label: 'Agent Updated', description: 'When agent metadata is modified' },
]

export default function WebhooksSection() {
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null)
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null)

  // Create form state
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState<WebhookEventType[]>(['agent.email.changed'])
  const [newDescription, setNewDescription] = useState('')

  // Fetch webhooks
  const fetchWebhooks = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/webhooks')
      if (response.ok) {
        const data = await response.json()
        setWebhooks(data.webhooks || [])
      } else {
        const err = await response.json()
        setError(err.error || 'Failed to load webhooks')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWebhooks()
  }, [])

  // Create webhook
  const handleCreate = async () => {
    if (!newUrl.trim() || newEvents.length === 0) return

    setSaving(true)
    setError(null)
    try {
      const payload: CreateWebhookRequest = {
        url: newUrl.trim(),
        events: newEvents,
        description: newDescription.trim() || undefined,
      }

      const response = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const data = await response.json()
        // Show the secret to the user (only time it's visible)
        alert(`Webhook created!\n\nIMPORTANT: Copy your secret now. It won't be shown again.\n\nSecret: ${data.webhook.secret}`)
        setShowCreateDialog(false)
        setNewUrl('')
        setNewEvents(['agent.email.changed'])
        setNewDescription('')
        fetchWebhooks()
      } else {
        const err = await response.json()
        setError(err.error || 'Failed to create webhook')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setSaving(false)
    }
  }

  // Delete webhook
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return

    try {
      const response = await fetch(`/api/webhooks/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchWebhooks()
      } else {
        const err = await response.json()
        setError(err.error || 'Failed to delete webhook')
      }
    } catch (err) {
      setError('Failed to connect to server')
    }
  }

  // Test webhook
  const handleTest = async (id: string) => {
    setTestingId(id)
    setTestResult(null)
    try {
      const response = await fetch(`/api/webhooks/${id}/test`, {
        method: 'POST',
      })

      const data = await response.json()
      setTestResult({
        id,
        success: data.success,
        message: data.success ? 'Webhook delivered successfully' : (data.error || 'Delivery failed'),
      })
    } catch (err) {
      setTestResult({
        id,
        success: false,
        message: 'Failed to send test',
      })
    } finally {
      setTestingId(null)
    }
  }

  // Copy secret placeholder
  const copySecret = (id: string) => {
    // Since we don't show secrets, copy the webhook ID instead
    navigator.clipboard.writeText(id)
    setCopiedSecret(id)
    setTimeout(() => setCopiedSecret(null), 2000)
  }

  // Toggle event selection
  const toggleEvent = (eventId: WebhookEventType) => {
    setNewEvents(prev =>
      prev.includes(eventId)
        ? prev.filter(e => e !== eventId)
        : [...prev, eventId]
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Webhooks</h1>
          <p className="text-gray-400">
            Subscribe external systems to agent identity changes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchWebhooks}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Webhook
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-4 mb-6 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center p-12 bg-gray-800/50 rounded-xl border border-gray-700">
          <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
          <span className="ml-3 text-gray-400">Loading webhooks...</span>
        </div>
      ) : webhooks.length === 0 ? (
        /* Empty state */
        <div className="text-center p-12 bg-gray-800/50 rounded-xl border border-gray-700">
          <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <Webhook className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-200 mb-2">No webhooks configured</h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Webhooks allow external systems like email gateways to receive real-time notifications
            when agent identity changes (e.g., email addresses added or removed).
          </p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Create Your First Webhook
          </button>
        </div>
      ) : (
        /* Webhook list */
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="bg-gray-800/50 rounded-xl border border-gray-700 hover:border-gray-600 transition-all overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    webhook.status === 'active' ? 'bg-green-500/10' : 'bg-yellow-500/10'
                  }`}>
                    <Webhook className={`w-6 h-6 ${
                      webhook.status === 'active' ? 'text-green-400' : 'text-yellow-400'
                    }`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-sm text-gray-100 truncate">{webhook.url}</span>
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        webhook.status === 'active'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {webhook.status}
                      </span>
                      {webhook.failureCount && webhook.failureCount > 0 && (
                        <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {webhook.failureCount} failures
                        </span>
                      )}
                    </div>

                    {webhook.description && (
                      <p className="text-sm text-gray-400 mb-2">{webhook.description}</p>
                    )}

                    {/* Events */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {webhook.events.map((event) => (
                        <span
                          key={event}
                          className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded"
                        >
                          {event}
                        </span>
                      ))}
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Created {formatDate(webhook.createdAt)}
                      </span>
                      {webhook.lastDeliveryAt && (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-green-400" />
                          Last delivery: {formatDate(webhook.lastDeliveryAt)}
                        </span>
                      )}
                    </div>

                    {/* Test result */}
                    {testResult && testResult.id === webhook.id && (
                      <div className={`mt-3 p-2 rounded text-sm flex items-center gap-2 ${
                        testResult.success
                          ? 'bg-green-500/10 text-green-300'
                          : 'bg-red-500/10 text-red-300'
                      }`}>
                        {testResult.success ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        {testResult.message}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTest(webhook.id)}
                      disabled={testingId === webhook.id}
                      className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-blue-400 transition-all disabled:opacity-50"
                      title="Send test webhook"
                    >
                      {testingId === webhook.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <PlayCircle className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => copySecret(webhook.id)}
                      className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-all"
                      title="Copy webhook ID"
                    >
                      {copiedSecret === webhook.id ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(webhook.id)}
                      className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-all"
                      title="Delete webhook"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
        <h4 className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2">
          <Webhook className="w-4 h-4" />
          How Webhooks Work
        </h4>
        <ul className="text-sm text-gray-400 space-y-1.5">
          <li>• When an event occurs, AI Maestro sends an HTTP POST to your URL</li>
          <li>• Payloads include a <code className="text-blue-300 bg-blue-500/10 px-1 rounded">X-Webhook-Signature</code> header (HMAC SHA-256)</li>
          <li>• Use your webhook secret to verify the signature and ensure authenticity</li>
          <li>• Failed deliveries are retried with exponential backoff</li>
        </ul>
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Webhook className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Create Webhook</h3>
                <p className="text-sm text-gray-400">Subscribe to agent identity events</p>
              </div>
            </div>

            {/* Error in dialog */}
            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* URL */}
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">
                  Webhook URL *
                </label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://your-service.com/webhooks/aimaestro"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
                  autoFocus
                />
              </div>

              {/* Events */}
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">
                  Events to subscribe *
                </label>
                <div className="space-y-2">
                  {VALID_EVENTS.map((event) => (
                    <label
                      key={event.id}
                      className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800 transition-all group"
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all mt-0.5 flex-shrink-0 ${
                          newEvents.includes(event.id)
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-600 group-hover:border-gray-500'
                        }`}
                        onClick={() => toggleEvent(event.id)}
                      >
                        {newEvents.includes(event.id) && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-200">{event.label}</div>
                        <div className="text-xs text-gray-500">{event.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="e.g., Email gateway routing table updates"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateDialog(false)
                  setNewUrl('')
                  setNewEvents(['agent.email.changed'])
                  setNewDescription('')
                  setError(null)
                }}
                className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newUrl.trim() || newEvents.length === 0 || saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Webhook
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              A secret will be generated for signature verification. Save it - it will not be shown again.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
