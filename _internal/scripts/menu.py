#!/usr/bin/env python3
"""GGeo unified menu launcher — invoked by top-level GGeo.command/.bat."""
from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
INTERNAL = ROOT / "_internal"

try:
    VERSION = (ROOT / "VERSION").read_text().strip()
except Exception:
    VERSION = "?"

if platform.system() == "Windows":
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        h = kernel32.GetStdHandle(-11)
        mode = ctypes.c_ulong()
        if kernel32.GetConsoleMode(h, ctypes.byref(mode)):
            kernel32.SetConsoleMode(h, mode.value | 0x0001 | 0x0004)
    except Exception:
        pass

C = "\x1b[36m"
CB = "\x1b[1;36m"
G = "\x1b[1;32m"
Y = "\x1b[33m"
R = "\x1b[1;31m"
DIM = "\x1b[2;37m"
BLUE = "\x1b[2;34m"
RST = "\x1b[0m"


def clear_screen() -> None:
    if platform.system() == "Windows":
        os.system("cls")
    else:
        sys.stdout.write("\x1b[2J\x1b[H")
        sys.stdout.flush()


def venv_python() -> Path:
    if platform.system() == "Windows":
        return INTERNAL / "venv" / "Scripts" / "python.exe"
    return INTERNAL / "venv" / "bin" / "python"


def detect_default() -> str:
    has_config = (INTERNAL / "data" / "client.json").exists()
    has_venv = venv_python().exists()
    if not has_config or not has_venv:
        return "1"
    return "3"


def banner() -> str:
    width = 54
    inner = width - 2
    inset = "   "
    sep = "    "
    logo_width = 12
    avail = inner - len(inset) - logo_width - len(sep)

    titles = [
        (f"GGeo Client v{VERSION}", None),
        ("Mobile GPS Location Spoofer", DIM),
        ("by Gpro · badupro", DIM),
    ]
    logos = ["╔═╗╔═╗┌─┐┌─┐", "║ ╦║ ╦├┤ │ │", "╚═╝╚═╝└─┘└─┘"]

    lines = ["", BLUE + "╔" + "═" * inner + "╗" + RST,
             BLUE + "║" + " " * inner + "║" + RST]
    for logo, (title, style) in zip(logos, titles):
        pad = max(0, avail - len(title))
        styled = (style + title + RST) if style else title
        lines.append(
            BLUE + "║" + RST
            + inset + CB + logo + RST + sep + styled + " " * pad
            + BLUE + "║" + RST
        )
    lines.append(BLUE + "║" + " " * inner + "║" + RST)
    lines.append(BLUE + "╚" + "═" * inner + "╝" + RST)
    return "\n".join(lines) + "\n"


def print_menu(default: str) -> None:
    items = [
        ("1", "Setup / re-configure"),
        ("2", "Start server"),
        ("3", "Start server + open log viewer"),
        ("4", "View live log only"),
        ("5", "Update from GitHub"),
        ("6", "Uninstall"),
        ("q", "Quit"),
    ]
    print("  Choose an action:\n")
    for num, label in items:
        if num == default:
            print(f"   {CB}[{num}]{RST}  {label}  {DIM}← default{RST}")
        else:
            print(f"   {C}[{num}]{RST}  {label}")
    print()


def kill_port_8484() -> None:
    if platform.system() == "Windows":
        try:
            res = subprocess.run(
                ["netstat", "-ano"], capture_output=True, text=True, timeout=5,
            )
            for line in res.stdout.splitlines():
                if ":8484" in line and "LISTENING" in line:
                    pid = line.split()[-1]
                    subprocess.run(["taskkill", "/F", "/PID", pid],
                                   capture_output=True)
        except Exception:
            pass
    else:
        os.system(
            'sudo lsof -iTCP:8484 -sTCP:LISTEN -t -P 2>/dev/null '
            '| xargs -r sudo kill -9 2>/dev/null'
        )


def action_setup() -> None:
    clear_screen()
    setup_py = INTERNAL / "setup.py"
    if platform.system() == "Windows":
        rc = subprocess.call(["python", str(setup_py)])
    else:
        rc = subprocess.call(["sudo", sys.executable, str(setup_py)])
    if rc != 0:
        print(f"\n  Setup exited with code {rc}.")
    input("  Press Enter to close...")


def action_start_server() -> None:
    clear_screen()
    py = venv_python()
    if not py.exists():
        print(f"  {R}venv not found. Run [1] Setup first.{RST}")
        input("  Press Enter to close...")
        return
    run_py = INTERNAL / "run.py"
    if platform.system() == "Windows":
        rc = subprocess.call([str(py), str(run_py)])
    else:
        rc = subprocess.call(["sudo", str(py), str(run_py)])
    print(f"\n  Server stopped (exit {rc}).")
    input("  Press Enter to close...")


def action_start_with_log() -> None:
    clear_screen()
    log_path = INTERNAL / "data" / "ggeo.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.touch()
    if platform.system() == "Darwin":
        applescript = (
            f'tell application "Terminal" to do script '
            f'"clear && echo GGeo Live Log && tail -f \\"{log_path}\\""'
        )
        subprocess.Popen(["osascript", "-e", applescript])
    elif platform.system() == "Windows":
        subprocess.Popen(
            ["cmd", "/C", "start", "cmd", "/K",
             "powershell", "-NoProfile", "-Command",
             f"Get-Content '{log_path}' -Wait -Tail 50"],
            shell=False,
        )
    time.sleep(1)
    action_start_server()


def action_view_log() -> None:
    clear_screen()
    log_path = INTERNAL / "data" / "ggeo.log"
    if not log_path.exists():
        print(f"  Log file not found:\n  {log_path}\n")
        print("  Has the server been started yet?")
        input("  Press Enter to close...")
        return
    print(f"  Tailing GGeo log (Ctrl+C to exit):\n  {log_path}\n")
    if platform.system() == "Windows":
        subprocess.call(
            ["powershell", "-NoProfile", "-Command",
             f"Get-Content '{log_path}' -Wait -Tail 50"]
        )
    else:
        subprocess.call(["tail", "-f", str(log_path)])


def action_update() -> None:
    clear_screen()
    print("  GGeo Client Update\n")
    print("  This will fetch latest from GitHub, rebuild venv,")
    print("  and reinstall dependencies.\n")
    ans = input("  Continue? [Y/n] ").strip().lower()
    if ans == "n":
        print("  Cancelled.")
        input("  Press Enter to close...")
        return

    print("\n  Stopping server...")
    kill_port_8484()

    print("  git fetch + reset...")
    if subprocess.call(["git", "-C", str(ROOT), "fetch", "origin", "main"]) != 0:
        input("  fetch failed. Press Enter...")
        return
    if subprocess.call(["git", "-C", str(ROOT), "reset", "--hard", "origin/main"]) != 0:
        input("  reset failed. Press Enter...")
        return

    print("  Removing old venv...")
    venv_dir = INTERNAL / "venv"
    if platform.system() == "Windows":
        shutil.rmtree(venv_dir, ignore_errors=True)
    else:
        subprocess.call(["sudo", "rm", "-rf", str(venv_dir)])

    print("  Creating fresh venv...")
    if subprocess.call([sys.executable, "-m", "venv", str(venv_dir)]) != 0:
        input("  venv creation failed. Press Enter...")
        return

    print("  Installing dependencies...")
    py = venv_python()
    subprocess.call([str(py), "-m", "pip", "install", "--upgrade", "pip", "--quiet"])
    if subprocess.call(
        [str(py), "-m", "pip", "install", "-r", str(INTERNAL / "requirements.txt")]
    ) != 0:
        input("  pip install failed. Press Enter...")
        return

    new_ver = (ROOT / "VERSION").read_text().strip() if (ROOT / "VERSION").exists() else "?"
    print(f"\n  Update complete. Version: {new_ver}")
    input("  Press Enter to close...")


def action_uninstall() -> None:
    clear_screen()
    print("  GGeo Client Uninstaller\n")
    print(f"  This will remove server, autostart, desktop shortcut,")
    print(f"  AND the entire install folder:\n  {ROOT}\n")
    ans = input("  Continue? [y/N] ").strip().lower()
    if ans != "y":
        print("  Cancelled.")
        input("  Press Enter to close...")
        return

    kill_port_8484()

    if platform.system() == "Windows":
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0, winreg.KEY_ALL_ACCESS,
            ) as k:
                names = []
                i = 0
                while True:
                    try:
                        n, _, _ = winreg.EnumValue(k, i)
                    except OSError:
                        break
                    if "ggeo" in n.lower() or "gpro" in n.lower():
                        names.append(n)
                    i += 1
                for n in names:
                    winreg.DeleteValue(k, n)
        except Exception:
            pass
        for desktop in (
            Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Desktop",
            Path(os.environ.get("USERPROFILE", str(Path.home()))) / "OneDrive" / "Desktop",
        ):
            if desktop.is_dir():
                for lnk in desktop.glob("GGeo*Client*.lnk"):
                    try:
                        lnk.unlink()
                    except Exception:
                        pass
                for lnk in desktop.glob("GGEO*Client*.lnk"):
                    try:
                        lnk.unlink()
                    except Exception:
                        pass
        os.system(
            f'start /B cmd /C "timeout /t 2 /nobreak > nul && rd /s /q "{ROOT}""'
        )
        print("\n  Uninstall scheduled. Folder will be deleted shortly.")
    else:
        os.system('sudo pkill -9 -f "_internal/run.py" 2>/dev/null')
        os.system('sudo pkill -9 -f "_internal/tray.py" 2>/dev/null')
        agents = Path.home() / "Library" / "LaunchAgents"
        if agents.is_dir():
            for plist in agents.glob("com.ggeo.tray.*.plist"):
                label = plist.stem
                os.system(f'launchctl bootout "gui/$(id -u)/{label}" 2>/dev/null')
                os.system(f'sudo launchctl bootout "system/{label}" 2>/dev/null')
                try:
                    plist.unlink()
                except Exception:
                    pass
        for app in (Path.home() / "Desktop").glob("*GGeo*Client*.app"):
            shutil.rmtree(app, ignore_errors=True)
        for app in (Path.home() / "Desktop").glob("*GGEO*Client*.app"):
            shutil.rmtree(app, ignore_errors=True)
        trash = f"/tmp/.ggeo-trash-{os.getpid()}"
        os.system(f'sudo mv "{ROOT}" "{trash}"')
        os.system(f'sudo rm -rf "{trash}" &')
        print("\n  Uninstall complete.")

    input("  Press Enter to close...")


def main() -> None:
    clear_screen()
    print(banner())
    default = detect_default()
    print_menu(default)
    try:
        choice = input(f"  Enter choice [{default}]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return
    if not choice:
        choice = default

    actions = {
        "1": action_setup,
        "2": action_start_server,
        "3": action_start_with_log,
        "4": action_view_log,
        "5": action_update,
        "6": action_uninstall,
    }

    if choice == "q":
        print("  Bye.")
        return

    fn = actions.get(choice)
    if fn:
        fn()
    else:
        print(f"  {R}Invalid choice.{RST}")
        time.sleep(1)


if __name__ == "__main__":
    main()
