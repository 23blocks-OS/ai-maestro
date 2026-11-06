import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { promisify } from "node:util";
const run = promisify(execFile);
export function cameraReady() {
  try {
    accessSync("/dev/video0", constants.R_OK);
    accessSync("/usr/bin/ffmpeg", constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
export async function snapshot(signal) {
  const { stdout } = await run(
    "/usr/bin/ffmpeg",
    [
      "-nostdin",
      "-loglevel",
      "error",
      "-f",
      "video4linux2",
      "-i",
      "/dev/video0",
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
