#!/usr/bin/env python3
"""Interactive setup wizard. Run once on a fresh install."""
from __future__ import annotations

import getpass
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
CLIENT_JSON = DATA_DIR / "client.json"
SCRIPTS_DIR = ROOT / "scripts"
VENV_DIR = ROOT / "venv"


def banner(msg: str) -> None:
    print()
    print("=" * 60)
    print(msg)
    print("=" * 60)


def step(n: int, total: int, msg: str) -> None:
    print()
    print(f"[{n}/{total}] {msg}")


def ok(msg: str) -> None:
    print(f"    [OK]   {msg}")


def warn(msg: str) -> None:
    print(f"    [WARN] {msg}")


def info(msg: str) -> None:
    print(f"    [INFO] {msg}")


def fail(msg: str) -> None:
    print(f"    [FAIL] {msg}")


def ask_yes_no(question: str, default: bool = True) -> bool:
    suffix = " [Y/n]" if default else " [y/N]"
    try:
        ans = input(f"    {question}{suffix}: ").strip().lower()
    except EOFError:
        return default
    if not ans:
        return default
    return ans in ("y", "yes")


def prompt(message: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"    {message}{suffix}: ").strip()
    return value or (default or "")


def venv_python() -> Path:
    if platform.system() == "Windows":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"



_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")


def _can_unicode() -> bool:
    enc = (sys.stdout.encoding or "utf-8").lower()
    if "utf" in enc:
        return True
    try:
        "⠋".encode(enc)
        return True
    except (UnicodeEncodeError, LookupError):
        return False


def run_with_spinner(cmd: list[str], idle_label: str = "working ...",
                     timeout: int | None = None) -> int:
    """Run *cmd* and show a spinner + last line of output until exit."""
    if not sys.stdout.isatty():
        return subprocess.call(cmd)

    spinner = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏" if _can_unicode() else "|/-\\"
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
    except FileNotFoundError as e:
        fail(f"Command not found: {e}")
        return 127

    state = {"last": idle_label, "stop": False}
    lock = threading.Lock()

    def reader() -> None:
        try:
            assert proc.stdout is not None
            for raw in proc.stdout:
                line = _ANSI_RE.sub("", raw).strip()
                if not line:
                    continue
                if "already satisfied" in line.lower():
                    continue
                with lock:
                    state["last"] = line[:64]
        except Exception:
            pass
        finally:
            with lock:
                state["stop"] = True

    t = threading.Thread(target=reader, daemon=True)
    t.start()

    start = time.monotonic()
    i = 0
    try:
        while True:
            with lock:
                if state["stop"] and proc.poll() is not None:
                    break
                msg = state["last"]
            elapsed = int(time.monotonic() - start)
            char = spinner[i % len(spinner)]
            line = f"    [{char}] {msg}  ({elapsed}s)"
            # Clip to terminal width; fallback 80 cols
            try:
                width = os.get_terminal_size().columns
            except OSError:
                width = 80
            line = line[: max(20, width - 1)]
            sys.stdout.write("\r" + line.ljust(min(80, width - 1)))
            sys.stdout.flush()
            time.sleep(0.1)
            i += 1
            if timeout and time.monotonic() - start > timeout:
                proc.terminate()
                break
    finally:
        # Clear spinner line.
        try:
            width = os.get_terminal_size().columns
        except OSError:
            width = 80
        sys.stdout.write("\r" + " " * (width - 1) + "\r")
        sys.stdout.flush()

    t.join(timeout=2)
    return proc.wait(timeout=5)



def step_python_version() -> None:
    v = sys.version_info
    if v.major != 3 or v.minor < 11:
        fail(f"Python {v.major}.{v.minor} detected. Need Python 3.11+.")
        info("Install via https://python.org or 'brew install python@3.11'.")
        sys.exit(1)
    if platform.system() == "Windows" and v.minor > 13:
        warn(
            f"Python {v.major}.{v.minor} on Windows. pywintunx-pmd3 wheels"
            " currently top out at 3.13; install may fail."
        )
        if not ask_yes_no("Continue anyway?", default=False):
            sys.exit(1)
    ok(f"Python {v.major}.{v.minor}.{v.micro} detected.")



def step_virtualenv() -> None:
    if VENV_DIR.exists():
        ok(f"venv already exists: {VENV_DIR}")
        return
    info(f"Creating virtual environment at {VENV_DIR} ...")
    rc = run_with_spinner(
        [sys.executable, "-m", "venv", str(VENV_DIR)],
        idle_label="creating virtualenv ...",
        timeout=120,
    )
    if rc != 0:
        fail("venv creation failed")
        sys.exit(1)
    ok("venv created.")



def step_install_deps() -> None:
    req = ROOT / "requirements.txt"
    if not req.is_file():
        fail(f"{req} not found.")
        sys.exit(1)
    py = venv_python()

    info("Upgrading pip ...")
    rc = run_with_spinner(
        [str(py), "-m", "pip", "install", "--upgrade", "pip"],
        idle_label="upgrading pip ...",
        timeout=180,
    )
    if rc != 0:
        warn("pip upgrade had warnings (non-fatal).")

    info(f"Installing dependencies from {req.name} ...")
    rc = run_with_spinner(
        [str(py), "-m", "pip", "install", "-r", str(req)],
        idle_label="resolving dependencies ...",
        timeout=600,
    )
    if rc != 0:
        fail("pip install failed. Run manually to inspect the error:")
        print(f"    {py} -m pip install -r {req}")
        sys.exit(1)
    ok("Dependencies installed.")



def step_service_checks() -> None:
    system = platform.system()
    if system == "Darwin":
        # usbmuxd is bundled with macOS via launchd. No action needed.
        ok("macOS: usbmuxd auto-managed by launchd.")
        return

    if system == "Linux":
        try:
            res = subprocess.run(
                ["systemctl", "is-active", "usbmuxd"],
                capture_output=True, text=True, timeout=5,
            )
            if res.returncode == 0:
                ok("usbmuxd active.")
            else:
                warn("usbmuxd inactive. Run: sudo systemctl start usbmuxd")
        except Exception as e:
            warn(f"usbmuxd check failed: {e}")
        return

    if system == "Windows":
        # Check Apple Mobile Device Service (USB) + Bonjour Service (WiFi).
        try:
            res = subprocess.run(
                ["sc", "query", "Apple Mobile Device Service"],
                capture_output=True, text=True, timeout=5,
            )
            if "RUNNING" in res.stdout:
                ok("Apple Mobile Device Service running.")
            else:
                warn("Apple Mobile Device Service not running. Install iTunes.")
        except Exception as e:
            warn(f"AMDS check failed: {e}")

        # Bonjour Service: required for WiFi device discovery.
        try:
            bres = subprocess.run(
                ["sc", "query", "Bonjour Service"],
                capture_output=True, text=True, timeout=5,
            )
            if "RUNNING" in bres.stdout:
                ok("Bonjour Service running.")
                return
            if "1060" in bres.stdout or "does not exist" in bres.stdout.lower():
                warn(
                    "Bonjour Service is not installed. Install iTunes "
                    "(bundles Bonjour) or Bonjour Print Services."
                )
                return
            info("Bonjour Service stopped. Attempting to start ...")
            subprocess.run(
                ["sc", "config", "Bonjour Service", "start=", "auto"],
                capture_output=True, text=True, timeout=5,
            )
            subprocess.run(
                ["sc", "start", "Bonjour Service"],
                capture_output=True, text=True, timeout=10,
            )
            recheck = subprocess.run(
                ["sc", "query", "Bonjour Service"],
                capture_output=True, text=True, timeout=5,
            )
            if "RUNNING" in recheck.stdout:
                ok("Bonjour Service started + set to Automatic.")
            else:
                warn("Could not start Bonjour Service automatically.")
                warn("Open PowerShell as Administrator and run:")
                warn("  Set-Service 'Bonjour Service' -StartupType Automatic")
                warn("  Start-Service 'Bonjour Service'")
        except Exception as e:
            warn(f"Bonjour check/start failed: {e}")



def prompt_url() -> str:
    info("Host URL is provided by the GGEO Host operator.")
    while True:
        url = input("    Host URL: ").strip()
        if not url:
            print("    Host URL is required.")
            continue
        if url.startswith("http://") or url.startswith("https://"):
            return url.rstrip("/")
        print("    Must start with http:// or https://")


def prompt_api_key() -> str:
    info("API key is provided by the GGEO Host operator.")
    while True:
        key = input("    API key: ").strip()
        if not key:
            print("    API key is required.")
            continue
        if key.startswith("ggeo_") and key.count("_") >= 2:
            return key
        print("    Invalid format. Expected: ggeo_{uuid}_{hex}")



def validate_with_host(host_url: str, api_key: str) -> dict:
    py = venv_python()
    info(f"POST {host_url}/api/client/validate ...")
    code = (
        "import json, sys\n"
        "import httpx\n"
        f"resp = httpx.post('{host_url}/api/client/validate',"
        f" headers={{'X-API-Key': '{api_key}'}},"
        " json={'client_version': '2.0.0'}, timeout=30)\n"
        "print('STATUS', resp.status_code)\n"
        "print(resp.text)\n"
    )
    res = subprocess.run([str(py), "-c", code], capture_output=True, text=True)
    if "STATUS 200" not in res.stdout:
        fail("Host did not return 200")
        print(res.stdout)
        print(res.stderr)
        sys.exit(1)
    body_line = res.stdout.split("STATUS 200", 1)[1].strip()
    try:
        data = json.loads(body_line)
    except json.JSONDecodeError:
        fail("Could not parse host response as JSON.")
        print(body_line)
        sys.exit(1)
    if not data.get("valid"):
        reason = data.get("reason", "unknown")
        fail(f"Host rejected api key (reason={reason})")
        sys.exit(1)
    ok(f"Connected. client_name='{data.get('client_name')}'")
    limits = data.get("limits") or {}
    for k, v in sorted(limits.items()):
        info(f"  {k}: {v}")
    return data



def prompt_admin_credentials() -> tuple[str, str]:
    info("Creating a client_admin account on this client.")
    username = ""
    while not username:
        username = input("    Admin username: ").strip()
    while True:
        pw = getpass.getpass("    Admin password (min 8 chars): ").strip()
        confirm = getpass.getpass("    Confirm password: ").strip()
        if pw != confirm:
            print("    Passwords do not match. Try again.")
            continue
        if len(pw) < 8:
            print("    Password must be at least 8 characters.")
            continue
        return username, pw


def create_admin(host_url: str, api_key: str, username: str, password: str) -> None:
    py = venv_python()
    info(f"POST {host_url}/api/client/users (role=client_admin) ...")
    body = json.dumps({"username": username, "password": password,
                       "role": "client_admin"}).replace('"', '\\"')
    code = (
        "import sys\n"
        "import httpx, json\n"
        f"resp = httpx.post('{host_url}/api/client/users',"
        f" headers={{'X-API-Key': '{api_key}'}},"
        f" json=json.loads('{body}'), timeout=30)\n"
        "print('STATUS', resp.status_code)\n"
        "print(resp.text)\n"
    )
    res = subprocess.run([str(py), "-c", code], capture_output=True, text=True)
    out = res.stdout
    if "STATUS 201" in out:
        ok(f"Created user '{username}' with role 'client_admin'.")
        return
    if "STATUS 409" in out:
        body_line = out.split("STATUS 409", 1)[1].strip()
        try:
            detail = json.loads(body_line).get("detail", "")
        except Exception:
            detail = body_line
        warn(f"{detail}")
        if ask_yes_no("Continue with existing user?", default=True):
            return
        sys.exit(1)
    fail(f"Host returned non-201 response.")
    print(out[-500:])
    sys.exit(1)



def save_client_json(host_url: str, api_key: str, validate_data: dict) -> None:
    DATA_DIR.mkdir(exist_ok=True, parents=True)
    payload = {
        "client_id": validate_data.get("client_id"),
        "api_key": api_key,
        "host_url": host_url,
        "client_name": validate_data.get("client_name") or "",
    }
    CLIENT_JSON.write_text(json.dumps(payload, indent=2) + "\n")
    try:
        os.chmod(CLIENT_JSON, 0o600)
    except OSError:
        pass
    ok(f"Saved {CLIENT_JSON}")



def step_desktop_shortcut() -> None:
    if not ask_yes_no("Create a desktop shortcut to start GGEO?",
                       default=True):
        info("Skipped.")
        return
    system = platform.system()
    try:
        if system == "Darwin":
            _create_macos_shortcut()
        elif system == "Windows":
            _create_windows_shortcut()
        elif system == "Linux":
            _create_linux_shortcut()
        else:
            warn(f"Unsupported platform: {system}")
    except Exception as e:
        warn(f"Could not create shortcut: {e}")


def _create_macos_shortcut() -> None:
    """Compile an AppleScript .app that opens Terminal + sudo run.py."""
    SCRIPTS_DIR.mkdir(exist_ok=True)
    helper = SCRIPTS_DIR / "ggeo-launcher.sh"
    py = venv_python()
    helper.write_text(
        "#!/bin/bash\n"
        "# GGEO v2.0.0 — macOS launcher (invoked by GGEO.app)\n\n"
        f'cd "{ROOT}" || exit 1\n\n'
        "B=$'\\033[1m'; C=$'\\033[96m'; Y=$'\\033[93m'; D=$'\\033[2m'; R=$'\\033[0m'\n"
        'URL="http://ggeo-client.local:8479/"\n\n'
        'printf "\\n"\n'
        'printf "  ${B}${C}GGEO Client${R}  ${D}v2.0.0${R}\\n"\n'
        'printf "  ${D}GPS Location Spoofer for iOS — Distributed Build${R}\\n"\n'
        'printf "  ${D}────────────────────────────────────────${R}\\n\\n"\n'
        "if lsof -iTCP:8479 -sTCP:LISTEN >/dev/null 2>&1; then\n"
        '    printf "  ${Y}[WARN] Server already running on port 8479.${R}\\n"\n'
        '    printf "  Opening ${C}${URL}${R}\\n\\n"\n'
        '    sleep 1; open "${URL}"\n'
        '    read -n 1 -s -r -p "  Press any key to close..."\n'
        '    printf "\\n"; exit 0\n'
        "fi\n\n"
        'printf "  ${D}Starting server…${R}\\n"\n'
        'printf "  ${D}sudo password needed for utun tunnel.${R}\\n\\n"\n'
        '( sleep 4 && open "${URL}" ) &\n\n'
        f'sudo "{py}" run.py\n'
        'EXIT_CODE=$?\n\n'
        'printf "\\n  ${D}Server stopped (exit %d).${R}\\n" "${EXIT_CODE}"\n'
        'read -n 1 -s -r -p "  Press any key to close..."\n'
        'printf "\\n"\n'
    )
    helper.chmod(0o755)

    applescript = (
        "on run\n"
        f'    set launcherScript to "{helper}"\n'
        '    tell application "Terminal"\n'
        "        activate\n"
        '        do script "clear && exec " & quoted form of launcherScript\n'
        "        delay 0.3\n"
        "        try\n"
        '            set custom title of front window to "GGEO Client v2.0.0"\n'
        "        end try\n"
        "    end tell\n"
        "end run\n"
    )
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".applescript", delete=False
    ) as tf:
        tf.write(applescript)
        applescript_path = tf.name

    desktop = Path.home() / "Desktop"
    app_path = desktop / "GGEO Client.app"
    if app_path.exists():
        subprocess.run(["rm", "-rf", str(app_path)], check=False)
    res = subprocess.run(
        ["osacompile", "-o", str(app_path), applescript_path],
        capture_output=True, text=True,
    )
    try:
        os.unlink(applescript_path)
    except OSError:
        pass
    if res.returncode != 0:
        warn(f"osacompile failed: {res.stderr.strip()}")
    else:
        ok(f"Desktop shortcut: {app_path}")


def _create_windows_shortcut() -> None:
    """Create GGEO.bat at root + .lnk on Desktop with icon + admin flag."""
    SCRIPTS_DIR.mkdir(exist_ok=True)
    bat_path = SCRIPTS_DIR / "ggeo-launcher.bat"
    icon_path = ROOT / "ggeo" / "static" / "favicon.ico"
    bat_path.write_text(
        "@echo off\n"
        "setlocal\n"
        'cd /d "%~dp0.."\n'
        "title GGEO Client v2.0.0\n"
        "cls\n"
        "echo.\n"
        "echo   GGEO Client v2.0.0 - Distributed GPS Spoofer\n"
        "echo.\n"
        'start "" /B cmd /C "timeout /t 4 /nobreak >nul && '
        'start http://ggeo-client.local:8479/"\n'
        "venv\\Scripts\\python.exe run.py\n"
        "pause\n"
    )
    root_launcher = ROOT / "GGEO.bat"
    root_launcher.write_text(f'@echo off\ncall "{bat_path}"\n')
    ok(f"Launcher created: {root_launcher}")

    desktop_ok = False
    user_profile = os.environ.get("USERPROFILE", str(Path.home()))
    candidates = [
        Path(user_profile) / "OneDrive" / "Desktop",
        Path(user_profile) / "Desktop",
        Path.home() / "Desktop",
    ]
    seen: set[str] = set()
    for desktop_dir in candidates:
        key = str(desktop_dir).lower()
        if key in seen or not desktop_dir.is_dir():
            continue
        seen.add(key)
        lnk_path = desktop_dir / "GGEO Client.lnk"
        try:
            vbs_content = (
                'Set WshShell = CreateObject("WScript.Shell")\n'
                f'Set oShortcut = WshShell.CreateShortcut("{lnk_path}")\n'
                f'oShortcut.TargetPath = "{bat_path}"\n'
                f'oShortcut.WorkingDirectory = "{ROOT}"\n'
                f'oShortcut.IconLocation = "{icon_path}"\n'
                'oShortcut.Description = "GGEO Client - GPS Spoofer"\n'
                'oShortcut.Save\n'
            )
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".vbs", delete=False, dir=str(ROOT),
            ) as tf:
                tf.write(vbs_content)
                vbs_file = tf.name
            res = subprocess.run(
                ["cscript", "//Nologo", vbs_file],
                capture_output=True, text=True, timeout=15,
            )
            try:
                os.unlink(vbs_file)
            except OSError:
                pass
            if res.returncode == 0 and lnk_path.exists():
                ok(f"Desktop shortcut: {lnk_path}")
                desktop_ok = True
                break
        except Exception as e:
            warn(f"Tried {desktop_dir}: {e}")
    if not desktop_ok:
        warn("Could not create desktop shortcut on any standard Desktop path.")
        info(f"Fallback: launch via {root_launcher}")


def _create_linux_shortcut() -> None:
    desktop = Path.home() / "Desktop"
    desktop.mkdir(exist_ok=True)
    df = desktop / "ggeo-client.desktop"
    df.write_text(
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Name=GGEO Client\n"
        f"Exec=sudo {venv_python()} {ROOT / 'run.py'}\n"
        f"Path={ROOT}\n"
        "Terminal=true\n"
    )
    df.chmod(0o755)
    ok(f"Desktop shortcut: {df}")



def step_autostart() -> None:
    if not ask_yes_no(
        "Configure GGEO to start automatically when you log in?",
        default=False,
    ):
        info("Skipped. You can enable later via the system tray menu.")
        return
    sys.path.insert(0, str(ROOT))
    try:
        from ggeo.autostart import install_autostart
        success, msg = install_autostart()
        if success:
            ok(msg)
        else:
            warn(f"Autostart not configured: {msg}")
    except Exception as e:
        warn(f"Could not register autostart: {e}")



def main() -> None:
    banner("GGEO Client v2.0.0 — Setup Wizard")

    step(1, 10, "Python version check")
    step_python_version()

    step(2, 10, "Virtual environment")
    step_virtualenv()

    step(3, 10, "Install dependencies")
    step_install_deps()

    step(4, 10, "usbmuxd / Bonjour Service check")
    step_service_checks()

    step(5, 10, "Host URL + API key")
    host_url = prompt_url()
    api_key = prompt_api_key()

    step(6, 10, "Validate with host")
    validate_data = validate_with_host(host_url, api_key)

    step(7, 10, "Create client admin account")
    username, password = prompt_admin_credentials()
    create_admin(host_url, api_key, username, password)

    step(8, 10, "Save data/client.json")
    save_client_json(host_url, api_key, validate_data)

    step(9, 10, "Desktop shortcut (optional)")
    step_desktop_shortcut()

    step(10, 10, "Autostart on login (optional)")
    step_autostart()

    banner("Setup complete!")
    print(f"  Client name : {validate_data.get('client_name')}")
    print(f"  Host URL    : {host_url}")
    print(f"  Admin user  : {username}")
    print()
    print("  To start the server:")
    if platform.system() == "Darwin":
        print("    Double-click 'GGEO Client.app' on Desktop")
        print(f"    or:  cd {ROOT} && sudo venv/bin/python run.py")
    elif platform.system() == "Windows":
        print("    Double-click 'GGEO Client' on Desktop")
        print(f"    or:  cd {ROOT} & venv\\Scripts\\python.exe run.py")
    else:
        print(f"    cd {ROOT} && sudo venv/bin/python run.py")
    print()
    print("  Then open: http://ggeo-client.local:8479/")
    print("=" * 60)


if __name__ == "__main__":
    main()
