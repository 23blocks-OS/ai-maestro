/**
 * Does a touch belong to the terminal? (#556)
 *
 * On a phone the terminal stays mounted under the chat (hidden with visibility, never display:none, so xterm
 * keeps its size). The terminal scrolls by a document-wide touchmove handler that calls preventDefault. It used
 * to decide "this touch is on the terminal" by comparing the finger with the terminal's bounding box. A hidden
 * terminal keeps its box, and the chat sits in the same place, so every swipe on the chat counted as a swipe on
 * the invisible terminal and was cancelled: the messages would not scroll (seen on iPhone Safari).
 *
 * The element that actually received the touch is the answer: a hidden element is never the target of a touch, a
 * visible terminal is the target (or the ancestor of it), and anything drawn over the terminal (the view toggle,
 * the chat) is not inside it.
 */
export function isTouchOnTerminal(terminalElement: { contains(node: any): boolean } | null | undefined, target: unknown): boolean {
  if (!terminalElement || !target) return false
  return terminalElement.contains(target)
}
