import { accessSync, constants } from "node:fs";
import { spawn } from "node:child_process";
export function speechReady() {
  try {
    accessSync("/usr/bin/espeak-ng", constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
export function say(text, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/espeak-ng", ["--stdin"], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    const stop = () => child.kill("SIGKILL");
    const timer = setTimeout(stop, 10000);
    signal?.addEventListener("abort", stop, { once: true });
    child.stdin.on("error", () => {});
    child.stdin.end(text);
    child.once("error", finish);
    child.once("close", (code) =>
      finish(
        code === 0 && !signal?.aborted
          ? null
          : new Error("Speech unavailable or stopped"),
      ),
    );
    let done = false;
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      error ? reject(error) : resolve({ played: true });
    }
    if (signal?.aborted) stop();
  });
}
