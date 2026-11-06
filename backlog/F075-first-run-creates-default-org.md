# F075 — First run creates an unnamed organization that every person and agent joins

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-03

## Description

When AI Maestro runs for the first time, it creates one organization (unnamed, for example shown as
"My organization" until the person names it). Every agent and every person created afterwards joins it by
default, unless they are given another organization.

What exists (0.106.66): agents with no `org:` tag are shown under a fallback default organization id
`personal` (`lib/org-registry.ts` `FALLBACK_DEFAULT_ORG`, `lib/organization.ts` `DEFAULT_ORG`), and there
is a default-organization setting (`~/.aimaestro/organization-default.json`). But no organization record
is created, agents and people do not carry the membership, and the name is an id, not something the
person chose.

## Why It's Needed

Organizations matter more now (people, org charts, F074 visibility). An install where nothing belongs to
an organization has nothing for F074 to filter by, and a new user meets organizations only when they
create a second one.

## Business Case

- Activation: the first screen already shows "your organization", ready to name, instead of an empty
  concept.
- It makes F074 work from day one, without a migration later.

## Implementation Plan

- Server startup (or the onboarding flow): if `~/.aimaestro/organizations/` is empty, create one record
  (id `personal` to match the existing fallback, name empty), and set it as the default.
- Creating an agent or a person with no organization puts them in the default one (agents get the
  `org:` tag; people get it in `orgs`).
- Existing installs: a one-time migration does the same for agents and people with no organization.
  Never move an agent that already has an `org:` tag.
- Multi-host, **decided by Juan (2026-11-05): there is one default organization, and a host that is part of
  the organization is in it.** Hosts do not each keep their own default.
- The consequence to design for: many hosts were first started on their own, each with its own (default)
  organization. When such a host joins another host's organization, the two organizations must be **merged**:
  its agents, people, cards and organization records move into the joined organization (ids, `org:` tags,
  `orgs` lists, cards' `org`), with no duplicate and nothing lost. That merge is the hard part of this item and
  needs its own design before code: what wins on a name clash, whether it can be undone, and what the person
  sees when a host joins.
- UI: prompt to name the organization (onboarding and Settings).
- Related: F074, the host join flow (Settings → Hosts, `/api/hosts` sync).
- Effort: M (the merge), was S-M.
- Words (Juan, 2026-11-06): the tenant is the organization; `org:` groups are units inside it. See docs/SPEC-MESH-ENTITIES.md, section 7. A host
  joining with another tenant name is the merge this item describes.
- **Not started**: Juan asked on 2026-11-05 to hold this and the other organization features for now.
