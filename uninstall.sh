#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/penguin-tools"
DESKTOP_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/applications/penguin-tools.desktop"

rm -rf "$INSTALL_ROOT"
rm -f "$HOME/.local/bin/penguin-tools" "$DESKTOP_FILE"

echo "Penguin Tools was removed. Your screenshots and notes were left intact."

