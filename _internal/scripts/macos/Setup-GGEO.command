#!/bin/bash
# GGeo Client — One-Click Setup Wizard (macOS)
#
# Pre-requisites:
#   1. Python 3.11, 3.12, or 3.13 installed
#      (brew install python@3.13, or https://python.org)
#   2. Host URL + API key from the GGeo Host operator

clear

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"

if ! command -v python3 >/dev/null 2>&1; then
    cat <<'EOF'

  Error: python3 not found in PATH.

  Install via:  brew install python@3.13
  or download:  https://python.org/downloads/

EOF
    read -p "Press Enter to close..."
    exit 1
fi

sudo python3 setup.py
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "  Setup exited with code $EXIT_CODE."
fi
read -p "Press Enter to close..."
