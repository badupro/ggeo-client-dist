#!/bin/bash
clear
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 _internal/scripts/menu.py
