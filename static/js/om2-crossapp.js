/* ==========================================================================
   OpenMobile-2 — cross-app mechanisms widget (#crossapp)
   Two mini phones on one device band, each showing a small app screen drawn
   in HTML. Selecting a mechanism plays a short script: the source screen
   highlights its item and names the action, a payload chip flies along a
   dashed arc to the destination screen and lands where the data says, and a
   round-trip mechanism sends a result chip back.

     OM2Widgets.crossApp(elOrSelector, { items })
       -> { el, select(key), destroy() }, or null when the host is missing

   items: [{ key, label, text, from, to, action, payload, sheet?, roundTrip,
             result? }], default OM2.crossApp; from / to: { app, color, screen }.
   Every string on a screen comes from its item, except the clock and the
   band label.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var count = 0;
  var CLOCK = "9:41";
  var BAND_LABEL = "one device, one resettable state";
  var GRADS = 4;                            /* gradient tile variants, .xa-g0 .. .xa-g3 */
  var PHOTO = 4;                            /* the shared photo: centre tile of the 3 x 3 grid */
  var PICKS = [2, 7, 4, 0, 5, 8, 1, 6, 3];  /* order in which the picker selects tiles */
  var FLY_MS = 1000, BACK_MS = 750, HOLD_MS = 1500;

  function reduced() { return !!(mq && mq.matches) || !window.requestAnimationFrame; }
  function now() { return window.performance ? window.performance.now() : Date.now(); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function bezier(p, t) {
    var u = 1 - t;
    return { x: u * u * p[0].x + 2 * u * t * p[1].x + t * t * p[2].x,
             y: u * u * p[0].y + 2 * u * t * p[1].y + t * t * p[2].y };
  }
  function pt(p) { return p.x.toFixed(1) + " " + p.y.toFixed(1); }

  /* ------------------------------------------------------------- helpers */
  function el(tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  /* a grey block standing in for a line of text, w = width in % */
  function line(parent, w, dim) {
    var n = el("i", "xa-ln" + (dim ? " is-dim" : ""), parent);
    n.style.width = w + "%";
    return n;
  }
  /* a gradient tile standing in for a photo; i picks the gradient */
  function tile(parent, i, cls) { return el("i", (cls || "xa-tile") + " xa-g" + (i % GRADS), parent); }
  function pill(hot, label) { return el("span", "xa-pill", hot, label); }
  function grid(body) {
    var g = el("div", "xa-grid", body), tiles = [];
    for (var i = 0; i < 9; i++) tiles.push(tile(g, i));
    return tiles;
  }
  function msg(parent, kind, ws) {
    var row = el("div", "xa-msg xa-msg-" + kind, parent);
    el("i", "xa-avatar", row);
    var b = el("div", "xa-bubble", row);
    ws.forEach(function (w) { line(b, w); });
    return b;
  }
  function input(form, w) { line(el("div", "xa-input", form), w, true); }
  function badge(t, n) { t.classList.add("is-pick"); el("b", "xa-badge", t, String(n)); }
  /* number of photos in a "photos" payload */
  function countOf(it) {
    var n = it.payload ? +it.payload.value : 0;
    return n > 0 && n <= PICKS.length ? n : 1;
  }
  /* true for an app colour light enough to need dark ink on it */
  function lightColor(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return false;
    var n = parseInt(m[1], 16);
    return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 > 0.6;
  }

  /* ------------------------------------------------------------- screens
     One builder per screen kind. Each draws into the app body (sheets go
     on the screen itself) and returns what the script needs: hot (the
     item the source highlights), pill (the action label), sheet, land and
     back (arc end points), and the onLand / onConfirm / onDone callbacks. */
  var SCREENS = {
    post: function (sc, body, it) {
      var card = el("div", "xa-card", body);
      var row = el("div", "xa-row", card);
      el("i", "xa-avatar", row);
      var col = el("div", "xa-col", row);
      line(col, 54); line(col, 34, true);
      line(card, 92); line(card, 72);
      var quote = el("div", "xa-quote xa-hot", card, it.payload.value);
      var acts = el("div", "xa-row xa-acts", card);
      line(acts, 18, true); line(acts, 18, true); line(acts, 18, true);
      var next = el("div", "xa-card is-dim", body);
      row = el("div", "xa-row", next);
      el("i", "xa-avatar", row);
      col = el("div", "xa-col", row);
      line(col, 46); line(col, 30, true);
      line(next, 84); line(next, 66);
      return { hot: quote, pill: pill(quote, it.action) };
    },
    note: function (sc, body, it) {
      var pad = el("div", "xa-note", body);
      line(pad, 62).classList.add("xa-title");
      line(pad, 88); line(pad, 76); line(pad, 83); line(pad, 58);
      var paste = el("div", "xa-paste", pad);
      var txt = el("span", null, paste);
      el("i", "xa-caret", paste);
      return { land: paste, onLand: function () {
        txt.textContent = it.payload.value;
        paste.classList.add("is-in");
      } };
    },
    gallery: function (sc, body, it) {
      line(body, 42);
      var tiles = grid(body), hot = tiles[PHOTO];
      hot.classList.add("xa-hot");
      line(body, 30, true);
      var sheet = el("div", "xa-sheet xa-share", sc);
      el("i", "xa-handle", sheet);
      var row = el("div", "xa-share-row", sheet);
      for (var i = 0; i < 4; i++) {
        var a = el("div", "xa-share-app" + (i === 1 ? " is-to" : ""), row);
        el("i", "xa-share-ico", a);
        if (i === 1) el("span", "xa-share-name", a, it.to.app); else line(a, 70, true);
      }
      return { hot: hot, pill: pill(hot, it.action), sheet: sheet };
    },
    chat: function (sc, body) {
      var th = el("div", "xa-chat", body);
      msg(th, "in", [68, 44]); msg(th, "out", [52]); msg(th, "in", [60]);
      var photo = msg(th, "in xa-msg-photo", []);
      tile(photo, PHOTO, "xa-thumb");
      return { land: photo, onLand: function () { photo.parentNode.classList.add("is-in"); } };
    },
    checkout: function (sc, body, it) {
      var card = el("div", "xa-card", body);
      var row = el("div", "xa-row", card);
      tile(row, 1, "xa-thumb");
      var col = el("div", "xa-col", row);
      line(col, 82); line(col, 50, true);
      line(card, 58, true);
      var total = el("div", "xa-total xa-hot", card);
      line(total, 32, true);
      el("span", "xa-amt", total, it.payload.value);
      var btn = el("div", "xa-pill xa-btn", body, it.action);
      return { hot: total, pill: btn, back: btn, onDone: function () {
        btn.textContent = it.result;
        btn.classList.add("is-done");
      } };
    },
    paysheet: function (sc, body, it) {
      line(body, 70); line(body, 50, true); line(body, 86); line(body, 40, true); line(body, 64);
      var sheet = el("div", "xa-sheet xa-pay", sc);
      el("i", "xa-handle", sheet);
      var row = el("div", "xa-row", sheet);
      el("i", "xa-merchant", row);
      line(row, 50);
      var big = el("div", "xa-big", sheet);
      line(sheet, 44, true);
      var fp = el("div", "xa-finger", sheet);
      el("i", null, fp);
      return { sheet: sheet, land: big, back: fp,
        onLand: function () { big.textContent = it.payload.value; big.classList.add("is-in"); },
        onConfirm: function () { fp.classList.add("is-on"); } };
    },
    listing: function (sc, body, it) {
      var form = el("div", "xa-form", body);
      var slot = el("div", "xa-slot xa-hot", form);
      el("i", "xa-plus", slot);
      var thumbs = el("div", "xa-thumbs", slot), n = countOf(it);
      for (var i = 0; i < n; i++) tile(thumbs, PICKS[i], "xa-thumb");
      var res = el("div", "xa-result", form);
      input(form, 44); input(form, 70);
      line(form, 30, true);
      return { hot: slot, pill: pill(slot, it.action), onDone: function () {
        slot.classList.add("is-done");
        res.textContent = it.result;
      } };
    },
    picker: function (sc, body, it) {
      line(body, 36);
      var tiles = grid(body), n = countOf(it);
      return { land: tiles[PICKS[0]], back: tiles[PICKS[n - 1]],
        onLand: function () { badge(tiles[PICKS[0]], 1); },
        onConfirm: function () { for (var k = 1; k < n; k++) badge(tiles[PICKS[k]], k + 1); } };
    }
  };
  /* an unknown screen kind: a few lines, the third one highlighted */
  function plain(sc, body) {
    line(body, 80); line(body, 60, true);
    var hot = line(body, 90); hot.classList.add("xa-hot");
    line(body, 50, true);
    return { hot: hot };
  }

  /* --------------------------------------------------------------- phone
     Rail, bezel, screen with punch-hole and status strip, a tinted app
     header, and the app body the screen builders draw into. */
  function phone(parent, side) {
    var wrap = el("div", "xa-side xa-side-" + side, parent);
    var ph = el("div", "xa-phone", wrap);
    var sc = el("div", "xa-screen", el("div", "xa-bezel", ph));
    el("i", "xa-cam", sc);
    var st = el("div", "xa-status", sc);
    el("span", "xa-clock", st, CLOCK);
    var sig = el("span", "xa-sig", st);
    el("i", "xa-sig-bars", sig);
    el("i", "xa-sig-bat", sig);
    var head = el("div", "xa-app-head", sc);
    el("i", "xa-app-ico", head);
    return { phone: ph, screen: sc, name: el("span", null, head), body: el("div", "xa-app-body", sc),
             caption: el("div", "xa-caption", wrap), sheet: null };
  }
  function setApp(p, app, it) {
    p.phone.style.setProperty("--xa-c", app.color || "");
    p.phone.classList.toggle("is-light-c", lightColor(app.color));
    p.name.textContent = app.app || "";
    p.caption.textContent = app.app || "";
    p.body.textContent = "";
    p.screen.classList.remove("has-sheet");
    if (p.sheet && p.sheet.parentNode) p.sheet.parentNode.removeChild(p.sheet);
    var scr = (SCREENS[app.screen] || plain)(p.screen, p.body, it);
    p.sheet = scr.sheet || null;
    scr.screen = p.screen;
    scr.hot = scr.hot || scr.land || p.body;
    scr.land = scr.land || scr.hot; scr.back = scr.back || scr.land;
    return scr;
  }
  function sheetUp(scr, up) {
    if (!scr.sheet) return;
    scr.sheet.classList.toggle("is-up", up);
    scr.screen.classList.toggle("has-sheet", up);
  }
  /* the flying chip: text, the amount, one photo, a stack of photos, or
     the result that comes back */
  function fillChip(chip, kind, value, back) {
    chip.textContent = "";
    chip.className = "xa-chip xa-chip-" + kind + (back ? " xa-chip-back" : "");
    if (kind === "photo") tile(chip, PHOTO, "xa-thumb");
    else if (kind === "photos") for (var k = 0; k < value; k++) tile(chip, PICKS[k], "xa-thumb");
    else chip.textContent = value;
  }

  /* -------------------------------------------------------------- widget */
  function crossApp(target, opts) {
    var host = typeof target === "string" ? document.querySelector(target) : target;
    if (!host) {
      if (window.console) console.warn("OM2Widgets.crossApp: no host for", target);
      return null;
    }
    var items = (opts && opts.items) || (window.OM2 && window.OM2.crossApp) || [];
    var uid = "xa" + (++count);
    var current = -1, raf = 0, io = null, scrollTimer = 0;
    var stopped = false, hovered = false, focused = false, visible = true;
    var plan = null, t0 = 0, elapsed = 0, fired = 0, flights = [], finished = false, pending = false;

    /* a second mount on the same host replaces the first */
    Array.prototype.slice.call(host.children).forEach(function (c) {
      if (c.classList.contains("xa")) host.removeChild(c);
    });
    var root = el("div", "xa", host);

    /* tabs */
    var tablist = el("div", "wt-tabs xa-tabs", root);
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", "Cross-app mechanism");
    var tabs = items.map(function (it) {
      var b = el("button", "wt-tab xa-tab", tablist, it.label);
      b.type = "button";
      b.id = uid + "-tab-" + it.key;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", "false");
      b.setAttribute("aria-controls", uid + "-panel");
      b.setAttribute("data-key", it.key);
      b.tabIndex = -1;
      return b;
    });

    /* scene: band, two phones, the arc overlay and the two chips */
    var panel = el("div", "xa-panel", root);
    panel.id = uid + "-panel";
    panel.setAttribute("role", "tabpanel");
    var band = el("div", "xa-band", panel);
    el("div", "xa-band-label", band, BAND_LABEL).setAttribute("aria-hidden", "true");
    var stage = el("div", "xa-stage", band);
    stage.setAttribute("role", "img");
    var left = phone(stage, "from"), right = phone(stage, "to");
    function svg(tag, cls, parent) {
      var n = document.createElementNS(NS, tag);
      n.setAttribute("class", cls);
      n.setAttribute("aria-hidden", "true");
      return parent.appendChild(n);
    }
    var pic = svg("svg", "xa-overlay", stage);
    var arcOut = svg("path", "xa-arc", pic), arcBack = svg("path", "xa-arc", pic);
    var chipOut = el("span", "xa-chip", stage), chipBack = el("span", "xa-chip", stage);
    chipOut.setAttribute("aria-hidden", "true");
    chipBack.setAttribute("aria-hidden", "true");
    var bar = el("i", null, el("div", "xa-progress", panel));
    var text = el("p", "xa-text", panel);

    /* ---------------------------------------------------------- geometry
       Stage pixels; the overlay's viewBox is set to the stage size so the
       path and the chip share one coordinate system. */
    function centre(node) {
      var r = node.getBoundingClientRect(), s = stage.getBoundingClientRect();
      return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top };
    }
    function bow(a, b, back) {
      var lift = Math.max(36, Math.abs(b.x - a.x) * 0.36);
      var cy = back ? Math.max(a.y, b.y) + lift * 0.55 : Math.min(a.y, b.y) - lift;
      return [a, { x: (a.x + b.x) / 2, y: cy }, b];
    }
    function fly(chip, path, from, to, start, ms, back, done) {
      var s = stage.getBoundingClientRect();
      pic.setAttribute("viewBox", "0 0 " + Math.max(1, Math.round(s.width)) + " " + Math.max(1, Math.round(s.height)));
      var p = bow(centre(from), centre(to), back);
      path.setAttribute("d", "M" + pt(p[0]) + " Q" + pt(p[1]) + " " + pt(p[2]));
      path.classList.add("is-on");
      chip.classList.add("is-on");
      flights.push({ chip: chip, path: path, p: p, start: start, ms: ms, done: done, over: false });
    }
    /* along the arc, growing as it lifts off and shrinking into the landing */
    function moveChip(fl, u) {
      var q = bezier(fl.p, ease(u)), s = 0.6 + 0.4 * Math.min(1, u * 5) - (u > 0.86 ? (u - 0.86) * 2.5 : 0);
      fl.chip.style.transform = "translate(" + q.x.toFixed(1) + "px," + q.y.toFixed(1) + "px) translate(-50%,-50%) scale(" + s.toFixed(3) + ")";
    }

    /* ------------------------------------------------------------ script
       Cues in ms from the start of the item; each fires once as the clock
       passes it. Flights are moved every frame between start and end. */
    function script(it, S, D) {
      var t = 0, cues = [];
      function at(dt, fn) { t += dt; cues.push({ t: t, fn: fn }); }
      at(250, function () { S.hot.classList.add("is-on"); });
      at(450, function () { if (S.pill) S.pill.classList.add("is-on"); });
      if (S.sheet) at(700, function () { sheetUp(S, true); });
      if (D.sheet) at(500, function () { sheetUp(D, true); });
      at(S.sheet || D.sheet ? 800 : 700, function (tc) {
        fly(chipOut, arcOut, S.hot, D.land, tc, FLY_MS, false, function () {
          if (D.onLand) D.onLand();
          sheetUp(S, false);
        });
      });
      t += FLY_MS;
      if (it.roundTrip) {
        at(400, function () { if (D.onConfirm) D.onConfirm(); });
        at(650, function (tc) {
          fly(chipBack, arcBack, D.back, S.back, tc, BACK_MS, true, function () { if (S.onDone) S.onDone(); });
        });
        t += BACK_MS;
      }
      return { cues: cues, total: t + HOLD_MS };
    }
    function frame(ts) {
      raf = 0;
      elapsed = ts - t0;
      while (fired < plan.cues.length && plan.cues[fired].t <= elapsed) { var c = plan.cues[fired++]; c.fn(c.t); }
      for (var i = 0; i < flights.length; i++) {
        var fl = flights[i];
        if (fl.over || elapsed < fl.start) continue;
        var u = Math.min(1, (elapsed - fl.start) / fl.ms);
        moveChip(fl, u);
        if (u >= 1) {
          fl.over = true;
          fl.chip.classList.remove("is-on");
          fl.path.classList.remove("is-on");
          fl.done();
        }
      }
      bar.style.transform = "scaleX(" + Math.min(1, elapsed / plan.total).toFixed(4) + ")";
      if (elapsed >= plan.total) { finished = true; onEnd(); return; }
      raf = window.requestAnimationFrame(frame);
    }
    function active() { return visible && !document.hidden; }
    function run() {
      if (raf || finished || !plan) return;
      t0 = now() - elapsed;
      raf = window.requestAnimationFrame(frame);
    }
    function halt() { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } }
    /* hidden or out of view: freeze the clock; back in view: resume */
    function sync() {
      if (!active()) { halt(); return; }
      run();
      if (pending) advance();
    }
    function onEnd() {
      if (stopped) select(items[current].key);
      else advance();
    }
    function advance() {
      pending = false;
      if (!active() || hovered || focused) { pending = true; return; }
      select(items[(current + 1) % items.length].key);
    }
    /* reduced motion: the final frame, payload landed and result shown */
    function finalFrame(it, S, D) {
      S.hot.classList.add("is-on");
      if (S.pill) S.pill.classList.add("is-on");
      sheetUp(S, true);
      sheetUp(D, true);
      if (D.onLand) D.onLand();
      if (D.onConfirm) D.onConfirm();
      if (it.roundTrip && S.onDone) S.onDone();
      bar.style.transform = "scaleX(1)";
    }
    function start(it, S, D) {
      halt();
      flights = []; fired = 0; elapsed = 0; finished = false; pending = false;
      [chipOut, chipBack, arcOut, arcBack].forEach(function (n) { n.classList.remove("is-on"); });
      if (reduced()) { plan = null; finalFrame(it, S, D); return; }
      plan = script(it, S, D);
      bar.style.transform = "scaleX(0)";
      if (active()) run();
    }

    /* --------------------------------------------------------- selection */
    function index(key) {
      for (var i = 0; i < items.length; i++) if (items[i].key === key) return i;
      return -1;
    }
    function select(key) {
      var i = index(key);
      if (i < 0) return false;
      var it = items[i], from = it.from || {}, to = it.to || {}, pl = it.payload || {};
      current = i;
      tabs.forEach(function (b, j) {
        b.setAttribute("aria-selected", j === i ? "true" : "false");
        b.tabIndex = j === i ? 0 : -1;
      });
      panel.setAttribute("aria-labelledby", tabs[i].id);
      root.style.setProperty("--xa-from", from.color || "");
      root.style.setProperty("--xa-to", to.color || "");
      var S = setApp(left, from, it), D = setApp(right, to, it);
      stage.setAttribute("aria-label", it.label + ": " + from.app + " to " + to.app);
      var n = countOf(it), photos = pl.kind === "photos";
      fillChip(chipOut, pl.kind || "text", photos ? n : pl.value, false);
      fillChip(chipBack, photos ? "photos" : "result", photos ? n : it.result, true);
      text.textContent = it.text;
      start(it, S, D);
      return true;
    }
    function stop() { stopped = true; }

    /* ------------------------------------------------------------ events */
    tablist.addEventListener("click", function (e) {
      var b = e.target.closest(".xa-tab");
      if (!b || !tablist.contains(b)) return;
      stop();
      select(b.getAttribute("data-key"));
    });
    tablist.addEventListener("keydown", function (e) {
      var n = items.length, i = current;
      if (!n) return;
      switch (e.key) {
        case "ArrowRight": case "ArrowDown": i = (i + 1) % n; break;
        case "ArrowLeft": case "ArrowUp": i = (i - 1 + n) % n; break;
        case "Home": i = 0; break;
        case "End": i = n - 1; break;
        default: return;
      }
      e.preventDefault();
      stop();
      select(items[i].key);
      tabs[i].focus();
    });
    /* the reader's attention holds the current item; it moves on after */
    root.addEventListener("mouseenter", function () { hovered = true; });
    root.addEventListener("mouseleave", function () { hovered = false; if (pending) advance(); });
    tablist.addEventListener("focusin", function () { focused = true; });
    tablist.addEventListener("focusout", function () { focused = false; if (pending) advance(); });
    document.addEventListener("visibilitychange", sync);

    /* in view: IntersectionObserver, with a geometry check on scroll for
       the cases where its callbacks wait on a rendering step */
    function inView() {
      var r = root.getBoundingClientRect();
      return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight || 0);
    }
    function onScroll() {
      if (scrollTimer) return;
      scrollTimer = setTimeout(function () { scrollTimer = 0; visible = inView(); sync(); }, 120);
    }
    if ("IntersectionObserver" in window) {
      visible = false;
      io = new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        sync();
      }, { threshold: 0.2 });
      io.observe(root);
    } else visible = inView();
    window.addEventListener("scroll", onScroll, { passive: true });

    function destroy() {
      stop(); halt(); plan = null;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = 0; }
      if (io) io.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", sync);
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    if (items.length) select(items[0].key);

    return { el: root, select: function (key) { return select(key); }, destroy: destroy };
  }

  window.OM2Widgets = window.OM2Widgets || {};
  window.OM2Widgets.crossApp = crossApp;
})();
