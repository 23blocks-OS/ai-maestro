# AGENTS.md

The project instructions for every coding agent are in [`CLAUDE.md`](./CLAUDE.md). Read it before you change code. It is written for Claude Code, but nothing in it is specific to Claude.

## Every pull request to main

- Bump the version with `./scripts/bump-version.sh patch` (or `minor` / `major`). Do not edit version numbers by hand.
- Add a `## [<new version>] - <date> - <title>` section at the top of `CHANGELOG.md` that says what changed and why.
- `yarn test` passes. `yarn build` passes, run outside the checkout a live server runs from.
