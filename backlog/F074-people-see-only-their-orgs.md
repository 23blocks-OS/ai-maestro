# F074 — A person sees only the organizations they belong to, and can hide one

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-03

## Description

In the dashboard and the mobile app, a person sees only the organizations they are assigned to or
attached to, and the agents, cards and people in them. A person can also hide an organization they belong
to, and that choice is respected everywhere they look (agent list, org chart, board, notifications).

Not an admin system and not a permission model: no roles, no approval flow. It is what a person chooses to
see, and which organizations they belong to.

What exists (0.106.66):

- `types/person.ts`: a person has `orgs?: string[]` (added by hand), and also counts as part of every
  organization whose agents report to them (derived, not stored).
- Organizations are records in `~/.aimaestro/organizations/` (`lib/org-registry.ts`); agents join one by
  their `org:` tag.
- The dashboard shows every agent on every host to whoever opens it.

## Why It's Needed

Juan opens a new organization (Suesca.com) with a human General Manager, Felipe, who should see his crew
and not the 3metas, crabmail and company-tool crews. People who belong to several organizations also want
to set one aside (hide it) without leaving it.

## Business Case

- Multi-organization use: one install serving several companies or teams is the path to the company tool
  (3Metas) built on AI Maestro.
- Focus: a person with many organizations sees only the ones they work on.

## Implementation Plan

- **Who is looking.** There is no login (no app-level auth by design). The dashboard and the app need to
  know which person is viewing: the mobile app already pairs devices to people
  (`lib/person-devices-registry.ts`); the browser can pick "I am …" once and keep it. Decide this first.
- Person record: `hiddenOrgs?: string[]` beside `orgs`.
- Visible organizations = (`orgs` + derived) minus `hiddenOrgs`. A filter in the views (agent list, org
  chart, board, notifications, the app), from one place, in the spirit of the single status source.
- An organization switcher in the header to show or hide each of the person's organizations.
- **This is a view filter, not security.** Anyone on the network can still reach every host's API. Real
  separation needs a second instance plus Tailscale access rules (as answered to pas-lola on 2026-11-03),
  or app-level auth, which is an exception Juan would decide.
- Related: F075 (the first organization at install), F043 (federation between people).
- Effort: M (L if the "who is looking" part grows).
