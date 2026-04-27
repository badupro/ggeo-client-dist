// GGEO Admin Panel — SPA logic for 7 tabs.

var Admin = {
    currentTab: "dashboard",
    users: [],
    devices: [],
    locations: [],
    dashboardInterval: null,

    _t: function(key, fallback) {
        if (typeof I18N !== "undefined") return I18N.t(key);
        return fallback || key;
    },

    _escape: function(s) {
        if (s == null) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    init: async function() {
        try {
            var user = await App.api("GET", "/api/auth/me");
            if (user.role !== "client_admin" && user.role !== "admin") {
                window.location.href = "/";
                return;
            }
            var ai = document.getElementById("avatar-initial");
            if (ai) ai.textContent = (user.username || "?").charAt(0);
            var nm = document.getElementById("user-menu-name");
            if (nm) nm.textContent = user.username;
            var rl = document.getElementById("user-menu-role");
            if (rl) rl.textContent = user.role;
        } catch (e) {
            window.location.href = "/login";
            return;
        }

        document.querySelectorAll(".tab-btn").forEach(function(btn) {
            btn.addEventListener("click", function() {
                Admin.switchTab(btn.dataset.tab);
            });
        });

        await Admin.Limits.refresh();
        this.switchTab("users");
    },

    switchTab: function(tabName) {
        this.currentTab = tabName;
        document.querySelectorAll(".tab-btn").forEach(function(btn) {
            btn.classList.toggle("active", btn.dataset.tab === tabName);
        });
        document.querySelectorAll(".tab-content").forEach(function(s) {
            s.classList.toggle("active", s.id === "tab-" + tabName);
        });

        if (Admin.Sessions && Admin.Sessions.pollInterval && tabName !== "activity") {
            clearInterval(Admin.Sessions.pollInterval);
            Admin.Sessions.pollInterval = null;
        }

        if (tabName === "users") Admin.Users.load();
        else if (tabName === "devices") Admin.Devices.load();
        else if (tabName === "locations") Admin.Locations.load();
        else if (tabName === "activity") {
            Admin.Sessions.load();
            Admin.Sessions.startPolling();
        }
    },

    // ── Modal helpers ──
    showModal: function(html) {
        document.getElementById("modal-content").innerHTML = html;
        document.getElementById("modal-overlay").style.display = "flex";
    },
    hideModal: function() {
        document.getElementById("modal-overlay").style.display = "none";
        document.getElementById("modal-content").innerHTML = "";
    },

    fmtDuration: function(sec) {
        if (sec == null) return "--";
        if (sec < 60) return sec + "s";
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        if (m < 60) return m + "m " + s + "s";
        var h = Math.floor(m / 60);
        return h + "h " + (m % 60) + "m";
    },
    fmtTs: function(ts) {
        return App.formatDateTime(ts);
    },
};

// ── Admin.Limits ─────────────────────────
Admin.Limits = {
    _max: {},
    _loaded: false,

    refresh: async function() {
        try {
            var s = await App.api("GET", "/api/admin/host-status");
            this._max = (s && s.limits) || {};
            this._loaded = true;
        } catch (e) { /* keep previous values; indicator shows '--' */ }
    },

    update: function(resource, count) {
        var max = this._max["max_" + resource];
        var usage = document.getElementById(resource + "-usage");
        var btn = document.getElementById(resource + "-add-btn");
        if (usage) {
            usage.textContent = (max != null) ? (count + " / " + max) : (count + " / --");
        }
        if (btn) {
            var atLimit = (max != null) && (count >= max);
            btn.disabled = atLimit;
            if (atLimit) {
                btn.title = "Limit tercapai. Hubungi administrator.";
                btn.classList.add("btn-disabled");
            } else {
                btn.removeAttribute("title");
                btn.classList.remove("btn-disabled");
            }
        }
    },
};

// ── Dashboard + DashboardChart ──
Admin.Dashboard = { load: function(){}, startPolling: function(){} };
Admin.DashboardChart = { init: function(){} };

// ── Users ──────────────────────────────────────────────────────

Admin.Users = {
    load: async function() {
        try {
            var users = await App.api("GET", "/api/admin/users");
            Admin.users = users;
            Admin.Limits.update("users", users.length);
            var tbody = document.querySelector("#users-table tbody");
            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' + Admin._t("empty_users", "No users") + '</td></tr>';
                return;
            }
            var html = "";
            var editLabel = Admin._t("edit", "Edit");
            var deleteLabel = Admin._t("delete", "Delete");
            users.forEach(function(u) {
                var perm = u.location_permission || "free";
                var locCell = u.location_name
                    ? u.location_name
                    : (u.default_lat != null ? 'Custom' : '--');
                html += '<tr>' +
                    '<td data-label="Username">' + u.username + '</td>' +
                    '<td data-label="Role">' + u.role + '</td>' +
                    '<td data-label="Permission">' + perm + '</td>' +
                    '<td data-label="Device">' + (u.device_udid ? u.device_udid.substring(0,12) + "..." : "--") + '</td>' +
                    '<td data-label="Location">' + locCell + '</td>' +
                    '<td data-label="Last Login">' + Admin.fmtTs(u.last_login) + '</td>' +
                    '<td data-label="Actions" class="table-actions">' +
                    '<button class="btn btn-outline btn-sm" onclick="Admin.Users.showEditModal(\'' + u.id + '\')">' + editLabel + '</button>' +
                    '<button class="btn btn-danger btn-sm" onclick="Admin.Users.remove(\'' + u.id + '\', \'' + u.username + '\')">' + deleteLabel + '</button>' +
                    '</td></tr>';
            });
            tbody.innerHTML = html;
        } catch (e) {
            App.toast(e.message, true);
        }
    },

    _permissionSelectHtml: function(currentValue, locationMode) {
        var cur = currentValue || (locationMode === "locked" ? "locked" : "free");
        if (locationMode === "locked") {
            return '<label>Permission</label>' +
                '<select class="input" id="m-permission" disabled>' +
                  '<option value="locked" selected>locked (host policy)</option>' +
                '</select>' +
                '<input type="hidden" id="m-permission-hidden" value="locked">';
        }
        return '<label>Permission</label>' +
            '<select class="input" id="m-permission" onchange="Admin.Users.togglePermFields()">' +
              '<option value="free"' + (cur === "free" ? " selected" : "") + '>free</option>' +
              '<option value="locked"' + (cur === "locked" ? " selected" : "") + '>locked</option>' +
            '</select>';
    },

    _readPermission: function() {
        var hidden = document.getElementById("m-permission-hidden");
        if (hidden) return hidden.value;
        return document.getElementById("m-permission").value;
    },

    showCreateModal: async function() {
        // Load devices for dropdown
        var devices = await App.api("GET", "/api/admin/devices").catch(function(){return [];});
        var locations = await App.api("GET", "/api/admin/locations").catch(function(){return [];});
        var hostStatus = await fetch("/api/host-status").then(function(r){return r.json();}).catch(function(){return {limits: {}};});
        var locationMode = (hostStatus.limits && hostStatus.limits.location_mode) || "free";
        var deviceOptions = '<option value="">None</option>' + devices.map(function(d) {
            return '<option value="' + d.udid + '">' + d.name + ' (' + d.udid.substring(0,12) + ')</option>';
        }).join("");
        var locOptions = '<option value="">Manual</option>' + locations.map(function(l) {
            return '<option value="' + l.id + '" data-lat="' + l.latitude + '" data-lon="' + l.longitude + '">' + l.name + '</option>';
        }).join("");

        Admin.showModal(
            '<h3>Create User</h3>' +
            '<label>Username</label><input type="text" class="input" id="m-username">' +
            '<label>Password (min 8 chars)</label><input type="password" class="input" id="m-password">' +
            '<label>Role</label><select class="input" id="m-role"><option value="user">user</option><option value="client_admin">client_admin</option></select>' +
            Admin.Users._permissionSelectHtml(null, locationMode) +
            '<label>Assigned Device</label><select class="input" id="m-device">' + deviceOptions + '</select>' +
            '<label>Initial Location (optional)</label>' +
            '<select class="input" id="m-loc-preset">' + locOptions + '</select>' +
            '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' +
              'Assign lebih banyak lokasi setelah user dibuat via Edit.' +
            '</div>' +
            '<div class="modal-error" id="m-error"></div>' +
            '<div class="buttons">' +
              '<button class="btn btn-primary" onclick="Admin.Users.create()">Create</button>' +
              '<button class="btn btn-outline" onclick="Admin.hideModal()">Cancel</button>' +
            '</div>'
        );
    },

    togglePermFields: function() {},

    fillLoc: function() {
        var sel = document.getElementById("m-loc-preset");
        var opt = sel.options[sel.selectedIndex];
        if (opt.dataset.lat) {
            document.getElementById("m-lat").value = opt.dataset.lat;
            document.getElementById("m-lon").value = opt.dataset.lon;
        }
    },

    create: async function() {
        var errEl = document.getElementById("m-error");
        errEl.textContent = "";
        var body = {
            username: document.getElementById("m-username").value.trim(),
            password: document.getElementById("m-password").value,
            role: document.getElementById("m-role").value,
            location_permission: Admin.Users._readPermission(),
            device_udid: document.getElementById("m-device").value || null,
        };
        var locPresetVal = document.getElementById("m-loc-preset").value;
        body.global_location_id = locPresetVal || null;
        try {
            await App.api("POST", "/api/admin/users", body);
            App.toast("toast_user_created");
            Admin.hideModal();
            Admin.Users.load();
        } catch (e) { errEl.textContent = e.message; }
    },

    showEditModal: async function(id) {
        var user = Admin.users.find(function(u) { return u.id === id; });
        if (!user) return;
        var devices = await App.api("GET", "/api/admin/devices").catch(function(){return [];});
        var locations = await App.api("GET", "/api/admin/locations").catch(function(){return [];});
        var hostStatus = await fetch("/api/host-status").then(function(r){return r.json();}).catch(function(){return {limits: {}};});
        var locationMode = (hostStatus.limits && hostStatus.limits.location_mode) || "free";
        var deviceOptions = '<option value="">None</option>' + devices.map(function(d) {
            return '<option value="' + d.udid + '"' + (d.udid === user.device_udid ? ' selected' : '') + '>' + d.name + ' (' + d.udid.substring(0,12) + ')</option>';
        }).join("");
        var locOptions = '<option value="">Manual</option>' + locations.map(function(l) {
            var sel = user.global_location_id === l.id ? ' selected' : '';
            return '<option value="' + l.id + '" data-lat="' + l.latitude + '" data-lon="' + l.longitude + '"' + sel + '>' + l.name + '</option>';
        }).join("");

        Admin.showModal(
            '<h3>Edit User: ' + user.username + '</h3>' +
            '<label>Username</label><input type="text" class="input" id="m-username" value="' + user.username + '">' +
            '<label>New Password (leave blank to keep current)</label><input type="password" class="input" id="m-password">' +
            '<label>Role</label><select class="input" id="m-role">' +
              '<option value="user"' + (user.role === "user" ? " selected" : "") + '>user</option>' +
              '<option value="client_admin"' + (user.role === "client_admin" ? " selected" : "") + '>client_admin</option>' +
            '</select>' +
            Admin.Users._permissionSelectHtml(user.location_permission, locationMode) +
            '<label>Assigned Device</label><select class="input" id="m-device">' + deviceOptions + '</select>' +
            '<label>Assigned Locations</label>' +
            '<div id="m-user-locations" class="stack" style="gap:4px;font-size:12px;color:var(--text-secondary)">Loading...</div>' +
            '<div style="display:flex;gap:6px;margin-top:4px">' +
              '<select class="input" id="m-loc-preset">' + locOptions + '</select>' +
              '<button class="btn btn-outline btn-sm" type="button" onclick="Admin.Users.assignLocation(\'' + id + '\')">Add</button>' +
            '</div>' +
            '<div class="modal-error" id="m-error"></div>' +
            '<div class="buttons">' +
              '<button class="btn btn-primary" onclick="Admin.Users.save(\'' + id + '\')">Save</button>' +
              '<button class="btn btn-outline" onclick="Admin.hideModal()">Cancel</button>' +
            '</div>'
        );
        Admin.Users.loadAssignedLocations(id);
    },

    loadAssignedLocations: async function(userId) {
        var box = document.getElementById("m-user-locations");
        if (!box) return;
        try {
            var rows = await App.api("GET", "/api/admin/users/" + userId + "/locations");
            if (!rows || rows.length === 0) {
                box.innerHTML = '<div class="empty-state" style="padding:4px">Belum ada lokasi di-assign.</div>';
                return;
            }
            box.innerHTML = rows.map(function(r) {
                var tag = r.is_universal
                    ? '<span class="badge badge-active" style="font-size:9px;margin-left:4px">universal</span>'
                    : '';
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px;background:rgba(255,255,255,0.02);border-radius:4px">' +
                    '<span>' + r.name + tag + ' <span style="color:var(--text-muted)">(' + r.latitude.toFixed(4) + ',' + r.longitude.toFixed(4) + ')</span></span>' +
                    '<button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:11px" onclick="Admin.Users.unassignLocation(\'' + userId + '\',\'' + r.id + '\')">Remove</button>' +
                    '</div>';
            }).join("");
        } catch (e) {
            box.innerHTML = '<div class="empty-state" style="padding:4px;color:var(--error)">Gagal load: ' + e.message + '</div>';
        }
    },

    assignLocation: async function(userId) {
        var errEl = document.getElementById("m-error");
        errEl.textContent = "";
        var locId = document.getElementById("m-loc-preset").value;
        if (!locId) { errEl.textContent = "Pilih lokasi dulu"; return; }
        try {
            await App.api("POST", "/api/admin/user-locations", {
                user_id: userId, location_id: locId,
            });
            App.toast("Lokasi di-assign");
            await Admin.Users.loadAssignedLocations(userId);
        } catch (e) { errEl.textContent = e.message; }
    },

    unassignLocation: async function(userId, locId) {
        try {
            await App.api("DELETE", "/api/admin/user-locations/" + userId + "/" + locId);
            await Admin.Users.loadAssignedLocations(userId);
        } catch (e) {
            var errEl = document.getElementById("m-error");
            if (errEl) errEl.textContent = e.message;
        }
    },

    save: async function(id) {
        var errEl = document.getElementById("m-error");
        errEl.textContent = "";
        var body = {
            username: document.getElementById("m-username").value.trim(),
            role: document.getElementById("m-role").value,
            location_permission: Admin.Users._readPermission(),
            device_udid: document.getElementById("m-device").value || null,
        };
        var pwd = document.getElementById("m-password").value;
        if (pwd) body.password = pwd;

        var locPresetVal = document.getElementById("m-loc-preset").value;
        body.global_location_id = locPresetVal || null;
        try {
            await App.api("PUT", "/api/admin/users/" + id, body);
            if (locPresetVal) {
                try {
                    await App.api("POST", "/api/admin/user-locations", {
                        user_id: id, location_id: locPresetVal,
                    });
                } catch (e2) { /* non-fatal, likely already exists */ }
            }
            App.toast("toast_user_updated");
            Admin.hideModal();
            Admin.Users.load();
        } catch (e) { errEl.textContent = e.message; }
    },

    remove: async function(id, username) {
        if (!(await App.confirm("Hapus '" + username + "'?", {title:"Hapus User", okText:"Hapus"}))) return;
        try {
            await App.api("DELETE", "/api/admin/users/" + id);
            App.toast("toast_deleted");
            Admin.Users.load();
        } catch (e) { App.toast(e.message, true); }
    },
};

// ── Devices ────────────────────────────────────────────────────

Admin.Devices = {
    load: async function() {
        try {
            var devices = await App.api("GET", "/api/admin/devices");
            Admin.devices = devices;
            Admin.Limits.update("devices", devices.length);
            var tbody = document.querySelector("#devices-table tbody");
            if (devices.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="empty-state">' + Admin._t("empty_devices", "No registered devices") + '</td></tr>';
                return;
            }
            var html = "";
            var editLabel = Admin._t("edit", "Edit");
            var deleteLabel = Admin._t("delete", "Delete");
            var activeLabel = Admin._t("active", "Active");
            var disabledLabel = Admin._t("inactive", "Disabled");
            var wifiEnabledLabel = Admin._t("wifi_enabled", "WiFi enabled");
            var usbOnlyLabel = Admin._t("usb_only", "USB only");
            devices.forEach(function(d) {
                var wifiFlag = d.wifi_enabled === true
                    || d.wifi_connections_enabled === true;
                var wifiBadge = wifiFlag
                    ? '<span class="badge badge-active">' + wifiEnabledLabel + '</span>'
                    : '<span class="badge badge-inactive">' + usbOnlyLabel + '</span>';
                var assignedName = (d.assigned_user && d.assigned_user.username)
                    || d.assigned_username
                    || "--";
                html += '<tr>' +
                    '<td data-label="Name">' + d.name + '</td>' +
                    '<td data-label="UDID">' + d.udid.substring(0,16) + '...</td>' +
                    '<td data-label="Model">' + (d.model || "--") + '</td>' +
                    '<td data-label="iOS">' + (d.ios_version || "--") + '</td>' +
                    '<td data-label="Status">' + (d.is_active ? activeLabel : disabledLabel) + '</td>' +
                    '<td data-label="WiFi">' + wifiBadge + '</td>' +
                    '<td data-label="Assigned">' + assignedName + '</td>' +
                    '<td data-label="Actions" class="table-actions">' +
                    '<button class="btn btn-outline btn-sm" onclick="Admin.Devices.showEditModal(\'' + d.id + '\')">' + editLabel + '</button>' +
                    '<button class="btn btn-danger btn-sm" onclick="Admin.Devices.remove(\'' + d.id + '\', \'' + d.name + '\')">' + deleteLabel + '</button>' +
                    '</td></tr>';
            });
            tbody.innerHTML = html;
        } catch (e) { App.toast(e.message, true); }
    },

    showRegisterModal: async function() {
        Admin.showModal(
            '<h3>Register New Device</h3>' +
            '<p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">First-time registration requires USB connection (for pairing and developer image mount). Devices already paired to this machine will also appear via WiFi.</p>' +
            '<button class="btn btn-outline btn-full" onclick="Admin.Devices.scan()">Scan Devices</button>' +
            '<div id="scan-results" style="margin-top:12px"></div>' +
            '<div class="modal-error" id="m-error"></div>' +
            '<div class="buttons"><button class="btn btn-outline btn-full" onclick="Admin.hideModal()">Close</button></div>'
        );
    },

    scan: async function() {
        var results = document.getElementById("scan-results");
        results.innerHTML = '<div class="empty-state">Scanning...</div>';
        try {
            var devices = await App.api("GET", "/api/admin/devices/scan");
            if (devices.length === 0) {
                results.innerHTML = '<div class="empty-state">No unregistered devices found. Plug iPhone via USB and trust this computer.</div>';
                return;
            }
            var html = "";
            devices.forEach(function(d, i) {
                var connBadge = d.connection === "USB"
                    ? '<span class="badge badge-active">USB</span>'
                    : '<span class="badge badge-warning">WiFi (previously paired)</span>';
                html += '<div class="card" style="padding:10px;margin-bottom:8px">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
                      '<div style="font-weight:600">' + d.name + '</div>' + connBadge +
                    '</div>' +
                    '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + d.model + ' - iOS ' + d.ios_version + '</div>' +
                    '<input type="text" class="input" id="d-name-' + i + '" placeholder="Friendly name" value="' + d.name + '" style="margin-top:8px">' +
                    '<button class="btn btn-primary btn-full btn-sm" style="margin-top:6px" onclick="Admin.Devices.register(\'' + d.udid + '\', ' + i + ')">Register</button>' +
                    '</div>';
            });
            results.innerHTML = html;
        } catch (e) { results.innerHTML = '<div class="modal-error">' + e.message + '</div>'; }
    },

    register: async function(udid, idx) {
        var errEl = document.getElementById("m-error");
        errEl.textContent = "";
        var name = document.getElementById("d-name-" + idx).value.trim();
        if (!name) { errEl.textContent = "Name required"; return; }
        try {
            await App.api("POST", "/api/admin/devices", {udid: udid, name: name});
            App.toast("toast_device_registered");
            Admin.hideModal();
            Admin.Devices.load();
        } catch (e) { errEl.textContent = e.message; }
    },

    showEditModal: async function(id) {
        var device = Admin.devices.find(function(d) { return d.id === id; });
        if (!device) return;
        var users = await App.api("GET", "/api/admin/users");
        var userOptions = '<option value="">None</option>' + users.map(function(u) {
            var sel = u.device_udid === device.udid ? ' selected' : '';
            return '<option value="' + u.id + '"' + sel + '>' + u.username + '</option>';
        }).join("");
        Admin.showModal(
            '<h3>Edit Device</h3>' +
            '<label>Name</label><input type="text" class="input" id="m-name" value="' + device.name + '">' +
            '<label>Assigned User</label><select class="input" id="m-user">' + userOptions + '</select>' +
            '<label>Status</label><select class="input" id="m-status">' +
              '<option value="1"' + (device.is_active ? " selected" : "") + '>Active</option>' +
              '<option value="0"' + (!device.is_active ? " selected" : "") + '>Disabled</option>' +
            '</select>' +
            '<div class="modal-error" id="m-error"></div>' +
            '<div class="buttons">' +
              '<button class="btn btn-primary" onclick="Admin.Devices.save(\'' + id + '\')">Save</button>' +
              '<button class="btn btn-outline" onclick="Admin.hideModal()">Cancel</button>' +
            '</div>'
        );
    },

    save: async function(id) {
        var errEl = document.getElementById("m-error");
        var userId = document.getElementById("m-user").value;
        var body = {
            name: document.getElementById("m-name").value.trim(),
            is_active: document.getElementById("m-status").value === "1",
            user_id: userId ? parseInt(userId) : null,
        };
        try {
            await App.api("PUT", "/api/admin/devices/" + id, body);
            App.toast("toast_user_updated");
            Admin.hideModal();
            Admin.Devices.load();
        } catch (e) { errEl.textContent = e.message; }
    },

    remove: async function(id, name) {
        if (!(await App.confirm("Hapus '" + name + "'?", {title:"Konfirmasi Hapus", okText:"Hapus"}))) return;
        try {
            await App.api("DELETE", "/api/admin/devices/" + id);
            App.toast("toast_deleted");
            Admin.Devices.load();
        } catch (e) { App.toast(e.message, true); }
    },
};

// ── Locations ───────────────────────────────────────────────────

Admin.Locations = {
    load: async function() {
        try {
            var locations = await App.api("GET", "/api/admin/locations");
            Admin.locations = locations;
            Admin.Limits.update("locations", locations.length);
            var tbody = document.querySelector("#locations-table tbody");
            if (locations.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' + Admin._t("empty_locations", "No global locations") + '</td></tr>';
                return;
            }
            var html = "";
            var assignLabel = Admin._t("assign", "Assign");
            var editLabel = Admin._t("edit", "Edit");
            var deleteLabel = Admin._t("delete", "Delete");
            locations.forEach(function(l) {
                var assignedStr = "--";
                if (l.assigned_users && l.assigned_users.length > 0) {
                    assignedStr = l.assigned_users.map(function(u){return u.username;}).join(", ");
                }
                html += '<tr>' +
                    '<td data-label="Name">' + l.name + '</td>' +
                    '<td data-label="Latitude">' + l.latitude.toFixed(6) + '</td>' +
                    '<td data-label="Longitude">' + l.longitude.toFixed(6) + '</td>' +
                    '<td data-label="Assigned Users">' + assignedStr + '</td>' +
                    '<td data-label="Created By">' + (l.creator_username || "--") + '</td>' +
                    '<td data-label="Actions" class="table-actions">' +
                    '<button class="btn btn-outline btn-sm" onclick="Admin.Locations.showAssignModal(\'' + l.id + '\')">' + assignLabel + '</button>' +
                    '<button class="btn btn-outline btn-sm" onclick="Admin.Locations.showEditModal(\'' + l.id + '\')">' + editLabel + '</button>' +
                    '<button class="btn btn-danger btn-sm" onclick="Admin.Locations.remove(\'' + l.id + '\', \'' + l.name + '\')">' + deleteLabel + '</button>' +
                    '</td></tr>';
            });
            tbody.innerHTML = html;
        } catch (e) { App.toast(e.message, true); }
    },

    showCreateModal: function() {
        Admin.showModal(
            '<h3>Add Location</h3>' +
            '<label>Name</label><input type="text" class="input" id="m-name" placeholder="e.g. Office">' +
            '<label>Coordinates (paste from Google Maps)</label>' +
            '<div class="input-group">' +
              '<input type="text" class="input" id="m-lat" placeholder="Latitude">' +
              '<input type="text" class="input" id="m-lon" placeholder="Longitude">' +
            '</div>' +
            '<div class="modal-error" id="m-error"></div>' +
            '<div class="buttons">' +
              '<button class="btn btn-primary" onclick="Admin.Locations.create()">Save</button>' +
              '<button class="btn btn-outline" onclick="Admin.hideModal()">Cancel</button>' +
            '</div>'
        );
        App.setupCoordAutofill(document.getElementById("m-lat"), document.getElementById("m-lon"));
    },

    create: async function() {
        var errEl = document.getElementById("m-error");
        errEl.textContent = "";
        try {
            await App.api("POST", "/api/admin/locations", {
                name: document.getElementById("m-name").value.trim(),
                lat: parseFloat(document.getElementById("m-lat").value),
                lon: parseFloat(document.getElementById("m-lon").value),
            });
            App.toast("toast_location_saved");
            Admin.hideModal();
            Admin.Locations.load();
        } catch (e) { errEl.textContent = e.message; }
    },

    showEditModal: function(id) {
        var loc = Admin.locations.find(function(l) { return l.id === id; });
        if (!loc) return;
        Admin.showModal(
            '<h3>Edit Location</h3>' +
            '<label>Name</label><input type="text" class="input" id="m-name" value="' + loc.name + '">' +
            '<label>Coordinates</label>' +
            '<div class="input-group">' +
              '<input type="text" class="input" id="m-lat" value="' + loc.latitude + '">' +
              '<input type="text" class="input" id="m-lon" value="' + loc.longitude + '">' +
            '</div>' +
            '<div class="modal-error" id="m-error"></div>' +
            '<div class="buttons">' +
              '<button class="btn btn-primary" onclick="Admin.Locations.save(\'' + id + '\')">Save</button>' +
              '<button class="btn btn-outline" onclick="Admin.hideModal()">Cancel</button>' +
            '</div>'
        );
        App.setupCoordAutofill(document.getElementById("m-lat"), document.getElementById("m-lon"));
    },

    save: async function(id) {
        var errEl = document.getElementById("m-error");
        try {
            await App.api("PUT", "/api/admin/locations/" + id, {
                name: document.getElementById("m-name").value.trim(),
                lat: parseFloat(document.getElementById("m-lat").value),
                lon: parseFloat(document.getElementById("m-lon").value),
            });
            App.toast("toast_location_saved");
            Admin.hideModal();
            Admin.Locations.load();
        } catch (e) { errEl.textContent = e.message; }
    },

    showAssignModal: async function(id) {
        var users = await App.api("GET", "/api/admin/users");
        var location = Admin.locations.find(function(l) { return l.id === id; });
        var assignedIds = {};
        if (location && location.assigned_users) {
            location.assigned_users.forEach(function(u) { assignedIds[u.id] = true; });
        }
        var checkboxes = users.map(function(u) {
            var checked = assignedIds[u.id] ? "checked" : "";
            var badge = u.location_permission === "locked"
                ? '<span class="badge badge-warning" style="margin-left:6px">locked</span>'
                : '<span class="badge badge-inactive" style="margin-left:6px">free</span>';
            return '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">' +
                '<input type="checkbox" value="' + u.id + '" ' + checked + '>' +
                '<span>' + u.username + '</span>' + badge +
                '</label>';
        }).join("");

        Admin.showModal(
            '<h3>Assign Location: ' + (location ? location.name : '') + '</h3>' +
            '<p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Select users to assign this location to. Unchecking a user removes the assignment but keeps their current default coordinates.</p>' +
            '<div id="assign-users-list" style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:10px">' + checkboxes + '</div>' +
            '<div class="modal-error" id="m-error"></div>' +
            '<div class="buttons">' +
              '<button class="btn btn-primary" onclick="Admin.Locations.assign(\'' + id + '\')">Save Assignments</button>' +
              '<button class="btn btn-outline" onclick="Admin.hideModal()">Cancel</button>' +
            '</div>'
        );
    },

    assign: async function(id) {
        var errEl = document.getElementById("m-error");
        var checked = document.querySelectorAll("#assign-users-list input[type=checkbox]:checked");
        var userIds = Array.prototype.map.call(checked, function(cb) { return parseInt(cb.value); });
        try {
            await App.api("POST", "/api/admin/locations/" + id + "/assign", {user_ids: userIds});
            App.toast(Admin._t("toast_location_saved", "Assignments saved") + " (" + userIds.length + ")");
            Admin.hideModal();
            Admin.Locations.load();
        } catch (e) { errEl.textContent = e.message; }
    },

    remove: async function(id, name) {
        if (!(await App.confirm("Hapus '" + name + "'?", {title:"Konfirmasi Hapus", okText:"Hapus"}))) return;
        try {
            await App.api("DELETE", "/api/admin/locations/" + id);
            App.toast("toast_deleted");
            Admin.Locations.load();
        } catch (e) { App.toast(e.message, true); }
    },
};

// ── Activity ───────────────────────────────────────────────────

Admin.Activity = {
    _page: 1,
    _limit: 10,
    _userId: "",

    init: async function() {
        var users = await App.api("GET", "/api/admin/users").catch(function(){return [];});
        var sel = document.getElementById("lh-user");
        if (sel) {
            var prev = sel.value;
            sel.innerHTML = '<option value="">' + Admin._t("all_users", "All Users") + '</option>' +
                users.map(function(u) {
                    return '<option value="' + u.id + '">' + Admin._escape(u.username) + '</option>';
                }).join("");
            sel.value = prev;
        }
        this._page = 1;
        this.load();
    },

    filterChange: function() {
        var sel = document.getElementById("lh-user");
        Admin.Activity._userId = sel ? sel.value : "";
        Admin.Activity._page = 1;
        Admin.Activity.load();
    },

    apply: function() {
        this._page = 1;
        this.load();
    },

    load: async function() {
        var qs = "page=" + this._page + "&limit=" + this._limit;
        if (Admin.Activity._userId) qs += "&user_id=" + encodeURIComponent(Admin.Activity._userId);
        try {
            var res = await fetch("/api/admin/login-history?" + qs, {
                credentials: "include",
            });
            var payload = await res.json();
            if (!payload || payload.status !== "ok") {
                throw new Error(payload && payload.message ? payload.message : "load failed");
            }
            Admin.Activity._render(payload.data || [], payload.total || 0);
        } catch (e) {
            App.toast(Admin._t("err_load", "Load failed") + ": " + e.message, true);
        }
    },

    /** delete all login_history (optional user scope). */
    deleteAll: async function() {
        var msg = Admin.Activity._userId
            ? Admin._t("confirm_delete_all_filtered", "Delete all login history for selected user?")
            : Admin._t("confirm_delete_all_login", "Delete ALL login history? This cannot be undone.");
        if (!(await App.confirm(msg, {title:"Konfirmasi"}))) return;
        try {
            var qs = Admin.Activity._userId
                ? "?user_id=" + encodeURIComponent(Admin.Activity._userId) : "";
            var res = await fetch("/api/admin/login-history" + qs, {
                method: "DELETE", credentials: "include",
            });
            var payload = await res.json();
            if (!payload || payload.status !== "ok") {
                throw new Error(payload && payload.message ? payload.message : "delete failed");
            }
            App.toast(Admin._t("deleted_count", "Deleted") + ": " + (payload.deleted || 0));
            Admin.Activity._page = 1;
            Admin.Activity.load();
        } catch (e) {
            App.toast(Admin._t("err_delete", "Delete failed") + ": " + e.message, true);
        }
    },

    _render: function(data, total) {
        var tbody = document.querySelector("#login-history-table tbody");
        var pager = document.getElementById("login-history-pager");
        if (!tbody) return;
        if (data.length === 0 && Admin.Activity._page === 1) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">' +
                Admin._t("empty_login_history", "No login history") + '</td></tr>';
            if (pager) { pager.hidden = true; pager.innerHTML = ""; }
            return;
        }
        if (data.length === 0 && Admin.Activity._page > 1) {
            Admin.Activity._page = Math.max(1, Admin.Activity._page - 1);
            return Admin.Activity.load();
        }

        var html = "";
        data.forEach(function(r) {
            var loggedIn = App.formatDateTime(r.logged_in_at);
            var loggedOut = r.logged_out_at ? App.formatDateTime(r.logged_out_at) :
                '<span style="color:var(--text-muted)">—</span>';
            html += '<tr>' +
                '<td data-label="User">' + Admin._escape(r.username || "--") + '</td>' +
                '<td data-label="Logged In">' + loggedIn + '</td>' +
                '<td data-label="Logged Out">' + loggedOut + '</td>' +
                '<td data-label="IP Address">' + Admin._escape(r.ip_address || "--") + '</td>' +
                '</tr>';
        });
        tbody.innerHTML = html;

        Admin.Activity._renderPager(pager, total);
    },

    _renderPager: function(pager, total) {
        if (!pager) return;
        var limit = Admin.Activity._limit;
        var pages = Math.max(1, Math.ceil(total / limit));
        if (pages <= 1) {
            pager.hidden = true;
            pager.innerHTML = "";
            return;
        }
        pager.hidden = false;
        var p = Admin.Activity._page;
        var parts = [];
        parts.push(
            '<button class="history-pager-btn" ' +
            (p === 1 ? "disabled" : "") +
            ' onclick="Admin.Activity.goTo(' + (p - 1) + ')" aria-label="Previous">&lsaquo;</button>'
        );
        var nums = Admin.Sessions._pageNumbers(p, pages);
        nums.forEach(function(n) {
            if (n === "…") {
                parts.push('<span class="history-pager-ellipsis">…</span>');
            } else {
                parts.push(
                    '<button class="history-pager-btn' + (n === p ? " active" : "") +
                    '" onclick="Admin.Activity.goTo(' + n + ')">' + n + '</button>'
                );
            }
        });
        parts.push(
            '<button class="history-pager-btn" ' +
            (p === pages ? "disabled" : "") +
            ' onclick="Admin.Activity.goTo(' + (p + 1) + ')" aria-label="Next">&rsaquo;</button>'
        );
        pager.innerHTML = parts.join("");
    },

    goTo: function(page) {
        if (page < 1) return;
        Admin.Activity._page = page;
        Admin.Activity.load();
    },

    del: async function(entryId) {
        if (!entryId) return;
        try {
            await App.api("DELETE", "/api/admin/login-history/" + entryId);
            App.toast(Admin._t("history_deleted", "Entry deleted"));
            Admin.Activity.load();
        } catch (e) {
            App.toast(Admin._t("err_delete", "Delete failed") + ": " + e.message, true);
        }
    },
};

// ── Sessions ───────────────────────────────────────────────────

Admin.Sessions = {
    pollInterval: null,
    _histPage: 1,
    _histLimit: 10,
    _histUserId: "",

    initHistFilter: async function() {
        try {
            var users = await App.api("GET", "/api/admin/users");
            var sel = document.getElementById("sh-user");
            if (!sel) return;
            var prev = sel.value;
            sel.innerHTML = '<option value="">' + Admin._t("all_users", "All Users") + '</option>' +
                users.map(function(u) {
                    return '<option value="' + u.id + '">' + Admin._escape(u.username) + '</option>';
                }).join("");
            sel.value = prev;
        } catch (e) { /* silent */ }
    },

    histFilterChange: function() {
        var sel = document.getElementById("sh-user");
        Admin.Sessions._histUserId = sel ? sel.value : "";
        Admin.Sessions._histPage = 1;
        Admin.Sessions.loadHistory();
    },

    _resolveLocName: function(lat, lon) {
        if (lat == null || lon == null) return null;
        if (!Admin.locations || !Admin.locations.length) return null;
        var target = parseFloat(lat).toFixed(5) + "," + parseFloat(lon).toFixed(5);
        for (var i = 0; i < Admin.locations.length; i++) {
            var l = Admin.locations[i];
            if (l.latitude == null) continue;
            var k = parseFloat(l.latitude).toFixed(5) + "," + parseFloat(l.longitude).toFixed(5);
            if (k === target) return l.name;
        }
        return null;
    },

    load: async function() {
        try {
            var sessions = await App.api("GET", "/api/admin/sessions");
            var tbody = document.querySelector("#sessions-table tbody");
            if (sessions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' + Admin._t("empty_sessions", "No active sessions") + '</td></tr>';
            } else {
                var html = "";
                var forceDisconnectLabel = Admin._t("force_disconnect", "Force Disconnect");
                var labelUser = Admin._t("user_header", "User");
                var labelDev = Admin._t("th_device", "Device");
                var labelConn = Admin._t("th_connection", "Connection");
                var labelLoc = Admin._t("location", "Location");
                var labelSince = Admin._t("since", "Since");
                var labelAct = Admin._t("th_actions", "Actions");
                sessions.forEach(function(s) {
                    var coords = s.lat != null ? s.lat.toFixed(6) + ", " + s.lon.toFixed(6) : "--";
                    var locName = s.location_name
                        || Admin.Sessions._resolveLocName(s.lat, s.lon);
                    var locCell = locName
                        ? '<strong>' + Admin._escape(locName) + '</strong><br>' +
                          '<span style="color:var(--text-muted);font-size:11px">' + coords + '</span>'
                        : coords;
                    var since = App.formatTime(s.active_since);
                    html += '<tr>' +
                        '<td data-label="' + labelUser + '">' + Admin._escape(s.username || "--") + '</td>' +
                        '<td data-label="' + labelDev + '">' + Admin._escape(s.device_name || "--") + '</td>' +
                        '<td data-label="' + labelConn + '">' + Admin._escape(s.connection) + '</td>' +
                        '<td data-label="' + labelLoc + '">' + locCell + '</td>' +
                        '<td data-label="' + labelSince + '">' + since + '</td>' +
                        '<td data-label="' + labelAct + '"><button class="btn btn-danger btn-sm" onclick="Admin.Sessions.forceDisconnect(\'' + s.udid + '\')">' + forceDisconnectLabel + '</button></td>' +
                        '</tr>';
                });
                tbody.innerHTML = html;
            }
        } catch (e) { App.toast(e.message, true); }
    },

    loadHistory: async function() {
        try {
            var page = Admin.Sessions._histPage;
            var limit = Admin.Sessions._histLimit;
            var qs = "page=" + page + "&limit=" + limit;
            if (Admin.Sessions._histUserId) {
                qs += "&user_id=" + encodeURIComponent(Admin.Sessions._histUserId);
            }
            var res = await fetch(
                "/api/admin/sessions/history?" + qs,
                { credentials: "include" }
            );
            var payload = await res.json();
            if (!payload || payload.status !== "ok") {
                throw new Error(payload && payload.message ? payload.message : "load failed");
            }
            Admin.Sessions._renderHistory(payload.data || [], payload.total || 0);
        } catch (e) {
            console.warn("loadHistory error:", e.message);
        }
    },

    deleteAllHistory: async function() {
        var msg = Admin.Sessions._histUserId
            ? Admin._t("confirm_delete_all_filtered", "Delete all session history for selected user?")
            : Admin._t("confirm_delete_all", "Delete ALL session history? This cannot be undone.");
        if (!(await App.confirm(msg, {title:"Konfirmasi"}))) return;
        try {
            var qs = Admin.Sessions._histUserId
                ? "?user_id=" + encodeURIComponent(Admin.Sessions._histUserId) : "";
            var res = await fetch("/api/admin/sessions/history" + qs, {
                method: "DELETE", credentials: "include",
            });
            var payload = await res.json();
            if (!payload || payload.status !== "ok") {
                throw new Error(payload && payload.message ? payload.message : "delete failed");
            }
            App.toast(Admin._t("deleted_count", "Deleted") + ": " + (payload.deleted || 0));
            Admin.Sessions._histPage = 1;
            Admin.Sessions.loadHistory();
        } catch (e) {
            App.toast(Admin._t("err_delete", "Delete failed") + ": " + e.message, true);
        }
    },

    _renderHistory: function(data, total) {
        var tbody = document.querySelector("#session-history-table tbody");
        var pager = document.getElementById("session-history-pager");
        if (!tbody) return;

        if (data.length === 0 && Admin.Sessions._histPage === 1) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' +
                Admin._t("empty_history", "No history yet") + '</td></tr>';
            if (pager) { pager.hidden = true; pager.innerHTML = ""; }
            return;
        }
        if (data.length === 0 && Admin.Sessions._histPage > 1) {
            Admin.Sessions._histPage = Math.max(1, Admin.Sessions._histPage - 1);
            return Admin.Sessions.loadHistory();
        }

        var endReasonMap = {
            user: Admin._t("end_reason_user", "User deactivate"),
            admin_force: Admin._t("end_reason_admin", "Admin force"),
            disconnect: Admin._t("end_reason_disconnect", "Disconnected"),
            server_stop: Admin._t("end_reason_server_stop", "Server stop"),
        };

        var html = "";
        data.forEach(function(s) {
            var resolvedName = s.location_name
                || Admin.Sessions._resolveLocName(s.latitude, s.longitude);
            var locationCell;
            if (resolvedName) {
                locationCell =
                    '<div class="history-name">' + Admin._escape(resolvedName) + '</div>' +
                    '<div class="history-coords">' +
                    (s.latitude != null ? parseFloat(s.latitude).toFixed(6) : "--") +
                    ", " +
                    (s.longitude != null ? parseFloat(s.longitude).toFixed(6) : "--") +
                    '</div>';
            } else {
                locationCell = '<div class="history-coords-primary">' +
                    (s.latitude != null ? parseFloat(s.latitude).toFixed(6) : "--") +
                    ", " +
                    (s.longitude != null ? parseFloat(s.longitude).toFixed(6) : "--") +
                    '</div>';
            }
            var duration = s.duration_seconds != null
                ? App.formatDuration(s.duration_seconds) : "--";
            var reasonLabel = endReasonMap[s.end_reason] || (s.end_reason || "--");
            var ts = App.formatDateTime(s.activated_at);
            var deviceLabel = s.device_name
                ? Admin._escape(s.device_name)
                : Admin._escape((s.device_udid || "--").slice(0, 12)) + '…';
            html += '<tr>' +
                '<td data-label="User">' + Admin._escape(s.username || "--") + '</td>' +
                '<td data-label="Device">' + deviceLabel + '</td>' +
                '<td data-label="Location">' + locationCell + '</td>' +
                '<td data-label="Duration">' + duration + '</td>' +
                '<td data-label="End Reason">' + Admin._escape(reasonLabel) + '</td>' +
                '<td data-label="Activated">' + Admin._escape(ts) + '</td>' +
                '</tr>';
        });
        tbody.innerHTML = html;

        Admin.Sessions._renderHistoryPager(pager, total);
    },

    _renderHistoryPager: function(pager, total) {
        if (!pager) return;
        var limit = Admin.Sessions._histLimit;
        var pages = Math.max(1, Math.ceil(total / limit));
        if (pages <= 1) {
            pager.hidden = true;
            pager.innerHTML = "";
            return;
        }
        pager.hidden = false;
        var p = Admin.Sessions._histPage;
        var parts = [];
        parts.push(
            '<button class="history-pager-btn" ' +
            (p === 1 ? "disabled" : "") +
            ' onclick="Admin.Sessions.histGoTo(' + (p - 1) + ')" aria-label="Previous">&lsaquo;</button>'
        );
        var nums = Admin.Sessions._pageNumbers(p, pages);
        nums.forEach(function(n) {
            if (n === "…") {
                parts.push('<span class="history-pager-ellipsis">…</span>');
            } else {
                parts.push(
                    '<button class="history-pager-btn' + (n === p ? " active" : "") +
                    '" onclick="Admin.Sessions.histGoTo(' + n + ')">' + n + '</button>'
                );
            }
        });
        parts.push(
            '<button class="history-pager-btn" ' +
            (p === pages ? "disabled" : "") +
            ' onclick="Admin.Sessions.histGoTo(' + (p + 1) + ')" aria-label="Next">&rsaquo;</button>'
        );
        pager.innerHTML = parts.join("");
    },

    _pageNumbers: function(cur, total) {
        if (total <= 7) {
            var arr = [];
            for (var i = 1; i <= total; i++) arr.push(i);
            return arr;
        }
        var res = [1];
        var start = Math.max(2, cur - 1);
        var end = Math.min(total - 1, cur + 1);
        if (start > 2) res.push("…");
        for (var j = start; j <= end; j++) res.push(j);
        if (end < total - 1) res.push("…");
        res.push(total);
        return res;
    },

    histGoTo: function(page) {
        if (page < 1) return;
        Admin.Sessions._histPage = page;
        Admin.Sessions.loadHistory();
    },

    delHistory: async function(sessionId) {
        if (!sessionId) return;
        try {
            await App.api("DELETE", "/api/admin/sessions/history/" + sessionId);
            App.toast(Admin._t("history_deleted", "Entry deleted"));
            Admin.Sessions.loadHistory();
        } catch (e) {
            App.toast(Admin._t("err_delete", "Delete failed") + ": " + e.message, true);
        }
    },

    startPolling: function() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        var self = this;
        this.pollInterval = setInterval(function() {
            self._pollActiveOnly();
        }, 5000);
    },

    _pollActiveOnly: async function() {
        try {
            var sessions = await App.api("GET", "/api/admin/sessions");
            var tbody = document.querySelector("#sessions-table tbody");
            if (!tbody) return;
            if (sessions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' +
                    Admin._t("empty_sessions", "No active sessions") + '</td></tr>';
                return;
            }
            var forceDisconnectLabel = Admin._t("force_disconnect", "Force Disconnect");
            var html = "";
            sessions.forEach(function(s) {
                var coords = s.lat != null ? s.lat.toFixed(4) + ", " + s.lon.toFixed(4) : "--";
                var since = App.formatTime(s.active_since);
                html += '<tr>' +
                    '<td>' + Admin._escape(s.username || "--") + '</td>' +
                    '<td>' + Admin._escape(s.device_name || "--") + '</td>' +
                    '<td>' + Admin._escape(s.connection) + '</td>' +
                    '<td>' + coords + '</td>' +
                    '<td>' + since + '</td>' +
                    '<td><button class="btn btn-danger btn-sm" onclick="Admin.Sessions.forceDisconnect(\'' + s.udid + '\')">' + forceDisconnectLabel + '</button></td>' +
                    '</tr>';
            });
            tbody.innerHTML = html;
        } catch (e) { /* silent poll fail */ }
    },

    forceDisconnect: async function(udid) {
        if (!(await App.confirm("Force disconnect sesi ini?", {title:"Force Disconnect", okText:"Disconnect"}))) return;
        try {
            await App.api("POST", "/api/admin/sessions/" + udid + "/force-disconnect");
            App.toast("toast_stopped");
            Admin.Sessions.load();
        } catch (e) { App.toast(e.message, true); }
    },

    deactivateAll: async function() {
        if (!(await App.confirm("Matikan SEMUA sesi aktif?", {title:"Deactivate All", okText:"Matikan Semua"}))) return;
        try {
            var res = await fetch("/api/admin/sessions/deactivate-all", {
                method: "POST", credentials: "include",
            });
            var pay = await res.json();
            if (!pay || pay.status !== "ok") {
                throw new Error(pay && pay.message ? pay.message : "request failed");
            }
            App.toast(Admin._t("deactivated_count", "Deactivated") + ": " + (pay.deactivated || 0));
            Admin.Sessions.load();
        } catch (e) {
            App.toast(Admin._t("err_deactivate", "Deactivate failed") + ": " + e.message, true);
        }
    },
};

// ── System ──────────────────────────────────────────────────────

// ── History (unified Session + Login sub-tabs) ─────────────────

Admin.History = {
    _sub: "active",
    _sessionPage: 1,
    _loginPage: 1,
    _perPage: 20,

    init: function() {
    },

    switchSub: function(sub) {
        if (!["active", "session", "login"].includes(sub)) return;
        Admin.History._sub = sub;
        document.querySelectorAll("#history-subtabs .history-subtab-btn").forEach(function(b) {
            b.classList.toggle("active", b.dataset.sub === sub);
        });
        ["active", "session", "login"].forEach(function(s) {
            var panel = document.getElementById("hist-panel-" + s);
            if (panel) panel.hidden = (s !== sub);
        });
        document.querySelectorAll(".hist-active-only").forEach(function(el) {
            el.hidden = (sub !== "active");
        });
        document.querySelectorAll(".hist-session-only").forEach(function(el) {
            el.hidden = (sub !== "session");
        });
        document.querySelectorAll(".hist-login-only").forEach(function(el) {
            el.hidden = (sub !== "login");
        });
        document.querySelectorAll(".hist-hide-on-active").forEach(function(el) {
            el.hidden = (sub === "active");
        });
        if (sub === "session") {
            Admin.History.loadSessionHistory();
        } else if (sub === "login") {
            Admin.History.loadLoginHistory();
        }
    },

    loadSessionHistory: async function() {
        var tbody = document.querySelector("#session-history-table tbody");
        if (!tbody) return;
        try {
            var resp = await fetch(
                "/api/admin/sessions/history?page=" + Admin.History._sessionPage +
                "&per_page=" + Admin.History._perPage,
                { credentials: "include" },
            );
            var payload = await resp.json();
            var rows = (payload && payload.data) || [];
            if (rows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No session history yet.</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map(function(r) {
                var dev = r.device_name || (r.device_udid || "--").slice(0, 12) + "…";
                var coordStr = r.latitude != null
                    ? parseFloat(r.latitude).toFixed(6) + ", " + parseFloat(r.longitude).toFixed(6)
                    : "--";
                var locName = r.location_name
                    || Admin.Sessions._resolveLocName(r.latitude, r.longitude);
                var locCell = locName
                    ? '<strong>' + Admin._escape(locName) + '</strong><br>' +
                      '<span style="color:var(--text-muted);font-size:11px">' + coordStr + '</span>'
                    : coordStr;
                var durSec = r.duration_seconds != null
                    ? App.formatDuration(r.duration_seconds) : "--";
                return '<tr>' +
                    '<td data-label="User">' + (r.username || "--") + '</td>' +
                    '<td data-label="Device">' + Admin._escape(dev) + '</td>' +
                    '<td data-label="Location">' + locCell + '</td>' +
                    '<td data-label="Activated">' + Admin.fmtTs(r.activated_at) + '</td>' +
                    '<td data-label="Duration">' + durSec + '</td>' +
                    '<td data-label="End Reason">' + Admin._escape(r.end_reason || "--") + '</td>' +
                '</tr>';
            }).join("");
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load: ' + Admin._escape(e.message) + '</td></tr>';
        }
    },

    loadLoginHistory: async function() {
        var tbody = document.querySelector("#login-history-table tbody");
        if (!tbody) return;
        try {
            var resp = await fetch(
                "/api/admin/login-history?page=" + Admin.History._loginPage +
                "&per_page=" + Admin.History._perPage,
                { credentials: "include" },
            );
            var payload = await resp.json();
            var rows = (payload && payload.data) || [];
            if (rows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No login history yet.</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map(function(r) {
                return '<tr>' +
                    '<td data-label="User">' + (r.username || "--") + '</td>' +
                    '<td data-label="IP">' + Admin._escape(r.ip_address || "--") + '</td>' +
                    '<td data-label="Logged In">' + Admin.fmtTs(r.logged_in_at) + '</td>' +
                    '<td data-label="Logged Out">' + (r.logged_out_at ? Admin.fmtTs(r.logged_out_at) : "--") + '</td>' +
                '</tr>';
            }).join("");
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Failed to load: ' + Admin._escape(e.message) + '</td></tr>';
        }
    },

    filterChange: function() {},
    deleteAll: function() {},
};
// ── Logs viewer ────────────────────────────

Admin.Logs = { load: function(){}, clear: function(){} };

Admin.System = { load: function(){} };

async function doLogout() {
    try { await fetch("/api/auth/logout", {method: "POST"}); } catch(e) {}
    window.location.href = "/login";
}

Admin.init();
