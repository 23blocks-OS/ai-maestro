import { accessSync, constants } from "node:fs";

// The hardware commands for the machine this bridge runs on. Linux first; macOS through ffmpeg's avfoundation.
// shortcut: macOS gives camera and microphone permission to the program that asks, and a background
// service may never see the prompt; a signed app is the real answer (clients/macos).
export const isMac = process.platform === "darwin";

const usable = (path, mode = constants.X_OK) => {
  try {
    accessSync(path, mode);
    return true;
  } catch {
    return false;
  }
};

export const ffmpegPath = isMac
  ? (["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"].find((p) => usable(p)) ?? "/usr/local/bin/ffmpeg")
  : "/usr/bin/ffmpeg";

export const ffmpegReady = () => usable(ffmpegPath);
// macOS lists cameras only through ffmpeg; a missing one shows as a failed capture
export const cameraPresent = () => isMac || usable("/dev/video0", constants.R_OK);

export const cameraInput = (framerate) =>
  isMac
    ? ["-f", "avfoundation", "-framerate", "30", "-video_size", "640x480", "-pixel_format", "uyvy422", "-i", "0:none"]
    : ["-f", "video4linux2", ...(framerate ? ["-framerate", framerate] : []), "-i", "/dev/video0"];

export const microphoneInput = isMac
  ? ["-f", "avfoundation", "-i", "none:0"]
  : ["-f", "pulse", "-i", "default"];

export const speakerOutput = isMac ? ["-f", "audiotoolbox", "-"] : ["-f", "pulse", "default"];

export const speechCommand = isMac ? "/usr/bin/say" : "/usr/bin/espeak-ng";
export const speechArgs = isMac ? ["-f", "-"] : ["--stdin"];
export const speechPresent = () => usable(speechCommand);

// aplay reads stdin; macOS has afplay, which needs a file, so ffmpeg plays the WAV through the same output
export const playCommand = isMac ? ffmpegPath : "/usr/bin/aplay";
export const playArgs = isMac
  ? ["-nostdin", "-loglevel", "error", "-i", "pipe:0", "-f", "audiotoolbox", "-"]
  : ["-q", "-"];
export const playPresent = () => usable(playCommand);
