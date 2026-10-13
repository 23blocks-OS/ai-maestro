#!/bin/bash
# Put a way back into AI Maestro on this machine (F039):
#   - the `ai-maestro` command in ~/.local/bin (open, start, stop, status)
#   - macOS: ~/Applications/AI Maestro.app (with the icon; drag it to the Dock)
#     Linux desktop: an "AI Maestro" entry in the applications menu
#   - optionally, start at login (macOS LaunchAgent, Linux autostart entry); no sudo needed
#
# Safe to run again; the updater runs it to refresh the launcher. Remove everything with --remove.
#
#   --login-item      start AI Maestro when you log in
#   --no-login-item   do not (and remove an existing one)
#   --no-launcher     only the command, no app / menu entry
#   --remove          remove all of it
#
# With neither login flag: asks on a terminal (default yes on a Mac), and keeps whatever is there when
# there is no terminal (the updater), so an update never turns start-at-login on by surprise.
#
# Test and relocation hooks: AIM_BIN_DIR, AIM_APPS_DIR, AIM_LAUNCH_AGENTS_DIR, AIM_AUTOSTART_DIR,
# AIM_DESKTOP_DIR, AIM_OS, AIM_NO_LAUNCHCTL=1 (do not load the LaunchAgent), AIM_FORCE_LAUNCHER=1 (Linux without a desktop).
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${AIM_BIN_DIR:-$HOME/.local/bin}"
OS="${AIM_OS:-$(uname -s)}"
APPS_DIR="${AIM_APPS_DIR:-$HOME/Applications}"
APP="$APPS_DIR/AI Maestro.app"
AGENTS_DIR="${AIM_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
PLIST="$AGENTS_DIR/com.23blocks.ai-maestro.plist"
DESKTOP_DIR="${AIM_DESKTOP_DIR:-$HOME/.local/share/applications}"
AUTOSTART_DIR="${AIM_AUTOSTART_DIR:-$HOME/.config/autostart}"
ICON_DIR="${AIM_ICON_DIR:-$HOME/.local/share/icons/hicolor/512x512/apps}"

LOGIN=keep   # keep | yes | no
LAUNCHER=yes
REMOVE=no
for a in "$@"; do
  case "$a" in
    --login-item) LOGIN=yes ;;
    --no-login-item) LOGIN=no ;;
    --no-launcher) LAUNCHER=no ;;
    --remove) REMOVE=yes ;;
    -y|--yes) ;;
    *) echo "install-launcher: unknown option $a" >&2; exit 2 ;;
  esac
done

has_linux_desktop() {
  [ -n "${AIM_FORCE_LAUNCHER:-}" ] || [ -d /usr/share/xsessions ] || [ -d /usr/share/wayland-sessions ] || [ -n "${XDG_CURRENT_DESKTOP:-}" ]
}

remove_all() {
  rm -f "$BIN/ai-maestro" "$PLIST" "$DESKTOP_DIR/ai-maestro.desktop" "$AUTOSTART_DIR/ai-maestro.desktop" "$ICON_DIR/ai-maestro.png"
  rm -rf "$APP"
  if [ "$OS" = "Darwin" ] && [ -z "${AIM_NO_LAUNCHCTL:-}" ]; then
    launchctl bootout "gui/$(id -u)/com.23blocks.ai-maestro" >/dev/null 2>&1 || true
  fi
  echo "removed the ai-maestro command, the launcher and the login item"
}

if [ "$REMOVE" = yes ]; then remove_all; exit 0; fi

# --- the command -------------------------------------------------------------------------------------
# The launcher records where node and pm2 are NOW (the updater's PATH, normally nvm's), because an app
# started from the Dock or a login item has almost no PATH.
mkdir -p "$BIN"
PATH_HINT=""
for tool in node pm2; do
  p="$(command -v "$tool" 2>/dev/null || true)"
  [ -n "$p" ] && PATH_HINT="$PATH_HINT:$(dirname "$p")"
done
PM2_BIN="$(command -v pm2 2>/dev/null || true)"
{
  echo '#!/bin/bash'
  echo "export AIM_REPO=\"$REPO\""
  echo "export PATH=\"${PATH_HINT#:}:\$PATH:/usr/local/bin:/opt/homebrew/bin\""
  [ -n "$PM2_BIN" ] && echo "export AIM_PM2=\"\${AIM_PM2:-$PM2_BIN}\""
  echo "exec bash \"$REPO/scripts/ai-maestro.sh\" \"\$@\""
} > "$BIN/ai-maestro"
chmod +x "$BIN/ai-maestro"
echo "installed: $BIN/ai-maestro"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "note: $BIN is not on your PATH yet" ;; esac

# --- start at login: the decision ---------------------------------------------------------------------
login_exists() { [ -f "$PLIST" ] || [ -f "$AUTOSTART_DIR/ai-maestro.desktop" ]; }
if [ "$LOGIN" = keep ]; then
  if login_exists; then LOGIN=yes
  elif [ -t 0 ] && [ "$LAUNCHER" = yes ] && { [ "$OS" = Darwin ] || has_linux_desktop; }; then
    printf 'Start AI Maestro when you log in? [Y/n] '
    read -r answer || answer=n
    case "$answer" in n|N|no|NO) LOGIN=no ;; *) LOGIN=yes ;; esac
  else
    LOGIN=no
  fi
fi

# --- macOS --------------------------------------------------------------------------------------------
if [ "$OS" = Darwin ]; then
  if [ "$LAUNCHER" = yes ]; then
    if ! command -v osacompile >/dev/null 2>&1; then
      echo "warning: osacompile not found, so no AI Maestro app was made (the ai-maestro command works)" >&2
    else
      mkdir -p "$APPS_DIR"
      rm -rf "$APP"
      script='try
  do shell script quoted form of "'"$BIN"'/ai-maestro" & " open 2>&1"
on error msg
  display alert "AI Maestro could not start" message msg
end try'
      if osacompile -o "$APP" -e "$script" 2>/dev/null; then
        plutil -replace CFBundleName -string "AI Maestro" "$APP/Contents/Info.plist" 2>/dev/null || true
        plutil -replace CFBundleIdentifier -string "com.23blocks.ai-maestro" "$APP/Contents/Info.plist" 2>/dev/null || true
        # osacompile's default icon also lives in an asset catalog that wins over applet.icns; drop it.
        plutil -remove CFBundleIconName "$APP/Contents/Info.plist" 2>/dev/null || true
        rm -f "$APP/Contents/Resources/Assets.car"
        cp "$REPO/scripts/launcher/AI-Maestro.icns" "$APP/Contents/Resources/applet.icns"
        codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true
        touch "$APP"
        echo "installed: $APP"
      else
        echo "warning: could not build the AI Maestro app (the ai-maestro command works)" >&2
      fi
    fi
  fi
  if [ "$LOGIN" = yes ]; then
    mkdir -p "$AGENTS_DIR"
    cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.23blocks.ai-maestro</string>
  <key>ProgramArguments</key>
  <array><string>$BIN/ai-maestro</string><string>start</string></array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLISTEOF
    if [ -z "${AIM_NO_LAUNCHCTL:-}" ]; then
      launchctl bootout "gui/$(id -u)/com.23blocks.ai-maestro" >/dev/null 2>&1 || true
      launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || echo "warning: could not load the login item now; it will load at your next login" >&2
    fi
    echo "installed: AI Maestro starts when you log in ($PLIST)"
  else
    if [ -f "$PLIST" ]; then
      [ -z "${AIM_NO_LAUNCHCTL:-}" ] && { launchctl bootout "gui/$(id -u)/com.23blocks.ai-maestro" >/dev/null 2>&1 || true; }
      rm -f "$PLIST"
      echo "removed: the login item"
    fi
  fi
  exit 0
fi

# --- Linux --------------------------------------------------------------------------------------------
if [ "$LAUNCHER" = yes ] && has_linux_desktop; then
  mkdir -p "$DESKTOP_DIR" "$ICON_DIR"
  cp "$REPO/public/icons/icon-512.png" "$ICON_DIR/ai-maestro.png"
  cat > "$DESKTOP_DIR/ai-maestro.desktop" <<DESKTOPEOF
[Desktop Entry]
Type=Application
Name=AI Maestro
Comment=Open the AI Maestro dashboard (starts it if it is not running)
Exec="$BIN/ai-maestro" open
Icon=$ICON_DIR/ai-maestro.png
Terminal=false
Categories=Development;
DESKTOPEOF
  chmod +x "$DESKTOP_DIR/ai-maestro.desktop"
  echo "installed: $DESKTOP_DIR/ai-maestro.desktop"
  if [ "$LOGIN" = yes ]; then
    mkdir -p "$AUTOSTART_DIR"
    cat > "$AUTOSTART_DIR/ai-maestro.desktop" <<AUTOEOF
[Desktop Entry]
Type=Application
Name=AI Maestro
Exec="$BIN/ai-maestro" start
Terminal=false
X-GNOME-Autostart-enabled=true
AUTOEOF
    echo "installed: AI Maestro starts when you log in ($AUTOSTART_DIR/ai-maestro.desktop)"
  else
    rm -f "$AUTOSTART_DIR/ai-maestro.desktop"
  fi
else
  echo "no desktop found here, so only the ai-maestro command was installed"
fi
exit 0
