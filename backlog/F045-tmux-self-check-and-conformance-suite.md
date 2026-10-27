# F045 - A tmux self-check: run our exact tmux calls against any tmux binary and name what fails

**Status:** Todo (the probe F041 needs; useful on every platform)
**Type:** Feature / tooling
**Created:** 2026-10-27
**Source:** `CamiloCaceres/lolad`, `lolad doctor` and `internal/tmux/conformance_test.go` (read 2026-10-27; not run).

## The idea

lolad ships a self-check that starts a private server (`-L <name>`), runs the operations it relies on with a tiny fake agent, prints which operation failed, and never touches the live server. Operations checked: detached start with directory, size and environment; exact session targets; PID and list; literal Unicode and punctuation; Enter, Escape, BSpace, C-c; ANSI capture; resize; a server that outlives its client; a dead pane that keeps its status; kill.

## For AI Maestro

A script (and a test) that runs the calls listed in the F041 table (`new-session -c`, `capture-pane -p -e`, `send-keys -l`/`-H`, `has-session`, `display-message -p`, `list-sessions -F`, `kill-session`, `rename-session -t`, `set-environment`, `set-option`, `load-buffer`/`paste-buffer`, `copy-mode`) against whichever binary `tmux` resolves to, in a private `-L` namespace. It is the F041 probe, and it also catches tmux version differences on Linux and macOS.

## Safety (from our own history)

Private `-L` socket only. Never `kill-server` without `-L`. Never touch the user's real tmux. Canary-test before running a suite (memory note, 2026-10-09). lolad's own test once started about 1,800 tmux servers; guard against re-entry.
