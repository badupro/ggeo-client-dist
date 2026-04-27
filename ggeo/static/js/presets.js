// GGEO presets.js — user's saved location presets (free users only).

var Presets = {
    list: [],

    init: function() {
        this.load();
    },

    load: async function() {
        try {
            var data = await App.api("GET", "/api/presets");
            this.list = data;
            this.render();
        } catch (e) {
            var panel = document.getElementById("presets-panel");
            if (panel) panel.style.display = "none";
        }
    },

    render: function() {
        var container = document.getElementById("presets-list");
        if (!container) return;
        if (this.list.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:10px;font-size:12px">No presets saved</div>';
            return;
        }
        var html = "";
        this.list.forEach(function(p) {
            html += '<div class="preset-item">' +
                '<div class="preset-info">' +
                  '<div class="preset-name">' + p.name + '</div>' +
                  '<div class="preset-coords">' + p.latitude.toFixed(4) + ", " + p.longitude.toFixed(4) + '</div>' +
                '</div>' +
                '<div class="preset-actions">' +
                  '<button class="btn btn-outline btn-sm" onclick="Presets.use(' + p.id + ')">Use</button>' +
                  '<button class="btn btn-ghost btn-sm" onclick="Presets.remove(' + p.id + ', \'' + p.name.replace(/'/g, "\\'") + '\')" title="Delete">&times;</button>' +
                '</div>' +
                '</div>';
        });
        container.innerHTML = html;
    },

    use: function(id) {
        var preset = this.list.find(function(p) { return p.id === id; });
        if (!preset) return;
        document.getElementById("lat-input").value = preset.latitude;
        document.getElementById("lon-input").value = preset.longitude;
        if (typeof GMap !== "undefined" && GMap.setPin) {
            GMap.setPin(preset.latitude, preset.longitude);
            GMap.flyTo(preset.latitude, preset.longitude);
        }
        App.toast("Loaded preset: " + preset.name);
    },

    save: async function() {
        var lat = parseFloat(document.getElementById("lat-input").value);
        var lon = parseFloat(document.getElementById("lon-input").value);
        if (isNaN(lat) || isNaN(lon)) {
            App.toast("Invalid coordinates", true);
            return;
        }
        var name = prompt("Preset name:");
        if (!name || !name.trim()) return;
        try {
            await App.api("POST", "/api/presets", {name: name.trim(), lat: lat, lon: lon});
            App.toast("Preset saved: " + name.trim());
            await this.load();
            if (typeof History !== "undefined") History.load();
        } catch (e) { App.toast(e.message, true); }
    },

    remove: async function(id, name) {
        if (!(await App.confirm("Hapus preset '" + name + "'?", {title:"Hapus Preset", okText:"Hapus"}))) return;
        try {
            await App.api("DELETE", "/api/presets/" + id);
            App.toast("Deleted");
            await this.load();
            if (typeof History !== "undefined") History.load();
        } catch (e) { App.toast(e.message, true); }
    },

};
