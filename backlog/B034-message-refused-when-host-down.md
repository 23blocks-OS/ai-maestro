# B034 — A message to anyone on a sleeping host is refused, not kept

**Status:** Todo
**Type:** Bug
**Created:** 2026-11-06

## Description

A sender's host finds a recipient by asking its peers. If the recipient's host is down, no peer can answer, so the recipient reads as
unknown and the send fails.

- **Person:** `personHostFor` finds nobody, and `routeMessage` answers 404 "No host holds the person"; a failed forward answers 502.
  There is no queue. Juan's record is on a laptop.
- **Agent:** `checkMeshAgentExists` finds nobody and the recipient is not resolved. The relay queue is reached only when a host
  answered the lookup and then failed, and it needs the agent's id.

Read from the code on 2026-11-06. **Not yet reproduced with a host down**: do that first. Also check whether anything forwards a relay-queued
message later for an agent on another host.

Expected: the message is kept and delivered when the host returns, and reported as queued.

## Why It's Needed

An agent trying to reach a person, or another agent, fails exactly when a host is asleep. Machines sleep; this is normal.

## Business Case

Reliability of the core feature. It is the false-failure twin of the delivery work in 0.36.x.

## Implementation Plan

F089 steps 1 and 2: know the recipient from the directory, then the sender's host holds and retries. One path for agents and people.
Effort: M.
