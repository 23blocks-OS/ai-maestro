'use client'

import { useState, useEffect } from 'react'
import {
  X,
  ArrowLeft,
  Clock,
  Sparkles,
  Mail,
  Brain,
  Share2,
  ArrowRightLeft,
  Server,
  ChevronRight,
  BookOpen,
  Terminal
} from 'lucide-react'
import { tutorials, categoryLabels, categoryOrder, type Tutorial } from '@/lib/tutorialData'

// Map icon names to components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Mail,
  Brain,
  Share2,
  ArrowRightLeft,
  Server,
}

interface HelpPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null)
  const [currentStep, setCurrentStep] = useState(0)

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      // Delay reset to allow close animation
      const timer = setTimeout(() => {
        setSelectedTutorial(null)
        setCurrentStep(0)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (selectedTutorial) {
          setSelectedTutorial(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, selectedTutorial, onClose])

  const handleBack = () => {
    setSelectedTutorial(null)
    setCurrentStep(0)
  }

  const groupedTutorials = categoryOrder.map(category => ({
    category,
    label: categoryLabels[category],
    tutorials: tutorials.filter(t => t.category === category),
  }))

  return (
    <div
      className={`fixed top-0 right-0 h-full w-[380px] z-50 transform transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
        {/* Glass effect container */}
        <div className="h-full bg-gray-950/95 backdrop-blur-xl border-l border-gray-800/50 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 px-5 py-4 border-b border-gray-800/50">
            <div className="flex items-center justify-between">
              {selectedTutorial ? (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
                >
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                  <span className="text-sm font-medium">All Tutorials</span>
                </button>
              ) : (
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-blue-500/20">
                    <BookOpen className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">Help Center</h2>
                    <p className="text-xs text-gray-500">Learn AI Maestro</p>
                  </div>
                </div>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-800/50 text-gray-500 hover:text-gray-300 transition-colors"
                aria-label="Close help panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {selectedTutorial ? (
              <TutorialView
                tutorial={selectedTutorial}
                currentStep={currentStep}
                onStepChange={setCurrentStep}
              />
            ) : (
              <TopicList
                groupedTutorials={groupedTutorials}
                onSelect={setSelectedTutorial}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-5 py-3 border-t border-gray-800/50 bg-gray-900/50">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Press ESC to {selectedTutorial ? 'go back' : 'close'}</span>
              <a
                href="https://github.com/23blocks-OS/ai-maestro/blob/main/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-400 transition-colors"
              >
                Full Documentation
              </a>
            </div>
          </div>
        </div>
    </div>
  )
}

// Topic List View
interface TopicListProps {
  groupedTutorials: { category: string; label: string; tutorials: Tutorial[] }[]
  onSelect: (tutorial: Tutorial) => void
}

function TopicList({ groupedTutorials, onSelect }: TopicListProps) {
  return (
    <div className="py-4 space-y-6">
      {groupedTutorials.map(({ category, label, tutorials }) => (
        <div key={category}>
          {/* Category header */}
          <div className="px-5 mb-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              {label}
            </h3>
          </div>

          {/* Tutorial cards */}
          <div className="space-y-1 px-3">
            {tutorials.map((tutorial) => {
              const IconComponent = iconMap[tutorial.icon] || Sparkles
              return (
                <button
                  key={tutorial.id}
                  onClick={() => onSelect(tutorial)}
                  className="w-full group px-3 py-3 rounded-lg hover:bg-gray-800/50 transition-all duration-200 text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-800/80 group-hover:bg-gray-700/80 flex items-center justify-center transition-colors border border-gray-700/50">
                      <IconComponent className="w-4 h-4 text-gray-400 group-hover:text-blue-400 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                          {tutorial.title}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                        {tutorial.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Clock className="w-3 h-3 text-gray-600" />
                        <span className="text-[10px] text-gray-600">{tutorial.estimatedTime}</span>
                        <span className="text-gray-700 mx-1">•</span>
                        <span className="text-[10px] text-gray-600">{tutorial.steps.length} steps</span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// Tutorial View with Steps
interface TutorialViewProps {
  tutorial: Tutorial
  currentStep: number
  onStepChange: (step: number) => void
}

function TutorialView({ tutorial, currentStep, onStepChange }: TutorialViewProps) {
  const IconComponent = iconMap[tutorial.icon] || Sparkles

  return (
    <div className="py-4">
      {/* Tutorial header */}
      <div className="px-5 pb-4 border-b border-gray-800/30">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-blue-500/20">
            <IconComponent className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">{tutorial.title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Clock className="w-3 h-3 text-gray-500" />
              <span className="text-xs text-gray-500">{tutorial.estimatedTime}</span>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-400">{tutorial.description}</p>
      </div>

      {/* Progress indicator */}
      <div className="px-5 py-3 flex items-center gap-1.5">
        {tutorial.steps.map((_, idx) => (
          <button
            key={idx}
            onClick={() => onStepChange(idx)}
            className={`h-1 rounded-full transition-all duration-300 ${
              idx === currentStep
                ? 'w-6 bg-blue-500'
                : idx < currentStep
                  ? 'w-3 bg-blue-500/50'
                  : 'w-3 bg-gray-700'
            }`}
            aria-label={`Go to step ${idx + 1}`}
          />
        ))}
        <span className="ml-auto text-xs text-gray-500">
          {currentStep + 1} / {tutorial.steps.length}
        </span>
      </div>

      {/* Steps */}
      <div className="px-5 space-y-4">
        {tutorial.steps.map((step, idx) => (
          <div
            key={idx}
            className={`transition-all duration-300 ${
              idx === currentStep
                ? 'opacity-100'
                : idx < currentStep
                  ? 'opacity-50'
                  : 'opacity-30'
            }`}
          >
            <button
              onClick={() => onStepChange(idx)}
              className="w-full text-left group"
            >
              <div className="flex gap-3">
                {/* Step number */}
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  idx === currentStep
                    ? 'bg-blue-500 text-white'
                    : idx < currentStep
                      ? 'bg-blue-500/30 text-blue-400'
                      : 'bg-gray-800 text-gray-500'
                }`}>
                  {idx + 1}
                </div>

                {/* Step content */}
                <div className="flex-1 pt-0.5">
                  <h4 className={`text-sm font-medium transition-colors ${
                    idx === currentStep ? 'text-white' : 'text-gray-400'
                  }`}>
                    {step.title}
                  </h4>

                  {idx === currentStep && (
                    <div className="mt-2 space-y-3 animate-fadeIn">
                      <p className="text-sm text-gray-400 leading-relaxed">
                        {step.description}
                      </p>

                      {step.tip && (
                        <div className="relative">
                          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 border-b border-gray-800">
                              <Terminal className="w-3 h-3 text-gray-500" />
                              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Command</span>
                            </div>
                            <pre className="px-3 py-2.5 text-sm text-green-400 font-mono overflow-x-auto">
                              <code>{step.tip}</code>
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="px-5 pt-6 flex items-center gap-3">
        <button
          onClick={() => onStepChange(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onStepChange(Math.min(tutorial.steps.length - 1, currentStep + 1))}
          disabled={currentStep === tutorial.steps.length - 1}
          className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {currentStep === tutorial.steps.length - 1 ? 'Complete' : 'Next'}
        </button>
      </div>
    </div>
  )
}
