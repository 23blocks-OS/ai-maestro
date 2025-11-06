'use client'

import { useState } from 'react'
import UseCaseSelector from './UseCaseSelector'
import SingleComputerGuide from './guides/SingleComputerGuide'
import MultiComputerGuide from './guides/MultiComputerGuide'
import DockerLocalGuide from './guides/DockerLocalGuide'
import DockerHybridGuide from './guides/DockerHybridGuide'
import AdvancedGuide from './guides/AdvancedGuide'

export type UseCase =
  | 'single-computer'
  | 'multi-computer'
  | 'docker-local'
  | 'docker-hybrid'
  | 'advanced'
  | null

interface OnboardingFlowProps {
  onComplete: () => void
  onSkip: () => void
}

export default function OnboardingFlow({ onComplete, onSkip }: OnboardingFlowProps) {
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase>(null)

  const handleUseCaseSelect = (useCase: UseCase) => {
    setSelectedUseCase(useCase)
  }

  const handleBack = () => {
    setSelectedUseCase(null)
  }

  const handleComplete = () => {
    // Mark onboarding as completed
    localStorage.setItem('aimaestro-onboarding-completed', 'true')
    localStorage.setItem('aimaestro-onboarding-use-case', selectedUseCase || '')
    onComplete()
  }

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 overflow-auto">
      {selectedUseCase === null ? (
        <UseCaseSelector onSelect={handleUseCaseSelect} onSkip={onSkip} />
      ) : selectedUseCase === 'single-computer' ? (
        <SingleComputerGuide onBack={handleBack} onComplete={handleComplete} />
      ) : selectedUseCase === 'multi-computer' ? (
        <MultiComputerGuide onBack={handleBack} onComplete={handleComplete} />
      ) : selectedUseCase === 'docker-local' ? (
        <DockerLocalGuide onBack={handleBack} onComplete={handleComplete} />
      ) : selectedUseCase === 'docker-hybrid' ? (
        <DockerHybridGuide onBack={handleBack} onComplete={handleComplete} />
      ) : selectedUseCase === 'advanced' ? (
        <AdvancedGuide onBack={handleBack} onComplete={handleComplete} />
      ) : null}
    </div>
  )
}
