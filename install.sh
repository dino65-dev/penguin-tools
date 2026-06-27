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

install_wayland_portal() {
  [[ "${XDG_SESSION_TYPE:-}" == "wayland" ]] || return 0
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
if "\$APPIMAGE" --appimage-version >/dev/null 2>&1; then
  exec "\$APPIMAGE" "\$@"
fi
APPIMAGE_EXTRACT_AND_RUN=1 exec "\$APPIMAGE" "\$@"
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
