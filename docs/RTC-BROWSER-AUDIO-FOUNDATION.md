# Browser audio transport foundation

This PR adds local microphone lifecycle management and a WebRTC audio peer.

## Integration sequence

1. Authenticate the human and agent principals and create an RTC invitation through the durable call coordinator.
2. Accept the invitation on the callee's authorized session.
3. Request browser microphone permission after an explicit call action.
4. Issue short-lived TURN/STUN configuration and exchange SDP/ICE via authenticated, call-scoped signaling.
5. Attach microphone audio, receive remote tracks, and only publish `rtc:connected` after the media transport reaches connected state.
6. Hang up: close peer, stop tracks, revoke media credentials, transition authoritative call state.

## Explicit limitations

- No signaling endpoint or authentication implementation is included.
- No agent speech pipeline is attached yet.
- This is not yet integrated into Companion or Zoom.
- No native iPhone CallKit support.
- No TURN credentials are stored or minted.
- No tests have been executed. Browser and network integration tests are required.

## Test gate

Two browsers with independently authenticated principals must exchange real audio over a configured TURN/STUN environment, including mute, denial, ICE failure and cleanup, before a working-call claim.
