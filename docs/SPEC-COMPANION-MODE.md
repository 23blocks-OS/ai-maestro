# Spec: companion mode in the phone app

Talk to an agent on the phone the way a person talks to it at a device: one screen, its signal, your signal, a mic. Status: draft, 2026-11-06. Backlog: F096. In the app it is its own screen, opened from the agent's page, and is not part of calls. The next step of companion mode, the phone as a real device, is F080 and is not part of this spec.

## 1. The decision

Companion mode is a mode of the existing AI Maestro app, not a new app. Pairing, QR connect, identity, push and the agent list are already there. A separate app makes sense only for a different audience, such as a person who should never see hosts or tasks. The screen and the API stay the same if that happens.

## 2. The design

Follow the device page: `apps/display` in `agentmessaging/agent-device-protocol`. Prototype: `~/.aimaestro/kiosk-prototype/v6.html` on Juan's Mac; ask for a copy.

- The screen has two channels. The top is the agent, the bottom is you.
- **Agent:** its name, one line under the name, and its signal. The line says "Here with you", "Listening to you" or "Thinking", and shows its words while it talks. They stay until you talk again.
- **You:** "You", your last words under it, your signal, and your camera behind them.
- **Signals:** the interlocked traces of `signals.js` on 24ailab.com. Blue for the agent, white for you. They follow real audio levels, never an animation that pretends.
- **Controls:** a large mic in the centre: tap to talk, tap to send. In a column at the left: keyboard, camera, settings. A second tap on the keyboard goes back to the mic.
- Portrait suits this better than the laptop: the two channels stack.
- English only for now.

## 3. How a turn works

1. The person taps the mic. Any speech the agent is playing stops at once, so the microphone does not hear it.
2. The app shows your signal from the microphone level, and turns speech into text on the phone, as voice mode does today.
3. On the second tap, the app sends the text through the normal chat path.
4. The line says "Thinking" until the agent answers.
5. The agent's reply arrives in the chat as usual. The app asks the host for speech, sentence by sentence, and plays it. The signal follows the audio it plays.

Typing uses the same path without steps 1 and 2.

## 4. What the server adds

The one new thing: speech in the agent's own voice.

`POST /api/agents/[id]/speech` with `{ text }`, on the agent's own host, at most 500 UTF-8 bytes.

- Answers `audio/wav` (16-bit mono, 24 kHz), one call per sentence, so the first sentence plays while the app asks for the next.
- Uses the voice chosen in the agent's profile (F092).
- `409 no_voice` when the agent has no voice chosen, or the host has no local speech. An older host answers 404. In both cases the app uses the voice on the phone.
- With the phone voice the app cannot read levels, so the agent's signal stays still. The line shows the agent's words, never "talking" (Juan, 2026-11-06).
- Same trust as every API here: the network is the boundary.

Kokoro takes about as long to make speech as to play it on mini-lola, and one run at a time. So a host serves one request at a time, and a second one waits.

## 5. The camera

The camera preview is the person's own picture, shown on their phone only. It is not sent to the agent or to any server. The label says "Only on this screen". The camera button turns it off with one tap.

In this step the agent cannot use the phone's camera at all, so the app must never show "Lola is looking". That comes with F080.

## 6. Not in this step

- The phone as a device: the agent jumping to it and using its camera, microphone and speaker. That needs live media over device-opened connections in the protocol (F080).
- Listening without a tap (F095). iOS also limits this to the app being on screen, or the call system.
- Real-time voice (F059).
- Other languages.

## 7. Answered by the app team

1. The phone voice stays as the fallback.
2. The screen stays awake while the mode is open, and only then.
3. The app team measures delay with the first build, on the local network and over Tailscale.
