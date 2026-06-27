# Penguin Tools

A small, mouse-first Linux desktop toolbox inspired by Microsoft PC Manager's floating toolbar. It stays above other windows and gives you region screenshots, live system status, quick notes, a calculator shortcut, and a screenshot gallery without requiring keyboard shortcuts.

![Penguin Tools floating toolbar](docs/toolbar.png)

## Features

- Draggable, frameless floating toolbar with a Windows 11 / PC Manager visual style
- Select any rectangular screen area using only the mouse
- Copy the capture directly to the system clipboard
- Also save every capture as a PNG in `~/Pictures/Penguin Tools`
- Live CPU, memory, download, upload, and uptime status
- Quick notes saved locally
- Opens your installed Linux calculator
- System tray controls, always-on-top toggle, and launch-at-login option
- X11 and Wayland support through Electron's desktop-capture APIs

## Install

Install or update the latest release with one command:

```bash
curl -fsSL https://raw.githubusercontent.com/dino65-dev/penguin-tools/main/install.sh | bash
```

Then open **Penguin Tools** from your application menu. The installer:

- detects x86-64 or ARM64 automatically;
- downloads the latest AppImage from GitHub Releases;
- works without root access;
- adds the `penguin-tools` command and application-menu entry;
- falls back to AppImage extract-and-run mode when FUSE is unavailable.
- detects a missing Wayland portal and installs the appropriate GNOME, KDE, Hyprland, or wlroots backend using your distro's package manager.

Portal installation requests `sudo` only when the dependency is missing. Set `PENGUIN_TOOLS_SKIP_PORTAL=1` before the install command if you want to manage portal packages yourself.

To uninstall the application while keeping your screenshots and notes:

```bash
curl -fsSL https://raw.githubusercontent.com/dino65-dev/penguin-tools/main/uninstall.sh | bash
```

## Run from source

Requirements: Node.js 20 or later, npm, and a Linux desktop environment.

```bash
npm install
npm start
```

On Wayland, screen capture uses the desktop portal. Install the portal implementation for your desktop if capture is unavailable:

- GNOME: `xdg-desktop-portal-gnome`
- KDE Plasma: `xdg-desktop-portal-kde`
- wlroots compositors: `xdg-desktop-portal-wlr`

Some Wayland desktops show a one-time system screen-sharing chooser. That prompt is controlled by the compositor and cannot be bypassed safely by applications.

## Releases

Every `v*` Git tag automatically builds x86-64 and ARM64 AppImage and Debian packages through GitHub Actions and publishes them to GitHub Releases.

## Build locally

Run this on Linux:

```bash
npm install
npm run dist:linux
```

The AppImage and Debian package are written to `dist/`.

## Mouse-only capture flow

1. Click **Screenshot** on the floating toolbar.
2. Drag around the area you want.
3. Click **Copy** in the selection controls.
4. Paste into a chat, document, or image editor.

The toolbar hides before the desktop image is captured, so it is not included in the screenshot.

## Privacy

All screenshots and notes stay on the local computer. Penguin Tools has no analytics and sends no capture data to a server.

## Known platform behavior

- Multi-monitor capture targets the monitor containing the toolbar.
- Network speed comes from `/proc/net/dev` on Linux. On other platforms it displays zero.
- Calculator launching supports GNOME Calculator, KCalc, Galculator, MATE Calculator, and xcalc.
- The app intentionally does not implement a privileged "drop Linux page cache" button. That operation generally makes performance worse and should not be presented as a RAM optimization.

## License

MIT
