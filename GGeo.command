#!/bin/bash
clear
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 _internal/scripts/menu.py
rc=$?
if [ "$TERM_PROGRAM" = "Apple_Terminal" ]; then
    tty_path=$(tty)
    osascript >/dev/null 2>&1 <<APPLE
tell application "Terminal"
    repeat with w in windows
        try
            if (tty of selected tab of w as text) is equal to "$tty_path" then
                close w saving no
                exit repeat
            end if
        end try
    end repeat
end tell
APPLE
fi
exit $rc
