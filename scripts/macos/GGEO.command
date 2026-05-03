#!/bin/bash
# GGEO client launcher for macOS.
#
# Drop this on the Desktop or double-click from Finder. Opens a
# Terminal window, activates the venv at the repo root, and starts
# the server with sudo (pytun_pmd3 needs root to create the utun
# interface on macOS).
#
# Usage:
#   1. Edit GGEO_ROOT below to the absolute path of your ggeo-client
#      checkout (the directory that has venv/ and run.py).
#   2. chmod +x GGEO.command
#   3. Double-click in Finder.
#
# The script stays attached to Terminal so you can see logs and
# Ctrl+C to stop cleanly (which lets the client fire the shutdown
# event to the host).

set -e

# --- EDIT ME ---
GGEO_ROOT="$HOME/ggeo-client"
# ---------------

cd "$GGEO_ROOT"

if [ ! -d "venv" ]; then
    echo "venv not found at $GGEO_ROOT/venv"
    echo "Run: cd $GGEO_ROOT && python3 -m venv venv && source venv/bin/activate && python setup.py"
    read -n 1 -s -r -p "Press any key to close..."
    exit 1
fi

# Make sure we have a cached sudo credential before run.py needs it.
sudo -v

# Keep the sudo timestamp alive while run.py runs.
( while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done ) 2>/dev/null &

echo "Starting GGEO client (Ctrl+C to stop cleanly)"
sudo ./venv/bin/python run.py
