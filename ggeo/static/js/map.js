// GGEO map.js — MapLibre GL JS, pin, geocoding, hover coordinates, layer switcher.

var GMap_STYLES = {
    streetmap: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    satellite: {
        version: 8,
        sources: {
            "esri-world-imagery": {
                type: "raster",
                tiles: [
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                ],
                tileSize: 256,
                attribution: "Tiles © Esri, Maxar, Earthstar Geographics"
            }
        },
        layers: [{
            id: "esri-world-imagery",
            type: "raster",
            source: "esri-world-imagery",
            minzoom: 0,
            maxzoom: 19
        }]
    }
};

var GMap = {
    map: null,
    marker: null,
    selectedLat: null,
    selectedLon: null,
    _onSelectCallbacks: [],
    _currentStyle: "streetmap",

    init: function(containerId) {
        var self = this;

        if (typeof maplibregl === "undefined") {
            document.getElementById(containerId).innerHTML =
                '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.24);font-size:14px;">Map unavailable offline. Coordinates still work.</div>';
            return;
        }

        self.map = new maplibregl.Map({
            container: containerId,
            style: GMap_STYLES.streetmap,
            center: [106.8456, -6.2088],
            zoom: 5,
        });

        self.map.addControl(new maplibregl.NavigationControl({
            visualizePitch: true,
        }), "top-right");
        var geolocate = new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true, timeout: 8000 },
            trackUserLocation: false,
            showUserLocation: true,
        });
        self.map.addControl(geolocate, "top-right");
        geolocate.on("error", function(e) {
            var msg;
            if (!e || e.code === 1) {
                msg = "Izin lokasi ditolak. Aktifkan di Settings > Privacy > Location untuk browser ini.";
            } else if (e.code === 2) {
                msg = "Lokasi tidak terdeteksi (butuh GPS atau WiFi known location).";
            } else if (e.code === 3) {
                msg = "Timeout menunggu lokasi. Coba lagi atau pindah ke tempat dengan sinyal lebih kuat.";
            } else {
                msg = "Lokasi tidak tersedia: " + (e.message || "unknown");
            }
            if (typeof App !== "undefined" && App.toast) {
                App.toast(msg, true);
            }
        });
        self.map.addControl(new maplibregl.FullscreenControl(), "top-right");

        self.map.addControl(new maplibregl.ScaleControl({
            maxWidth: 120,
            unit: "metric",
        }), "bottom-left");

        self.map.addControl(new GMap._LayerToggleControl(), "bottom-right");

        self.map.on("click", function(e) {
            var lat = e.lngLat.lat;
            var lon = e.lngLat.lng;
            self.setPin(lat, lon);
            self._fireSelect(lat, lon);
        });

        self.map.on("mousemove", function(e) {
            var el = document.getElementById("map-coords");
            if (el) {
                el.textContent = e.lngLat.lat.toFixed(8) + ", " + e.lngLat.lng.toFixed(8);
            }
        });

        self.map.on("style.load", function() {
            if (self.selectedLat != null && self.selectedLon != null) {
                self.setPin(self.selectedLat, self.selectedLon);
            }
        });

        self.map.on("error", function() {});
    },

    setStyle: function(name) {
        if (!this.map || !GMap_STYLES[name]) return;
        if (name === this._currentStyle) return;
        this._currentStyle = name;
        this.map.setStyle(GMap_STYLES[name]);
    },

    _LayerToggleControl: function() {
        this.onAdd = function(map) {
            var container = document.createElement("div");
            container.className = "maplibregl-ctrl maplibregl-ctrl-group";
            var btn = document.createElement("button");
            btn.className = "map-layer-toggle";
            btn.type = "button";
            btn.title = "Toggle satellite";
            btn.setAttribute("aria-label", "Toggle satellite view");
            var ICON_GLOBE =
                '<svg viewBox="0 0 24 24" width="18" height="18"' +
                ' fill="none" stroke="currentColor" stroke-width="2"' +
                ' stroke-linecap="round" stroke-linejoin="round">' +
                '<circle cx="12" cy="12" r="10"/>' +
                '<line x1="2" y1="12" x2="22" y2="12"/>' +
                '<path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>' +
                '</svg>';
            var ICON_DISH =
                '<svg viewBox="0 0 24 24" width="18" height="18"' +
                ' fill="none" stroke="currentColor" stroke-width="2"' +
                ' stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M4 20h10"/>' +
                '<path d="M5 20l4-8"/>' +
                '<path d="M13 20l-4-8"/>' +
                '<circle cx="15" cy="9" r="3"/>' +
                '<path d="M19 5l2-2M19 13l2 2"/>' +
                '</svg>';
            btn.innerHTML = ICON_GLOBE;
            btn.addEventListener("click", function() {
                var nextStyle = GMap._currentStyle === "streetmap"
                    ? "satellite" : "streetmap";
                GMap.setStyle(nextStyle);
                btn.innerHTML = nextStyle === "streetmap" ? ICON_GLOBE : ICON_DISH;
                btn.title = nextStyle === "streetmap"
                    ? "Switch to satellite" : "Switch to streetmap";
            });
            container.appendChild(btn);
            this._container = container;
            return container;
        };
        this.onRemove = function() {
            if (this._container && this._container.parentNode) {
                this._container.parentNode.removeChild(this._container);
            }
        };
    },

    setPin: function(lat, lon) {
        var self = this;
        if (!self.map) return;

        self.selectedLat = lat;
        self.selectedLon = lon;

        if (self.marker) {
            self.marker.remove();
        }

        var el = document.createElement("div");
        el.className = "map-pin";

        self.marker = new maplibregl.Marker({ element: el })
            .setLngLat([lon, lat])
            .addTo(self.map);
    },

    setPinActive: function() {
        var pin = document.querySelector(".map-pin");
        if (pin) pin.classList.add("active");
    },

    setPinInactive: function() {
        var pin = document.querySelector(".map-pin");
        if (pin) pin.classList.remove("active");
    },

    flyTo: function(lat, lon, zoom) {
        if (!this.map) return;
        this.map.flyTo({
            center: [lon, lat],
            zoom: zoom || 15,
            duration: 1500,
        });
    },

    onSelect: function(fn) {
        this._onSelectCallbacks.push(fn);
    },

    _fireSelect: function(lat, lon) {
        this._onSelectCallbacks.forEach(function(fn) { fn(lat, lon); });
    },

    search: async function(query) {
        if (!query || query.length < 2) return [];
        try {
            var url = "https://nominatim.openstreetmap.org/search?q=" +
                encodeURIComponent(query) + "&format=json&limit=5";
            var res = await fetch(url, {
                headers: { "Accept-Language": "en" },
            });
            var results = await res.json();
            return results.map(function(r) {
                return {
                    name: r.display_name,
                    lat: parseFloat(r.lat),
                    lon: parseFloat(r.lon),
                };
            });
        } catch (e) {
            return [];
        }
    },

    initSearch: function(inputId, resultsId) {
        var self = this;
        var input = document.getElementById(inputId);
        var results = document.getElementById(resultsId);
        if (!input || !results) return;

        var debounce = null;

        input.addEventListener("input", function() {
            clearTimeout(debounce);
            debounce = setTimeout(async function() {
                var q = input.value.trim();
                if (q.length < 2) {
                    results.classList.remove("visible");
                    return;
                }
                var items = await self.search(q);
                if (items.length === 0) {
                    results.classList.remove("visible");
                    return;
                }
                results.innerHTML = "";
                items.forEach(function(item) {
                    var div = document.createElement("div");
                    div.className = "search-result-item";
                    div.textContent = item.name;
                    div.addEventListener("click", function() {
                        self.setPin(item.lat, item.lon);
                        self.flyTo(item.lat, item.lon);
                        self._fireSelect(item.lat, item.lon);
                        results.classList.remove("visible");
                        input.value = "";
                    });
                    results.appendChild(div);
                });
                results.classList.add("visible");
            }, 400);
        });

        document.addEventListener("click", function(e) {
            if (!input.contains(e.target) && !results.contains(e.target)) {
                results.classList.remove("visible");
            }
        });
    },
};
