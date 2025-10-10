# Contributing to AI Maestro

Thank you for your interest in contributing to AI Maestro! This document provides guidelines for contributing to the project.

## Code of Conduct

**Be Respectful:**
- Treat all contributors with respect
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Assume good intentions

**Zero Tolerance for:**
- Harassment or discrimination of any kind
- Personal attacks
- Trolling or inflammatory comments
- Spam or self-promotion

## How to Contribute

### 1. Reporting Bugs

**Before submitting a bug report:**
- Check existing issues to avoid duplicates
- Test with the latest version
- Gather relevant information (OS version, Node version, error messages)

**Bug report should include:**
- Clear, descriptive title
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Environment details (macOS version, Node version, tmux version)

### 2. Suggesting Features

**Feature requests should include:**
- Clear description of the feature
- Use case and benefits
- Potential implementation approach
- Why it fits with the project goals

**Note:** Please check the roadmap in README.md first!

### 3. Pull Requests

**Before submitting a PR:**
- Discuss major changes in an issue first
- Fork the repository
- Create a feature branch (`git checkout -b feature/amazing-feature`)
- Follow the coding standards below

**PR Requirements:**
- Clear description of changes
- Reference related issue(s)
- Update documentation if needed
- Ensure the code runs without errors
- Follow existing code style

**PR Process:**
1. Fork the repo
2. Create your feature branch
3. Make your changes
4. Test thoroughly
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/agents-web.git
cd agents-web

# Install dependencies
yarn install

# Start development server
yarn dev

# Test your changes
# Open http://localhost:3000
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define proper types (no `any` unless absolutely necessary)
- Use interfaces for object shapes
- Export types from `types/` directory

### React Components

- Use functional components with hooks
- Keep components small and focused
- Use meaningful component and variable names
- Add JSDoc comments for complex logic

```typescript
// ✅ Good
interface SessionListProps {
  sessions: Session[]
  onSessionSelect: (id: string) => void
}

export default function SessionList({ sessions, onSessionSelect }: SessionListProps) {
  // Component logic
}

// ❌ Avoid
export default function SessionList(props: any) {
  // Component logic
}
```

### File Organization

- Place components in `components/`
- Place hooks in `hooks/`
- Place utilities in `lib/`
- Place types in `types/`
- One component per file

### Naming Conventions

- **Files:** PascalCase for components (`SessionList.tsx`)
- **Files:** camelCase for utilities (`websocket.ts`)
- **Variables:** camelCase (`sessionId`, `isConnected`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_RECONNECT_ATTEMPTS`)
- **Types/Interfaces:** PascalCase (`Session`, `WebSocketMessage`)

### Git Commits

Use conventional commit messages:

```bash
feat: add session export functionality
fix: resolve WebSocket reconnection issue
docs: update installation instructions
refactor: improve color palette organization
style: format SessionList component
test: add tests for useWebSocket hook
chore: update dependencies
```

## Project Structure

```
agents-web/
├── app/              # Next.js pages and API routes
├── components/       # React components
├── hooks/            # Custom React hooks
├── lib/              # Utilities and helpers
├── types/            # TypeScript type definitions
├── docs/             # Documentation
└── server.mjs        # Custom server
```

## What We're Looking For

**High Priority:**
- Bug fixes
- Performance improvements
- Documentation improvements
- Accessibility enhancements
- Test coverage

**Welcome Contributions:**
- UI/UX improvements
- New features (aligned with roadmap)
- Code refactoring
- Examples and tutorials

**Lower Priority:**
- Major architectural changes (discuss first!)
- Features outside the roadmap
- Breaking changes

## Testing

Currently, there's no automated test suite. When contributing:

**Manual Testing Checklist:**
1. Start the dashboard (`yarn dev`)
2. Create test sessions
3. Test session switching
4. Test session management (create/rename/delete)
5. Test notes functionality
6. Test terminal interaction
7. Check browser console for errors
8. Test on different browsers (Chrome, Safari, Firefox)

## Documentation

**When to update documentation:**
- Adding new features
- Changing existing behavior
- Adding new configuration options
- Fixing documentation errors

**Files to update:**
- `README.md` - Main documentation
- `CLAUDE.md` - Claude Code context
- `docs/OPERATIONS-GUIDE.md` - User guide
- `docs/REQUIREMENTS.md` - System requirements

## Getting Help

**Need help contributing?**
- Open a GitHub Discussion
- Comment on an existing issue
- Reach out to maintainers

**Resources:**
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [xterm.js Documentation](https://xtermjs.org)
- [tmux Manual](https://man.openbsd.org/tmux)

## License

By contributing to AI Maestro, you agree that your contributions will be licensed under the MIT License.

## Recognition

All contributors will be:
- Listed in the project's contributor list
- Credited in release notes for significant contributions
- Appreciated and thanked for their work!

---

**Thank you for contributing to AI Maestro! 🎉**

Every contribution, no matter how small, makes a difference.
