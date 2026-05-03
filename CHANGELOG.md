# Changelog

All notable changes to GGEO Client will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] — 2026-05-03

PyArmor multi-Python ABI build, wizard redesign, port change.

### Build / distribution

- PyArmor build matrix on CI: 3 Python versions (3.11, 3.12, 3.13)
  build in parallel. Output goes to `dist/<py_tag>/` per build, merged
  in CI. Resolves Windows ABI mismatch (`.pyd` was hard-linked to
  `python311.dll` only) — see `Report/v2/redesign/reports/pyarmor-windows-abi-bug.md`.
- Top-level `run.py` and `tray.py` are plain Python dispatchers that
  detect the running Python version and exec the matching `pyXXX/`
  obfuscated tree.
- `setup.py` strict guard rejects Python outside 3.11/3.12/3.13.
- `pywin32` added to `requirements.txt` with `sys_platform == 'win32'`
  marker for `IShellLink` desktop shortcut creation.

### Setup wizard

- Visual redesign with `╔╗╚╝` double-line banner, logo, ANSI colors.
- Compact 1-line per step with `✓ ⚠ ✗` indicators.
- Auto-elevate: macOS re-execs with sudo, Windows force-closes
  outside elevation.
- Detect existing GGeo shortcuts and autostart entries (any version)
  and offer to remove before installing the new one.
- Verify install actually applied (file exists + functional checks)
  rather than trusting subprocess return code.
- Version-named artifacts: `GGeo Client v2.3.0.app/.lnk` and
  `com.ggeo.tray.v2_3_0` LaunchAgent label.
- macOS: custom `.icns` icon embedded via `osacompile -i`.
- Windows: `IShellLink` via pywin32 + `favicon.ico` + Run-As-Admin
  flag (byte 0x15 OR 0x20). Falls back to VBS if pywin32 missing.
- Windows: `SHGetFolderPath(CSIDL_DESKTOP)` honors OneDrive Known
  Folder Move redirect.
- Admin existence pre-check via new host endpoint
  `GET /api/client/users/check`; user picks "use existing / new
  username" before being prompted for password.
- Restore ownership (`chown -R` to `SUDO_USER`) at the end so files
  created during sudo run aren't left root-owned.

### Runtime dashboard (`run.py`)

- Static banner with status indicator + URLs (Local / Network /
  Host / Logs path) rendered once at startup.
- Bottom status line in-place via `\r` — spinner + uptime,
  no per-request log spam.
- `uvicorn` runs with `access_log=False` and `log_level="warning"`;
  full request log goes to `data/ggeo.log` only (RotatingFileHandler).
- Force-close box if not running with sudo on macOS / Linux.

### Other

- Port default `8479` → `8484`.

## [2.2.0] — 2026-05-03

UI redesign + macOS scan reliability fix.

### Frontend

- Full UI redesign (Stage A-K+ + L organic): login, dashboard (Free/Locked/Admin variants), admin panel (Users/Devices/Locations/Activity tabs).
- Mobile responsive (320/375/393/430/768) — bottom nav, simplified header, mobile cards via `data-label` CSS-only.
- Avatar menu restructure: View/Lang/Account/Footer info inside dropdown.
- System Health mobile popover (header icon + aggregate status dot).
- Pagination per 10 across all admin tabs.
- Filter consolidation (single icon menu + badge count).
- Loading skeleton + processing toast + saving button states.
- Footer: `.app-foot` desktop + `.avatar-menu-foot` split-layout mobile.
- 30+ new i18n keys (EN + ID).
- Self-hosted fonts: Inter Tight + Geist Mono + Fraunces.

### Backend

- New endpoint `/api/system-health` — usbmuxd/mDNS/host_sync/tunnel probes (Stage 0).
- Fix scan logic SM.4 Tahap 1 — ungate Bonjour browse on macOS (was win32-only since v1.1.5).
- `_device_ips` populate before skip-duplicate check — ping fallback path now hits cached IPs for silent devices.
- Local Network permission diagnostic warning saat Bonjour browse empty + registered devices exist.
- DELETE proxy endpoints: sessions/history + login-history (single + bulk).
- `/api/device/locations` returns all global locations for free users (locked users still get assigned-only).
- `App.api` forward FastAPI `detail` field to frontend error message (was masking validation errors as generic "Request failed").
- `manager.activate()` clears stale dead session before reject ALREADY_ACTIVE (fix flicker).

### Frontend mobile fixes

- `setTimeout(flyToInputs, 50)` — fix locked_user Safari iPhone reload kedip-kedip (Leaflet map dimensions race in mobile bootstrap).

### Performance trade-off

- Scan latency median 7s (target <3s). Acceptable — pre-fix ~1-3s tapi G-13 hilang di amnesia/silent scenarios. Post-fix reliable scan all scenarios.
- Optimization tracked post-release: pymobiledevice3 timeout tunable, parallel asyncio.gather, progressive UX render.

### Deferred

- SM.4 Tahap 2 (Saran 1 persist IP cache disk) — re-evaluate after 1 month monitoring.
- SM.4 Tahap 3 (Saran 3 periodic mDNS) — re-evaluate after Tahap 2.

## [2.0.0] — 2026-04-26

Initial public release.

### Architecture

- Thin client that talks to a centralized GGEO Host instance over HTTP.
- No local database, no local password storage. All state lives on the host.
- Host URL is provided by the operator at setup time and stored in
  `data/client.json` (gitignored).

### Setup

- One-click setup: `Setup-GGEO.command` (macOS) + `Setup-GGEO.bat` (Windows).
- 10-step wizard: Python check, venv, deps, services, host URL + api_key,
  admin user, save config, desktop shortcut, autostart on login.
- Animated spinner with live last-line of pip output during install.
- Platform-aware Bonjour auto-start on Windows.
- Desktop shortcut creation per platform (macOS .app via osacompile, Windows
  .lnk via VBScript with icon, Linux .desktop).

### Auto-update

- `run.py` runs `git fetch + pull --ff-only` on `origin/main` before booting.
- Re-execs the process so the new code takes effect immediately.
- Skips on uncommitted changes / non-git checkout / `GGEO_NO_AUTOUPDATE=1`.

### Remote control

- Heartbeat polling every 10 seconds.
- Host can `activate` / `deactivate` / `kill_session` / `kill_all` / `scan`
  via pending_commands queue (at-least-once delivery, client dedupes by
  `command_id`).
- `MAX_FAILURES=30` (5 min grace before suspending GPS).

### UI

- VPN-style power button: circular SVG with animated pulsing rings.
- Live HH:MM:SS timer anchored to server `spoof_started_at`.
- Per-device state with optional multi-session chip.
- Locked mode: dropdown-only for assigned locations.
- Free mode: map + manual coord input + presets + history.
- Mobile responsive (320 / 386 / 430px tested), bottom-sheet map drawer.
- Custom `App.confirm()` modal and toast notifications.
- i18n: English / Bahasa Indonesia (default: Indonesian).

### Security

- bcrypt password hashing.
- Signed session cookies (itsdangerous).
- No credentials hardcoded; all configuration via `data/client.json` or
  environment variables.

### Platform support

- macOS 14+ (Apple Silicon and Intel).
- Windows 10/11 (with iTunes for Apple Mobile Device Service).
- Linux (USB only; WiFi tethering depends on usbmuxd).
- iOS 17+ on the iPhone/iPad side via pymobiledevice3.
