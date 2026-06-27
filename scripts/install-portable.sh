#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BIN="$APP_DIR/penguin-tools"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="$DESKTOP_DIR/penguin-tools.desktop"

if [[ ! -f "$BIN" ]]; then
  echo "penguin-tools binary was not found next to this installer." >&2
  exit 1
fi

chmod +x "$BIN" "$APP_DIR/chrome-sandbox" "$APP_DIR/chrome_crashpad_handler"
mkdir -p "$DESKTOP_DIR"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Penguin Tools
Comment=Floating screenshot and system toolbox
Exec=$BIN
Icon=$APP_DIR/icon.svg
Terminal=false
Type=Application
Categories=Utility;
StartupWMClass=penguin-tools
EOF

chmod +x "$DESKTOP_FILE"
echo "Penguin Tools is installed for this user."
echo "Launch it from your application menu or run: $BIN"
