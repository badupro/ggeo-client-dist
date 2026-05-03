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

_PY_TAG = f"py{sys.version_info.major}{sys.version_info.minor}"
_PY_TREE = ROOT / _PY_TAG
if _PY_TREE.is_dir() and (_PY_TREE / "ggeo" / "__init__.py").exists():
    sys.path.insert(0, str(_PY_TREE))

SUPPORTED_PYTHONS = {(3, 11), (3, 12), (3, 13)}
TOTAL_STEPS = 10
DEFAULT_PORT = 8484

try:
    VERSION = (ROOT / "VERSION").read_text().strip()
except Exception:
    VERSION = "2.3.0"

SHORTCUT_LABEL = f"GGeo Client v{VERSION}"
AUTOSTART_LABEL = "com.ggeo.tray." + VERSION.replace(".", "_")


def _early_force_close(title: str, lines: list[str]) -> None:
    print()
    print("=" * 56)
    print(f"  X  {title}")
    print()
    for ln in lines:
        print(f"  {ln}")
    print("=" * 56)
    print()


def _ensure_elevated() -> None:
    system = platform.system()
    if system == "Darwin":
        if os.geteuid() != 0:
            print("Re-executing with sudo for setup ...")
            os.execvp("sudo", ["sudo", "-E", sys.executable] + sys.argv)
    elif system == "Windows":
        try:
            import ctypes
            is_admin = bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            is_admin = True
        if not is_admin:
            _early_force_close(
                "Administrator privileges required",
                [
                    "Right-click 'Setup-GGEO.bat'",
                    "and choose 'Run as administrator'",
                    "",
                    "Press any key to exit...",
                ],
            )
            try:
                input()
            except Exception:
                pass
            sys.exit(1)


_ensure_elevated()

try:
    from ggeo.cli import (
        cyan, cyan_b, green, green_b, yellow, yellow_b, red, red_b,
        grey, underline_cyan, banner_setup, force_close_box,
        error_box_inline, step_line, step_indent, Spinner,
        SYM_OK, SYM_WARN, SYM_FAIL, BOX, DEFAULT_BOX_WIDTH,
    )
except ImportError as e:
    print(f"FATAL: cannot import ggeo.cli ({e})", file=sys.stderr)
    print(f"sys.path: {sys.path[:3]}", file=sys.stderr)
    sys.exit(1)
def out(line: str = "") -> None:
    print(line)


def out_lines(lines: list[str]) -> None:
    for ln in lines:
        print(ln)


def step(num: int, label: str, status: str = "") -> None:
    out(step_line(num, TOTAL_STEPS, label, status))


def step_overwrite(num: int, label: str, status: str) -> None:
    sys.stdout.write("\x1b[F\x1b[2K")
    sys.stdout.flush()
    out(step_line(num, TOTAL_STEPS, label, status))


def ok_inline(msg: str = "") -> str:
    return green_b(SYM_OK) + (" " + msg if msg else "")


def warn_inline(msg: str = "") -> str:
    return yellow(SYM_WARN) + (" " + msg if msg else "")


def fail_inline(msg: str = "") -> str:
    return red_b(SYM_FAIL) + (" " + msg if msg else "")


def out_field(label: str, value: str) -> None:
    out("          " + grey(f"{label:10} ") + value)


def out_indent(text: str) -> None:
    out("          " + text)


def ask_yes_no(question: str, default: bool = True) -> bool:
    suffix = " [Y/n]" if default else " [y/N]"
    try:
        ans = input("          " + question + suffix + " ").strip().lower()
    except EOFError:
        return default
    if not ans:
        return default
    return ans in ("y", "yes")


def ask(question: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    val = input("          " + question + suffix + " ").strip()
    return val or (default or "")


def venv_python() -> Path:
    if platform.system() == "Windows":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")


def run_streamed(cmd: list[str], sp: Spinner,
                 idle: str = "working ...", timeout: int = 300) -> int:
    sp.update(idle)
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
    except FileNotFoundError:
        return 127

    def reader() -> None:
        try:
            assert proc.stdout is not None
            for raw in proc.stdout:
                line = _ANSI_RE.sub("", raw).strip()
                if not line or "already satisfied" in line.lower():
                    continue
                sp.update(line[:60])
        except Exception:
            pass

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    try:
        return proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.terminate()
        return 124

def do_python_check() -> str:
    v = sys.version_info
    if (v.major, v.minor) not in SUPPORTED_PYTHONS:
        out("")
        out(red_b(f"  {SYM_FAIL} Python {v.major}.{v.minor}.{v.micro} not supported"))
        out("    " + grey("Supported: Python 3.11, 3.12, 3.13"))
        out("    " + grey("Install: https://python.org/downloads/"))
        sys.exit(1)
    return f"{v.major}.{v.minor}.{v.micro}"

def do_virtualenv() -> str:
    if VENV_DIR.exists():
        return "./venv " + grey("(existing)")
    sp = Spinner(prefix="          ")
    sp.update("creating ./venv ...")
    sp.start()
    try:
        rc = subprocess.run(
            [sys.executable, "-m", "venv", str(VENV_DIR)],
            capture_output=True, timeout=120,
        ).returncode
    finally:
        sp.stop()
    if rc != 0:
        raise RuntimeError("venv creation failed")
    return "./venv"

def do_install_deps() -> None:
    req = ROOT / "requirements.txt"
    if not req.is_file():
        raise FileNotFoundError(f"{req} not found")
    py = venv_python()
    sp = Spinner(prefix="          ")
    sp.start()
    try:
        run_streamed(
            [str(py), "-m", "pip", "install", "--upgrade", "pip"],
            sp, idle="upgrading pip ...", timeout=180,
        )
        rc = run_streamed(
            [str(py), "-m", "pip", "install", "-r", str(req)],
            sp, idle="resolving deps ...", timeout=600,
        )
    finally:
        sp.stop()
    if rc != 0:
        raise RuntimeError("pip install failed")

def do_service_checks() -> list[str]:
    system = platform.system()
    if system == "Darwin":
        return ["usbmuxd"]
    if system == "Linux":
        services = []
        try:
            res = subprocess.run(
                ["systemctl", "is-active", "usbmuxd"],
                capture_output=True, text=True, timeout=5,
            )
            if res.returncode == 0:
                services.append("usbmuxd")
        except Exception:
            pass
        return services
    if system == "Windows":
        services: list[str] = []
        try:
            res = subprocess.run(
                ["sc", "query", "Apple Mobile Device Service"],
                capture_output=True, text=True, timeout=5,
            )
            if "RUNNING" in res.stdout:
                services.append("Apple MD")
        except Exception:
            pass
        try:
            res = subprocess.run(
                ["sc", "query", "Bonjour Service"],
                capture_output=True, text=True, timeout=5,
            )
            if "RUNNING" in res.stdout:
                services.append("Bonjour")
            elif "1060" not in res.stdout:
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
                    services.append("Bonjour")
        except Exception:
            pass
        return services
    return []

def prompt_url() -> str:
    while True:
        url = ask("Host URL  ")
        if not url:
            out("          " + grey("Host URL is required."))
            continue
        if url.startswith(("http://", "https://")):
            return url.rstrip("/")
        out("          " + grey("Must start with http:// or https://"))


def prompt_api_key() -> str:
    while True:
        key = ask("API key   ")
        if not key:
            out("          " + grey("API key is required."))
            continue
        if key.startswith("ggeo_") and key.count("_") >= 2:
            return key
        out("          " + grey("Invalid format. Expected: ggeo_{uuid}_{hex}"))

def host_request(host_url: str, api_key: str, method: str, path: str,
                 body: dict | None = None, timeout: int = 30) -> tuple[int, dict | str]:
    py = venv_python()
    body_json = json.dumps(body) if body is not None else "None"
    code = (
        "import sys, json, httpx\n"
        f"resp = httpx.{method.lower()}("
        f"'{host_url}{path}', "
        f"headers={{'X-API-Key': '{api_key}'}}, "
        f"{'json=' + body_json + ', ' if body is not None else ''}"
        f"timeout={timeout})\n"
        "print('STATUS', resp.status_code)\n"
        "print(resp.text)\n"
    )
    res = subprocess.run([str(py), "-c", code], capture_output=True, text=True)
    out_str = res.stdout
    if "STATUS " not in out_str:
        return -1, res.stderr or out_str
    parts = out_str.split("STATUS ", 1)[1].split("\n", 1)
    status = int(parts[0])
    body_text = parts[1].strip() if len(parts) > 1 else ""
    try:
        return status, json.loads(body_text) if body_text else {}
    except json.JSONDecodeError:
        return status, body_text


def do_validate(host_url: str, api_key: str) -> dict:
    sp = Spinner(prefix="          ")
    sp.update(f"POST {host_url}/api/client/validate ...")
    sp.start()
    try:
        status, data = host_request(
            host_url, api_key, "POST", "/api/client/validate",
            body={"client_version": VERSION},
        )
    finally:
        sp.stop()
    if status != 200:
        raise RuntimeError(f"Host validate returned {status}: {data}")
    if not isinstance(data, dict) or not data.get("valid"):
        reason = data.get("reason", "unknown") if isinstance(data, dict) else str(data)
        raise RuntimeError(f"Host rejected api key (reason={reason})")
    return data

def check_user_exists(host_url: str, api_key: str, username: str) -> dict | None:
    status, data = host_request(
        host_url, api_key, "GET",
        f"/api/client/users/check?username={username}",
        timeout=15,
    )
    if status == 200 and isinstance(data, dict):
        return data
    return None


def create_admin(host_url: str, api_key: str, username: str, password: str) -> bool:
    status, data = host_request(
        host_url, api_key, "POST", "/api/client/users",
        body={"username": username, "password": password, "role": "client_admin"},
    )
    if status == 201:
        return True
    if status == 409:
        return False
    raise RuntimeError(f"Host returned status {status}: {data}")


def do_admin_account(host_url: str, api_key: str) -> tuple[str, str]:
    while True:
        username = ask("Username  ")
        if not username:
            out("          " + grey("Username required."))
            continue
        check = check_user_exists(host_url, api_key, username)
        if check and check.get("exists"):
            role = check.get("role", "?")
            out("          " + warn_inline(f"user '{username}' exists (role={role})"))
            choice = ask("Use existing / new username [y/n/new]", "y").lower()
            if choice in ("y", "yes"):
                pw = getpass.getpass("          Password  ").strip()
                return username, pw
            if choice == "new":
                continue
            sys.exit(1)
        pw = getpass.getpass("          Password (min 8) ").strip()
        confirm = getpass.getpass("          Confirm        ").strip()
        if pw != confirm:
            out("          " + grey("Passwords do not match."))
            continue
        if len(pw) < 8:
            out("          " + grey("Password must be at least 8 characters."))
            continue
        try:
            create_admin(host_url, api_key, username, pw)
        except RuntimeError as e:
            out("          " + fail_inline(str(e)))
            continue
        return username, pw

def do_save_client_json(host_url: str, api_key: str, validate_data: dict) -> None:
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

def get_windows_desktop() -> Path:
    try:
        import ctypes
        from ctypes import wintypes, windll
        CSIDL_DESKTOP = 0x0000
        SHGFP_TYPE_CURRENT = 0
        buf = ctypes.create_unicode_buffer(wintypes.MAX_PATH)
        windll.shell32.SHGetFolderPathW(0, CSIDL_DESKTOP, 0,
                                        SHGFP_TYPE_CURRENT, buf)
        if buf.value:
            return Path(buf.value)
    except Exception:
        pass
    return Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Desktop"


def detect_old_shortcuts() -> list[Path]:
    found: list[Path] = []
    system = platform.system()
    if system == "Darwin":
        for parent in (Path.home() / "Desktop", Path.home() / "Applications",
                       Path("/Applications")):
            if not parent.is_dir():
                continue
            for app in parent.glob("*.app"):
                name = app.name.lower()
                if "ggeo" in name or "gpro" in name:
                    found.append(app)
    elif system == "Windows":
        seen: set[str] = set()
        for parent in (get_windows_desktop(),
                       Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Desktop"):
            key = str(parent).lower()
            if key in seen or not parent.is_dir():
                continue
            seen.add(key)
            for lnk in parent.glob("*.lnk"):
                if "ggeo" in lnk.name.lower() or "gpro" in lnk.name.lower():
                    found.append(lnk)
    return found


def remove_paths(paths: list[Path]) -> int:
    n = 0
    for p in paths:
        try:
            if p.is_dir():
                subprocess.run(["rm", "-rf", str(p)], check=False)
            else:
                p.unlink(missing_ok=True)
            n += 1
        except Exception:
            pass
    return n


def create_macos_shortcut() -> tuple[bool, str]:
    SCRIPTS_DIR.mkdir(exist_ok=True)
    helper = SCRIPTS_DIR / "ggeo-launcher.sh"
    py = venv_python()
    helper.write_text(
        "#!/bin/bash\n"
        f'cd "{ROOT}" || exit 1\n\n'
        "B=$'\\033[1m'; C=$'\\033[96m'; D=$'\\033[2m'; R=$'\\033[0m'\n"
        f'URL="http://ggeo-client.local:{DEFAULT_PORT}/"\n\n'
        f"if lsof -iTCP:{DEFAULT_PORT} -sTCP:LISTEN >/dev/null 2>&1; then\n"
        '    open "${URL}"; exit 0\n'
        "fi\n\n"
        '( sleep 4 && open "${URL}" ) &\n'
        f'sudo "{py}" run.py\n'
        'EXIT_CODE=$?\n'
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
        f'            set custom title of front window to "{SHORTCUT_LABEL}"\n'
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
    app_path = desktop / f"{SHORTCUT_LABEL}.app"
    if app_path.exists():
        subprocess.run(["rm", "-rf", str(app_path)], check=False)
    icns = SCRIPTS_DIR / "macos" / "ggeo.icns"
    cmd = ["osacompile"]
    if icns.exists():
        cmd += ["-i", str(icns)]
    cmd += ["-o", str(app_path), applescript_path]
    res = subprocess.run(cmd, capture_output=True, text=True)
    try:
        os.unlink(applescript_path)
    except OSError:
        pass
    if res.returncode != 0:
        return False, f"osacompile failed: {res.stderr.strip()[:80]}"
    subprocess.run(["codesign", "--force", "--deep", "-s", "-", str(app_path)],
                   capture_output=True)
    try:
        os.utime(app_path, None)
    except OSError:
        pass
    if not app_path.exists() or not (app_path / "Contents" / "Info.plist").exists():
        return False, "verification failed"
    return True, str(app_path.relative_to(Path.home())) if app_path.is_relative_to(Path.home()) else str(app_path)


def create_windows_shortcut() -> tuple[bool, str]:
    SCRIPTS_DIR.mkdir(exist_ok=True)
    bat_path = SCRIPTS_DIR / "ggeo-launcher.bat"
    icon_path = ROOT / "ggeo" / "static" / "favicon.ico"
    bat_path.write_text(
        "@echo off\n"
        "setlocal\n"
        'cd /d "%~dp0.."\n'
        f"title {SHORTCUT_LABEL}\n"
        "cls\n"
        'start "" /B cmd /C "timeout /t 4 /nobreak >nul && '
        f'start http://ggeo-client.local:{DEFAULT_PORT}/"\n'
        "venv\\Scripts\\python.exe run.py\n"
        "pause\n"
    )

    desktop = get_windows_desktop()
    if not desktop.is_dir():
        return False, f"Desktop not found: {desktop}"
    lnk_path = desktop / f"{SHORTCUT_LABEL}.lnk"
    ok = False
    try:
        import pythoncom
        from win32com.shell import shell
        link = pythoncom.CoCreateInstance(
            shell.CLSID_ShellLink, None,
            pythoncom.CLSCTX_INPROC_SERVER, shell.IID_IShellLink,
        )
        link.SetPath(str(bat_path))
        link.SetWorkingDirectory(str(ROOT))
        if icon_path.exists():
            link.SetIconLocation(str(icon_path), 0)
        link.SetDescription(SHORTCUT_LABEL)
        link.QueryInterface(pythoncom.IID_IPersistFile).Save(str(lnk_path), 0)
        try:
            with open(lnk_path, "r+b") as f:
                f.seek(0x15)
                b = f.read(1)
                f.seek(0x15)
                f.write(bytes([b[0] | 0x20]))
        except Exception:
            pass
        ok = lnk_path.exists()
    except ImportError:
        vbs_content = (
            'Set WshShell = CreateObject("WScript.Shell")\n'
            f'Set oShortcut = WshShell.CreateShortcut("{lnk_path}")\n'
            f'oShortcut.TargetPath = "{bat_path}"\n'
            f'oShortcut.WorkingDirectory = "{ROOT}"\n'
            f'oShortcut.IconLocation = "{icon_path}"\n'
            f'oShortcut.Description = "{SHORTCUT_LABEL}"\n'
            'oShortcut.Save\n'
        )
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".vbs", delete=False, dir=str(ROOT),
        ) as tf:
            tf.write(vbs_content)
            vbs_file = tf.name
        try:
            subprocess.run(
                ["cscript", "//Nologo", vbs_file],
                capture_output=True, text=True, timeout=15,
            )
        finally:
            try:
                os.unlink(vbs_file)
            except OSError:
                pass
        ok = lnk_path.exists()
    except Exception as e:
        return False, f"shortcut creation failed: {e}"

    if not ok:
        return False, "shortcut not created"
    return True, str(lnk_path)


def do_desktop_shortcut() -> str:
    if not ask_yes_no("Create desktop shortcut?", default=True):
        return grey("skipped")
    old = detect_old_shortcuts()
    if old:
        out("          " + warn_inline(f"found {len(old)} existing GGeo shortcut(s)"))
        for p in old[:5]:
            try:
                rel = p.relative_to(Path.home())
                out("          " + grey(f"  ~/{rel}"))
            except ValueError:
                out("          " + grey(f"  {p}"))
        if ask_yes_no("Remove existing?", default=True):
            n = remove_paths(old)
            out("          " + ok_inline(f"removed {n}"))

    system = platform.system()
    if system == "Darwin":
        ok, msg = create_macos_shortcut()
    elif system == "Windows":
        ok, msg = create_windows_shortcut()
    else:
        return grey("not supported on " + system)

    if ok:
        return ok_inline(msg)
    return fail_inline(msg)

def detect_old_autostart() -> list[Path | str]:
    found: list[Path | str] = []
    system = platform.system()
    if system == "Darwin":
        agents = Path.home() / "Library" / "LaunchAgents"
        if agents.is_dir():
            for plist in agents.glob("com.ggeo.*.plist"):
                found.append(plist)
    elif system == "Windows":
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0, winreg.KEY_READ,
            ) as k:
                i = 0
                while True:
                    try:
                        name, _, _ = winreg.EnumValue(k, i)
                    except OSError:
                        break
                    if "ggeo" in name.lower() or "gpro" in name.lower():
                        found.append(f"HKCU\\...\\Run\\{name}")
                    i += 1
        except Exception:
            pass
    return found


def remove_old_autostart(items: list[Path | str]) -> int:
    n = 0
    for item in items:
        if isinstance(item, Path):
            try:
                if platform.system() == "Darwin":
                    label = item.stem
                    subprocess.run(["launchctl", "unload", str(item)],
                                   capture_output=True)
                item.unlink(missing_ok=True)
                n += 1
            except Exception:
                pass
        elif isinstance(item, str) and item.startswith("HKCU"):
            try:
                import winreg
                value_name = item.split("\\")[-1]
                with winreg.OpenKey(
                    winreg.HKEY_CURRENT_USER,
                    r"Software\Microsoft\Windows\CurrentVersion\Run",
                    0, winreg.KEY_SET_VALUE,
                ) as k:
                    winreg.DeleteValue(k, value_name)
                n += 1
            except Exception:
                pass
    return n


def install_autostart_macos() -> tuple[bool, str]:
    plist_path = Path.home() / "Library" / "LaunchAgents" / f"{AUTOSTART_LABEL}.plist"
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    py = venv_python()
    tray_py = ROOT / "tray.py"
    plist_path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" '
        '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
        '<plist version="1.0">\n'
        '<dict>\n'
        f'    <key>Label</key><string>{AUTOSTART_LABEL}</string>\n'
        f'    <key>ProgramArguments</key>\n'
        '    <array>\n'
        f'        <string>{py}</string>\n'
        f'        <string>{tray_py}</string>\n'
        '    </array>\n'
        f'    <key>WorkingDirectory</key><string>{ROOT}</string>\n'
        '    <key>RunAtLoad</key><true/>\n'
        '    <key>KeepAlive</key><false/>\n'
        f'    <key>StandardOutPath</key><string>{ROOT / "data" / "tray.stdout.log"}</string>\n'
        f'    <key>StandardErrorPath</key><string>{ROOT / "data" / "tray.stderr.log"}</string>\n'
        '</dict>\n'
        '</plist>\n'
    )
    res = subprocess.run(["launchctl", "load", str(plist_path)],
                         capture_output=True, text=True)
    if res.returncode != 0:
        return False, f"launchctl load failed: {res.stderr.strip()[:60]}"
    check = subprocess.run(["launchctl", "list", AUTOSTART_LABEL],
                           capture_output=True, text=True)
    if check.returncode != 0:
        return False, "launchctl list verify failed"
    return True, AUTOSTART_LABEL


def install_autostart_windows() -> tuple[bool, str]:
    try:
        import winreg
    except ImportError:
        return False, "winreg unavailable"
    py = venv_python()
    tray_py = ROOT / "tray.py"
    cmd = f'"{py}" "{tray_py}"'
    value_name = SHORTCUT_LABEL
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE,
        ) as k:
            winreg.SetValueEx(k, value_name, 0, winreg.REG_SZ, cmd)
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_READ,
        ) as k:
            winreg.QueryValueEx(k, value_name)
        return True, f"HKCU\\...\\Run\\{value_name}"
    except Exception as e:
        return False, f"registry write failed: {e}"


def do_autostart() -> str:
    if not ask_yes_no("Configure autostart on login?", default=False):
        return grey("skipped")

    old = detect_old_autostart()
    if old:
        out("          " + warn_inline(f"found {len(old)} existing autostart(s)"))
        for it in old[:5]:
            label = it.name if isinstance(it, Path) else it
            out("          " + grey(f"  {label}"))
        if ask_yes_no("Remove existing?", default=True):
            n = remove_old_autostart(old)
            out("          " + ok_inline(f"removed {n}"))

    system = platform.system()
    if system == "Darwin":
        ok, msg = install_autostart_macos()
    elif system == "Windows":
        ok, msg = install_autostart_windows()
    else:
        return grey("not supported on " + system)

    if ok:
        return ok_inline(msg)
    return fail_inline(msg)

def _restore_ownership() -> None:
    if platform.system() != "Darwin":
        return
    sudo_user = os.environ.get("SUDO_USER")
    if not sudo_user:
        return
    try:
        import pwd
        pw = pwd.getpwnam(sudo_user)
    except Exception:
        return
    targets = [VENV_DIR, DATA_DIR, SCRIPTS_DIR, CLIENT_JSON]
    for path in targets:
        if path.exists():
            subprocess.run(
                ["chown", "-R", f"{pw.pw_uid}:{pw.pw_gid}", str(path)],
                capture_output=True,
            )
def closing_card() -> list[str]:
    width = DEFAULT_BOX_WIDTH
    out_lines: list[str] = []
    from ggeo.cli import box_top, box_bot, box_line
    out_lines.append(box_top(width))
    out_lines.append(box_line(width=width))
    out_lines.append(box_line("  " + green_b(SYM_OK) + " Setup complete", width))
    out_lines.append(box_line(width=width))
    if platform.system() in ("Darwin", "Windows"):
        out_lines.append(box_line(
            "  Start  double-click '" + cyan(SHORTCUT_LABEL) + "' on Desktop",
            width,
        ))
    else:
        out_lines.append(box_line(
            f"  Start  cd {ROOT} && sudo venv/bin/python run.py",
            width,
        ))
    out_lines.append(box_line(width=width))
    out_lines.append(box_bot(width))
    return out_lines
def main() -> None:
    out("")
    out_lines(banner_setup(VERSION))
    out("")
    step(1, "Python version check")
    py_ver = do_python_check()
    step_overwrite(1, "Python version check", ok_inline(py_ver))
    step(2, "Virtual environment")
    venv_status = do_virtualenv()
    step_overwrite(2, "Virtual environment", ok_inline(venv_status))
    step(3, "Installing dependencies")
    do_install_deps()
    step_overwrite(3, "Installing dependencies", ok_inline())
    step(4, "Service checks")
    services = do_service_checks()
    svc_status = ok_inline(" · ".join(services)) if services else warn_inline("none active")
    step_overwrite(4, "Service checks", svc_status)
    step(5, "Host configuration")
    host_url = prompt_url()
    api_key = prompt_api_key()
    out_field("Host URL", host_url)
    out_field("API key", "********")
    step(6, "Validate")
    validate_data = do_validate(host_url, api_key)
    name = validate_data.get("client_name") or "?"
    limits = validate_data.get("limits") or {}
    mode = validate_data.get("location_mode") or limits.get("location_mode") or "?"
    step_overwrite(6, "Validate", ok_inline(f"{name} · {mode}"))
    out_indent(grey(
        f"{limits.get('max_devices', '?')} dev · "
        f"{limits.get('max_users', '?')} user · "
        f"{limits.get('max_locations', '?')} loc"
    ))
    step(7, "Admin account")
    username, _ = do_admin_account(host_url, api_key)
    step(8, "Save data/client.json")
    do_save_client_json(host_url, api_key, validate_data)
    step_overwrite(8, "Save data/client.json", ok_inline())
    step(9, "Desktop shortcut")
    sh_status = do_desktop_shortcut()
    step_overwrite(9, "Desktop shortcut", sh_status)
    step(10, "Autostart on login")
    as_status = do_autostart()
    step_overwrite(10, "Autostart on login", as_status)
    _restore_ownership()
    out("")
    out_lines(closing_card())
    out("")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        print(grey("Setup cancelled."))
        sys.exit(130)
    except Exception as e:
        print()
        print(red_b(f"  {SYM_FAIL} Setup error: {e}"))
        sys.exit(1)
