/* ==========================================================================
   OpenMobile-2 — app wall
   Hero key art: a rendered phone whose screen holds every app in the
   playground as an icon, grouped and coloured by domain. Reads window.OM2
   (om2-data.js).

   OM2Widgets.appWall(elOrSelector, opts) -> { el, update(opts), destroy() }
   opts: apps, domains (default OM2.*), interval (ms, 2800), autoplay (true),
         pin (domain key), maxWidth (px, 360; null fills the container),
         aspect (optional outer width / height; default fits a 9/20 screen), minCols (8), maxCols (12),
         clock ("9:41"), labels ({ sim, emu, simKey, emuKey, isNew, system,
         simulated, emulator }).
   ========================================================================== */
(function (global) {
  "use strict";

  var DEFAULTS = {
    apps: null,
    domains: null,
    interval: 2800,
    autoplay: true,
    pin: null,
    maxWidth: 360,
    aspect: null,
    minCols: 8,
    maxCols: 12,
    clock: "9:41",
    onEnter: null,            /* function(screen, lifecycle): creates an inline simulator */
    labels: {
      sim: "MobileGym++ client",
      emu: "Android emulator",
      simKey: "MobileGym++ client",
      emuKey: "Emulator app",
      isNew: "built in this work",
      system: "system client",
      simulated: "simulated",
      emulator: "emulator",
      swipe: "Try MobileGym++",
      swipeHint: "Swipe up or click to play"
    }
  };

  var SVG_NS = "http://www.w3.org/2000/svg";
  var XLINK_NS = "http://www.w3.org/1999/xlink";

  /* status strip: signal bars, Wi-Fi arcs, battery with fill (11 px high) */
  var STATUS_ICONS =
    '<svg viewBox="0 0 12 11" fill="currentColor" aria-hidden="true">' +
      '<rect x="0" y="7" width="2.2" height="4" rx=".6"/><rect x="3.3" y="4.8" width="2.2" height="6.2" rx=".6"/>' +
      '<rect x="6.6" y="2.4" width="2.2" height="8.6" rx=".6"/><rect x="9.9" y="0" width="2.2" height="11" rx=".6" opacity=".35"/></svg>' +
    '<svg viewBox="0 0 15 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M1.2 3.9a9.4 9.4 0 0 1 12.6 0"/><path d="M3.8 6.6a5.6 5.6 0 0 1 7.4 0"/>' +
      '<circle cx="7.5" cy="9.4" r="1.1" fill="currentColor" stroke="none"/></svg>' +
    '<svg viewBox="0 0 23 11" fill="currentColor" aria-hidden="true">' +
      '<rect x=".6" y=".6" width="18.5" height="9.8" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.1"/>' +
      '<rect x="2.3" y="2.3" width="12.6" height="6.4" rx="1.3"/><path d="M20.6 3.6v3.8a1.9 1.9 0 0 0 0-3.8Z" opacity=".55"/></svg>';

  /* 16 x 16 stroke glyphs, one per app icon key (om2-data.js app.icon);
     "default" is the dot a tile gets when neither its icon nor its domain's
     glyph has a symbol. A zero-length "h.01" segment draws a round dot. */
  var GLYPHS = {
    "default": '<circle cx="8" cy="8" r="3.2"/>',
    pin: '<path d="M8 14.3S3.6 10 3.6 6.8a4.4 4.4 0 0 1 8.8 0c0 3.2-4.4 7.5-4.4 7.5Z"/><circle cx="8" cy="6.8" r="1.5"/>',
    map: '<path d="M2.5 4.5 6.2 3l3.6 1.5L13.5 3v8.5L9.8 13 6.2 11.5 2.5 13V4.5Z"/><path d="M6.2 3v8.5M9.8 4.5V13"/>',
    route: '<circle cx="3.6" cy="12.4" r="1.4"/><circle cx="12.4" cy="3.6" r="1.4"/><path d="M4.7 11.3C8 12 8 4 11.3 4.7" stroke-dasharray="2.2 2"/>',
    check: '<rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2.4"/><path d="m5.4 8.2 1.8 1.8 3.5-3.7"/>',
    list: '<path d="M6 4h7.5M6 8h7.5M6 12h7.5"/><path d="M2.7 4h.01M2.7 8h.01M2.7 12h.01"/>',
    play: '<path d="M5.4 3.3v9.4l7.4-4.7-7.4-4.7Z"/>',
    tv: '<rect x="2" y="3" width="12" height="8.5" rx="1.6"/><path d="m5 14.2 1.2-2.7M11 14.2l-1.2-2.7"/>',
    film: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 3v10M11 3v10M2 6.5h3M2 9.5h3M11 6.5h3M11 9.5h3"/>',
    music: '<path d="M6 12.5V4l7-1.5v8"/><circle cx="4.2" cy="12.5" r="1.8"/><circle cx="11.2" cy="10.5" r="1.8"/>',
    mic: '<rect x="5.8" y="2" width="4.4" height="7.5" rx="2.2"/><path d="M3.5 7.8a4.5 4.5 0 0 0 9 0M8 12.3V14M6 14h4"/>',
    book: '<path d="M8 4.5C6.5 3 4 3 2.5 3.5v9c1.5-.5 4-.5 5.5 1 1.5-1.5 4-1.5 5.5-1v-9C12 3 9.5 3 8 4.5Z"/><path d="M8 4.5v9"/>',
    news: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M4.5 5.5h3v3h-3zM9.5 5.5h2M9.5 8.5h2M4.5 11h7"/>',
    chat: '<path d="M8 2.9c-3.3 0-5.9 2.1-5.9 4.7 0 1.5.8 2.8 2.1 3.6l-.7 2.5 2.9-1.3c.5.1 1 .2 1.6.2 3.3 0 5.9-2.1 5.9-4.7S11.3 2.9 8 2.9Z"/>',
    at: '<circle cx="8" cy="8" r="2.6"/><path d="M10.6 8v1.2a1.8 1.8 0 0 0 3.6 0V8a6.2 6.2 0 1 0-2.4 4.9"/>',
    heart: '<path d="M8 13.5S2.5 10 2.5 6.3A2.9 2.9 0 0 1 8 4.8a2.9 2.9 0 0 1 5.5 1.5C13.5 10 8 13.5 8 13.5Z"/>',
    star: '<path d="m8 2.6 1.7 3.6 3.9.5-2.8 2.7.7 3.9L8 11.4l-3.5 1.9.7-3.9L2.4 6.7l3.9-.5L8 2.6Z"/>',
    bag: '<path d="M3.6 5.6h8.8l-.6 7.8H4.2l-.6-7.8Z"/><path d="M5.8 5.6V5a2.2 2.2 0 0 1 4.4 0v.6"/>',
    cart: '<path d="M2 3h2l1.6 7.2h6.8L14 5.2H5"/><circle cx="6.4" cy="13" r="1.1"/><circle cx="11.6" cy="13" r="1.1"/>',
    tag: '<path d="M2.5 2.5h5.3l5.7 5.7-5.3 5.3-5.7-5.7V2.5Z"/><circle cx="5.6" cy="5.6" r="1"/>',
    box: '<path d="M8 2.5 13.5 5.5v5L8 13.5 2.5 10.5v-5L8 2.5Z"/><path d="M2.5 5.5 8 8.5l5.5-3M8 8.5v5"/>',
    plane: '<path d="M13.8 2.4 2.4 7.1l4.8 1.9 1.8 4.8 4.8-11.4Z"/><path d="m7.2 9 6.6-6.6"/>',
    train: '<rect x="3.5" y="2.5" width="9" height="9" rx="2.2"/><path d="M3.5 7h9M6.2 9.8h.01M9.8 9.8h.01"/><path d="m5.2 14 1.1-2.5M10.8 14l-1.1-2.5"/>',
    car: '<path d="m3 9.5 1.4-3.6A1.5 1.5 0 0 1 5.8 5h4.4a1.5 1.5 0 0 1 1.4.9L13 9.5v3H3v-3Z"/><path d="M5.5 11h.01M10.5 11h.01M2 9.5h12"/>',
    bus: '<rect x="2.5" y="2.5" width="11" height="9.5" rx="2"/><path d="M2.5 8h11M8 2.5V8"/><path d="M5.5 10.3h.01M10.5 10.3h.01M4.5 14v-2M11.5 14v-2"/>',
    bed: '<path d="M2.5 13V4.5M2.5 9.5h11v3.5"/><path d="M6.5 9.5V7.2a1.2 1.2 0 0 1 1.2-1.2h4.6a1.2 1.2 0 0 1 1.2 1.2v2.3"/>',
    coin: '<circle cx="8" cy="8" r="5.8"/><path d="m5.7 4.9 2.3 3.3 2.3-3.3M8 8.2v3.4M6.2 8.7h3.6M6.2 10.3h3.6"/>',
    card: '<rect x="2" y="3.5" width="12" height="9" rx="1.8"/><path d="M2 6.8h12M4.5 10h3"/>',
    receipt: '<path d="M3.5 2.5h9v11l-1.5-1.2-1.5 1.2-1.5-1.2-1.5 1.2-1.5-1.2-1.5 1.2v-11Z"/><path d="M6 6h4M6 8.8h4"/>',
    coffee: '<path d="M3 5.5h8v4.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V5.5Z"/><path d="M11 7h1.2a1.6 1.6 0 0 1 0 3.2H11"/><path d="M5.5 2.5v1.2M8.5 2.5v1.2"/>',
    food: '<path d="M4.5 2.5v11M3 2.5v3.3a1.5 1.5 0 0 0 3 0V2.5"/><path d="M11.8 2.5c-1.7 1-2.3 3.4-2.3 6.3h2.3v4.7"/>',
    dumbbell: '<path d="M5.5 8h5"/><path d="M3 5.5h2.5v5H3zM10.5 5.5H13v5h-2.5z"/><path d="M1.8 7v2M14.2 7v2"/>',
    clock: '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.8V8l2.3 1.6"/>',
    calc: '<rect x="3" y="2.5" width="10" height="11" rx="1.8"/><path d="M5.5 6.2h3M7 4.7v3"/><path d="M5.5 10.2h5M5.5 12h5"/>',
    compass: '<circle cx="8" cy="8" r="5.8"/><path d="m10.6 5.4-1.5 4.1-3.7 1.1 1.5-4.1 3.7-1.1Z"/>',
    image: '<rect x="2.5" y="3" width="11" height="10" rx="1.8"/><path d="m2.5 10.5 3-3 3 3 2-2 3 3"/><path d="M10.5 6h.01"/>',
    camera: '<path d="M2.5 5.5h2.6l1.2-1.8h3.4l1.2 1.8h2.6v7.5h-11V5.5Z"/><circle cx="8" cy="9" r="2.2"/>',
    gear: '<circle cx="8" cy="8" r="2.2"/><circle cx="8" cy="8" r="4.6"/><path d="M8 2.2V4M8 12v1.8M2.2 8H4M12 8h1.8M3.9 3.9l1.3 1.3M10.8 10.8l1.3 1.3M3.9 12.1l1.3-1.3M10.8 5.2l1.3-1.3"/>',
    globe: '<circle cx="8" cy="8" r="5.8"/><path d="M2.2 8h11.6M8 2.2c2 2 2 9.6 0 11.6M8 2.2c-2 2-2 9.6 0 11.6"/>',
    palette: '<circle cx="8" cy="8" r="5.8"/><path d="M5.5 8.5h.01M7 5.3h.01M10.3 5.5h.01"/>',
    calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.8"/><path d="M2.5 7h11M5.5 2v3M10.5 2v3"/>',
    phone: '<path d="M4.3 2.5h2.2l1.2 3-1.6 1a7.6 7.6 0 0 0 3.4 3.4l1-1.6 3 1.2v2.2a1.3 1.3 0 0 1-1.4 1.3A10.6 10.6 0 0 1 3 3.9a1.3 1.3 0 0 1 1.3-1.4Z"/>',
    folder: '<path d="M2.5 4.5a1.3 1.3 0 0 1 1.3-1.3h3l1.5 1.6h4.4a1.3 1.3 0 0 1 1.3 1.3v6.1a1.3 1.3 0 0 1-1.3 1.3H3.8a1.3 1.3 0 0 1-1.3-1.3V4.5Z"/>',
    note: '<path d="M3.5 2.5h6l3 3v8h-9v-11Z"/><path d="M9.5 2.5v3h3M6 8.5h4M6 11h4"/>',
    mail: '<rect x="2" y="3.5" width="12" height="9" rx="1.6"/><path d="m2.5 5 5.5 4 5.5-4"/>',
    hash: '<path d="M6.3 2.8 5 13.2M11 2.8 9.7 13.2M3 6h10.5M2.5 10H13"/>',
    video: '<rect x="2" y="4" width="8.5" height="8" rx="1.6"/><path d="m10.5 7 3.5-2v6l-3.5-2"/>',
    pen: '<path d="m3 13 .9-3.4 7.6-7.6a1.5 1.5 0 0 1 2.1 2.1L6 11.7 3 13Z"/><path d="m9.8 3.7 2.5 2.5"/>',
    briefcase: '<rect x="2" y="5" width="12" height="8.5" rx="1.6"/><path d="M5.8 5V3.6A1.1 1.1 0 0 1 6.9 2.5h2.2a1.1 1.1 0 0 1 1.1 1.1V5M2 9h12"/>',
    search: '<circle cx="7" cy="7" r="4.3"/><path d="m10.2 10.2 3.3 3.3"/>',
    download: '<path d="M8 2.5v8M4.8 7.3 8 10.5l3.2-3.2"/><path d="M2.5 11v1.3a1.2 1.2 0 0 0 1.2 1.2h8.6a1.2 1.2 0 0 0 1.2-1.2V11"/>',
    sparkle: '<path d="M8 2.2c.5 3.3 2.5 5.3 5.8 5.8-3.3.5-5.3 2.5-5.8 5.8-.5-3.3-2.5-5.3-5.8-5.8 3.3-.5 5.3-2.5 5.8-5.8Z"/>',
    person: '<circle cx="8" cy="5.3" r="2.8"/><path d="M2.8 13.6a5.2 5.2 0 0 1 10.4 0"/>',
    code: '<path d="m5.3 4.8-3.3 3.2 3.3 3.2M10.7 4.8l3.3 3.2-3.3 3.2M9.3 2.8 6.7 13.2"/>',
    translate: '<path d="m2.2 11.5 2.6-6.5 2.6 6.5M3.4 9.3h2.8"/><path d="M9 4.5h5M11.5 3v1.5M9.5 7c.5 2.2 2.5 4.3 4.5 5.2M13.3 7c-.6 2.3-2.4 4.5-4.3 5.3"/>',
    gamepad: '<rect x="1.8" y="4.5" width="12.4" height="7.5" rx="3"/><path d="M5.3 6.8v3M3.8 8.3h3"/><path d="M10.3 7.5h.01M11.8 9h.01"/>',
    grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><path d="M2.5 10a1 1 0 0 1 1-1H6a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V10ZM9 10a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V10Z"/>',
    sun: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M3.6 12.4l1.3-1.3M11.1 4.9l1.3-1.3"/>',
    x: '<path d="m3.5 3.5 9 9M12.5 3.5l-9 9"/>',
    cap: '<path d="m2 6.5 6-2.7 6 2.7-6 2.7-6-2.7Z"/><path d="M4.8 7.8v3c1.8 1.6 4.6 1.6 6.4 0v-3M14 6.5v3.5"/>',
    cloud: '<path d="M5 13a3.2 3.2 0 0 1-.4-6.4 4.2 4.2 0 0 1 8 1.1A2.7 2.7 0 0 1 12 13H5Z"/>',
    ball: '<circle cx="8" cy="8" r="5.8"/><path d="M3.5 4.5c2.2 1.4 2.2 5.6 0 7M12.5 4.5c-2.2 1.4-2.2 5.6 0 7"/>'
  };

  /* ------------------------------------------------------------- helpers */
  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }

  function options(next, base) {
    var o = extend({}, base || DEFAULTS, next);
    o.labels = extend({}, (base || DEFAULTS).labels, next && next.labels);
    return o;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* the tile colour: the theme's --dom-* variable, the data colour as fallback */
  function colorVar(d) {
    return "var(--dom-" + d.key + (d.color ? ", " + d.color : "") + ")";
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  /* Group by domain in data order; within a domain: new clients, other
     clients, system clients, then emulator apps. Ties keep the data order. */
  function order(apps, domains) {
    var di = {};
    domains.forEach(function (d, i) { di[d.key] = i; });
    function rank(a) {
      if (a.runtime !== "sim") return 3;
      return a.isNew ? 0 : a.isSystem ? 2 : 1;
    }
    return apps
      .map(function (a, i) { return { a: a, i: i }; })
      .filter(function (x) { return Object.prototype.hasOwnProperty.call(di, x.a.domain); })
      .sort(function (x, y) {
        return (di[x.a.domain] - di[y.a.domain]) || (rank(x.a) - rank(y.a)) || (x.i - y.i);
      })
      .map(function (x) { return x.a; });
  }

  /* counts per domain and overall */
  function summarize(apps, domains) {
    var by = {}, all = { total: 0, sim: 0, emu: 0 };
    domains.forEach(function (d) { by[d.key] = { total: 0, sim: 0, emu: 0 }; });
    apps.forEach(function (a) {
      [by[a.domain], all].forEach(function (c) {
        c.total++;
        c[a.runtime === "sim" ? "sim" : "emu"]++;
      });
    });
    return { by: by, all: all };
  }

  /* Square tiles that fill a w x h box: for each column count, the tile is
     the smaller of the width-bound and the height-bound size; the gap scales
     with the tile (4-6 px). Keeps the count with the largest tile. */
  function fit(w, h, n, minC, maxC) {
    var best = null, c, r, g, t;
    for (c = minC; c <= maxC; c++) {
      r = Math.ceil(n / c);
      t = Math.min((w - (c - 1) * 4) / c, (h - (r - 1) * 4) / r);
      g = Math.max(4, Math.min(6, Math.round(t * 0.12)));
      t = Math.floor(Math.min((w - (c - 1) * g) / c, (h - (r - 1) * g) / r));
      if (!best || t > best.tile) best = { cols: c, rows: r, tile: t, gap: g };
    }
    return best;
  }

  function inner(n) {
    var cs = getComputedStyle(n);
    return {
      w: n.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      h: n.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    };
  }

  /* one hidden sprite per widget: a <symbol id="aw-g-<key>"> per icon key */
  function sprite() {
    var wrap = el("div");
    wrap.innerHTML = '<svg class="aw-sprite" aria-hidden="true" focusable="false">' +
      Object.keys(GLYPHS).map(function (k) {
        return '<symbol id="aw-g-' + k + '" viewBox="0 0 16 16" fill="none" stroke="currentColor"' +
          ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + GLYPHS[k] + "</symbol>";
      }).join("") + "</svg>";
    return wrap.firstChild;
  }

  function glyph(key) {
    var g = document.createElementNS(SVG_NS, "svg");
    g.setAttribute("class", "aw-glyph");
    g.setAttribute("aria-hidden", "true");
    var u = document.createElementNS(SVG_NS, "use");
    u.setAttribute("href", "#aw-g-" + key);
    u.setAttributeNS(XLINK_NS, "xlink:href", "#aw-g-" + key);
    g.appendChild(u);
    return g;
  }

  /* --------------------------------------------------------------- build */
  function build(root, o) {
    var data = global.OM2 || {};
    var domains = o.domains || data.domains;
    var apps = o.apps || data.apps;
    if (!domains || !apps) throw new Error("appWall: no app data; load om2-data.js first");

    var L = o.labels;
    var byKey = {}, glyphs = {};
    domains.forEach(function (d) { byKey[d.key] = d; });
    /* symbol for a tile: app.icon, else the domain glyph (OM2.domainGlyph), else a dot */
    var domainGlyph = data.domainGlyph || {};
    function iconKey(a) {
      if (a.icon && GLYPHS[a.icon]) return a.icon;
      var k = domainGlyph[a.domain];
      return (k && GLYPHS[k]) ? k : "default";
    }
    function glyphFor(key) {
      if (!glyphs[key]) glyphs[key] = glyph(key);
      return glyphs[key].cloneNode(true);
    }
    var ordered = order(apps, domains);
    var counts = summarize(ordered, domains);
    var reducedMq = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : null;

    /* ---- markup: stage > float > phone (rail) > bezel > screen */
    root.classList.add("aw");
    root.textContent = "";
    var stage = el("div", "aw-stage");
    var lift = el("div", "aw-float");
    var phone = el("div", "aw-phone");
    var bezel = el("div", "aw-bezel");
    var screen = el("div", "aw-screen");
    var wash = el("i", "aw-wash");
    var status = el("div", "aw-status");
    var clock = el("span", "aw-clock");
    var sig = el("span", "aw-sig");
    var cam = el("i", "aw-cam");
    var wall = el("div", "aw-wall");
    var grid = el("div", "aw-grid");
    var foot = el("div", "aw-foot");
    var dock = el("div", "aw-dock");
    var swipe = el("button", "aw-swipe");
    var swipeIco = el("i", "aw-swipe-ico");
    var capDot = el("i", "aw-dot");
    var capText = el("span", "aw-cap-text");
    var capName = el("b");
    var capRest = el("span");
    var legend = el("div", "wt-legend aw-legend");
    var keys = el("div", "wt-legend aw-keys");
    var tip = el("div", "wt-tip aw-tip");
    var tipName = el("b");
    var tipMeta = el("small");
    var tipDot = el("i", "aw-dot");
    var tipText = el("span");

    sig.innerHTML = STATUS_ICONS;
    status.setAttribute("aria-hidden", "true");
    cam.setAttribute("aria-hidden", "true");
    dock.setAttribute("aria-hidden", "true");
    swipe.type = "button";
    swipe.setAttribute("aria-label", L.swipe + ". " + L.swipeHint);
    swipeIco.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>';
    var swipeCopy = el("span", "aw-swipe-copy");
    swipeCopy.appendChild(el("span", "aw-swipe-text", L.swipe));
    swipeCopy.appendChild(el("span", "aw-swipe-hint", L.swipeHint));
    swipe.appendChild(swipeCopy);
    swipe.appendChild(swipeIco);
    tip.setAttribute("role", "tooltip");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", plural(ordered.length, "app", "apps") + " in the playground, by domain");

    var bands = {}, chips = {};
    domains.forEach(function (d) {
      var b = el("div", "aw-band");
      b.setAttribute("data-dom", d.key);
      bands[d.key] = b;
      grid.appendChild(b);

      var c = counts.by[d.key];
      var chip = el("button", "aw-chip");
      chip.type = "button";
      chip.setAttribute("data-dom", d.key);
      chip.setAttribute("aria-pressed", "false");
      chip.setAttribute("aria-label", d.label + ", " + plural(c.total, "app", "apps"));
      chip.title = summary(c);
      chip.style.setProperty("--aw-c", colorVar(d));
      chip.appendChild(el("i"));
      chip.appendChild(document.createTextNode(d.label));
      chips[d.key] = chip;
      legend.appendChild(chip);
    });
    ordered.forEach(function (a, i) {
      var sim = a.runtime === "sim";
      var t = el("button", "aw-tile " + (sim ? "is-sim" : "is-emu") +
        (a.isNew ? " is-new" : "") + (a.isSystem ? " is-sys" : ""));
      t.type = "button";
      t.setAttribute("data-dom", a.domain);
      t.setAttribute("data-i", String(i));
      t.setAttribute("aria-label", a.name + ", " + meta(a).replace(/ · /g, ", "));
      t.style.setProperty("--aw-c", colorVar(byKey[a.domain]));
      t.style.setProperty("--aw-i", String(i));
      t.appendChild(glyphFor(iconKey(a)));
      bands[a.domain].appendChild(t);
    });
    [["is-sim", L.simKey], ["is-emu", L.emuKey]].forEach(function (k) {
      var s = el("span", "aw-key");
      s.appendChild(el("i", k[0]));
      s.appendChild(document.createTextNode(k[1]));
      keys.appendChild(s);
    });
    ["aw-sbtn aw-sbtn-power", "aw-sbtn aw-sbtn-vol1", "aw-sbtn aw-sbtn-vol2"].forEach(function (cls) {
      phone.appendChild(el("i", cls));
    });

    status.appendChild(clock);
    status.appendChild(sig);
    capText.appendChild(capName);
    capText.appendChild(capRest);
    dock.appendChild(capDot);
    dock.appendChild(capText);
    foot.appendChild(dock);
    foot.appendChild(el("i", "aw-home"));
    wall.appendChild(grid);
    screen.appendChild(wash);
    screen.appendChild(status);
    screen.appendChild(cam);
    /* Put the main action before the icon grid in keyboard navigation. */
    if (typeof o.onEnter === "function") screen.appendChild(swipe);
    screen.appendChild(wall);
    screen.appendChild(foot);
    /* lock screen: time, today's date, a padlock; slides away on unlock */
    var lock = el("div", "aw-lock");
    var lockPad = el("i", "aw-lock-pad");
    lockPad.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.6"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7"/></svg>';
    var lockTime = el("span", "aw-lock-time", o.clock || "");
    var today = new Date();
    var lockDate = el("span", "aw-lock-date", today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
    lock.appendChild(lockPad);
    lock.appendChild(lockTime);
    lock.appendChild(lockDate);
    lock.appendChild(el("i", "aw-lock-home"));
    lock.setAttribute("aria-hidden", "true");
    screen.appendChild(lock);
    bezel.appendChild(screen);
    phone.appendChild(bezel);
    lift.appendChild(phone);
    stage.appendChild(el("i", "aw-blob aw-blob-a"));
    stage.appendChild(el("i", "aw-blob aw-blob-b"));
    stage.appendChild(el("i", "aw-ground"));
    stage.appendChild(lift);
    root.appendChild(stage);
    /* the domain legend and the two keys stay in memory for the state logic
       but are no longer shown under the phone */
    root.appendChild(sprite());
    tipMeta.appendChild(tipDot);
    tipMeta.appendChild(tipText);
    tip.appendChild(tipName);
    tip.appendChild(document.createElement("br"));
    tip.appendChild(tipMeta);
    document.body.appendChild(tip);

    /* ---- text */
    function summary(c) {
      var parts = [];
      if (c.sim) parts.push(c.sim + " " + L.simulated);
      if (c.emu) parts.push(c.emu + " " + L.emulator);
      return plural(c.total, "app", "apps") + " · " + parts.join(", ");
    }
    /* second tooltip line: "MobileGym++ client · Shopping · built in this work" */
    function meta(a) {
      var s = (a.runtime === "sim" ? L.sim : L.emu) + " · " + byKey[a.domain].label;
      if (a.runtime === "sim" && a.isNew) s += " · " + L.isNew;
      else if (a.runtime === "sim" && a.isSystem) s += " · " + L.system;
      return s;
    }
    function setCaption(key) {
      var c = key ? counts.by[key] : counts.all;
      var s = summary(c);
      capDot.style.setProperty("--aw-c", key ? colorVar(byKey[key]) : "var(--accent-400)");
      capName.textContent = key ? byKey[key].label : s.split(" · ")[0];
      capRest.textContent = key ? " · " + s : s.slice(s.indexOf(" · "));
    }

    /* ---- state: hovered/focused tile > legend hover > pinned chip > cycle */
    var cycle = [null].concat(domains.map(function (d) { return d.key; }));
    var ci = 0, timer = null, over = false, pinKey = null, previewKey = null;
    var active = null;            /* { tile, mode: "pointer" | "anchor" } */
    var shownKey;

    function reduced() { return !!(reducedMq && reducedMq.matches); }
    function playing() { return o.autoplay && !entered && !reduced() && !pinKey && !over && !document.hidden; }
    function current() {
      if (active) return active.tile.getAttribute("data-dom");
      if (previewKey) return previewKey;
      if (pinKey) return pinKey;
      return (o.autoplay && !reduced()) ? cycle[ci] : null;
    }
    function tick() { ci = (ci + 1) % cycle.length; apply(); }
    function start() { if (!timer && playing()) timer = setInterval(tick, o.interval); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function sync() { if (playing()) start(); else stop(); apply(); }

    function apply() {
      var key = current();
      if (key === shownKey) return;
      shownKey = key;
      root.classList.toggle("has-focus", !!key);
      domains.forEach(function (d) {
        bands[d.key].classList.toggle("is-on", d.key === key);
        chips[d.key].classList.toggle("is-on", d.key === key);
      });
      root.style.setProperty("--aw-glow", key ? colorVar(byKey[key]) : "var(--accent-400)");
      setCaption(key);
    }
    function setPin(key) {
      pinKey = key && byKey[key] ? key : null;
      domains.forEach(function (d) {
        chips[d.key].setAttribute("aria-pressed", String(d.key === pinKey));
      });
      sync();
    }

    /* ---- tooltip */
    function placeTip(x, y, rect) {
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var vw = global.innerWidth, vh = global.innerHeight, left, top;
      if (rect) {
        left = rect.left + rect.width / 2 - w / 2;
        top = rect.bottom + 10;
        if (top + h > vh - 8) top = rect.top - h - 10;
      } else {
        left = x + 14;
        top = y + 16;
        if (left + w > vw - 8) left = x - w - 14;
        if (top + h > vh - 8) top = y - h - 12;
      }
      tip.style.left = Math.max(8, Math.min(left, vw - w - 8)) + "px";
      tip.style.top = Math.max(8, top) + "px";
    }
    function showTip(tile, mode, x, y) {
      var a = ordered[+tile.getAttribute("data-i")];
      tipName.textContent = a.name;
      tipText.textContent = meta(a);
      tipDot.style.setProperty("--aw-c", colorVar(byKey[a.domain]));
      tip.classList.add("on");
      active = { tile: tile, mode: mode };
      placeTip(x, y, mode === "anchor" ? tile.getBoundingClientRect() : null);
      apply();
    }
    function hideTip(tile) {
      if (tile && active && active.tile !== tile) return;
      tip.classList.remove("on");
      active = null;
      apply();
    }

    /* ---- events: one delegated set on the grid, one on the legend */
    function tileOf(e) { return e.target.closest ? e.target.closest(".aw-tile") : null; }
    function onOver(e) {
      var t = tileOf(e);
      if (t && e.pointerType !== "touch") showTip(t, "pointer", e.clientX, e.clientY);
    }
    function onOut(e) {
      var t = tileOf(e);
      if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) hideTip(t);
    }
    function onMove(e) {
      if (active && active.mode === "pointer") placeTip(e.clientX, e.clientY, null);
    }
    function onFocus(e) {
      var t = tileOf(e);
      if (t && !(active && active.tile === t)) showTip(t, "anchor");
    }
    function onBlur(e) {
      var t = tileOf(e);
      if (t && active && active.tile === t && active.mode === "anchor") hideTip(t);
    }
    function onClick(e) {
      var t = tileOf(e);
      if (!t) return;
      var key = t.getAttribute("data-dom");
      setPin(pinKey === key ? null : key);
    }
    function onChipOver(e) {
      var c = e.target.closest ? e.target.closest(".aw-chip") : null;
      if (c && e.pointerType !== "touch") { previewKey = c.getAttribute("data-dom"); apply(); }
    }
    function onChipOut(e) {
      var c = e.target.closest ? e.target.closest(".aw-chip") : null;
      if (c && !(e.relatedTarget && c.contains(e.relatedTarget))) { previewKey = null; apply(); }
    }
    function onChipClick(e) {
      var c = e.target.closest ? e.target.closest(".aw-chip") : null;
      if (!c) return;
      var key = c.getAttribute("data-dom");
      previewKey = null;
      setPin(pinKey === key ? null : key);
    }
    function onEnter() { over = true; sync(); }
    function onLeave() { over = false; sync(); }
    function onKey(e) {
      if (e.key !== "Escape") return;
      previewKey = null;
      if (active) hideTip();
      setPin(null);
    }
    function onVis() { sync(); }

    /* ---- unlock into a live device in this very screen. No page scrolling. */
    var swipeStart = null, swiped = false, entered = false, simulator = null;
    var wheelTravel = 0, wheelTimer = null;
    function restore() {
      entered = false;
      simulator = null;
      root.classList.remove("is-playing", "is-live");
      wall.inert = false;
      foot.inert = false;
      swipe.inert = false;
      wall.removeAttribute("aria-hidden");
      foot.removeAttribute("aria-hidden");
      swipe.removeAttribute("aria-hidden");
      root.setAttribute("aria-label", "All applications in the playground, coloured by domain");
      sync();
      swipe.focus({ preventScroll: true });
    }
    function enter() {
      if (typeof o.onEnter !== "function" || entered) return;
      clearTimeout(unlockTimer); unlock();
      entered = true;
      hideTip(); stop();
      wall.inert = true;
      foot.inert = true;
      swipe.inert = true;
      wall.setAttribute("aria-hidden", "true");
      foot.setAttribute("aria-hidden", "true");
      swipe.setAttribute("aria-hidden", "true");
      root.classList.add("is-playing");
      root.setAttribute("aria-label", "Interactive MobileGym++ playground");
      try {
        simulator = o.onEnter(screen, {
          onReady: function () { if (entered) root.classList.add("is-live"); },
          onClose: restore
        });
        if (!simulator) restore();
      } catch (err) {
        restore();
        if (global.console) global.console.error("[appWall] onEnter", err);
      }
    }
    function onSwipeDown(e) {
      swiped = false;
      if (entered || (e.pointerType === "mouse" && e.button !== 0)) return;
      swipeStart = { x: e.clientX, y: e.clientY };
      swiped = false;
    }
    function onSwipeMove(e) {
      if (!swipeStart || swiped || entered) return;
      var dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y;
      if (dy < -50 && Math.abs(dy) > Math.abs(dx) * 1.3) {
        swiped = true; swipeStart = null;
        e.preventDefault(); enter();
      }
    }
    function onSwipeEnd() { swipeStart = null; }
    function onSwipeClick(e) {
      /* The pointerup ending a swipe must not activate a tile or a new control. */
      if (swiped) { swiped = false; e.stopPropagation(); e.preventDefault(); }
    }
    function onWheel(e) {
      /* Contain trackpad momentum on the loading layer and navigation bar. */
      if (entered) { e.preventDefault(); return; }
      if (e.deltaY <= 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      wheelTravel += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function () { wheelTravel = 0; }, 220);
      if (wheelTravel > 65) { wheelTravel = 0; enter(); }
    }

    grid.addEventListener("pointerover", onOver);
    grid.addEventListener("pointerout", onOut);
    grid.addEventListener("pointermove", onMove);
    grid.addEventListener("focusin", onFocus);
    grid.addEventListener("focusout", onBlur);
    grid.addEventListener("click", onClick);
    legend.addEventListener("pointerover", onChipOver);
    legend.addEventListener("pointerout", onChipOut);
    legend.addEventListener("click", onChipClick);
    phone.addEventListener("pointerenter", onEnter);
    phone.addEventListener("pointerleave", onLeave);
    if (typeof o.onEnter === "function") {
      screen.addEventListener("wheel", onWheel, { passive: false });
      screen.addEventListener("pointerdown", onSwipeDown);
      screen.addEventListener("pointermove", onSwipeMove);
      screen.addEventListener("pointerup", onSwipeEnd);
      global.addEventListener("pointerup", onSwipeEnd);
      global.addEventListener("pointercancel", onSwipeEnd);
      screen.addEventListener("pointercancel", onSwipeEnd);
      screen.addEventListener("click", onSwipeClick, true);
      swipe.addEventListener("click", function (e) { e.stopPropagation(); enter(); });
    }
    root.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);
    if (reducedMq) {
      if (reducedMq.addEventListener) reducedMq.addEventListener("change", onVis);
      else if (reducedMq.addListener) reducedMq.addListener(onVis);
    }

    /* ---- unlock: a beat after the page opens (at once under reduced motion) */
    function unlock() { root.classList.add("is-unlocked"); }
    var unlockTimer = setTimeout(unlock, reduced() ? 0 : 1100);
    lock.addEventListener("click", function () { clearTimeout(unlockTimer); unlock(); });

    /* ---- sizing. The stage width sets --aw-w (radii, bezel, dock type);
       the wall's content box, which the status strip and dock shrink,
       decides columns and tile size. Observing both keeps each callback
       from resizing its own target. */
    var layout = null;
    function setWidth(w) {
      if (w > 0) root.style.setProperty("--aw-w", String(Math.round(w)));
    }
    function fitGrid() {
      var b = inner(wall);
      if (b.w < 40 || b.h < 40) return;
      var f = fit(b.w, b.h, ordered.length, o.minCols, o.maxCols);
      if (!f || f.tile < 6) return;
      layout = f;
      grid.style.setProperty("--aw-cols", String(f.cols));
      grid.style.setProperty("--aw-tile", f.tile + "px");
      grid.style.setProperty("--aw-gap", f.gap + "px");
    }
    function relayout() { setWidth(stage.clientWidth); fitGrid(); }
    function onResize(entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].target === stage) setWidth(entries[i].contentRect.width);
        else fitGrid();
      }
    }
    var ro = null;
    if ("ResizeObserver" in global) {
      ro = new global.ResizeObserver(onResize);
      ro.observe(stage);
      ro.observe(wall);
    } else {
      global.addEventListener("resize", relayout);
    }

    /* ---- options that apply without a rebuild */
    function applyOptions(next, changed) {
      o = next;
      stage.style.maxWidth = o.maxWidth ? o.maxWidth + "px" : "none";
      phone.style.aspectRatio = typeof o.aspect === "number" ? String(o.aspect) : (o.aspect || "");
      clock.textContent = o.clock || "";
      clock.style.visibility = o.clock ? "" : "hidden";
      if (changed && changed.interval !== undefined) stop();
      if (!changed || changed.pin !== undefined) setPin(o.pin);
      else sync();
      relayout();
    }
    applyOptions(o);

    return {
      layout: function () { return layout; },
      options: applyOptions,
      destroy: function () {
        clearTimeout(unlockTimer);
        clearTimeout(wheelTimer);
        if (simulator) simulator.destroy();
        stop();
        if (ro) ro.disconnect(); else global.removeEventListener("resize", relayout);
        document.removeEventListener("visibilitychange", onVis);
        if (reducedMq) {
          if (reducedMq.removeEventListener) reducedMq.removeEventListener("change", onVis);
          else if (reducedMq.removeListener) reducedMq.removeListener(onVis);
        }
        global.removeEventListener("pointerup", onSwipeEnd);
        global.removeEventListener("pointercancel", onSwipeEnd);
        root.removeEventListener("keydown", onKey);
        if (tip.parentNode) tip.parentNode.removeChild(tip);
        root.textContent = "";
        root.style.removeProperty("--aw-glow");
        root.style.removeProperty("--aw-w");
        root.classList.remove("aw", "has-focus", "is-unlocked", "is-playing", "is-live");
      }
    };
  }

  /* ----------------------------------------------------------------- api */
  function appWall(target, opts) {
    var root = typeof target === "string" ? document.querySelector(target) : target;
    if (!root) throw new Error("appWall: mount target not found");
    var o = options(opts);
    var inst = build(root, o);
    var api = {
      el: root,
      update: function (next) {
        if (!next) return api;
        o = options(next, o);
        if (next.apps || next.domains || next.labels) {
          inst.destroy();
          inst = build(root, o);
        } else {
          inst.options(o, next);
        }
        return api;
      },
      destroy: function () { inst.destroy(); }
    };
    return api;
  }

  global.OM2Widgets = global.OM2Widgets || {};
  global.OM2Widgets.appWall = appWall;
})(window);
