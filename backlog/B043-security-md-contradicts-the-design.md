# B043 - SECURITY.md contradicts the design and itself

**Status:** Done (0.106.234: SECURITY.md rewritten to the design; `tests/security-md.test.ts` stops the drift)
**Type:** Bug (documentation)
**Created:** 2026-11-18
**Source:** CamiloCaceres/lolad (MIT), reviewed 2026-11-18 at `2649a3f`.

## Description

SECURITY.md lists `1.0.x` as the only supported version (we ship 0.106.x), points to a CLAUDE.md section that does not exist ("Localhost-Only Security Model"), calls `0.0.0.0` unsafe and tells users to expect `127.0.0.1:3000`, says the WebSockets accept only localhost (they accept anyone), says session content is only in memory, advises `tmux kill-server` at the end of the day, and plans user authentication (not planned, B005).

## Why It's Needed

Users, researchers and auditors read SECURITY.md first. Today it describes another product, and no release is "supported" by its own table.

## Business Case

A one-file rewrite that says the model once (no app login, network is the boundary) and lists the known design limits (no auth, plain HTTP on the LAN, one OS user per host (B021), permission-bypass modes, message content reaching the model, the browser path until B044). Fewer duplicate reports; honest posture.

## Implementation Plan

Rewrite to the outline in the spec, part A. Add `tests/security-md.test.ts` against the known contradictions. Separate PR. Size S.
