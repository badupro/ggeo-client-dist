#!/usr/bin/env python3
"""GGeo Tray launcher — dispatch to obfuscated tree matching Python version."""
from __future__ import annotations

import os
import runpy
import sys
from pathlib import Path

SUPPORTED = ("py311", "py312", "py313")

ROOT = Path(__file__).resolve().parent


def _fail(msg: str) -> None:
    print()
    print("=" * 60)
    print(msg)
    print("=" * 60)
    print()
    sys.exit(1)


def main() -> None:
    v = sys.version_info
    py_tag = f"py{v.major}{v.minor}"

    if py_tag not in SUPPORTED:
        _fail(
            f"  GGeo Client requires Python 3.11, 3.12, or 3.13.\n"
            f"  Detected: Python {v.major}.{v.minor}.{v.micro}\n"
            f"  Install from https://python.org/downloads/"
        )

    target = ROOT / py_tag
    entry = target / "tray.py"
    if not entry.exists():
        _fail(f"  Runtime tree missing: {entry}")

    sys.path.insert(0, str(target))
    os.chdir(ROOT)

    runpy.run_path(str(entry), run_name="__main__")


if __name__ == "__main__":
    main()
