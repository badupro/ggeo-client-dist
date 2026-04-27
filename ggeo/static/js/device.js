// GGEO device.js — device control, SSE listener, session cards.

var Device = {
    eventSource: null,
    devices: [],
    _iosWarningShown: {},

    _t: function(key, fallback) {
        if (typeof I18N !== "undefined") return I18N.t(key);
        return fallback || key;
    },

    initSSE: function() {
        var self = this;
        if (self.eventSource) {
            self.eventSource.close();
        }
        self.eventSource = new EventSource("/api/device/events");
        self.startLiveCounter();
        self.eventSource.addEventListener("status", function(e) {
            try {
                var data = JSON.parse(e.data);
                self.renderSessions(data);
            } catch (err) {}
        });
        self.eventSource.onerror = function() {};
    },

    scan: async function() {
        var select = document.getElementById("device-select");
        var scanBtn = document.getElementById("scan-btn");
        var progress = document.getElementById("scan-progress");
        if (!select || !scanBtn) return;

        scanBtn.disabled = true;
        scanBtn.textContent = Device._t("scanning", "Scanning...");
        scanBtn.classList.add("scanning");
        select.disabled = true;
        select.innerHTML = '<option value="">' +
            Device._t("scan_in_progress", "Scanning devices (up to 15 seconds)...") +
            '</option>';
        if (progress) progress.hidden = false;

        try {
            var data = await App.api("GET", "/api/device/scan");
            var silentDevices = data.filter(function(d) { return d.bonjour_silent; });
            var normalDevices = data.filter(function(d) { return !d.bonjour_silent; });
            this.devices = normalDevices;
            select.innerHTML = "";
            if (normalDevices.length === 0) {
                select.innerHTML = '<option value="">--</option>';
            } else {
                normalDevices.forEach(function(d) {
                    var opt = document.createElement("option");
                    opt.value = d.udid;
                    var label = d.name + " (" + d.model + " - " + d.connection + ")" +
                        (d.active ? " [ACTIVE]" : "");
                    if (d.ios_untested) label += " \u26a0";
                    opt.textContent = label;
                    select.appendChild(opt);
                    if (d.ios_untested && !Device._iosWarningShown[d.udid]) {
                        Device._iosWarningShown[d.udid] = true;
                        App.toast(Device._t("err_ios_untested", "iOS version not yet verified"), true);
                    }
                });
                select.disabled = false;
            }
            select.dispatchEvent(new Event("change", { bubbles: true }));
            var hintBox = document.getElementById("bonjour-silent-hint");
            if (hintBox) {
                if (silentDevices.length > 0) {
                    var names = silentDevices.map(function(d) { return d.name; }).join(", ");
                    var tmpl = Device._t("device_bonjour_silent_hint",
                        "Device {names} not detected. Try rebooting the iPhone.");
                    hintBox.textContent = tmpl.replace("{names}", names);
                    hintBox.hidden = false;
                } else {
                    hintBox.hidden = true;
                }
            }
        } catch (e) {
            select.innerHTML = '<option value=""></option>';
            App.toast(Device._t("err_scan_failed", "Scan failed") + ": " + e.message, true);
        } finally {
            scanBtn.disabled = false;
            scanBtn.textContent = Device._t("scan", "Scan");
            scanBtn.classList.remove("scanning");
            if (progress) progress.hidden = true;
        }
    },

    activateSelected: async function() {
        var select = document.getElementById("device-select");
        var latInput = document.getElementById("lat-input");
        var lonInput = document.getElementById("lon-input");
        var btn = document.getElementById("activate-btn");
        if (!select || !select.value) return;

        var originalLabel = Device._t("activate", "Activate");
        btn.disabled = true;
        btn.textContent = "...";

        try {
            var data = await App.api("POST", "/api/device/activate", {
                udid: select.value,
                lat: parseFloat(latInput.value),
                lon: parseFloat(lonInput.value),
            });
            App.toast(Device._t("toast_location_applied", "Activated") + ": " + data.name);
            GMap.setPinActive();
        } catch (e) {
            App.toast(e.message, true);
        } finally {
            btn.disabled = false;
            btn.textContent = originalLabel;
        }
    },

    deactivate: async function(udid) {
        try {
            await App.api("POST", "/api/device/deactivate", { udid: udid });
            App.toast(Device._t("toast_stopped", "Deactivated"));
            GMap.setPinInactive();
        } catch (e) {
            App.toast(Device._t("toast_stopped", "Deactivate failed") + ": " + e.message, true);
        }
    },

    deactivateAll: async function() {
        try {
            await App.api("POST", "/api/device/deactivate-all");
            App.toast(Device._t("toast_stopped", "All devices deactivated"));
            GMap.setPinInactive();
        } catch (e) {
            App.toast(Device._t("toast_stopped", "Deactivate all failed") + ": " + e.message, true);
        }
    },

    renderSessions: function(data) {
        var container = document.getElementById("sessions-container");
        var countEl = document.getElementById("active-count");

        var sessionMap = data.sessions || {};
        var keys = Object.keys(sessionMap);

        keys.forEach(function(k) {
            var s = sessionMap[k];
            if (!s || s.lat == null || s.lon == null) return;
            if (s.location_name) return;
            var matched = Device._resolveLocationName(s.lat, s.lon);
            if (matched) s.location_name = matched;
        });

        var unreachableNames = [];
        keys.forEach(function(udid) {
            var s = sessionMap[udid];
            if (s && s.wifi_unreachable) unreachableNames.push(s.name);
        });
        var hintBox = document.getElementById("wifi-unreachable-hint");
        if (hintBox) {
            if (unreachableNames.length > 0) {
                var tmpl = Device._t("device_wifi_unreachable_hint",
                    "Device \"{names}\" not reachable via WiFi. Connect via USB briefly to refresh the service, then try Activate again.");
                hintBox.textContent = tmpl.replace("{names}", unreachableNames.join(", "));
                hintBox.hidden = false;
            } else {
                hintBox.hidden = true;
            }
        }

        var selectedSel = document.getElementById("device-select");
        var selectedUdid = selectedSel && selectedSel.value;
        var isUdidActive = function(s) {
            return !!(s && (
                s.is_active === true
                || s.connection_status === "active"
                || s.is_simulating
                || s.status === "simulating"
                || s.status === "connected"
            ));
        };
        var activeUdids = keys.filter(function(k) { return isUdidActive(sessionMap[k]); });
        var totalActive = activeUdids.length;
        var selectedIsOn = selectedUdid && isUdidActive(sessionMap[selectedUdid]);
        var selectedSession = selectedUdid ? sessionMap[selectedUdid] : null;
        var selectedName = selectedSession ? selectedSession.name : (selectedSel && selectedSel.selectedOptions[0] && selectedSel.selectedOptions[0].text.split(" (")[0]);
        var stateSig = (selectedIsOn ? "1" : "0") + ":" + totalActive + ":" + (selectedUdid || "");
        if (Device._statusCallbacks && Device._lastStateSig !== stateSig) {
            Device._lastStateSig = stateSig;
            Device._lastStatusOn = selectedIsOn;
            Device._lastSessionName = selectedName;
            Device._lastSummary = {
                totalActive: totalActive,
                activeUdids: activeUdids,
                sessionsByUdid: sessionMap,
                selectedUdid: selectedUdid,
            };
            Device._statusCallbacks.forEach(function(cb) {
                try { cb(selectedIsOn, selectedName, Device._lastSummary); } catch (e) {}
            });
        }

        if (!container) return;
        if (countEl) countEl.textContent = keys.length;

        if (keys.length === 0) {
            container.innerHTML = '<div class="empty-state">' + Device._t("empty_sessions", "No active sessions") + '</div>';
            return;
        }

        var html = "";
        if (keys.length > 1) {
            html += '<div style="text-align:right;margin-bottom:8px">' +
                '<button class="btn btn-danger btn-sm" onclick="Device.deactivateAll()">' +
                Device._t("deactivate_all", "Deactivate All") + '</button></div>';
        }

        keys.forEach(function(udid) {
            var s = sessionMap[udid];
            html += Device._renderCard(s);
        });

        container.innerHTML = html;
    },

    _statusCallbacks: [],
    _lastStatusOn: null,
    _lastSessionName: null,
    _lastSummary: null,
    _lastStateSig: null,
    _onStatusChange: function(cb) {
        if (typeof cb !== "function") return;
        Device._statusCallbacks.push(cb);
        if (Device._lastStatusOn !== null) {
            try { cb(Device._lastStatusOn, Device._lastSessionName, Device._lastSummary); } catch (e) {}
        }
    },

    _resolveLocationName: function(lat, lon) {
        var roundKey = function(a, b) {
            return a.toFixed(5) + "," + b.toFixed(5);
        };
        var target = roundKey(parseFloat(lat), parseFloat(lon));
        var picker = document.getElementById("location-picker");
        if (picker) {
            for (var i = 0; i < picker.options.length; i++) {
                var opt = picker.options[i];
                if (!opt.dataset.lat) continue;
                var k = roundKey(parseFloat(opt.dataset.lat), parseFloat(opt.dataset.lon));
                if (k === target) {
                    return opt.dataset.name || opt.textContent.split(" (")[0];
                }
            }
        }
        if (typeof Presets !== "undefined" && Presets.list) {
            for (var j = 0; j < Presets.list.length; j++) {
                var p = Presets.list[j];
                if (!p || p.latitude == null) continue;
                if (roundKey(parseFloat(p.latitude), parseFloat(p.longitude)) === target) {
                    return p.name;
                }
            }
        }
        return null;
    },

    recomputeSelectedState: function() {
        if (!Device._lastSummary) return;
        var s = Device._lastSummary;
        var selectedUdid = (document.getElementById("device-select") || {}).value;
        var sess = s.sessionsByUdid && s.sessionsByUdid[selectedUdid];
        var isOn = !!(sess && (sess.is_active === true
            || sess.connection_status === "active"
            || sess.is_simulating
            || sess.status === "simulating"
            || sess.status === "connected"));
        var sel = document.getElementById("device-select");
        var name = sess ? sess.name : (sel && sel.selectedOptions[0] && sel.selectedOptions[0].text.split(" (")[0]);
        Device._lastStatusOn = isOn;
        Device._lastSessionName = name;
        Device._lastSummary = Object.assign({}, s, {selectedUdid: selectedUdid});
        Device._statusCallbacks.forEach(function(cb) {
            try { cb(isOn, name, Device._lastSummary); } catch (e) {}
        });
    },

    _renderCard: function(s) {
        var dot = "dot-grey dot-pulse";
        var badgeClass = "badge-inactive";
        var badgeText = Device._t("inactive", "Inactive");

        if (s.connection_status === "active" && s.lat != null) {
            dot = "dot-green dot-pulse";
            badgeClass = "badge-active";
            badgeText = Device._t("status_active", "Aktif");
        } else if (s.connection_status && s.connection_status.startsWith("connecting")) {
            dot = "dot-yellow dot-pulse";
            badgeClass = "badge-warning";
            badgeText = Device._t("status_connecting", "Menyambungkan");
        } else if (s.connection_status === "reconnecting") {
            dot = "dot-yellow dot-pulse";
            badgeClass = "badge-warning";
            badgeText = Device._t("status_reconnecting", "Menyambungkan ulang");
        } else if (s.connection_status && s.connection_status.startsWith("error")) {
            dot = "dot-red dot-pulse";
            badgeClass = "badge-error";
            badgeText = Device._t("status_error", "Error");
        }

        var escape = function(str) {
            return String(str || "").replace(/&/g, "&amp;")
                .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        };

        var locationRow;
        var coordsStr = s.lat != null
            ? s.lat.toFixed(6) + ", " + s.lon.toFixed(6)
            : "--";
        if (s.location_name) {
            locationRow = '<div class="session-location">' +
                escape(s.location_name) +
                '<span class="session-coords-inline">' + coordsStr + '</span></div>';
        } else {
            locationRow = '<div class="session-coords-primary">' + coordsStr + '</div>';
        }

        var durationParts = [];
        if (s.connect_duration != null) {
            durationParts.push(s.connect_duration.toFixed(2) + "s");
        }
        if (s.connection_status === "active" && s.spoof_started_at) {
            durationParts.push('<span class="session-counter" data-started-at="' +
                s.spoof_started_at + '"><span>' +
                App.formatDuration(s.spoof_elapsed || 0) + '</span></span>');
        } else if (s.connection_status === "reconnecting" && s.disconnect_started_at) {
            var now = Math.floor(Date.now() / 1000);
            var initialElapsed = Math.max(0, now - s.disconnect_started_at);
            var retryLabel = s.retry_count > 0
                ? ' <span style="color:var(--text-muted)">(retry ' + s.retry_count + ')</span>'
                : '';
            durationParts.push('<span class="session-counter" data-started-at="' +
                s.disconnect_started_at + '"><span>' +
                App.formatDuration(initialElapsed) + '</span></span>' + retryLabel);
        } else if ((s.connection_status || "").startsWith("connecting") && s.connect_elapsed != null) {
            durationParts.push(Device._t("connecting_elapsed", "Menyambungkan") + " " +
                s.connect_elapsed.toFixed(1) + "s");
        }
        var durationRow = "";
        if (durationParts.length > 0) {
            durationRow = '<div class="session-meta">' +
                Device._t("session_duration", "Durasi") + ': ' +
                durationParts.join(' <span class="session-sep">|</span> ') +
                '</div>';
        }

        return '<div class="card session-card">' +
            '<div class="session-head">' +
                '<span class="session-title"><span class="dot ' + dot + '"></span>' +
                '<span class="session-title-text">' + escape(s.name || s.udid) + '</span></span>' +
                '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
            '</div>' +
            locationRow +
            durationRow +
            '<button class="btn btn-danger btn-full btn-sm" style="margin-top:4px"' +
            ' onclick="Device.deactivate(\'' + s.udid + '\')">' +
            Device._t("deactivate", "Deactivate") + '</button>' +
            '</div>';
    },

    startLiveCounter: function() {
        if (Device._counterInterval) return;
        Device._counterInterval = setInterval(function() {
            var now = Math.floor(Date.now() / 1000);
            document.querySelectorAll(".session-counter").forEach(function(el) {
                var startedAt = parseFloat(el.dataset.startedAt);
                if (!startedAt) return;
                var elapsed = Math.max(0, now - startedAt);
                var span = el.querySelector("span");
                if (span) span.textContent = App.formatDuration(elapsed);
            });
        }, 1000);
    },
};
