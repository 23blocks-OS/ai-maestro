#!/bin/bash
# Sourced by the start and update scripts: puts the Node line in .nvmrc first on PATH, when nvm has it. Otherwise PATH stays as it
# is, so a host moves when its Node is installed, and a system Node shared with other services is never touched.
_aim_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_aim_want=""
if [ -f "$_aim_root/.nvmrc" ]; then _aim_want="$(tr -d '[:space:]v' < "$_aim_root/.nvmrc")"; fi
if [ -n "$_aim_want" ]; then
    _aim_dir="$(ls -d "$HOME/.nvm/versions/node/v$_aim_want".* 2>/dev/null | sort -V | tail -1)"
    if [ -n "$_aim_dir" ] && [ -x "$_aim_dir/bin/node" ]; then
        export PATH="$_aim_dir/bin:$PATH"
    fi
fi
unset _aim_root _aim_want _aim_dir
