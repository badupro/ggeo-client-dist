#!/bin/bash
# GGEO Client — One-Click Setup Wizard (macOS)
#
# Sebelum jalankan:
#   1. Letakkan repo di folder pilihan (mis. ~/ggeo-client)
#   2. Pastikan Python 3.11+ ter-install
#      (brew install python@3.11  ATAU  https://python.org)
#   3. Pastikan punya Host URL + API key dari operator GGEO Host
#      (host admin → Clients → [Add] → copy api_key)
#
# Cara pakai:
#   Double-click Setup-GGEO.command dari Finder.
#   Wizard akan membuat venv, install deps, prompt host URL + api_key,
#   buat client_admin account, save config, BUAT SHORTCUT, opt-in
#   autostart on login. Setelah selesai double-click "GGEO Client.app"
#   di Desktop untuk jalankan server.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Naik 2 level: scripts/macos/ → repo root
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=================================================="
echo "  GGEO Client — One-Click Setup (macOS)"
echo "=================================================="
echo "  Repo: $REPO_DIR"
echo ""

cd "$REPO_DIR"

# Cek Python
if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 tidak ada di PATH."
    echo "Install via:  brew install python@3.11"
    echo "atau download dari https://python.org"
    read -p "Tekan Enter untuk keluar..."
    exit 1
fi

PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "Python detected: $PY_VER"
echo ""

# Run wizard — semua langkah (venv, deps, host, shortcut, autostart)
# di dalam setup.py.
python3 setup.py

EXIT_CODE=$?
echo ""
echo "=================================================="
if [ $EXIT_CODE -eq 0 ]; then
    echo "  Setup berhasil! Tutup window ini."
    echo ""
    echo "  Untuk jalankan server, double-click 'GGEO Client.app' di Desktop."
else
    echo "  Setup error (exit $EXIT_CODE). Lihat pesan di atas."
fi
echo "=================================================="
read -p "Tekan Enter untuk menutup..."
