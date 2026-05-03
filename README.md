# GGeo Client

Mobile GPS Location Spoofer for iOS / iPadOS.

## Install

Clone:

```
git clone https://github.com/badupro/ggeo-client-dist ggeo-client
cd ggeo-client
```

Then run the one-click setup wizard:

- **macOS:** double-click `Setup-GGeo.command`
- **Windows:** right-click `Setup-GGeo.bat` → **Run as administrator**

The wizard creates a virtualenv, installs dependencies, prompts for the host
URL + API key, creates a desktop shortcut, and optionally enables autostart
on login.

Requires **Python 3.11, 3.12, or 3.13** (https://python.org/downloads/).

## Run

After setup, double-click the desktop shortcut **GGeo Client v\<version\>**
created during install.

The server listens on `http://ggeo-client.local:8484` (mDNS).

## Layout

```
ggeo-client/
├── README.md
├── CHANGELOG.md
├── VERSION
├── Setup-GGeo.command      ← macOS launcher
├── Setup-GGeo.bat          ← Windows launcher
└── _internal/              ← obfuscated runtime + helpers (do not edit)
```

Contact your administrator for access credentials.
