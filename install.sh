#!/usr/bin/env bash
set -euo pipefail

REPO="${PENGUIN_TOOLS_REPO:-dino65-dev/penguin-tools}"
INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/penguin-tools"
BIN_DIR="$HOME/.local/bin"
APPIMAGE="$INSTALL_ROOT/Penguin-Tools.AppImage"
WRAPPER="$BIN_DIR/penguin-tools"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="$DESKTOP_DIR/penguin-tools.desktop"
ICON="$INSTALL_ROOT/icon.svg"

install_wayland_capture_backend() {
  [[ "${XDG_SESSION_TYPE:-}" == "wayland" || -n "${WAYLAND_DISPLAY:-}" ]] || return 0
  [[ "${PENGUIN_TOOLS_SKIP_CAPTURE_BACKEND:-0}" != "1" ]] || return 0

  local desktop="${XDG_CURRENT_DESKTOP:-${XDG_SESSION_DESKTOP:-}}"
  local command_name
  local apt_package
  local dnf_package
  local pacman_package
  local zypper_package

  case "${desktop,,}" in
    *gnome*|*unity*|*cinnamon*)
      command_name="gdbus"
      apt_package="libglib2.0-bin"
      dnf_package="glib2"
      pacman_package="glib2"
      zypper_package="glib2-tools"
      ;;
    *kde*|*plasma*)
      command_name="spectacle"
      apt_package="spectacle"
      dnf_package="spectacle"
      pacman_package="spectacle"
      zypper_package="spectacle"
      ;;
    *hyprland*|*sway*|*wlroots*|*river*|*wayfire*)
      command_name="grim"
      apt_package="grim"
      dnf_package="grim"
      pacman_package="grim"
      zypper_package="grim"
      ;;
    *)
      for command_name in gdbus spectacle grim gnome-screenshot; do
        command -v "$command_name" >/dev/null 2>&1 && return 0
      done
      echo "Desktop-native Wayland capture backend was not detected for: ${desktop:-unknown}."
      echo "Install gdbus, Spectacle, or grim for prompt-free capture on your compositor."
      return 0
      ;;
  esac

  command -v "$command_name" >/dev/null 2>&1 && return 0
  if ! command -v sudo >/dev/null 2>&1; then
    echo "Install $command_name to enable prompt-free Wayland capture (sudo was not found)."
    return 0
  fi

  echo "Installing $command_name for prompt-free Wayland screen capture..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y "$apt_package" || true
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y "$dnf_package" || true
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --needed --noconfirm "$pacman_package" || true
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper --non-interactive install "$zypper_package" || true
  else
    echo "Package manager not recognized. Install $command_name for prompt-free capture."
  fi
}

install_wayland_portal() {
  [[ "${XDG_SESSION_TYPE:-}" == "wayland" ]] || return 0
  [[ "${PENGUIN_TOOLS_INSTALL_PORTAL:-0}" == "1" ]] || return 0
  [[ "${PENGUIN_TOOLS_SKIP_PORTAL:-0}" != "1" ]] || return 0

  if compgen -G '/usr/share/xdg-desktop-portal/portals/*.portal' >/dev/null; then
    return 0
  fi

  local desktop="${XDG_CURRENT_DESKTOP:-${XDG_SESSION_DESKTOP:-}}"
  local backend
  case "${desktop,,}" in
    *gnome*|*unity*|*cinnamon*) backend="xdg-desktop-portal-gnome" ;;
    *kde*|*plasma*) backend="xdg-desktop-portal-kde" ;;
    *hyprland*) backend="xdg-desktop-portal-hyprland" ;;
    *sway*|*wlroots*|*river*|*wayfire*) backend="xdg-desktop-portal-wlr" ;;
    *)
      echo "Wayland portal backend was not detected for desktop: ${desktop:-unknown}."
      echo "Screen capture may require an xdg-desktop-portal backend from your distro."
      return 0
      ;;
  esac

  if ! command -v sudo >/dev/null 2>&1; then
    echo "Install $backend to enable Wayland screen capture (sudo was not found)."
    return 0
  fi

  echo "Installing the missing Wayland screen-capture portal ($backend)..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y xdg-desktop-portal "$backend" || true
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y xdg-desktop-portal "$backend" || true
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --needed --noconfirm xdg-desktop-portal "$backend" || true
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper --non-interactive install xdg-desktop-portal "$backend" || true
  else
    echo "Package manager not recognized. Install $backend to enable Wayland capture."
  fi
}

install_xwayland() {
  [[ "${XDG_SESSION_TYPE:-}" == "wayland" || -n "${WAYLAND_DISPLAY:-}" ]] || return 0
  [[ "${PENGUIN_TOOLS_SKIP_XWAYLAND:-0}" != "1" ]] || return 0

  if command -v Xwayland >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "Install XWayland to enable reliable widget dragging and edge docking (sudo was not found)."
    return 0
  fi

  echo "Installing XWayland for reliable widget dragging and edge docking..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y xwayland || true
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y xorg-x11-server-Xwayland || true
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --needed --noconfirm xorg-xwayland || true
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper --non-interactive install xwayland || true
  else
    echo "Package manager not recognized. Install XWayland to enable widget docking."
  fi
}

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Penguin Tools currently supports Linux only." >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64|amd64) RELEASE_ARCH="x86_64" ;;
  aarch64|arm64) RELEASE_ARCH="arm64" ;;
  *) echo "Unsupported CPU architecture: $(uname -m)" >&2; exit 1 ;;
esac

for command in curl chmod mkdir; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

mkdir -p "$INSTALL_ROOT" "$BIN_DIR" "$DESKTOP_DIR"
install_wayland_capture_backend
install_xwayland
install_wayland_portal

echo "Downloading Penguin Tools for $RELEASE_ARCH..."
curl --fail --location --show-error --progress-bar \
  "https://github.com/$REPO/releases/latest/download/Penguin-Tools-$RELEASE_ARCH.AppImage" \
  --output "$APPIMAGE"
curl --fail --location --show-error --silent \
  "https://raw.githubusercontent.com/$REPO/main/assets/icon.svg" \
  --output "$ICON"
chmod +x "$APPIMAGE"

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
APPIMAGE="$APPIMAGE"
PENGUIN_ARGS=()
HAS_OZONE_OVERRIDE=0
for argument in "\$@"; do
  case "\$argument" in
    --ozone-platform|--ozone-platform=*) HAS_OZONE_OVERRIDE=1 ;;
  esac
done
if [[ "\${XDG_SESSION_TYPE:-}" == "wayland" || -n "\${WAYLAND_DISPLAY:-}" ]] \\
  && [[ -n "\${DISPLAY:-}" ]] \\
  && [[ "\${PENGUIN_TOOLS_NATIVE_WAYLAND:-0}" != "1" ]] \\
  && [[ "\$HAS_OZONE_OVERRIDE" != "1" ]]; then
  PENGUIN_ARGS+=(--ozone-platform=x11)
fi
if "\$APPIMAGE" --appimage-version >/dev/null 2>&1; then
  exec "\$APPIMAGE" "\${PENGUIN_ARGS[@]}" "\$@"
fi
APPIMAGE_EXTRACT_AND_RUN=1 exec "\$APPIMAGE" "\${PENGUIN_ARGS[@]}" "\$@"
EOF
chmod +x "$WRAPPER"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Penguin Tools
Comment=Floating screenshot and system toolbox
Exec=$WRAPPER
Icon=$ICON
Terminal=false
Type=Application
Categories=Utility;
StartupWMClass=penguin-tools
EOF
chmod +x "$DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

echo
echo "Penguin Tools is installed."
echo "Open it from your application menu or run: penguin-tools"
