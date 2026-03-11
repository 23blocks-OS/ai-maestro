'use client'

import { FileText, X } from 'lucide-react'

interface HaephestosLeftPanelProps {
  files: Array<{ path: string; filename: string }>
  onRemoveFile: (path: string) => void
  onClose?: () => void
}

export default function HaephestosLeftPanel({
  files,
  onRemoveFile,
  onClose,
}: HaephestosLeftPanelProps) {
  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200">
      {/* Header with optional mobile close */}
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="text-xs uppercase tracking-wider text-gray-500">Workshop</span>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center py-6 border-b border-gray-700">
        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
          <span className="text-5xl leading-none" role="img" aria-label="Haephestos">
            🔨
          </span>
        </div>
        <span className="mt-2 text-sm font-medium tracking-wide" style={{ fontVariant: 'small-caps' }}>
          Haephestos
        </span>
      </div>

      {/* Attached files section */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 px-1">
          Attached Files
        </h3>

        {files.length === 0 ? (
          <p className="text-xs italic text-gray-600 px-1">No files attached</p>
        ) : (
          <ul className="space-y-1">
            {files.map((file) => (
              <li
                key={file.path}
                className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800 transition-colors"
              >
                <FileText size={14} className="shrink-0 text-gray-500" />
                <span className="text-xs truncate flex-1" title={file.filename}>
                  {file.filename}
                </span>
                <button
                  onClick={() => onRemoveFile(file.path)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-opacity"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
