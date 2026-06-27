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

