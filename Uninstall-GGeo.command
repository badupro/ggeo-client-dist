#!/bin/bash
clear
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "  GGeo Client Uninstaller"
echo
echo "  This will remove:"
echo "    - The server (running process if any)"
echo "    - Autostart agent (LaunchAgent)"
echo "    - Desktop shortcut"
echo "    - The entire install folder: $INSTALL_DIR"
echo
read -p "  Continue? [y/N] " ans
if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
    echo "  Cancelled."
    read -p "  Press Enter to close..."
    exit 0
fi

echo
echo "  Stopping server..."
sudo lsof -iTCP:8484 -sTCP:LISTEN -t -P 2>/dev/null | xargs -r sudo kill -9 2>/dev/null || true
sudo pkill -9 -f "_internal/run.py" 2>/dev/null || true
sudo pkill -9 -f "_internal/tray.py" 2>/dev/null || true

echo "  Removing autostart..."
for plist in ~/Library/LaunchAgents/com.ggeo.tray.*.plist; do
    [ -f "$plist" ] || continue
    label=$(basename "$plist" .plist)
    sudo launchctl bootout "system/$label" 2>/dev/null || true
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    rm -f "$plist"
done

echo "  Removing desktop shortcuts..."
rm -rf ~/Desktop/GGeo\ Client*.app 2>/dev/null
rm -rf ~/Desktop/GGEO\ Client*.app 2>/dev/null

echo "  Removing install folder..."
TRASH="/tmp/.ggeo-trash-$$"
sudo mv "$INSTALL_DIR" "$TRASH" || { echo "  mv failed"; read -p "Press Enter..."; exit 1; }
sudo rm -rf "$TRASH" &

echo
echo "  Uninstall complete."
echo "  You can re-install via: git clone https://github.com/badupro/ggeo-client-dist"
echo
read -p "  Press Enter to close..."
