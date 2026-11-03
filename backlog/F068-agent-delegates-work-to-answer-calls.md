# F068 — An agent hands its work to subagents so it can answer a call fast

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-02

## Description

An idea to test, not a decided design.

When a call comes in (F059, `ask_agent`), the agent is often in the middle of a long turn. The question
waits behind the turn, so the person on the phone waits too. The idea: an agent that may get calls
does its work through subagents and keeps its own turn short. Its main loop only plans, delegates and
reports status changes. A call then reaches an agent that is free, and it answers from what it knows
about the running work ("the tests are running in a subagent, 3 of 5 done").

## Why It's Needed

A voice call needs an answer in about a second. A coding agent in a twelve-minute turn cannot give
one: the voice model either waits or answers without the agent. Today the plan is to queue the
question or reply later by AMP, which is not a conversation.

## Business Case

Calls are only worth having if the agent answers. This could make the agent reachable during work
without a second model or a second session. If it does not work, the cost is a spike.

## Implementation Plan

- Spike (S): one agent with an instruction (CLAUDE.md or a skill) to send every task over a few
  steps to a subagent (the Task/Agent tool, run in the background) and to keep its own turns short.
  Measure how long a call question waits, with and without the instruction, over a day of real work.
- Questions to answer:
  - Does the agent keep to it, or drift back to doing the work itself?
  - Cost: subagents start with fresh context, so tokens may go up.
  - Quality: does handing work off lose context the agent had?
  - Can the agent report a subagent's progress while it runs, or only when it ends?
- Compare with the other option: a separate "receptionist" session that reads the agent's state and
  answers for it (F059 hand-off).
- Related: F059 (V1 voice call), F062 and F063 (later stages), F064 (phone numbers).
