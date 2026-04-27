# Changelog

All notable changes to GGEO Client will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
