# Phase 02: Search & Filter Implementation

This phase implements the core search and filtering functionality across agents, messages, code graphs, and conversations. We'll build a sophisticated search engine that leverages CozoDB's graph capabilities to deliver fast, relevant results with advanced filtering options including date ranges, message types, sources, and relevance scoring.

## Tasks

- [ ] Implement full-text search with CozoDB integration:
  - Extend `lib/search-utility.ts` with advanced search functions:
    - fullTextSearch(agentId, query, options) - CozoDB full-text search across all indexed content
    - semanticSearch(agentId, query, options) - Vector similarity search using embeddings (if available)
    - hybridSearch(agentId, query, options) - Combine full-text and semantic search with weighted scoring
  - Implement relevance scoring algorithm:
    - Term frequency weighting (exact matches score higher)
    - Recent content boost (newer messages get slight boost)
    - Context matching (search within same session gets boost)
    - Type relevance weighting (user messages > assistant messages > system messages)
  - Add search result highlighting:
    - highlightTerms(text, queryTerms) - Wrap matching terms in `<mark>` tags
    - extractContext(result, query, contextLength) - Extract surrounding context for results

- [ ] Build advanced filtering system:
  - Extend `types/search.ts` with comprehensive filter options:
    - DateRangeFilter (startDate, endDate, relative ranges like 'last-7-days')
    - MessageTypeFilter (user, assistant, system, error - checkbox selection)
    - SourceFilter (conversations, code-graphs, messages, documentation)
    - AgentFilter (multiple agent selection)
    - SessionFilter (specific session selection, wildcard support)
  - Implement filter application in `lib/search-utility.ts`:
    - applyFilters(queryResults, filters) - Apply all filters to search results
    - buildFilterQuery(filters) - Convert filter options to CozoDB query
    - validateFilterCombination(filters) - Check for incompatible filter combinations

- [ ] Create search result aggregation and ranking:
  - Implement result aggregation in `lib/search-utility.ts`:
    - aggregateResultsByType(results) - Group results by type (messages, code, docs)
    - deduplicateResults(results) - Remove duplicates from multiple search sources
    - rankResults(results, relevanceScores) - Sort by combined relevance score
  - Add result caching layer:
    - SearchCache class with TTL (5 minutes) for common queries
    - cacheKey generation based on query + filters hash
    - cache invalidation on agent data updates

- [ ] Build search API with pagination and sorting:
  - Enhance `app/api/agents/[id]/search/route.ts`:
    - Add query parameters: q (search text), page, pageSize, sortBy, sortOrder
    - Support sort options: relevance, date, messageCount, agentName
    - Return paginated response with totalResults, pageCount, hasNextPage metadata
    - Implement server-side highlighting for large result sets
  - Add search suggestions endpoint:
    - Create `app/api/agents/[id]/search/suggestions/route.ts`
    - Return autocomplete suggestions based on indexed terms
    - Include suggestion types (terms, agents, sessions)

- [ ] Implement UI components for search and filtering:
  - Enhance `components/AgentSearch.tsx`:
    - Add filter panel with collapsible sections (date, type, source, agents)
    - Implement date range picker with preset ranges (today, last week, last month, custom)
    - Add type source badges (message, code, documentation) with color coding
    - Add sort dropdown with relevance/date/agent sorting
  - Create `components/SearchFilters.tsx`:
    - Filter chip system for active filters with remove buttons
    - Filter summary bar showing active filter count and quick clear button
    - Saved searches functionality with localStorage persistence

- [ ] Add keyboard shortcuts and UX enhancements:
  - Implement keyboard shortcuts:
    - Ctrl+K / Cmd+K - Focus search input
    - Ctrl+F / Cmd+F - Open advanced filters
    - Escape - Clear search/filters
    - Ctrl+Enter / Cmd+Enter - Execute search with current filters
  - Add search UX enhancements:
    - Debounced search (300ms delay) to reduce API calls
    - Loading skeleton while search is in progress
    - Empty states for no results with helpful suggestions
    - Result count display with "showing X of Y results" message

- [ ] Integrate search into existing agent views:
  - Update `components/SessionList.tsx` to include:
    - Global search bar at top of sidebar (searches across all agents)
    - Search results dropdown showing matching agents/sessions
    - Quick filter toggle for current agent
  - Update `components/TerminalView.tsx` to include:
    - In-terminal search (Ctrl+F) to search scrollback
    - Search results highlight with next/prev navigation
  - Update `app/page.tsx` main layout:
    - Add search hotkey listener component
    - Integrate search results panel overlay

- [ ] Test and validate search functionality:
  - Create comprehensive test data:
    - Test tmux session with varied message types (user, assistant, system, error)
    - Multiple conversations spanning different date ranges
    - Code indexed from test repository
    - Documentation indexed from test files
  - Test search scenarios:
    - Exact phrase matching with quotes
    - Boolean operators (AND, OR, NOT)
    - Wildcard and fuzzy matching
    - Date range filtering (last 7 days, custom range)
    - Multi-agent search results aggregation
    - Search result highlighting accuracy
    - Pagination and sorting behavior
    - Cached query performance improvement
  - Performance benchmark:
    - Search 1000+ messages in < 500ms
    - Full-text search across indexed code in < 1s
    - Filter application adds < 100ms overhead

- [ ] Documentation and polish:
  - Add search help modal accessible via ?
  - Document search syntax (operators, filters, examples)
  - Add keyboard shortcut cheat sheet in search panel
  - Ensure all search components follow existing design system (colors, typography, spacing)
  - Run `yarn lint` and `yarn build` to verify no regressions
