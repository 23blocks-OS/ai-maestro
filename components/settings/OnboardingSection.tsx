'use client'

import { useState } from 'react'
import { Compass, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function OnboardingSection() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'restarting'>('idle')

  const onboardingCompleted = typeof window !== 'undefined'
    ? localStorage.getItem('aimaestro-onboarding-completed')
    : null

  const selectedUseCase = typeof window !== 'undefined'
    ? localStorage.getItem('aimaestro-onboarding-use-case')
    : null

  const handleRestartOnboarding = () => {
    setStatus('restarting')

    // Clear onboarding flags
    localStorage.removeItem('aimaestro-onboarding-completed')
    localStorage.removeItem('aimaestro-onboarding-use-case')

    // Redirect to home (which will trigger onboarding)
    setTimeout(() => {
      router.push('/')
    }, 500)
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Onboarding</h1>
        <p className="text-gray-400">
          Getting started guide and setup wizard for AI Maestro
        </p>
      </div>

      {/* Current Status */}
      <div className="mb-8 p-6 bg-gray-800/30 border border-gray-700 rounded-lg">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-400" />
          Onboarding Status
        </h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Status:</span>
            <span className={`font-medium ${onboardingCompleted ? 'text-green-400' : 'text-yellow-400'}`}>
              {onboardingCompleted ? 'Completed' : 'Not completed'}
            </span>
          </div>

          {selectedUseCase && (
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Selected Use Case:</span>
              <span className="font-medium text-blue-400 capitalize">
                {selectedUseCase.replace(/-/g, ' ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Restart Onboarding */}
      <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-lg">
        <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-blue-400" />
          Restart Onboarding
        </h2>
        <p className="text-gray-400 mb-4">
          Want to see the onboarding wizard again? This is useful if you want to:
        </p>
        <ul className="space-y-2 text-sm text-gray-300 mb-6">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Change your use case setup</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Review the getting started guide</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Create your first agent with the wizard</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Learn about different deployment options</span>
          </li>
        </ul>

        <button
          onClick={handleRestartOnboarding}
          disabled={status === 'restarting'}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
        >
          {status === 'restarting' ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Restarting...
            </>
          ) : (
            <>
              <Compass className="w-5 h-5" />
              Restart Onboarding
            </>
          )}
        </button>
      </div>

      {/* Information */}
      <div className="mt-8 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-blue-400 font-medium mb-1">What happens when you restart?</p>
            <p className="text-sm text-gray-300">
              You&apos;ll be redirected to the onboarding wizard, where you can choose your use case and follow the setup guide.
              Your existing sessions and settings will not be affected.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
