# B017 - Gateways: /api is open when ADMIN_TOKEN is unset

**Status:** Todo
**Type:** Bug
**Created:** 2026-10-28
**Source:** Security round, 2026-10-28. Repo `aimaestro-gateways`.

## What the code does

`authMiddleware` lets `/api` requests through when `ADMIN_TOKEN` is not set.

## Why

Acceptable while a gateway listens on loopback only. It becomes a hole once a gateway is bound to a non-loopback address, and a change to choose the Docker bind address is in progress. The two must not meet.

## Work

- At startup, if the bind address is not loopback and `ADMIN_TOKEN` is empty, print a clear error and exit.
- Treat `0.0.0.0`, `::` and any address outside 127.0.0.0/8 and `::1` as non-loopback; resolve hostnames before deciding.
- Keep the loopback, no-token case working, with a one-line warning.
- Tests: refuses to start non-loopback without a token; starts with one; starts on loopback without one.
- Land it before or with the Docker bind-address PR.
