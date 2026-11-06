'use client'

/** The QR code a phone scans to find a host (#798). It holds addresses only, and the app asks before connecting. */
import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { ConnectInfo } from '@/lib/connect-info'

export default function ConnectPhoneDialog({ baseUrl = '', onClose }: { baseUrl?: string; onClose: () => void }) {
  const [info, setInfo] = useState<ConnectInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    fetch(`${baseUrl}/api/hosts/connect-info`, { signal: AbortSignal.timeout(10000) })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'This host needs a newer AI Maestro' : `HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => { if (live) setInfo(data) })
      .catch((err) => { if (live) setError(err.message) })
    return () => { live = false }
  }, [baseUrl])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Connect your phone" data-testid="connect-phone" className="bg-gray-800 rounded-xl p-6 w-full max-w-sm shadow-2xl border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white">Connect your phone{info ? ` to ${info.name}` : ''}</h3>
        {error && <p role="alert" className="mt-3 text-sm text-red-300 break-words">{error}</p>}
        {!info && !error && <p className="mt-3 text-sm text-gray-400">Loading…</p>}
        {info && info.urls.length === 0 && <p role="alert" className="mt-3 text-sm text-amber-300">This computer has no address a phone can reach. Connect it to Tailscale or a local network, then try again.</p>}
        {info && info.urls.length > 0 && (
          <>
            <div className="mt-4 flex justify-center">
              <div className="bg-white p-3 rounded-lg">
                <QRCodeSVG value={info.link} size={224} level="M" title="Connection code for the AI Maestro app" />
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-300">Install AI Maestro on your phone, open Tailscale on the phone with the same account, then scan this code with the app or the phone&apos;s camera.</p>
            <p className="mt-3 text-xs text-gray-500">Or type one of these, best first:</p>
            <ul className="mt-1 space-y-1">
              {info.urls.map((url) => <li key={url} className="text-xs font-mono text-gray-300 break-all select-all">{url}</li>)}
            </ul>
          </>
        )}
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm text-white">Close</button>
        </div>
      </div>
    </div>
  )
}
