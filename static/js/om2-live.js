/* ==========================================================================
   OpenMobile-2 — live simulator card
   Mounts the browser-hosted simulator (a static build served from sim/,
   same origin) inside a phone frame when the visitor powers it on, and
   drives it through the window API the simulator exposes (__OS__, __SIM__).
   The screen is rendered at the simulator's logical size (360 x 800) and the
   whole phone is scaled to fit, so the device never letterboxes or scrolls
   sideways. Prototype: the build is the public MobileGym base.
   ========================================================================== */
(function () {
  "use strict";
  var W = window.OM2Widgets = window.OM2Widgets || {};
  var SCREEN_W = 360, SCREEN_H = 800, BEZEL = 10;
  /* the three-button navigation bar sits under the app area, like a phone
     with button navigation: it never covers an app's own bottom bar */
  var NAV_H = 36;
  var PHONE_W = SCREEN_W + 2 * BEZEL, PHONE_H = SCREEN_H + NAV_H + 2 * BEZEL;

  function h(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function svg(paths, size, fill) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", fill || "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.8");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    if (size) { s.setAttribute("width", size); s.setAttribute("height", size); }
    paths.forEach(function (d) {
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      s.appendChild(p);
    });
    return s;
  }
  var ICONS = {
    power: ["M12 3v8", "M18.4 6.6a9 9 0 1 1-12.8 0"],
    reset: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"],
    /* Android three-button navigation */
    navBack: ["M15 5.5 7.5 12l7.5 6.5z"],
    navHome: ["M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z"],
    navRecents: ["M5.5 5.5h13v13h-13z"]
  };

  /* Inside the iframe, scrollIntoView and focus() bubble up to the parent
     page and yank it around. Same origin lets us confine both to the nearest
     scrollable ancestor inside the simulator (the MobileGym demo does the
     same), and keep the document itself from scrolling sideways. */
  function confineScrolling(iframe) {
    var win = iframe.contentWindow, doc = iframe.contentDocument;
    if (!win || !doc || win.__om2ScrollPatched) return;
    win.__om2ScrollPatched = true;
    try { doc.documentElement.style.overflowX = "hidden"; } catch (e) { /* noop */ }
    /* the simulator draws its own text-selection handles and leaves them in
       place when a field loses focus (keyboard closed, app left); collapsing
       the selection as the field blurs makes them go away */
    function collapseSelection(t) {
      if (win.__om2NoCollapse) return; /* test switch */
      if (!t || !(t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      try {
        if (t.selectionStart !== t.selectionEnd) {
          t.setSelectionRange(t.selectionEnd, t.selectionEnd);
          doc.dispatchEvent(new win.Event("selectionchange"));
        }
      } catch (err) { /* inputs without a selection range */ }
    }
    doc.addEventListener("focusout", function (e) { collapseSelection(e.target); }, true);
    doc.addEventListener("pointerdown", function (e) {
      var a = doc.activeElement;
      if (a && a !== e.target && !a.contains(e.target)) collapseSelection(a);
    }, true);
    var El = win.Element, HEl = win.HTMLElement;
    if (!El || !HEl) return;
    El.prototype.scrollIntoView = function (arg) {
      var view = this.ownerDocument && this.ownerDocument.defaultView;
      if (!view) return;
      var t = this.parentElement;
      while (t && t !== this.ownerDocument.documentElement) {
        var cs = view.getComputedStyle(t);
        if (/(auto|scroll|overlay)/.test(cs.overflowY) && t.scrollHeight > t.clientHeight) break;
        t = t.parentElement;
      }
      if (!t || t === this.ownerDocument.documentElement) return;
      var opts = (typeof arg === "object" && arg) || {};
      var block = arg === false ? "end" : (opts.block || (arg === true ? "start" : "nearest"));
      var er = this.getBoundingClientRect(), tr = t.getBoundingClientRect();
      var top = er.top - tr.top + t.scrollTop, next = t.scrollTop;
      if (block === "start") next = top;
      else if (block === "end") next = top - t.clientHeight + er.height;
      else if (block === "center") next = top - t.clientHeight / 2 + er.height / 2;
      else if (top < t.scrollTop) next = top;
      else if (top + er.height > t.scrollTop + t.clientHeight) next = top - t.clientHeight + er.height;
      t.scrollTop = Math.max(0, next);
    };
    var origFocus = HEl.prototype.focus;
    HEl.prototype.focus = function (o) {
      var opts = (typeof o === "object" && o) || {};
      opts.preventScroll = true;
      return origFocus.call(this, opts);
    };
  }

  /* English by default: the simulator keeps the language in its OS state. */
  function applyLocale(win, locale) {
    try {
      if (win.__OS__ && win.__OS__.locale && win.__OS__.locale.setLocale) win.__OS__.locale.setLocale(locale);
      if (win.__SIM__ && win.__SIM__.setState) {
        win.__SIM__.setState({ os: { settings: { global: { language: locale } } } });
      }
    } catch (e) { if (window.console) console.warn("[om2-live] locale", e); }
  }

  /* Preset location and weather: the base simulator has no weather key, so
     its launcher widget sits on "Locating" with 0 degrees. We pin the device
     to one place and fill the located city from the library's own template. */
  var WEATHER_DEFAULT = {
    city: "Mountain View", lat: 37.3861, lon: -122.0839,
    temp: 21, feelsLike: 20, high: 24, low: 13, text: "Sunny", icon: "100",
    aqi: 32, humidity: 55, windDir: "W", windScale: "2", windSpeed: "9"
  };
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function isoDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function isoTime(d) { return isoDate(d) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + "-07:00"; }
  function applyPreset(win, wx) {
    try {
      if (win.__SIM_LOCATION__ && win.__SIM_LOCATION__.setSimulatedLocation) {
        win.__SIM_LOCATION__.setSimulatedLocation({ latitude: wx.lat, longitude: wx.lon, accuracy: 100 });
      }
      var st = win.__SIM__.getState();
      var lib = st && st.apps && st.apps.weather && st.apps.weather.weatherLibrary;
      var tpl = lib && (lib.located || lib.sanya || lib.beijing);
      if (!tpl || !tpl.bundle) return;
      var b = JSON.parse(JSON.stringify(tpl.bundle));
      var now = new Date(win.__SIM_TIME__ && win.__SIM_TIME__.now ? win.__SIM_TIME__.now() : Date.now());
      var swing = [0, 1, -1, 2, 0, -2, 1, 0, -1, 2, 1, 0, -1, 1, 0];
      b.now = b.now || {};
      b.now.obsTime = isoTime(now);
      b.now.temp = String(wx.temp); b.now.feelsLike = String(wx.feelsLike);
      b.now.text = wx.text; b.now.icon = wx.icon;
      b.now.humidity = String(wx.humidity); b.now.windDir = wx.windDir;
      b.now.windScale = wx.windScale; b.now.windSpeed = wx.windSpeed; b.now.precip = "0.0";
      (b.daily || []).forEach(function (day, i) {
        var d = new Date(now.getTime() + i * 864e5);
        day.fxDate = isoDate(d);
        day.tempMax = String(wx.high + (i ? swing[i % swing.length] : 0));
        day.tempMin = String(wx.low + (i ? swing[(i + 3) % swing.length] : 0));
        day.textDay = wx.text; day.iconDay = wx.icon; day.textNight = "Clear"; day.iconNight = "150";
        day.sunrise = "07:10"; day.sunset = "18:45"; day.precip = "0.0"; day.humidity = String(wx.humidity);
      });
      (b.hourly || []).forEach(function (h, i) {
        var d = new Date(now.getTime() + (i + 1) * 36e5);
        var hour = d.getHours();
        var t = wx.low + (wx.high - wx.low) * (0.5 - 0.5 * Math.cos((hour - 5) / 24 * 2 * Math.PI));
        h.fxTime = isoTime(d); h.temp = String(Math.round(t));
        h.text = hour >= 7 && hour <= 18 ? wx.text : "Clear"; h.icon = hour >= 7 && hour <= 18 ? wx.icon : "150";
        h.precip = "0.0"; h.pop = "0";
      });
      b.airQuality = b.airQuality || {};
      b.airQuality.aqi = String(wx.aqi); b.airQuality.category = "Good"; b.airQuality.level = "1";
      b.warnings = []; b.minutely = []; delete b.forecastKeypoint;
      win.__SIM__.setState({ apps: { weather: {
        selectedCityId: "located",
        bundlesByCityId: { located: { locationName: wx.city, lonLat: wx.lon + "," + wx.lat, bundle: b } }
      } } }, { deep: true });
    } catch (e) { if (window.console) console.warn("[om2-live] preset", e); }
  }

  W.liveSim = function (target, opts) {
    var host = typeof target === "string" ? document.querySelector(target) : target;
    if (!host) return null;
    opts = opts || {};
    var src = opts.src || "sim/";
    var apps = opts.apps || [];
    var locale = opts.locale || "en";
    var weather = opts.weather || WEATHER_DEFAULT;
    var state = { on: false, ready: false, iframe: null, timer: null, scale: 1 };

    var root = h("div", "lv", host);
    var stage = h("div", "lv-stage", root);
    var scaler = h("div", "lv-scaler", stage);
    h("span", "lv-blob lv-blob-a", scaler); h("span", "lv-blob lv-blob-b", scaler); h("span", "lv-ground", scaler);
    var phone = h("div", "lv-phone", scaler);
    h("span", "lv-sbtn lv-vol1", phone); h("span", "lv-sbtn lv-vol2", phone); h("span", "lv-sbtn lv-power", phone);
    var bezel = h("div", "lv-bezel", phone);
    var screen = h("div", "lv-screen", bezel);
    var off = h("div", "lv-off", screen);
    var boot = h("button", "lv-boot", off);
    boot.type = "button"; boot.setAttribute("aria-label", "Power on the simulator");
    boot.appendChild(svg(ICONS.power, 26));
    h("span", "lv-boot-label", off, "Power on");
    var loading = h("div", "lv-loading", screen);
    h("span", "lv-spinner", loading); h("span", null, loading, "Starting up");

    /* three-button navigation, floating over the bottom of the screen; the
       strip itself lets pointer events through so the simulator's own
       swipe gestures keep working around the buttons */
    var nav = h("div", "lv-nav", screen);
    function navKey(name, label, fn) {
      var b = h("button", "lv-nav-key", nav);
      b.type = "button"; b.setAttribute("aria-label", label); b.title = label;
      b.appendChild(svg(ICONS[name], 16, name === "navBack" ? "currentColor" : "none"));
      b.addEventListener("click", fn);
      return b;
    }
    navKey("navBack", "Back", function () { call(function (os) { os.handleBack(); }); logAction("system_button", "Back"); });
    navKey("navHome", "Home", function () { call(function (os) { os.goHome(); }); logAction("system_button", "Home"); });
    navKey("navRecents", "Recents", function () { call(function (os) { os.showRecents(); }); logAction("system_button", "Recents"); });
    var sheen = h("span", "lv-sheen", screen); sheen.setAttribute("aria-hidden", "true");

    var side = h("div", "lv-side", root);
    var status = h("div", "lv-status", side);
    var stApp = h("span", "lv-st-app", status, "off");
    var stRoute = h("span", "lv-st-route", status, "");
    var stPlace = h("span", "lv-st-place", status, weather.city + " \u00b7 " + weather.temp + "\u00b0 " + weather.text);
    var keys = h("div", "lv-keys", side);
    function key(name, label, fn, cls) {
      var b = h("button", "wt-btn lv-key" + (cls ? " " + cls : ""), keys);
      b.type = "button"; b.setAttribute("aria-label", label); b.title = label;
      b.appendChild(svg(ICONS[name], 15));
      h("span", null, b, label);
      b.addEventListener("click", fn);
      return b;
    }
    key("reset", "Reset", function () {
      var sim = state.iframe && state.iframe.contentWindow && state.iframe.contentWindow.__SIM__;
      if (sim && sim.reset) { setReady(false); sim.reset(); }
    });
    key("power", "Power off", function () { powerOff(); state.wasOff = true; }, "lv-key-off");

    /* chips: a featured row, then every app in the build grouped by domain
       behind a toggle (opts.apps = the full list, opts.featured = ids) */
    function chip(a, parent) {
      var c = h("button", "wt-tab lv-app", parent);
      c.type = "button";
      var label = a.label || a.name || a.id;
      if (a.pkg && opts.iconBase && a.icon !== false) {
        var img = h("img", "lv-app-ico", c);
        img.alt = ""; img.width = 18; img.height = 18; img.loading = "lazy";
        img.src = opts.iconBase + a.pkg + ".png";
        img.addEventListener("error", function () { img.remove(); });
      } else if (a.color) {
        /* apps whose launcher icon is drawn in code: a tile in the app's own colour */
        var tile = h("i", "lv-app-tile", c, label[0]);
        tile.setAttribute("aria-hidden", "true");
        tile.style.background = a.color;
        if (a.fg) tile.style.color = a.fg;
      }
      h("span", null, c, label);
      c.addEventListener("click", function () { call(function (os) { os.launchApp(a.id); }); logAction("open_app", a.id); });
    }
    if (apps.length) {
      var byId = {};
      apps.forEach(function (a) { byId[a.id] = a; });
      var featured = (opts.featured || []).map(function (id) { return byId[id]; }).filter(Boolean);
      if (!featured.length) featured = apps;
      h("p", "lv-label", side, "Open an app");
      var chips = h("div", "lv-apps", side);
      featured.forEach(function (a) { chip(a, chips); });
      if (featured.length < apps.length) {
        var more = h("button", "wt-btn lv-apps-more", side, "All " + apps.length + " apps");
        more.type = "button"; more.setAttribute("aria-expanded", "false");
        var all = h("div", "lv-apps-all", side); all.hidden = true;
        var groups = {}, order = [];
        apps.forEach(function (a) {
          var d = a.domain || "other";
          if (!groups[d]) { groups[d] = []; order.push(d); }
          groups[d].push(a);
        });
        order.forEach(function (d) {
          var g = h("div", "lv-app-group", all);
          h("span", "lv-app-dom", g, d.charAt(0).toUpperCase() + d.slice(1));
          var row = h("div", "lv-apps", g);
          groups[d].forEach(function (a) { chip(a, row); });
        });
        more.addEventListener("click", function () {
          var open = all.hidden;
          all.hidden = !open;
          more.setAttribute("aria-expanded", open ? "true" : "false");
          more.textContent = open ? "Fewer apps" : "All " + apps.length + " apps";
        });
      }
    }
    /* two panels tie the phone to the paper: what the policy would emit for
       each touch, and the business state the verifier reads */
    var panels = h("div", "lv-panels", side);
    var agentPanel = h("section", "lv-panel lv-agent", panels);
    var ah = h("div", "lv-panel-head", agentPanel);
    h("h4", null, ah, "Agent action space");
    h("p", null, ah, "Each touch or tool call, as a policy would emit it; touches in the 999 \u00d7 999 space");
    var agentLog = h("ol", "lv-log", agentPanel);
    var agentEmpty = h("p", "lv-empty", agentPanel, "Tap, swipe or type on the phone.");
    var statePanel = h("section", "lv-panel lv-state", panels);
    var sh = h("div", "lv-panel-head", statePanel);
    h("h4", null, sh, "Business state");
    h("p", null, sh, "What the verifier reads: the app\u2019s own objects, not the screen");
    var stateHead = h("div", "lv-state-app", statePanel, "home screen");
    var stateList = h("dl", "lv-kv", statePanel);
    /* the third panel is the paper's hybrid setting, live: the foreground
       app's app-native tools (window.__MOBILE_GYM_TOOLS__ in the build), each
       callable from here, writing the same state the GUI writes */
    var toolsPanel = h("section", "lv-panel lv-tools", panels);
    var th = h("div", "lv-panel-head", toolsPanel);
    h("h4", null, th, "App-native tools");
    h("p", null, th, "What the foreground app exposes besides its screen; a call writes the same state as a tap");
    var toolsHead = h("div", "lv-state-app", toolsPanel, "home screen");
    var toolsList = h("ol", "lv-tool-list", toolsPanel);
    var toolsEmpty = h("p", "lv-empty", toolsPanel, "Open an app to see its tools.");

    var hint = h("p", "lv-hint", side);
    hint.appendChild(svg(["M12 19V8", "M7 13l5-5 5 5"], 14));
    h("span", null, hint, "The phone also answers to gestures: swipe up from the bottom edge for Home, swipe in from a side edge for Back.");
    if (opts.note) h("p", "wt-note lv-note", side, opts.note);

    /* ----- action log ------------------------------------------------- */
    var MAX_LOG = 9, logCount = 0;
    function norm(x, y) {
      return [Math.max(0, Math.min(999, Math.round(x / SCREEN_W * 999))),
              Math.max(0, Math.min(999, Math.round(y / SCREEN_H * 999)))];
    }
    function logAction(name, args, isTool) {
      if (agentEmpty.parentNode) agentEmpty.remove();
      var li = h("li", "lv-log-item" + (isTool ? " is-tool" : ""), agentLog);
      h("span", "lv-log-n", li, String(++logCount));
      h("span", "lv-log-name", li, name);
      h("span", "lv-log-args", li, args);
      while (agentLog.children.length > MAX_LOG) agentLog.removeChild(agentLog.firstChild);
      agentLog.scrollTop = agentLog.scrollHeight;
      scheduleState(320);
    }
    var typeBuf = "", typeTimer = null;
    function flushType() {
      if (typeBuf) { logAction("type", JSON.stringify(typeBuf)); typeBuf = ""; }
      typeTimer = null;
    }
    function attachMonitor(f) {
      var doc = f.contentDocument;
      if (!doc || doc.__om2Monitored) return;
      doc.__om2Monitored = true;
      var down = null, last = null;
      function finish(x, y) {
        if (!down) return;
        var dx = x - down.x, dy = y - down.y, dt = Date.now() - down.t;
        var a = norm(down.x, down.y), b = norm(x, y);
        if (Math.sqrt(dx * dx + dy * dy) > 24) logAction("swipe", "[" + a + "] \u2192 [" + b + "]");
        else if (dt > 500) logAction("long_press", "[" + a + "]");
        else logAction("click", "[" + a + "]");
        down = null;
      }
      doc.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        down = { x: e.clientX, y: e.clientY, t: Date.now() };
        last = { x: e.clientX, y: e.clientY };
      }, true);
      doc.addEventListener("pointermove", function (e) {
        if (down) last = { x: e.clientX, y: e.clientY };
      }, true);
      doc.addEventListener("pointerup", function (e) { finish(e.clientX, e.clientY); }, true);
      /* a scroll container that captures the pointer ends the gesture with a
         cancel; the last seen position is where the finger lifted */
      doc.addEventListener("pointercancel", function () { if (down && last) finish(last.x, last.y); }, true);
      /* wheel or trackpad scrolling has no finger: the equivalent action is a
         swipe in the opposite direction of the content movement, so a scroll
         burst is collected and logged once */
      var wheel = null, wheelTimer = null;
      function flushWheel() {
        var a = wheel; wheel = null;
        if (!a || (Math.abs(a.dx) < 12 && Math.abs(a.dy) < 12)) return;
        /* a finger travels at most about half a screen in one swipe */
        var cap = function (v, m) { return Math.max(-m, Math.min(m, v)); };
        var ex = Math.max(0, Math.min(SCREEN_W, a.x - cap(a.dx, SCREEN_W * 0.5)));
        var ey = Math.max(0, Math.min(SCREEN_H, a.y - cap(a.dy, SCREEN_H * 0.5)));
        logAction("swipe", "[" + norm(a.x, a.y) + "] \u2192 [" + norm(ex, ey) + "]");
      }
      doc.addEventListener("wheel", function (e) {
        if (!wheel) wheel = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
        wheel.dx += e.deltaX; wheel.dy += e.deltaY;
        clearTimeout(wheelTimer); wheelTimer = setTimeout(flushWheel, 260);
      }, { capture: true, passive: true });
      doc.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { flushType(); logAction("system_button", "Enter"); return; }
        if (e.key === "Backspace") { typeBuf = typeBuf.slice(0, -1); return; }
        if (e.key.length !== 1 || e.metaKey || e.ctrlKey) return;
        typeBuf += e.key;
        clearTimeout(typeTimer); typeTimer = setTimeout(flushType, 900);
      }, true);
    }

    /* ----- business state --------------------------------------------- */
    var stateTimer = null, lastSummary = {}, lastApp = null;
    function summarize(v) {
      if (v == null) return "\u2014";
      if (Array.isArray(v)) return v.length + (v.length === 1 ? " item" : " items");
      if (typeof v === "object") { var k = Object.keys(v).length; return k + (k === 1 ? " field" : " fields"); }
      if (typeof v === "string") return v.length > 28 ? v.slice(0, 27) + "\u2026" : (v || "\u201c\u201d");
      return String(v);
    }
    function pickKeys(obj) {
      var keys = Object.keys(obj).filter(function (k) { return k.charAt(0) !== "_" && k !== "version" && k !== "settings"; });
      var score = function (k) { var v = obj[k]; return Array.isArray(v) ? 3 : typeof v === "number" ? 2 : typeof v === "string" ? 1 : 0; };
      keys.sort(function (a, b) { return score(b) - score(a); });
      return keys.slice(0, 7);
    }
    /* ----- app-native tools ------------------------------------------- */
    var toolsApp = null; /* null = nothing rendered yet */
    function toolApi() {
      var w = state.iframe && state.iframe.contentWindow;
      return w && w.__MOBILE_GYM_TOOLS__;
    }
    function compactArgs(args) {
      return Object.keys(args).map(function (k) { return k + "=" + JSON.stringify(args[k]); }).join(", ");
    }
    function trimJSON(v, max) {
      var t; try { t = JSON.stringify(v, null, 1); } catch (e) { t = String(v); }
      return t.length > max ? t.slice(0, max) + "\u2026" : t;
    }
    function toolForm(d, form) {
      var schema = d.inputSchema || {}, props = schema.properties || {}, req = schema.required || [];
      var fields = [];
      Object.keys(props).forEach(function (k) {
        var pr = props[k] || {}, type = Array.isArray(pr.type) ? pr.type[0] : pr.type;
        var lab = h("label", "lv-tool-field", form);
        h("span", null, lab, k + (req.indexOf(k) >= 0 ? " *" : "") + (type ? " \u00b7 " + type : ""));
        var inp = document.createElement("input");
        if (type === "boolean") inp.type = "checkbox";
        else { inp.type = type === "number" || type === "integer" ? "number" : "text"; inp.placeholder = pr.description || (pr.enum ? pr.enum.join(" | ") : ""); }
        if (pr.default !== undefined && type !== "boolean") inp.value = pr.default;
        lab.appendChild(inp);
        fields.push({ key: k, type: type, input: inp });
      });
      var run = h("div", "lv-tool-run", form);
      var go = h("button", "wt-btn is-tool", run, "Call " + d.name.split("__").slice(1).join("__"));
      go.type = "button";
      var status = h("span", "lv-tool-status", run);
      var out = h("pre", "lv-tool-out", form); out.hidden = true;
      go.addEventListener("click", function () {
        var api = toolApi(); if (!api) return;
        var args = {};
        fields.forEach(function (f) {
          if (f.type === "boolean") { if (f.input.checked) args[f.key] = true; return; }
          var v = f.input.value;
          if (v === "") return;
          if (f.type === "number" || f.type === "integer") { var n = Number(v); if (!isNaN(n)) args[f.key] = n; return; }
          if (f.type === "array" || f.type === "object") { try { args[f.key] = JSON.parse(v); return; } catch (e) { /* keep as text */ } }
          args[f.key] = v;
        });
        logAction(d.name, compactArgs(args), true);
        status.textContent = "\u2026"; status.className = "lv-tool-status";
        var p; try { p = Promise.resolve(api.callTool(d.name, args)); } catch (e) { p = Promise.reject(e); }
        p.then(function (res) {
          var ok = res && res.ok !== false;
          status.textContent = ok ? "ok" : "error"; status.className = "lv-tool-status " + (ok ? "is-ok" : "is-err");
          out.textContent = trimJSON(ok ? res.output : (res && res.error) || res, 900); out.hidden = false;
        }, function (err) {
          status.textContent = "error"; status.className = "lv-tool-status is-err";
          out.textContent = String(err && err.message || err); out.hidden = false;
        });
        scheduleState(300);
      });
    }
    function effectTag(d) {
      var a = d.annotations || {};
      if (a.uiEffect === "navigation") return "opens a screen";
      if (a.uiEffect === "draft") return "prefills a form";
      return a.readOnlyHint ? "reads" : "writes state";
    }
    function closeTools() {
      Array.prototype.forEach.call(toolsList.querySelectorAll(".lv-tool-form"), function (f) { f.hidden = true; f.innerHTML = ""; });
      Array.prototype.forEach.call(toolsList.querySelectorAll(".lv-tool-btn"), function (b) { b.setAttribute("aria-expanded", "false"); });
    }
    function toolRow(d) {
      var li = h("li", "lv-tool", toolsList);
      var btn = h("button", "lv-tool-btn", li);
      btn.type = "button"; btn.setAttribute("aria-expanded", "false");
      h("span", "lv-tool-name", btn, d.name.split("__").slice(1).join("__") || d.name);
      h("span", "lv-tool-tag", btn, effectTag(d));
      h("span", "lv-tool-desc", btn, d.description || "");
      var form = h("div", "lv-tool-form", li); form.hidden = true;
      btn.addEventListener("click", function () {
        var open = form.hidden;
        closeTools();
        if (open) { toolForm(d, form); form.hidden = false; btn.setAttribute("aria-expanded", "true"); }
      });
    }
    function renderTools(appId) {
      appId = appId || "";
      if (appId === toolsApp && (toolsList.children.length || toolsEmpty.parentNode)) return;
      toolsApp = appId;
      while (toolsList.firstChild) toolsList.removeChild(toolsList.firstChild);
      var api = toolApi(), defs = [];
      try { defs = api ? (appId ? api.listTools({ app: appId }) : api.listTools()) : []; } catch (e) { defs = []; }
      if (!appId) {
        var apps = {}; defs.forEach(function (d) { apps[d.app] = 1; });
        /* the tool registry can appear a moment after boot: keep retrying
           the home-screen line until it answers */
        if (!defs.length) toolsApp = null;
        toolsHead.textContent = "home screen";
        toolsEmpty.textContent = defs.length
          ? "Open an app to see its tools: " + defs.length + " across " + Object.keys(apps).length + " apps in this build."
          : "Open an app to see its tools.";
        toolsPanel.appendChild(toolsEmpty);
        return;
      }
      toolsHead.textContent = "apps." + appId;
      if (!defs.length) {
        toolsEmpty.textContent = "No app-native tools here; this app is GUI-only.";
        toolsPanel.appendChild(toolsEmpty);
        return;
      }
      if (toolsEmpty.parentNode) toolsEmpty.remove();
      defs.forEach(toolRow);
    }

    function refreshState() {
      var w = state.iframe && state.iframe.contentWindow;
      if (!w || !w.__SIM__ || !w.__OS__) return;
      var route = null;
      try { route = w.__OS__.getAppRoute(); } catch (e) { /* noop */ }
      var appId = route && route.app;
      stApp.textContent = appId || "home";
      renderTools(appId);
      stRoute.textContent = route && route.path && route.path !== "/" ? route.path : "";
      var st; try { st = w.__SIM__.getState(); } catch (e) { return; }
      var rows = [];
      if (appId && st.apps && st.apps[appId]) {
        var a = st.apps[appId];
        pickKeys(a).forEach(function (k) { rows.push([k, summarize(a[k])]); });
        stateHead.textContent = "apps." + appId;
      } else {
        var os = st.os || {};
        var clip = os.clipboard && (os.clipboard.text || os.clipboard.content || os.clipboard.value);
        rows.push(["clipboard", clip ? summarize(String(clip)) : "empty"]);
        rows.push(["notifications", summarize(os.notifications && (os.notifications.items || os.notifications.list || os.notifications))]);
        rows.push(["apps with state", summarize(Object.keys(st.apps || {}))]);
        stateHead.textContent = "os";
      }
      var changed = appId !== lastApp;
      lastApp = appId;
      while (stateList.firstChild) stateList.removeChild(stateList.firstChild);
      var next = {};
      rows.forEach(function (r) {
        next[r[0]] = r[1];
        var dt = h("dt", null, stateList, r[0]);
        var dd = h("dd", null, stateList, r[1]);
        if (!changed && lastSummary[r[0]] !== undefined && lastSummary[r[0]] !== r[1]) { dd.classList.add("is-changed"); }
      });
      lastSummary = next;
    }
    /* refresh twice after an action: once for immediate state writes, once
       after the app has had time to open and settle */
    function scheduleState(ms) {
      clearTimeout(stateTimer);
      stateTimer = setTimeout(function () { refreshState(); stateTimer = setTimeout(refreshState, 1100); }, ms || 0);
    }
    setInterval(function () { if (state.ready && !document.hidden) refreshState(); }, 2500);

    function call(fn) {
      var os = state.iframe && state.iframe.contentWindow && state.iframe.contentWindow.__OS__;
      if (!os) return;
      try { fn(os); } catch (e) { if (window.console) console.warn("[om2-live]", e); }
      try { state.iframe.contentWindow.focus(); } catch (e) { /* noop */ }
    }
    function setReady(v) {
      state.ready = v;
      root.classList.toggle("is-ready", v);
    }
    function powerOn() {
      if (state.on) return;
      state.on = true;
      root.classList.add("is-on");
      var f = document.createElement("iframe");
      f.className = "lv-frame";
      f.title = "Live simulator";
      f.setAttribute("allow", "clipboard-write");
      f.width = SCREEN_W; f.height = SCREEN_H;
      f.src = src;
      f.addEventListener("load", function () {
        confineScrolling(f);
        /* the window API appears once the app has booted; poll briefly */
        var tries = 0;
        clearInterval(state.timer);
        state.timer = setInterval(function () {
          var w = f.contentWindow;
          if (w && w.__OS__ && w.__SIM__) {
            clearInterval(state.timer);
            applyLocale(w, locale);
            applyPreset(w, weather);
            attachMonitor(f);
            setReady(true);
            scheduleState(600);
          } else if (++tries > 120) { clearInterval(state.timer); setReady(true); }
        }, 50);
      });
      screen.appendChild(f);
      state.iframe = f;
    }
    function powerOff() {
      if (!state.on) return;
      clearInterval(state.timer);
      if (state.iframe) { state.iframe.remove(); state.iframe = null; }
      state.on = false;
      setReady(false);
      root.classList.remove("is-on");
      stApp.textContent = "off"; stRoute.textContent = "";
      toolsApp = null; while (toolsList.firstChild) toolsList.removeChild(toolsList.firstChild);
      toolsHead.textContent = "home screen"; toolsEmpty.textContent = "Open an app to see its tools."; toolsPanel.appendChild(toolsEmpty);
    }
    boot.addEventListener("click", function () { state.wasOff = false; powerOn(); });

    /* scale the phone to the space it has; the layout box follows the scale */
    function fit() {
      var w = root.clientWidth || host.clientWidth || PHONE_W;
      var stacked = w < 760;
      root.classList.toggle("is-stacked", stacked);
      var avail = stacked ? w : Math.max(PHONE_W * 0.72, Math.min(PHONE_W, w - 340));
      var s = Math.min(1, avail / PHONE_W);
      state.scale = s;
      scaler.style.transform = "scale(" + s.toFixed(4) + ")";
      stage.style.width = Math.round(PHONE_W * s) + "px";
      stage.style.height = Math.round(PHONE_H * s) + "px";
    }
    fit();
    if ("ResizeObserver" in window) new ResizeObserver(fit).observe(root);
    else window.addEventListener("resize", fit);

    /* the phone is on by default: it boots as the card approaches the
       viewport, and powers off after a while out of view to save CPU. The
       power button stays as the way back after a power-off. */
    var autoOn = opts.autoOn !== false;
    function nearViewport() {
      var r = root.getBoundingClientRect();
      return r.bottom > -320 && r.top < (window.innerHeight || 0) + 320;
    }
    if ("IntersectionObserver" in window) {
      var away = null;
      new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (en.isIntersecting) {
            clearTimeout(away); away = null;
            if (autoOn && !state.on && !state.wasOff) powerOn();
          } else if (state.on && !away) {
            away = setTimeout(function () {
              away = null;
              if (!nearViewport()) { powerOff(); state.wasOff = false; }
            }, 90000);
          }
        });
      }, { rootMargin: "320px 0px", threshold: 0 }).observe(root);
    } else if (autoOn) {
      powerOn();
    }
    /* IntersectionObserver callbacks wait for a rendering step, which a
       background tab may not get; a geometry check on scroll covers that. */
    function autoCheck() {
      if (!autoOn || state.on || state.wasOff) return;
      if (nearViewport()) powerOn();
    }
    if (autoOn) {
      var pending = null;
      var onScroll = function () {
        if (pending) return;
        pending = setTimeout(function () { pending = null; autoCheck(); }, 120);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      setTimeout(autoCheck, 0);
    }

    return {
      el: root,
      powerOn: powerOn,
      powerOff: powerOff,
      os: function () { return state.iframe && state.iframe.contentWindow && state.iframe.contentWindow.__OS__ || null; },
      destroy: function () { powerOff(); root.remove(); }
    };
  };
})();
