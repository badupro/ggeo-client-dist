#!/bin/bash
# GGEO Client — One-Click Setup Wizard (macOS)
#
# Pre-requisites:
#   1. Place this repo in a folder of your choice (e.g., ~/ggeo-client)
#   2. Python 3.11+ installed
#      (brew install python@3.11, or https://python.org)
#   3. Host URL + API key from the GGEO Host operator
#      (host admin → Clients → [Add] → copy api_key)
#
# Usage:
#   Double-click Setup-GGEO.command from Finder.
#   The wizard creates the venv, installs dependencies, prompts for
#   host URL + api_key, creates a client_admin account, saves config,
#   creates a desktop shortcut, and optionally enables autostart on
#   login. When setup finishes, double-click "GGEO Client.app" on the
#   Desktop to start the server.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Two levels up: scripts/macos/ → repo root
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=================================================="
echo "  GGEO Client — One-Click Setup (macOS)"
echo "=================================================="
echo "  Repo: $REPO_DIR"
echo ""

cd "$REPO_DIR"

# Check Python
if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 not found in PATH."
    echo "Install via:  brew install python@3.11"
    echo "or download from https://python.org"
    read -p "Press Enter to exit..."
    exit 1
fi

PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "Python detected: $PY_VER"
echo ""

# Run wizard — all steps (venv, deps, host, shortcut, autostart)
# are inside setup.py.
python3 setup.py

EXIT_CODE=$?
echo ""
echo "=================================================="
if [ $EXIT_CODE -eq 0 ]; then
    echo "  Setup complete."
    echo ""
    echo "  To start the server, double-click 'GGEO Client.app' on the Desktop."
else
    echo "  Setup failed (exit $EXIT_CODE). See messages above."
fi
echo "=================================================="
read -p "Press Enter to close..."
