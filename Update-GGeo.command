#!/bin/bash
clear
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$INSTALL_DIR"

echo "  GGeo Client Update"
echo
echo "  This will fetch the latest version from GitHub,"
echo "  rebuild the venv, and reinstall dependencies."
echo
read -p "  Continue? [Y/n] " ans
if [[ "$ans" == "n" || "$ans" == "N" ]]; then
    echo "  Cancelled."
    read -p "  Press Enter to close..."
    exit 0
fi

if ! command -v git >/dev/null 2>&1; then
    echo "  Error: git not found in PATH."
    read -p "  Press Enter to close..."
    exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
    echo "  Error: python3 not found in PATH."
    read -p "  Press Enter to close..."
    exit 1
fi

echo
echo "  Stopping running server (if any)..."
sudo lsof -iTCP:8484 -sTCP:LISTEN -t -P 2>/dev/null | xargs -r sudo kill -9 2>/dev/null || true
sudo pkill -9 -f "_internal/run.py" 2>/dev/null || true
sudo pkill -9 -f "_internal/tray.py" 2>/dev/null || true

echo "  Pulling latest from origin/main..."
if ! git fetch origin main; then
    echo "  git fetch failed."
    read -p "  Press Enter to close..."
    exit 1
fi
if ! git reset --hard origin/main; then
    echo "  git reset failed."
    read -p "  Press Enter to close..."
    exit 1
fi

echo "  Removing old venv..."
sudo rm -rf _internal/venv

echo "  Creating fresh venv..."
if ! python3 -m venv _internal/venv; then
    echo "  venv creation failed."
    read -p "  Press Enter to close..."
    exit 1
fi

echo "  Installing dependencies (this may take a minute)..."
_internal/venv/bin/pip install --upgrade pip --quiet
if ! _internal/venv/bin/pip install -r _internal/requirements.txt; then
    echo "  pip install failed."
    read -p "  Press Enter to close..."
    exit 1
fi

NEW_VER=$(cat VERSION 2>/dev/null || echo "?")
echo
echo "  Update complete. Version: $NEW_VER"
read -p "  Press Enter to close..."
