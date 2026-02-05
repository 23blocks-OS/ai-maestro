'use client'

import { useState, useCallback } from 'react'
import { Download, Calendar, FileText, X, CheckCircle, AlertCircle, Loader2, Settings } from 'lucide-react'
import { useTranscriptExport } from '@/hooks/useTranscriptExport'
import type { ExportType, ExportJob } from '@/types/export'

interface TranscriptExportProps {
  agentId: string
  agentName?: string
  onExportComplete?: (job: ExportJob) => void
  className?: string
}

export default function TranscriptExport({ 
  agentId, 
  agentName, 
  onExportComplete,
  className = '' 
}: TranscriptExportProps) {
  const [format, setFormat] = useState<ExportType>('markdown')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [includeMetadata, setIncludeMetadata] = useState(true)
  const [includeTimestamps, setIncludeTimestamps] = useState(true)
  const [maxMessages, setMaxMessages] = useState<number>(0)
  const [showOptions, setShowOptions] = useState(false)
  
  const { 
    exportTranscript, 
    jobs, 
    loading, 
    error,
    cancelJob,
    activeJobs,
    getJob
  } = useTranscriptExport(agentId)
  
  // Handle export
  const handleExport = useCallback(() => {
    const options = {
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
      includeMetadata,
      includeTimestamps,
      ...(maxMessages > 0 && { maxMessages })
    }
    
    exportTranscript(format, options)
  }, [format, startDate, endDate, includeMetadata, includeTimestamps, maxMessages, exportTranscript])
  
  // Handle cancel
  const handleCancel = useCallback((jobId: string) => {
    if (confirm('Are you sure you want to cancel this export?')) {
      cancelJob(jobId)
    }
  }, [cancelJob])
  
  // Get format icon
  const getFormatIcon = (type: ExportType) => {
    const icons = {
      json: <FileText className="w-4 h-4" />,
      markdown: <FileText className="w-4 h-4" />,
      plaintext: <FileText className="w-4 h-4" />,
      csv: <FileText className="w-4 h-4" />
    }
    return icons[type] || icons.json
  }
  
  // Get format label
  const getFormatLabel = (type: ExportType) => {
    const labels = {
      json: 'JSON',
      markdown: 'Markdown',
      plaintext: 'Plain Text',
      csv: 'CSV'
    }
    return labels[type] || labels.json
  }
  
  // Get status color
  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-600',
      processing: 'bg-blue-100 text-blue-600',
      completed: 'bg-green-100 text-green-600',
      failed: 'bg-red-100 text-red-600'
    }
    return colors[status as keyof typeof colors] || colors.pending
  }
  
  // Render export job card
  const renderJob = (job: ExportJob) => (
    <div key={job.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {getFormatIcon(job.type)}
          <div>
            <h4 className="text-sm font-medium text-gray-100">
              {getFormatLabel(job.type)} Export
            </h4>
            <p className="text-xs text-gray-500">{job.agentName || agentName}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(job.status)}`}>
          {job.status}
        </span>
      </div>
      
      {/* Progress Bar */}
      {(job.status === 'pending' || job.status === 'processing') && (
        <div className="mb-3">
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-400">
              {job.status === 'processing' ? 'Processing...' : 'Queued...'}
            </span>
            <span className="text-xs text-gray-400">{job.progress}%</span>
          </div>
        </div>
      )}
      
      {/* Completed State */}
      {job.status === 'completed' && job.filePath && (
        <div className="mb-3 p-3 bg-green-900/20 border border-green-800 rounded-md">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Export Complete</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            File saved to: <code className="bg-gray-800 px-1 rounded ml-1">{job.filePath}</code>
          </p>
          {job.completedAt && (
            <p className="text-xs text-gray-500 mt-1">
              Completed at: {new Date(job.completedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
      
      {/* Failed State */}
      {job.status === 'failed' && (
        <div className="mb-3 p-3 bg-red-900/20 border border-red-800 rounded-md">
          <div className="flex items-center gap-2 text-red-400 mb-1">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Export Failed</span>
          </div>
          <p className="text-xs text-gray-400">{job.errorMessage}</p>
        </div>
      )}
      
      {/* Actions */}
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-500">
          Created: {new Date(job.createdAt).toLocaleString()}
        </p>
        {(job.status === 'pending' || job.status === 'processing') && (
          <button
            onClick={() => handleCancel(job.id)}
            className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
          >
            Cancel
          </button>
        )}
        {job.status === 'failed' && (
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
  
  return (
    <div className={`flex flex-col ${className}`}>
      {/* Export Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-100">Export Transcript</h3>
        <button
          onClick={() => setShowOptions(!showOptions)}
          className={`p-2 rounded-lg transition-colors ${
            showOptions ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
          title="Toggle export options"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
      
      {/* Export Options Panel */}
      {showOptions && (
        <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-200">Export Options</h4>
            <button
              onClick={() => setShowOptions(false)}
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-4">
            {/* Format Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Export Format
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys({
                  json: 'JSON',
                  markdown: 'Markdown',
                  plaintext: 'Plain Text',
                  csv: 'CSV'
                }) as ExportType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFormat(type)}
                    className={`p-3 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${
                      format === type
                        ? 'border-blue-500 bg-blue-900/20 text-blue-400'
                        : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {getFormatIcon(type)}
                    <span className="text-sm font-medium">{getFormatLabel(type)}</span>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Start Date (Optional)
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  End Date (Optional)
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>
            
            {/* Options */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMetadata}
                  onChange={(e) => setIncludeMetadata(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 bg-gray-900"
                />
                <span className="text-sm text-gray-300">Include message metadata</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTimestamps}
                  onChange={(e) => setIncludeTimestamps(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 bg-gray-900"
                />
                <span className="text-sm text-gray-300">Include timestamps</span>
              </label>
            </div>
            
            {/* Max Messages */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Max Messages (0 = no limit)
              </label>
              <input
                type="number"
                min="0"
                value={maxMessages}
                onChange={(e) => setMaxMessages(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Export Button */}
      <button
        onClick={handleExport}
        disabled={loading}
        className={`w-full mb-4 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          loading ? 'animate-pulse' : ''
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Starting Export...
          </>
        ) : (
          <>
            <Download className="w-5 h-5" />
            Export Transcript
          </>
        )}
      </button>
      
      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-900/20 border border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error.message}</span>
          </div>
        </div>
      )}
      
      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-200 mb-3">Active Exports</h4>
          <div className="space-y-2">
            {activeJobs.map(renderJob)}
          </div>
        </div>
      )}
      
      {/* Recent Jobs */}
      {jobs.length > activeJobs.length && (
        <div>
          <h4 className="text-sm font-medium text-gray-200 mb-3">
            Recent Exports ({jobs.length - activeJobs.length})
          </h4>
          <div className="space-y-2">
            {jobs.filter(job => !activeJobs.includes(job)).slice(0, 5).map(renderJob)}
          </div>
        </div>
      )}
      
      {/* No Jobs */}
      {jobs.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Download className="w-12 h-12 mx-auto mb-2 text-gray-600" />
          <p>No exports yet</p>
          <p className="text-sm mt-1">Configure options above and click Export to start</p>
        </div>
      )}
    </div>
  )
}
