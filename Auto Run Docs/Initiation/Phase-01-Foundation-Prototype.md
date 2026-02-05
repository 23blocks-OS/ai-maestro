# Phase 01: Foundation & Working Prototype

This phase establishes the foundational infrastructure for Phase 5 features (search, export, playback). We'll set up the necessary API routes, database schema extensions, and UI scaffolding to support these advanced capabilities. By the end of this phase, we'll have a working prototype with basic search endpoints, export utilities, and playback state management that can be tested and expanded.

## Tasks

- [x] Set up database schema extensions for Phase 5 features:
  - Create `lib/cozo-schema-phase5.ts` with new relations:
    - Transcript entity (agentId, sessionId, startTime, endTime, messageCount, filePath)
    - PlaybackState entity (agentId, sessionId, isPlaying, currentPosition, playbackSpeed)
    - ExportJob entity (agentId, sessionId, exportType, status, createdAt, filePath)
  - Update `lib/cozo-db.ts` to include schema initialization for Phase 5
  - Create migration scripts in `scripts/migrations/` for existing agents

- [x] Create API route scaffolding for Phase 5 endpoints:
  - `app/api/agents/[id]/search/route.ts` - GET endpoint for searching across agent data (messages, conversations, code) **(ALREADY EXISTS - comprehensive RAG search)**
  - `app/api/agents/[id]/export/route.ts` - POST endpoint for triggering transcript exports (JSON, MD, TXT formats) **(ADDED POST handler for transcript exports)**
  - `app/api/agents/[id]/playback/route.ts` - GET/POST endpoints for playback state management **(CREATED)**
  - `app/api/export/jobs/[jobId]/route.ts` - GET endpoint for checking export job status **(CREATED)**
  - Each route should include proper error handling and validation **(IMPLEMENTED)**

**Implementation Notes:**
- Added POST handler to existing export route for transcript exports (formats: json, markdown, plaintext)
- Created new playback route with GET (get state) and POST (control playback) handlers
- Created export jobs status route with GET (status) and DELETE (cancel) handlers
- All routes include proper validation, error handling, and placeholder TODO comments for future Phase 5 implementation
- Type definitions (PlaybackState, ExportJob, etc.) defined inline with TODO comments to move to types/ in future task

- [x] Implement core utility libraries for Phase 5 features:
   - `lib/search-utility.ts` - Search helper functions:
     - searchMessages(agentId, query) - Search indexed messages using CozoDB
     - filterSessions(filter) - Filter sessions by date, activity, message count
     - buildSearchResponse(results, highlightTerms) - Format search results with term highlighting
   - `lib/transcript-export.ts` - Export helper functions:
     - exportTranscript(agentId, format, options) - Main export orchestrator
     - formatAsMarkdown(transcript, options) - Convert to MD format
     - formatAsJSON(transcript, options) - Convert to JSON format
     - formatAsPlainText(transcript, options) - Convert to TXT format
   - `lib/playback-manager.ts` - Playback state management:
     - PlaybackState class with start(), pause(), seek(), setSpeed() methods
     - loadPlaybackState(agentId) - Load persisted state from CozoDB
     - savePlaybackState(agentId, state) - Persist state to CozoDB

- [x] Create TypeScript type definitions for Phase 5:
  - `types/transcript.ts`:
    - Transcript interface with id, agentId, sessionId, startTime, endTime, messageCount, filePath
    - TranscriptMessage interface with role, content, timestamp, metadata
  - `types/search.ts`:
    - SearchQuery interface with queryText, filters (dateRange, messageTypes, sources)
    - SearchResult interface with id, type, content, highlight, relevanceScore
    - SearchFilter interface for advanced filtering options
  - `types/playback.ts`:
    - PlaybackState interface with agentId, sessionId, isPlaying, currentMessageIndex, speed
    - PlaybackControl interface for start/pause/seek/setSpeed operations
  - `types/export.ts`:
    - ExportType enum ('json', 'markdown', 'plaintext', 'csv')
    - ExportJob interface with id, agentId, sessionId, type, status, progress, filePath
    - ExportOptions interface for customizing export output

- [x] Create React hooks for Phase 5 features:
   - `hooks/useAgentSearch.ts`:
     - search(query, filters) function with debouncing
     - searchResults state management
     - searchError state with retry logic
   - `hooks/useTranscriptExport.ts`:
     - exportTranscript(format, options) function
     - exportJobs state tracking
     - exportProgress polling for long-running jobs
   - `hooks/useAgentPlayback.ts`:
     - playbackState management (isPlaying, currentPosition, speed)
     - playbackControls (start, pause, seek, setSpeed)
     - playbackMessages loading and caching

- [x] Build basic UI scaffolding components:
   - `components/AgentSearch.tsx`:
     - Search input with autocomplete and filters dropdown
     - Results list with highlighting and type indicators
     - Pagination controls for large result sets
   - `components/TranscriptExport.tsx`:
     - Export format selector (JSON/MD/TXT)
     - Date range picker for export scope
     - Export button with progress indicator
   - `components/AgentPlayback.tsx`:
     - Playback controls (play/pause, seek slider, speed selector)
     - Current message display with navigation
     - Playback timeline visualization

**Implementation Notes:**
- Created AgentSearch.tsx with search input, filters (mode, results per page), result cards with highlighting, pagination
- Created TranscriptExport.tsx with format selector (JSON/MD/PLAINTEXT/CSV), date range picker, options (metadata, timestamps, max messages), export job tracking with progress
- Created AgentPlayback.tsx with play/pause/seek/speed controls, current message display, keyboard shortcuts (Space, arrows, Home/End), timeline visualization
- All components follow existing patterns: Tailwind CSS, lucide-react icons, TypeScript, proper state management
- Components integrate with existing hooks: useAgentSearch, useTranscriptExport, useAgentPlayback
- Linting: Only expected warning is about HTML entities in dangerouslySetInnerHTML (required for highlighting)

- [x] Integrate Phase 5 components into main page:
   - Update `app/page.tsx` to include:
     - Search panel in agent detail view (hidden by default, toggleable)
     - Export button in agent actions menu
     - Playback controls when viewing agent transcripts
   - Ensure all new components use existing patterns (visibility toggling, localStorage persistence)
   - Add keyboard shortcuts (Ctrl+K for search, Ctrl+E for export, Space for playback)

**Implementation Notes:**
- Added three new tab buttons to tab navigation: Search, Playback, Export
- All three new tabs render their respective components in tab content area
- Added Ctrl+E keyboard shortcut to open Export dialog (Ctrl+K handled by AgentSearch component, Space by AgentPlayback)
- Components follow existing tab architecture pattern with visibility toggling
- Build passes successfully; lint passes with only expected warnings

- [ ] Test and verify working prototype:
  - Create test tmux session with sample Claude Code conversation
  - Test search endpoint with various queries (by message content, by date range, by type)
  - Test export endpoint with all three formats (JSON, MD, TXT)
  - Test playback state persistence across page refreshes
  - Verify all API routes return proper error messages for invalid inputs
  - Run `yarn lint` and `yarn build` to ensure no errors
