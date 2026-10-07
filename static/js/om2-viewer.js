/* ==========================================================================
   OpenMobile-2 — trajectory viewer
   Data: viewer/data/index.json (every episode's summary) and
   viewer/data/<id>.json (steps), frames in viewer/frames/<id>/fNNN.jpg,
   posters in viewer/posters/<id>.jpg; all written by tools/build_viewer_data.py
   and tools/sample_openmobile_data.py.

   OM2Widgets.trajPlayer(el, { episode, compact, base })      one episode
   OM2Widgets.trajViewer(el, { base })                        filters + list + player
   OM2Widgets.trajPairs(el, { pairs, base })                  GUI-only vs hybrid
   OM2Widgets.trajCards(el, { base, viewer, limit })          homepage cards

   Step i (0 <= i < N) shows the screen before action i with the action drawn
   on it; step N is the final screen. Coordinates are on the source's
   normalised 0-1000 scale and map onto the 360 x 800 logical screen.
   ========================================================================== */
(function () {
  "use strict";

  var W = window.OM2Widgets = window.OM2Widgets || {};
  var SCREEN_W = 360, SCREEN_H = 800, PHONE_W = 380, PHONE_H = 820;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SVG = "http://www.w3.org/2000/svg";

  /* ------------------------------------------------------------ helpers */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function svg(tag, attrs) {
    var el = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function pad3(n) { return (n < 10 ? "00" : n < 100 ? "0" : "") + n; }
  function frameUrl(base, ep, k) { return base + "frames/" + ep.id + "/f" + pad3(k) + ".jpg"; }
  function posterUrl(base, ep) { return base + "posters/" + ep.id + ".jpg"; }
  function modeLabel(m) { return m === "hybrid" ? "hybrid" : "GUI-only"; }
  function scopeLabel(s) { return s === "S1" ? "single app" : (s === "S2" || s === "S3") ? "cross-app" : ""; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  /* an episode file carries the step list; the index carries the count */
  function stepCount(ep) { return Array.isArray(ep.steps) ? ep.steps.length : ep.steps; }
  function countsText(ep) {
    var t = plural(stepCount(ep), "step", "steps");
    if (ep.mode === "hybrid") t += " · " + plural(ep.toolCalls, "tool call", "tool calls");
    return t;
  }
  function argsText(step) {
    var a = step.call.args || {}, k = step.kind;
    function xy(c) { return c ? "(" + Math.round(c[0]) + ", " + Math.round(c[1]) + ")" : ""; }
    if (k === "click" || k === "double_tap" || k === "long_press") return k + " " + xy(a.coordinate);
    if (k === "swipe" || k === "drag") return k + " " + xy(a.coordinate) + " → " + xy(a.coordinate2);
    if (k === "type") return "type " + JSON.stringify(a.text || "");
    if (k === "open_app") return "open_app " + appArg(a);
    if (k === "system_button") return "system_button " + (a.button || "");
    if (k === "wait") return "wait" + (a.time ? " " + a.time + " s" : "");
    if (k === "answer") return "answer " + JSON.stringify(a.text || "");
    if (k === "terminate") return "terminate · " + (a.status || "");
    return k;
  }
  /* the app to open: MobileGym++ episodes say `app`, OpenMobile-Data says `text` */
  function appArg(a) { return a.app || a.app_name || a.name || a.text || ""; }
  function compactArgs(args) {
    var parts = [];
    Object.keys(args || {}).forEach(function (k) {
      var v = args[k];
      parts.push(k + "=" + (typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v)));
    });
    return parts.join(", ");
  }

  var cache = {};
  function loadJSON(url) {
    if (cache[url]) return cache[url];
    cache[url] = fetch(url, { cache: "force-cache" }).then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + url);
      return r.json();
    });
    return cache[url];
  }

  /* ============================================================== player */
  W.trajPlayer = function (target, opts) {
    opts = opts || {};
    var base = opts.base || "viewer/";
    var compact = !!opts.compact;
    var ep = null, steps = [], idx = 0, timer = null, speed = 1, imgs = [];
    var showHead = !compact && opts.head !== false;

    /* --- DOM --- */
    var frameA = h("img", { class: "tv-frame", alt: "", draggable: "false" });
    var frameB = h("img", { class: "tv-frame", alt: "", draggable: "false" });
    var overlay = svg("svg", { class: "tv-overlay", viewBox: "0 0 " + SCREEN_W + " " + SCREEN_H, "aria-hidden": "true" });
    var chips = h("div", { class: "tv-chips", "aria-hidden": "true" });
    var screen = h("div", { class: "tv-screen" }, [frameA, frameB, overlay, chips, h("div", { class: "tv-sheen" })]);
    var phone = h("div", { class: "tv-phone" }, [
      h("i", { class: "tv-sbtn tv-vol1" }), h("i", { class: "tv-sbtn tv-vol2" }), h("i", { class: "tv-sbtn tv-pwr" }),
      h("div", { class: "tv-bezel" }, [screen])
    ]);
    var scaler = h("div", { class: "tv-scaler" }, [h("div", { class: "tv-ground" }), phone]);
    var stage = h("div", { class: "tv-stage" }, [scaler]);

    var head = showHead ? h("div", { class: "tv-head" }) : null;
    var strip = h("ol", { class: "tv-strip", "aria-label": "Steps" });
    var btnPrev = h("button", { class: "wt-btn", type: "button", "aria-label": "Previous step", html: icon("prev") });
    var btnPlay = h("button", { class: "wt-btn", type: "button", "aria-label": "Play", html: icon("play") });
    var btnNext = h("button", { class: "wt-btn", type: "button", "aria-label": "Next step", html: icon("next") });
    var btnSpeed = h("button", { class: "wt-btn", type: "button", "aria-pressed": "false", text: "2×", title: "Play twice as fast" });
    var count = h("span", { class: "wt-count", "aria-live": "polite" });
    var kbd = compact ? null : h("span", { class: "tv-kbd", html: "<kbd>←</kbd> <kbd>→</kbd> step · <kbd>space</kbd> play" });
    var controls = h("div", { class: "tv-controls" }, [btnPrev, btnPlay, btnNext, btnSpeed, count, kbd]);
    var stepBox = h("div", { class: "tv-step", "aria-live": "polite" });
    var side = h("div", { class: "tv-side" }, [head, strip, controls, stepBox]);
    var root = h("div", { class: "tv-player" + (compact ? " is-compact" : "") }, [stage, side]);
    target.innerHTML = "";
    target.appendChild(root);

    function icon(kind) {
      if (kind === "play") return '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>';
      if (kind === "pause") return '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>';
      if (kind === "prev") return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3 5 8l5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 3 5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

    /* --- frames --- */
    var shown = frameA, hidden = frameB;
    function showFrame(k) {
      var url = frameUrl(base, ep, Math.min(k, ep.frames.count - 1));
      if (shown.getAttribute("src") === url) return;
      var next = hidden;
      next.onload = function () {
        next.classList.add("is-shown");
        shown.classList.remove("is-shown");
        var t = shown; shown = next; hidden = t;
        next.onload = null;
      };
      next.src = url;
      if (next.complete && next.naturalWidth) next.onload();
    }
    function preload(k) {
      for (var j = k; j < Math.min(k + 3, ep.frames.count); j++) {
        if (!imgs[j]) { imgs[j] = new Image(); imgs[j].src = frameUrl(base, ep, j); }
      }
    }

    /* --- overlay drawing --- */
    function px(c) { return [c[0] / 1000 * SCREEN_W, c[1] / 1000 * SCREEN_H]; }
    function clear() { while (overlay.firstChild) overlay.removeChild(overlay.firstChild); chips.innerHTML = ""; screen.classList.remove("is-tool"); }
    function chip(cls, label, text) {
      var c = h("div", { class: "tv-chip " + cls }, [label ? h("b", { text: label }) : null, text]);
      chips.appendChild(c);
    }
    function drawTap(c, kind) {
      var p = px(c);
      if (kind === "long_press") overlay.appendChild(svg("circle", { class: "m-hold", cx: p[0], cy: p[1], r: 24 }));
      overlay.appendChild(svg("circle", { class: "m-ring", cx: p[0], cy: p[1], r: 18 }));
      if (kind === "double_tap") overlay.appendChild(svg("circle", { class: "m-ring m-ring2", cx: p[0], cy: p[1], r: 18 }));
      overlay.appendChild(svg("circle", { class: "m-dot", cx: p[0], cy: p[1], r: 7 }));
    }
    function drawSwipe(c1, c2) {
      var a = px(c1), b = px(c2);
      var d = "M" + a[0] + " " + a[1] + " L" + b[0] + " " + b[1];
      overlay.appendChild(svg("path", { class: "m-shadow", d: d }));
      overlay.appendChild(svg("path", { class: "m-path", d: d }));
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      var L = 14, wdt = 8;
      var tip = b, l = [b[0] - L * Math.cos(ang) + wdt * Math.sin(ang), b[1] - L * Math.sin(ang) - wdt * Math.cos(ang)];
      var r = [b[0] - L * Math.cos(ang) - wdt * Math.sin(ang), b[1] - L * Math.sin(ang) + wdt * Math.cos(ang)];
      overlay.appendChild(svg("polygon", { class: "m-head", points: tip.join(",") + " " + l.join(",") + " " + r.join(",") }));
      overlay.appendChild(svg("circle", { class: "m-dot", cx: a[0], cy: a[1], r: 6 }));
    }
    function drawStep(step) {
      clear();
      var a = step.call.args || {}, k = step.kind;
      if (k === "tool") {
        screen.classList.add("is-tool");
        var banner = h("div", { class: "tv-banner" + (step.ok === false ? " is-err" : "") }, [
          h("span", { class: "tv-banner-k", text: step.ok === false ? "tool call · error" : "app-native tool call" }),
          h("span", { class: "tv-banner-n", text: step.call.name }),
          h("span", { class: "tv-banner-a", text: compactArgs(a) })
        ]);
        chips.appendChild(banner);
        return;
      }
      if ((k === "click" || k === "double_tap" || k === "long_press") && a.coordinate) drawTap(a.coordinate, k);
      else if ((k === "swipe" || k === "drag") && a.coordinate && a.coordinate2) drawSwipe(a.coordinate, a.coordinate2);
      else if (k === "type") { if (a.coordinate) drawTap(a.coordinate, "click"); chip("at-bottom is-type", "type", a.text || ""); }
      else if (k === "open_app") chip("at-top", "open app", appArg(a));
      else if (k === "system_button") chip("at-bottom", "system", String(a.button || "").toLowerCase());
      else if (k === "wait") chip("at-top", "wait", a.time ? a.time + " s" : "");
      else if (k === "answer") chip("at-bottom is-type", "answer", a.text || "");
      else if (k === "terminate") chip("at-top " + (a.status === "success" ? "is-done" : "is-fail"), "terminate", a.status || "");
      else if (k === "end") chip("at-top " + (ep.success === false ? "is-fail" : "is-done"), ep.success === false ? "check failed" : "done", plural(steps.length, "step", "steps"));
    }

    /* --- step panel --- */
    function renderHead() {
      if (!head) return;
      head.innerHTML = "";
      head.appendChild(h("h3", { class: "tv-title", text: ep.title }));
      if (ep.instruction && ep.instruction !== ep.title) head.appendChild(h("p", { class: "tv-instr", lang: /[一-鿿]/.test(ep.instruction) ? "zh" : "en", text: ep.instruction }));
      var meta = h("div", { class: "tv-meta" });
      meta.appendChild(h("span", { class: "tv-tag is-mode-" + ep.mode, text: modeLabel(ep.mode) }));
      if (ep.difficulty) meta.appendChild(h("span", { class: "tv-tag", text: ep.difficulty }));
      if (scopeLabel(ep.scope)) meta.appendChild(h("span", { class: "tv-tag", text: scopeLabel(ep.scope) }));
      (ep.appNames || []).forEach(function (n) { meta.appendChild(h("span", { class: "tv-tag is-app", text: n })); });
      if (ep.success === true) meta.appendChild(h("span", { class: "tv-tag is-ok", text: "check passed" }));
      if (ep.success === false) meta.appendChild(h("span", { class: "tv-tag is-bad", text: "check failed" }));
      if (ep.model) meta.appendChild(h("span", { class: "tv-tag is-model", text: ep.model }));
      if (ep.pair && opts.onPair) {
        meta.appendChild(h("button", { class: "wt-btn tv-pairlink", type: "button", text: ep.mode === "hybrid" ? "GUI-only run of this task" : "Hybrid run of this task", onclick: function () { opts.onPair(ep.pair); } }));
      }
      head.appendChild(meta);
      if (ep.note) head.appendChild(h("p", { class: "wt-note", text: ep.note }));
    }
    function renderStrip() {
      strip.innerHTML = "";
      steps.forEach(function (s, i) {
        var cls = "tv-mark" + (s.kind === "tool" ? " is-tool" : "") + (s.kind === "open_app" || s.kind === "system_button" ? " is-nav" : "") + (s.ok === false ? " is-fail" : "");
        var label = "Step " + s.n + " · " + (s.kind === "tool" ? s.call.name : s.kind);
        strip.appendChild(h("li", null, [h("button", { class: cls, type: "button", title: label, "aria-label": label, onclick: function () { go(i); } })]));
      });
      strip.appendChild(h("li", null, [h("button", { class: "tv-mark is-end", type: "button", title: "Final screen", "aria-label": "Final screen", onclick: function () { go(steps.length); } })]));
    }
    function renderStep() {
      stepBox.innerHTML = "";
      var N = steps.length;
      if (idx >= N) {
        var headEl = h("div", { class: "tv-step-head" }, [h("span", { class: "tv-badge " + (ep.success === false ? "is-fail" : "is-end"), text: ep.success === false ? "check failed" : "episode complete" })]);
        stepBox.appendChild(headEl);
        var t = "Ends after " + plural(N, "step", "steps");
        if (ep.mode === "hybrid") t += ", " + plural(ep.toolCalls, "of them an app-native tool call", "of them app-native tool calls");
        t += ".";
        if (ep.success === true) t += " The automatic check on the final app state passed.";
        if (ep.success === false) t += " The automatic check on the final app state failed.";
        stepBox.appendChild(h("p", { class: "tv-end", text: t }));
        count.textContent = "Final screen";
        return;
      }
      var s = steps[idx];
      var tool = s.kind === "tool";
      var hd = h("div", { class: "tv-step-head" }, [
        h("span", { class: "tv-badge" + (tool ? " is-tool" : "") + (s.ok === false ? " is-fail" : ""), text: tool ? "tool call" : s.kind.replace("_", " ") }),
        s.app ? h("span", { class: "tv-step-app", text: s.app }) : null,
        s.ok === false ? h("span", { class: "tv-tag is-bad", text: "returned an error" }) : null
      ]);
      stepBox.appendChild(hd);
      if (s.thought) stepBox.appendChild(h("p", { class: "tv-thought", text: s.thought }));
      if (s.action) stepBox.appendChild(h("p", { class: "tv-action", text: s.action }));
      if (!tool) stepBox.appendChild(h("div", { class: "tv-args", text: argsText(s) }));
      else {
        var box = h("div", { class: "tv-tool" }, [h("div", { class: "tv-tool-name", text: s.call.name })]);
        var args = s.call.args || {}, keys = Object.keys(args);
        if (keys.length) {
          var dl = h("dl", { class: "tv-kv" });
          keys.forEach(function (k) { dl.appendChild(h("dt", { text: k })); dl.appendChild(h("dd", { text: typeof args[k] === "string" ? args[k] : JSON.stringify(args[k]) })); });
          box.appendChild(dl);
        }
        if (s.result !== null && s.result !== undefined) {
          var det = h("details", { class: "tv-result" }, [
            h("summary", null, [h("span", { class: s.ok === false ? "is-err" : "is-ok", text: s.ok === false ? "error" : "ok" }), "returned value"]),
            h("pre", { text: typeof s.result === "string" ? s.result : JSON.stringify(s.result, null, 2) }),
            s.resultTruncated ? h("small", { text: "Long lists and strings are shortened on the page." }) : null
          ]);
          box.appendChild(det);
        }
        stepBox.appendChild(box);
      }
      count.textContent = "Step " + (idx + 1) + " / " + N;
    }
    function markCurrent() {
      var marks = strip.querySelectorAll(".tv-mark");
      Array.prototype.forEach.call(marks, function (m, i) {
        if (i === idx) m.setAttribute("aria-current", "step"); else m.removeAttribute("aria-current");
        m.classList.toggle("is-past", i < idx);
      });
    }

    /* --- navigation --- */
    function go(i, keepPlaying) {
      if (!ep) return;
      var N = steps.length;
      idx = Math.max(0, Math.min(N, i));
      var frame = idx < N ? steps[idx].before : ep.frames.count - 1;
      showFrame(frame);
      preload(frame + 1);
      drawStep(idx < N ? steps[idx] : { kind: "end", call: { args: {} } });
      renderStep();
      markCurrent();
      if (!keepPlaying) pause();
      if (idx >= N && timer) pause();
    }
    function dwell() {
      if (idx >= steps.length) return 0;
      var k = steps[idx].kind;
      var ms = k === "tool" ? 2400 : k === "type" || k === "answer" ? 2000 : 1500;
      return ms / speed;
    }
    function tick() {
      if (idx >= steps.length) { pause(); return; }
      go(idx + 1, true);
      if (idx >= steps.length) { pause(); if (opts.onEnd) opts.onEnd(); return; }
      timer = setTimeout(tick, dwell());
    }
    function play() {
      if (!ep) return;
      if (idx >= steps.length) go(0, true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, dwell());
      root.classList.add("is-playing");
      btnPlay.innerHTML = icon("pause");
      btnPlay.setAttribute("aria-label", "Pause");
    }
    function pause() {
      if (timer) clearTimeout(timer);
      timer = null;
      root.classList.remove("is-playing");
      btnPlay.innerHTML = icon("play");
      btnPlay.setAttribute("aria-label", "Play");
    }
    btnPrev.addEventListener("click", function () { go(idx - 1); });
    btnNext.addEventListener("click", function () { go(idx + 1); });
    btnPlay.addEventListener("click", function () { if (timer) pause(); else play(); });
    btnSpeed.addEventListener("click", function () {
      speed = speed === 1 ? 2 : 1;
      btnSpeed.setAttribute("aria-pressed", speed === 2 ? "true" : "false");
      if (timer) { clearTimeout(timer); timer = setTimeout(tick, dwell()); }
    });

    /* --- fit the phone to its column --- */
    var baseScale = compact ? 0.74 : 1;
    function fit() {
      /* measure the host, not the player: the 380 px stage would hold the
         player open and hide the overflow */
      var avail = target.clientWidth || root.clientWidth;
      var stacked = avail < PHONE_W + 420;
      root.classList.toggle("is-stacked", stacked);
      var w = stacked ? avail : Math.min(avail, PHONE_W);
      var s = Math.min(baseScale, Math.max(0.5, w / PHONE_W));
      if (compact) {
        root.style.setProperty("--tv-scale", s);
        root.classList.toggle("is-stacked", avail < PHONE_W * s + 300);
      } else {
        scaler.style.transform = "scale(" + s + ")";
        stage.style.width = Math.round(PHONE_W * s) + "px";
        stage.style.height = Math.round(PHONE_H * s) + "px";
      }
    }
    var ro = ("ResizeObserver" in window) ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(root); else window.addEventListener("resize", fit);

    function setEpisode(data, startAt) {
      pause();
      ep = data; steps = data.steps || []; imgs = []; idx = 0;
      frameA.classList.remove("is-shown"); frameB.classList.remove("is-shown");
      frameA.removeAttribute("src"); frameB.removeAttribute("src");
      shown = frameA; hidden = frameB;
      renderHead(); renderStrip();
      go(startAt || 0);
      fit();
    }
    if (opts.episode) setEpisode(opts.episode);

    return {
      el: root, go: go, next: function () { go(idx + 1); }, prev: function () { go(idx - 1); },
      play: play, pause: pause, setEpisode: setEpisode, reset: function () { go(0); },
      isPlaying: function () { return !!timer; }, index: function () { return idx; },
      episode: function () { return ep; },
      destroy: function () { pause(); if (ro) ro.disconnect(); else window.removeEventListener("resize", fit); target.innerHTML = ""; }
    };
  };

  /* ============================================================== viewer */
  W.trajViewer = function (target, opts) {
    opts = opts || {};
    var base = opts.base || "viewer/";
    var index = null, episodes = [], current = null, player = null;
    var state = { group: "all", mode: "all", app: "", tools: false, q: "" };

    var tabs = h("div", { class: "wt-tabs", role: "tablist" });
    var modeSel = h("select", { class: "tv-select", "aria-label": "Interaction mode" }, [
      h("option", { value: "all", text: "Any mode" }), h("option", { value: "hybrid", text: "Hybrid" }), h("option", { value: "gui_only", text: "GUI-only" })]);
    var appSel = h("select", { class: "tv-select", "aria-label": "App" }, [h("option", { value: "", text: "Any app" })]);
    var toolsBtn = h("button", { class: "wt-btn", type: "button", "aria-pressed": "false", text: "Has tool calls" });
    var search = h("input", { class: "tv-search", type: "search", placeholder: "Search tasks", "aria-label": "Search tasks" });
    var countEl = h("span", { class: "wt-count" });
    var filters = h("div", { class: "tv-filters" }, [tabs, h("span", { class: "tv-sep" }), modeSel, appSel, toolsBtn, search, countEl]);
    var list = h("ol", { class: "tv-list", "aria-label": "Episodes" });
    var main = h("div", { class: "tv-main" }, [h("div", { class: "tv-loading", text: "Loading episodes…" })]);
    var body = h("div", { class: "tv-body" }, [list, main]);
    var root = h("div", { class: "tv" }, [filters, body]);
    target.innerHTML = "";
    target.appendChild(root);

    function groupOf(id) { return (index.groups || []).filter(function (g) { return g.id === id; })[0]; }
    function visible() {
      var q = state.q.trim().toLowerCase();
      return episodes.filter(function (e) {
        if (state.group !== "all" && e.group !== state.group) return false;
        if (state.mode !== "all" && e.mode !== state.mode) return false;
        if (state.app && (e.appNames || []).indexOf(state.app) < 0) return false;
        if (state.tools && !(e.toolCalls > 0)) return false;
        if (q && (e.title + " " + e.instruction + " " + e.id + " " + (e.appNames || []).join(" ")).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
    }
    function renderTabs() {
      tabs.innerHTML = "";
      var all = [{ id: "all", label: "All" }].concat(index.groups.filter(function (g) { return episodes.some(function (e) { return e.group === g.id; }); }));
      all.forEach(function (g) {
        tabs.appendChild(h("button", { class: "wt-tab", type: "button", role: "tab", "aria-selected": state.group === g.id ? "true" : "false", text: g.label, title: g.note || "", onclick: function () { state.group = g.id; renderTabs(); renderList(); } }));
      });
    }
    function renderApps() {
      var names = {};
      episodes.forEach(function (e) { (e.appNames || []).forEach(function (n) { names[n] = 1; }); });
      Object.keys(names).sort().forEach(function (n) { appSel.appendChild(h("option", { value: n, text: n })); });
    }
    function renderList() {
      var rows = visible();
      list.innerHTML = "";
      countEl.textContent = rows.length + " of " + episodes.length + " episodes";
      if (!rows.length) { list.appendChild(h("li", { class: "tv-empty", text: "No episode matches these filters." })); return; }
      rows.forEach(function (e) {
        var g = groupOf(e.group);
        var item = h("button", { class: "tv-item", type: "button", "aria-current": current && current.id === e.id ? "true" : "false", onclick: function () { select(e.id, true); } }, [
          h("img", { src: posterUrl(base, e), alt: "", loading: "lazy" }),
          h("div", null, [
            h("p", { class: "tv-item-t", text: e.title }),
            h("p", { class: "tv-item-m", html: escapeHtml((e.appNames || []).join(" · ")) + "<br>" + escapeHtml(plural(e.steps, "step", "steps")) + (e.mode === "hybrid" ? " · <i>" + escapeHtml(plural(e.toolCalls, "tool call", "tool calls")) + "</i>" : " · GUI-only") }),
            g ? h("span", { class: "tv-item-g", text: g.label }) : null
          ])
        ]);
        list.appendChild(h("li", null, [item]));
      });
    }
    function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

    function select(id, pushHash) {
      var summary = episodes.filter(function (e) { return e.id === id; })[0];
      if (!summary) return;
      current = summary;
      Array.prototype.forEach.call(list.querySelectorAll(".tv-item"), function (b, i) {
        b.setAttribute("aria-current", visible()[i] && visible()[i].id === id ? "true" : "false");
      });
      if (pushHash) {
        try { history.replaceState(null, "", "#ep=" + id); } catch (e) { location.hash = "ep=" + id; }
      }
      loadJSON(base + "data/" + id + ".json").then(function (data) {
        if (current.id !== id) return;
        if (!player) {
          main.innerHTML = "";
          var holder = h("div");
          main.appendChild(holder);
          player = W.trajPlayer(holder, { base: base, onPair: function (pid) { select(pid, true); } });
        }
        player.setEpisode(data);
        if (pushHash && main.getBoundingClientRect().top < 0) main.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      }).catch(function (err) {
        main.innerHTML = "";
        main.appendChild(h("div", { class: "tv-loading", text: "Could not load this episode (" + err.message + ")." }));
      });
    }
    function fromHash() {
      var m = /[#&]ep=([\w-]+)/.exec(location.hash || "");
      return m ? m[1] : null;
    }

    modeSel.addEventListener("change", function () { state.mode = modeSel.value; renderList(); });
    appSel.addEventListener("change", function () { state.app = appSel.value; renderList(); });
    toolsBtn.addEventListener("click", function () { state.tools = !state.tools; toolsBtn.setAttribute("aria-pressed", state.tools ? "true" : "false"); renderList(); });
    search.addEventListener("input", function () { state.q = search.value; renderList(); });
    window.addEventListener("hashchange", function () { var id = fromHash(); if (id && (!current || current.id !== id)) select(id, false); });
    document.addEventListener("keydown", function (e) {
      if (!player) return;
      var t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") { player.next(); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { player.prev(); e.preventDefault(); }
      else if (e.key === " ") { if (player.isPlaying()) player.pause(); else player.play(); e.preventDefault(); }
    });

    loadJSON(base + "data/index.json").then(function (data) {
      index = data;
      episodes = data.episodes.slice().sort(function (a, b) {
        var fa = a.featured || 99, fb = b.featured || 99;
        if (fa !== fb) return fa - fb;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      renderTabs(); renderApps(); renderList();
      var start = fromHash();
      if (!start || !episodes.some(function (e) { return e.id === start; })) start = episodes[0] && episodes[0].id;
      if (start) select(start, false);
    }).catch(function (err) {
      main.innerHTML = "";
      main.appendChild(h("div", { class: "tv-loading", text: "Could not load the episode index (" + err.message + "). Serve the site over HTTP." }));
    });

    return { el: root, select: select, destroy: function () { if (player) player.destroy(); target.innerHTML = ""; } };
  };

  /* =============================================================== pairs */
  W.trajPairs = function (target, opts) {
    opts = opts || {};
    var base = opts.base || "viewer/";
    var pairs = opts.pairs || [];
    var tabs = h("div", { class: "wt-tabs", role: "tablist" });
    var task = h("p", { class: "tv-task" });
    var left = h("div"), right = h("div");
    var grid = h("div", { class: "tv-pairs-grid" }, [left, right]);
    var playAll = h("button", { class: "wt-btn", type: "button", text: "Play both" });
    var reset = h("button", { class: "wt-btn", type: "button", text: "Reset" });
    var foot = h("div", { class: "tv-pairs-foot" }, [playAll, reset, h("span", { class: "wt-note", style: "margin:0", text: "Each side runs at its own pace. Coral steps are app-native tool calls." })]);
    var root = h("div", { class: "tv-pairs" }, [tabs, task, grid, foot]);
    target.innerHTML = "";
    target.appendChild(root);
    var players = [null, null], active = 0;

    function lane(holder, ep, label) {
      holder.innerHTML = "";
      var tag = ep.mode === "hybrid" ? h("span", { class: "tv-tag is-mode-hybrid", text: countsText(ep) })
        : h("span", { class: "tv-tag", text: plural(stepCount(ep), "step", "steps") + " · taps only" });
      holder.appendChild(h("div", { class: "tv-lane-head" }, [h("h4", { text: label }), tag, ep.note ? h("span", { class: "tv-tag is-model", text: ep.note }) : null]));
      var mount = h("div");
      holder.appendChild(mount);
      return W.trajPlayer(mount, { base: base, compact: true, episode: ep });
    }
    function show(i) {
      active = i;
      var p = pairs[i];
      Array.prototype.forEach.call(tabs.children, function (t, j) { t.setAttribute("aria-selected", j === i ? "true" : "false"); });
      players.forEach(function (pl) { if (pl) pl.destroy(); });
      players = [null, null];
      left.innerHTML = right.innerHTML = "";
      left.appendChild(h("div", { class: "tv-loading", text: "Loading…" }));
      Promise.all([loadJSON(base + "data/" + p.gui + ".json"), loadJSON(base + "data/" + p.hybrid + ".json")]).then(function (eps) {
        if (active !== i) return;
        task.innerHTML = "";
        task.appendChild(document.createTextNode(eps[1].title + " "));
        if (eps[1].instruction && eps[1].instruction !== eps[1].title) task.appendChild(h("span", { lang: "zh", text: "— " + eps[1].instruction }));
        players[0] = lane(left, eps[0], "GUI-only");
        players[1] = lane(right, eps[1], "Hybrid: GUI and app-native tools");
      }).catch(function (err) {
        left.innerHTML = "";
        left.appendChild(h("div", { class: "tv-loading", text: "Could not load this pair (" + err.message + ")." }));
      });
    }
    pairs.forEach(function (p, i) {
      tabs.appendChild(h("button", { class: "wt-tab", type: "button", role: "tab", "aria-selected": i === 0 ? "true" : "false", text: p.label, onclick: function () { show(i); } }));
    });
    playAll.addEventListener("click", function () { players.forEach(function (pl) { if (pl) { pl.reset(); pl.play(); } }); });
    reset.addEventListener("click", function () { players.forEach(function (pl) { if (pl) pl.reset(); }); });
    if (pairs.length) show(0);
    return { el: root, destroy: function () { players.forEach(function (pl) { if (pl) pl.destroy(); }); target.innerHTML = ""; } };
  };

  /* =============================================================== cards */
  W.trajCards = function (target, opts) {
    opts = opts || {};
    var base = opts.base || "viewer/";
    var viewer = opts.viewer || "viewer.html";
    var grid = h("div", { class: "tv-cards" });
    target.innerHTML = "";
    target.appendChild(grid);
    loadJSON(base + "data/index.json").then(function (data) {
      var rows = data.episodes.filter(function (e) { return e.featured; }).sort(function (a, b) { return a.featured - b.featured; });
      if (opts.limit) rows = rows.slice(0, opts.limit);
      rows.forEach(function (e, i) {
        var apps = h("div", { class: "tv-card-apps" });
        (e.appNames || []).slice(0, 4).forEach(function (n) { apps.appendChild(h("span", { text: n })); });
        var m = h("p", { class: "tv-card-m", html: escape(plural(e.steps, "step", "steps")) + (e.mode === "hybrid" ? " · <i>" + escape(plural(e.toolCalls, "tool call", "tool calls")) + "</i>" : "") });
        grid.appendChild(h("a", { class: "tv-card", href: viewer + "#ep=" + e.id, "aria-label": e.title }, [
          h("div", { class: "tv-card-shot" }, [h("img", { src: posterUrl(base, e), alt: "", loading: "lazy" })]),
          h("div", { class: "tv-card-body" }, [h("span", { class: "tv-card-n", text: pad2(i + 1) + " · " + (e.difficulty || "") }), h("p", { class: "tv-card-t", text: e.title }), apps, m])
        ]));
      });
      if (opts.onLoad) opts.onLoad(data);
    }).catch(function () { target.innerHTML = ""; });
    function pad2(n) { return (n < 10 ? "0" : "") + n; }
    function escape(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    return { el: grid, destroy: function () { target.innerHTML = ""; } };
  };
})();
