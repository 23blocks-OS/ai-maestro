# F061 - V3: An audio conference with people and agents

**Status:** Todo (after V1)
**Type:** Feature
**Created:** 2026-11-02

Stage 3 of 5 in F050. Takes the audio half of F054.

## Description

A conference call (no video) where several people and several agents talk, from the app or the browser. People join by link or from the existing meeting page; agents join as participants with their own voices. A person says "Lola, check the deploy" and Lola answers; the other agents stay quiet unless asked.

| Step | Protocol | Options | Status |
|---|---|---|---|
| Room and audio mixing | WebRTC to a media server (SFU) | LiveKit server (Apache 2.0, self-hosted on one host, needs the Tailscale certificate and UDP ports), LiveKit Cloud, or another SFU | Not built |
| Who speaks | our design: one voice layer for the room | the V1 providers | Not built |
| Agents in the room | each agent behind the room's voice layer, through the V1 hand-off | ours | Not built |
| Meeting record | `Meeting` today has only `agentIds`, text and terminals | ours | Agents-only text meetings: done (Zoom view, team meeting) |

## Why It's Needed

Work with several agents today means switching between chats. A meeting puts the team in one place: the person speaks once and the right agent picks it up, and other people can join, the way a team call works.

## Business Case

- One voice session for the whole room, not one per agent: the cost stays near a single call (about $0.12 to $0.50 for 10 minutes plus agent work), and agents cannot talk over each other.
- No product solves several AI agents taking turns in one room; this is where we can be first.

## Implementation Plan

1. **Turn-taking design (S, first).** One voice layer listens to the room and speaks for the agents, in a different voice per agent, and routes a question to the agent who was named (or the meeting's lead agent). Alternative to measure: a floor token per agent. Write it down before building.
2. **People in `Meeting` (S).** Add person ids next to `agentIds`; the meeting page lists both.
3. **Media server (M).** LiveKit on one host, started by AI Maestro like other services, certificates from Tailscale; a join token endpoint per participant. Off by default.
4. **The room's voice layer as a LiveKit participant (M)** using LiveKit Agents or Pipecat, with the V1 hand-off to each agent.
5. **Privacy (S).** What an agent may say in a room with several people about its private memory: answer before building. Recording only with everyone's consent (several US states require all parties).

Effort: about one 6-day cycle after V1.
