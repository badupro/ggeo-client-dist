#!/bin/bash
clear
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$INSTALL_DIR/_internal/data/ggeo.log"

if [ ! -f "$LOG" ]; then
    echo "  Log file not found:"
    echo "  $LOG"
    echo
    echo "  Has the server been started yet?"
    echo
    read -p "  Press Enter to close..."
    exit 0
fi

echo "  Tailing GGeo log (Ctrl+C to exit):"
echo "  $LOG"
echo
exec tail -f "$LOG"
