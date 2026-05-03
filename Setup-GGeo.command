#!/bin/bash
# GGeo Client — One-Click Setup Wizard (macOS)

clear

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
    cat <<'EOF'

  Error: python3 not found in PATH.

  Install via:  brew install python@3.13
  or download:  https://python.org/downloads/

EOF
    read -p "Press Enter to close..."
    exit 1
fi

sudo python3 _internal/setup.py
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "  Setup exited with code $EXIT_CODE."
fi
read -p "Press Enter to close..."
