# B003 — Clicking a question option may not confirm it

**Status:** Done (not reproducible on Claude Code 2.1.318; no code change)
**Type:** Bug
**Created:** 2026-09-19

## Description

`sendPermissionResponse` sends the option number as a raw keystroke, with a
comment asserting *"Number selects+confirms"*.

Measured against a live AskUserQuestion menu on 15 Sep 2026: pressing `4` **moved
the selection** to `❯ 4. Type something.` and the footer still read
**"Enter to select"**. The number navigates; it does not confirm.

The free-text path works anyway, because the message that follows carries its own
`C-m`. So the sequence is correct by accident of composition, not by design — and
a plain option click sends only the number.

## Why It's Needed

This is very likely the origin of the whole 15–19 Sep chat investigation: the user
clicked option 5, the selection moved, nothing confirmed, and the only way through
was the terminal.

## Business Case

It is the first interaction anyone has with an agent's question. If clicking an
option silently does nothing, the chat looks broken in the most visible way
possible — and the workaround is the terminal, which is the thing the chat exists
to avoid.

## Implementation Plan

**Verify before changing.** It needs a live AskUserQuestion menu:

1. Trigger a question on a scratch agent
2. Send only the number via `chat:permissionResponse`
3. Read the pane — did the menu close and the answer register, or did the
   selection merely move?

If it only moves: send `Enter` after the key in `sendPermissionResponse`.

The care needed is that this function is also used for **permission** prompts
(y/n style), where a single key genuinely does confirm. A blanket Enter could
double-submit there. Confirm both menu shapes before changing one path.

- Effort: **S** once verified
- Blocked on: a live agent not holding production state

## Resolution (2026-11-05): does not reproduce on Claude Code 2.1.318; no code change

Tested live on a scratch agent (`zz-scratch-review`, Claude Code 2.1.318), the way the chat answers a
question: the option's number sent as a single key.

- One question ("Which colour?", Red/Green/Blue): pressing `2` **selected and confirmed** it. The menu closed
  and the transcript shows "User answered Claude's questions: Which colour do you prefer? → Green". The
  behaviour measured on 15 Sep 2026 (the number only moves the selection) no longer happens.
- The menu's footer is "Enter to select · ↑/↓ to navigate · Esc to cancel" (one question) and
  "Enter to select · Tab/Arrow keys to navigate · Esc to cancel" (several).

A fix was written first (press Enter when the menu still shows the chosen option selected with "Enter to
select") and **removed before release**: in a menu with two questions, pressing `1` answers the first and shows
the second with option 1 already selected and the same footer, so the fix would have pressed Enter and
answered the second question for the person ("Tea", in the test). Sending the number alone, as the code always
did, is right for this version.

If a future Claude Code goes back to "number moves, Enter confirms", the fix must tell the same question
from the next one (for example by its title) before adding an Enter.
