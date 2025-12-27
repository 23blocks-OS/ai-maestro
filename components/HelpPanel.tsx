'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  Terminal,
  User,
  Moon,
  Search,
  Loader2,
  FileText,
  BookMarked,
  Globe,
  Cpu,
  AlertTriangle,
  MousePointer2,
  KeyRound
} from 'lucide-react'
import { tutorials, categoryLabels, categoryOrder, type Tutorial } from '@/lib/tutorialData'
import type { HelpSearchResult } from '@/lib/help-search'

// Map icon names to components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Mail,
  Brain,
  Share2,
  ArrowRightLeft,
  Server,
  User,
  Moon,
  FileText,
  Globe,
  Cpu,
  AlertTriangle,
  MousePointer2,
  KeyRound,
}

interface HelpPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<HelpSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null!)
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced search function
  const performSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    setSearchError(null)

    try {
      const response = await fetch(`/api/help/search?q=${encodeURIComponent(query)}&limit=10`)
      const data = await response.json()

      if (data.success) {
        setSearchResults(data.results)
      } else {
        setSearchError(data.error || 'Search failed')
        setSearchResults([])
      }
    } catch {
      setSearchError('Failed to connect to search')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Handle search input change with debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)

    // Clear previous debounce
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }

    // Debounce search
    searchDebounceRef.current = setTimeout(() => {
      performSearch(query)
    }, 300)
  }

  // Clear search
  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setSearchError(null)
    searchInputRef.current?.focus()
  }

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      // Delay reset to allow close animation
      const timer = setTimeout(() => {
        setSelectedTutorial(null)
        setCurrentStep(0)
        setSearchQuery('')
        setSearchResults([])
        setSearchError(null)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
    }
  }, [])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (selectedTutorial) {
          setSelectedTutorial(null)
        } else if (searchQuery) {
          clearSearch()
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, selectedTutorial, searchQuery, onClose])

  // Handle search result click
  const handleSearchResultClick = (result: HelpSearchResult) => {
    if (result.type === 'glossary') {
      // For glossary items, we could show a modal or inline expansion
      // For now, just show the definition in the search result
      return
    }

    // For tutorials, navigate to the tutorial and optionally to a specific step
    if (result.tutorialId) {
      const tutorial = tutorials.find(t => t.id === result.tutorialId)
      if (tutorial) {
        setSelectedTutorial(tutorial)
        if (result.stepIndex !== undefined) {
          setCurrentStep(result.stepIndex)
        } else {
          setCurrentStep(0)
        }
        // Clear search after navigation
        setSearchQuery('')
        setSearchResults([])
      }
    }
  }

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
                searchQuery={searchQuery}
                searchResults={searchResults}
                isSearching={isSearching}
                searchError={searchError}
                onSearchChange={handleSearchChange}
                onClearSearch={clearSearch}
                onResultClick={handleSearchResultClick}
                searchInputRef={searchInputRef}
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
  searchQuery: string
  searchResults: HelpSearchResult[]
  isSearching: boolean
  searchError: string | null
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClearSearch: () => void
  onResultClick: (result: HelpSearchResult) => void
  searchInputRef: React.RefObject<HTMLInputElement>
}

function TopicList({
  groupedTutorials,
  onSelect,
  searchQuery,
  searchResults,
  isSearching,
  searchError,
  onSearchChange,
  onClearSearch,
  onResultClick,
  searchInputRef
}: TopicListProps) {
  const hasSearch = searchQuery.trim().length > 0
  const showResults = hasSearch && (searchResults.length > 0 || isSearching || searchError)

  return (
    <div className="py-4 space-y-4">
      {/* Search Input */}
      <div className="px-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search tutorials and glossary..."
            className="w-full pl-10 pr-10 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-all"
          />
          {isSearching ? (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" />
          ) : hasSearch ? (
            <button
              onClick={onClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Search Results */}
      {showResults && (
        <div className="px-3">
          {searchError ? (
            <div className="px-2 py-3 text-sm text-red-400">
              {searchError}
            </div>
          ) : isSearching ? (
            <div className="px-2 py-6 text-center">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-500">Searching...</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <p className="text-sm text-gray-400">No results found</p>
              <p className="text-xs text-gray-500 mt-1">Try searching for &quot;agent&quot;, &quot;tmux&quot;, or &quot;message&quot;</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-2 py-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </span>
              </div>
              {searchResults.map((result) => (
                <SearchResultItem
                  key={result.id}
                  result={result}
                  onClick={() => onResultClick(result)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tutorial Categories (dimmed when search has results) */}
      <div className={showResults && searchResults.length > 0 ? 'opacity-40' : ''}>
        {groupedTutorials.map(({ category, label, tutorials }) => (
          <div key={category} className="mb-6">
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
    </div>
  )
}

// Search Result Item Component
interface SearchResultItemProps {
  result: HelpSearchResult
  onClick: () => void
}

function SearchResultItem({ result, onClick }: SearchResultItemProps) {
  const isGlossary = result.type === 'glossary'
  const isTutorialStep = result.type === 'tutorial-step'

  // Get icon based on type
  const Icon = isGlossary ? BookMarked : FileText

  // Get type label
  const typeLabel = isGlossary
    ? 'Glossary'
    : isTutorialStep
      ? 'Tutorial Step'
      : 'Tutorial'

  // Format score as relevance indicator
  const relevanceLevel = result.score > 0.7 ? 'high' : result.score > 0.5 ? 'medium' : 'low'

  return (
    <button
      onClick={onClick}
      className="w-full group px-3 py-3 rounded-lg hover:bg-gray-800/50 transition-all duration-200 text-left"
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors border ${
          isGlossary
            ? 'bg-purple-500/10 border-purple-500/20 group-hover:bg-purple-500/20'
            : 'bg-blue-500/10 border-blue-500/20 group-hover:bg-blue-500/20'
        }`}>
          <Icon className={`w-4 h-4 ${
            isGlossary ? 'text-purple-400' : 'text-blue-400'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${
              isGlossary
                ? 'bg-purple-500/10 text-purple-400'
                : 'bg-blue-500/10 text-blue-400'
            }`}>
              {typeLabel}
            </span>
            <div className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-1 h-1 rounded-full ${
                    (relevanceLevel === 'high' && i <= 2) ||
                    (relevanceLevel === 'medium' && i <= 1) ||
                    (relevanceLevel === 'low' && i === 0)
                      ? 'bg-green-400'
                      : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>
          <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors block">
            {result.title}
          </span>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
            {result.text}
          </p>
          {result.relatedTerms && result.relatedTerms.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {result.relatedTerms.slice(0, 3).map(term => (
                <span key={term} className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">
                  {term}
                </span>
              ))}
            </div>
          )}
        </div>
        {!isGlossary && (
          <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
        )}
      </div>
    </button>
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
