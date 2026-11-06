import { agentAddress, publicKey } from "./index.mjs";
export function validateChange(change) {
  if (!change || typeof change !== "object" || Array.isArray(change))
    throw new Error("Invalid change");
  if (
    change.action === "transfer" &&
    Object.keys(change).every((k) => ["action", "agent", "key"].includes(k))
  ) {
    agentAddress(change.agent);
    publicKey(change.key);
    return;
  }
  if (
    change.action === "camera" &&
    typeof change.enabled === "boolean" &&
    Object.keys(change).every((k) => ["action", "enabled"].includes(k))
  )
    return;
  if (change.action === "revoke" && Object.keys(change).length === 1) return;
  throw new Error("Unsupported device change");
}
export function sameChange(a, b) {
  try {
    validateChange(a);
    validateChange(b);
  } catch {
    return false;
  }
  return (
    a.action === b.action &&
    a.agent === b.agent &&
    a.key === b.key &&
    a.enabled === b.enabled
  );
}
