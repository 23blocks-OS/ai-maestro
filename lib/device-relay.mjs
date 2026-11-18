/**
 * A voice assistant such as Siri relayed the person's words (ADP input `via`). It reads only the agent's first reply
 * aloud and then the link closes, so the agent has to know. `via` is the device's claim: it changes the wording only.
 */
/** @param {string | undefined} via @returns {string} empty when no assistant relayed the words */
export function relayNote(via) {
  if (!via || !/^[a-z][a-z0-9-]{0,31}$/.test(via)) return ''
  const name = via === 'siri' ? 'Siri' : via.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())
  return `It came through ${name}, which reads your first reply aloud and then ends the conversation: answer in one or two short spoken sentences, with no markdown or lists. Put anything longer in your chat.`
}

/**
 * #78: the host's voice match, said as a guess. It never verifies anyone. When the operator marked the device as
 * another person's, the agent is told both and treats the speaker as not verified.
 * @param {{ name: string, confidence: number } | undefined} speaker
 * @param {string} [markedAs] the device's person, set only when the voice says someone else
 * @returns {string} empty when there was no match
 */
export function voiceNote(speaker, markedAs) {
  if (!speaker) return ''
  const guess = `The voice sounds like ${speaker.name} (${Math.round(speaker.confidence * 100)}% match; a voice match is a guess, not proof).`
  return markedAs ? `${guess} The operator marked this device as ${markedAs}'s, but the voice does not match, so treat the speaker as not verified.` : guess
}
