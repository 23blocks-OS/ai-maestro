import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cameraInput, cameraPresent, ffmpegPath, ffmpegReady } from "./platform.mjs";
const run = promisify(execFile);
export function cameraReady() {
  return cameraPresent() && ffmpegReady();
}
export async function snapshot(signal) {
  const { stdout } = await run(
    ffmpegPath,
    [
      "-nostdin",
      "-loglevel",
      "error",
      ...cameraInput(),
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-c:v",
      "mjpeg",
      "-f",
      "image2pipe",
      "pipe:1",
    ],
    {
      signal,
      encoding: "buffer",
      timeout: 8000,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
    },
  );
  if (
    stdout.length < 4 ||
    stdout.readUInt16BE(0) !== 0xffd8 ||
    stdout.readUInt16BE(stdout.length - 2) !== 0xffd9
  )
    throw new Error("Invalid JPEG");
  return { mime: "image/jpeg", data: stdout.toString("base64") };
}
