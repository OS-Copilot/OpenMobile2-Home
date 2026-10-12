/* ==========================================================================
   OpenMobile-2 — data pipeline tour (#pipeline-flow)
   Seven stations explain the data pipeline: two runtimes, functionality
   map, goals, rollout, verification, step filtering, and the two outputs.
   The map is illustrative; later stations use released examples (data:
   OM2.pipelineTour; the rollout is played by OM2Widgets.trajPlayer).

     OM2Widgets.pipelineFlow(elOrSelector, { data, base })
       -> { el, go(i), play(), pause(), destroy() }, or null without a host

   Plays by itself while in view; arrows, the station buttons and the dots
   move through it by hand. Reduced motion: no autoplay, no entrances.
   ========================================================================== */
(function () {
  "use strict";

  var W = window.OM2Widgets = window.OM2Widgets || {};
  var NS = "http://www.w3.org/2000/svg";
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(mq && mq.matches); }

  /* station icons, 20 x 20 outlines */
  var ICON = {
    sources: "M4 2.5h5a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 9 17.5H4A1.5 1.5 0 0 1 2.5 16V4A1.5 1.5 0 0 1 4 2.5zM11.5 6.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6M11.5 9.5h7",
    graph:   "M5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM15 8.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 16.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6.6 4.4l6.8 2.4M14 8.3l-5 4.5M5.6 5.3l1.9 7.4",
    goals:   "M4 3.5h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM6.5 7.5h7M6.5 10.5h7M6.5 13.5h4",
    rollout: "M6.5 1.5h7a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 17V3a1.5 1.5 0 0 1 1.5-1.5zM8.5 7.2v5.6l4.5-2.8z",
    verify:  "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM6.5 10.2l2.4 2.4 4.6-4.9",
    filter:  "M3 3.5h14l-5.2 6.3v5.2l-3.6 1.8v-7z",
    outputs: "M3.5 6.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 3.5h9a1 1 0 0 1 1 1v9"
  };
  /* dwell per station while playing, ms; the rollout waits for its player */
  var DWELL = { sources: 4200, graph: 7600, goals: 7600, rollout: 26000, verify: 8200, filter: 8200, outputs: 6500 };

  /* ----------------------------------------------------------- helpers */
  function h(tag, cls, parent, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined && txt !== null) n.textContent = txt;
    if (parent) parent.appendChild(n);
    return n;
  }
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function icon(key, size) {
    var s = svg("svg", { viewBox: "0 0 20 20", width: size || 18, height: size || 18, fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
    svg("path", { d: ICON[key] || ICON.goals }, s);
    return s;
  }
  function kindLabel(k) { return k === "tool" ? "tool" : k.replace("_", " "); }
  /* schedule a chain of timeouts that can be cancelled as one */
  function timeline() {
    var ids = [];
    return {
      at: function (ms, fn) { ids.push(setTimeout(fn, reduced() ? 0 : ms)); },
      clear: function () { ids.forEach(clearTimeout); ids = []; }
    };
  }

  /* ---------------------------------------------------------- visuals
     Each returns { el, start(playing), stop() }. "start" runs the stage's
     own animation; they all render their final state under reduced motion. */
  function visSources(st) {
    var el = h("div", "pt-sources");
    var tl = timeline();
    var tiles = [];
    st.sources.forEach(function (s, i) {
      var t = h("div", "pt-source is-" + s.key, el);
      var head = h("div", "pt-source-head", t);
      head.appendChild(icon(s.key === "emu" ? "rollout" : "sources", 16));
      h("span", null, head, s.label);
      h("p", "pt-source-sub", t, s.sub);
      var grid = h("div", "pt-source-grid", t);
      for (var k = 0; k < 24; k++) { var c = h("i", "pt-app", grid); c.style.animationDelay = (i * 0.4 + k * 0.045) + "s"; }
      tiles.push(t);
    });
    /* Parallel sources, not a conversion from one runtime to the other. */
    var join = h("div", "pt-source-join");
    el.insertBefore(join, tiles[1]);
    var js = svg("svg", { viewBox: "0 0 32 32", width: "32", height: "32", "aria-hidden": "true" }, join);
    svg("path", { d: "M7 16h18M16 7v18" }, js);
    return { el: el, start: function () { el.classList.add("is-live"); }, stop: function () { tl.clear(); } };
  }

  function visKnowledge(st, onInteract) {
    var g = st.knowledge, el = h("div", "pt-knowledge");
    var sources = h("div", "pt-knowledge-sources", el);
    g.sources.forEach(function (source) {
      var card = h("div", "pt-knowledge-source", sources);
      card.appendChild(icon(source.icon, 18));
      var text = h("div", null, card);
      h("b", null, text, source.label);
      h("span", null, text, source.detail);
    });

    var map = h("div", "pt-knowledge-map", el);
    var head = h("div", "pt-knowledge-head", map);
    h("span", null, head, "Connected environment knowledge");
    h("span", "pt-knowledge-example", head, "Illustrative example");
    var columns = h("div", "pt-knowledge-columns", map);
    ["Apps", "Functions", "Relevant data"].forEach(function (label) { h("span", null, columns, label); });
    var network = h("div", "pt-knowledge-network", map);
    network.setAttribute("role", "group");
    network.setAttribute("aria-label", "Example relationships between apps, functions and relevant data");
    var lines = svg("svg", { "class": "pt-knowledge-links", viewBox: "0 0 600 216", preserveAspectRatio: "none", "aria-hidden": "true" }, network);
    var byId = {}, nodes = {}, selected = null;
    g.nodes.forEach(function (n) { byId[n.id] = n; });
    /* Undirected associations; the map does not encode execution order. */
    var links = g.links.map(function (pair) {
      var a = byId[pair[0]], b = byId[pair[1]];
      var ax = a.x + 78, bx = b.x - 78, mx = (ax + bx) / 2;
      var path = svg("path", { d: "M" + ax + " " + a.y + " C" + mx + " " + a.y + " " + mx + " " + b.y + " " + bx + " " + b.y }, lines);
      return { ids: pair, el: path };
    });
    g.nodes.forEach(function (n) {
      var isFunction = n.kind === "function";
      var node = h(isFunction ? "button" : "span", "pt-knowledge-node is-" + n.kind, network, n.label);
      node.style.left = (n.x / 600 * 100) + "%";
      node.style.top = (n.y / 216 * 100) + "%";
      if (isFunction) {
        node.type = "button";
        node.setAttribute("aria-pressed", "false");
        var related = g.links.filter(function (pair) { return pair.indexOf(n.id) !== -1; }).map(function (pair) { return byId[pair[0] === n.id ? pair[1] : pair[0]].label; });
        node.setAttribute("aria-label", n.label + ": " + related.join(", "));
        node.addEventListener("focus", onInteract);
        node.addEventListener("click", function () { onInteract(); select(selected === n.id ? null : n.id); });
      }
      nodes[n.id] = node;
    });
    var detail = h("div", "pt-knowledge-detail", el);
    detail.setAttribute("aria-live", "polite");
    detail.setAttribute("aria-atomic", "true");
    var detailTitle = h("b", null, detail), detailText = h("span", null, detail);
    function select(id) {
      selected = id;
      var related = {};
      if (id) related[id] = true;
      links.forEach(function (link) {
        var active = link.ids.indexOf(id) !== -1;
        link.el.classList.toggle("is-related", active);
        if (active) link.ids.forEach(function (key) { related[key] = true; });
      });
      g.nodes.forEach(function (n) {
        nodes[n.id].classList.toggle("is-related", !!related[n.id]);
        if (n.kind === "function") nodes[n.id].setAttribute("aria-pressed", n.id === id ? "true" : "false");
      });
      detailTitle.textContent = id ? "Example task context" : "Explore the connections";
      detailText.textContent = id ? byId[id].context : "Select a function to see its app and data context.";
    }
    select(null);
    return { el: el, start: function () {}, stop: function () {} };
  }

  function visGoals(st) {
    var el = h("div", "pt-goals"), tl = timeline();
    var views = h("div", "pt-views", el);
    h("span", "pt-views-k", views, "task context");
    st.goal.context.forEach(function (v) { h("span", "pt-tag", views, v); });
    var card = h("div", "pt-goal", el);
    var top = h("div", "pt-goal-top", card);
    h("span", "pt-tag is-pop", top, st.teacher);
    st.goal.apps.forEach(function (a) { h("span", "pt-tag", top, a); });
    var en = h("p", "pt-goal-en", card, "");
    var zh = h("p", "pt-goal-zh", card, st.goal.zh); zh.setAttribute("lang", "zh");
    var foot = h("div", "pt-goal-foot", card);
    st.filters.forEach(function (f) { var c = h("span", "pt-check", foot); h("i", null, c); h("span", null, c, f + " filter"); });
    var text = st.goal.en, i = 0;
    function type() {
      if (reduced()) { en.textContent = text; card.classList.add("is-done"); return; }
      en.textContent = text.slice(0, i); i++;
      if (i <= text.length) tl.at(28, type); else tl.at(300, function () { card.classList.add("is-done"); });
    }
    return {
      el: el,
      start: function () { i = 0; type(); },
      stop: function () { tl.clear(); }
    };
  }

  function visRollout(st, base, episodeId, onEnd) {
    var el = h("div", "pt-rollout");
    var holder = h("div", "pt-player", el);
    var note = h("p", "pt-loading", el, "Loading the episode…");
    var player = null, data = null, wantPlay = false;
    function ensure() {
      if (player || !W.trajPlayer) return;
      player = W.trajPlayer(holder, { base: base, compact: true, scale: 0.62, head: false, onEnd: onEnd });
      fetch(base + "data/" + episodeId + ".json", { cache: "force-cache" }).then(function (r) { return r.json(); }).then(function (d) {
        data = d; note.remove(); player.setEpisode(d);
        var cap = h("p", "pt-rollout-cap", el);
        h("b", null, cap, d.title); cap.appendChild(document.createTextNode(" — " + d.appNames.join(" + ") + ", one of the released trajectories."));
        if (wantPlay && !reduced()) player.play();
      }).catch(function () { note.textContent = "The episode could not be loaded."; });
    }
    return {
      el: el,
      start: function (playing) { ensure(); wantPlay = playing; if (player && data) { player.reset(); if (playing && !reduced()) player.play(); } },
      stop: function () { wantPlay = false; if (player) player.pause(); },
      destroy: function () { if (player) player.destroy(); }
    };
  }

  function visVerify(st) {
    var el = h("div", "pt-verify"), tl = timeline();
    var cards = [];
    st.checks.forEach(function (c, ci) {
      var card = h("div", "pt-checker" + (c.pass ? " is-pass" : " is-fail"), el);
      var head = h("div", "pt-checker-head", card);
      h("h5", null, head, c.title);
      h("span", "pt-tag", head, c.verifier);
      var rows = h("div", "pt-fields", card);
      var hr = h("div", "pt-field pt-field-h", rows); h("span", null, hr, "field"); h("span", null, hr, "expected"); h("span", null, hr, "actual"); h("span", null, hr, "");
      var fieldEls = c.fields.map(function (f) {
        var r = h("div", "pt-field" + (f.pass ? " is-ok" : " is-bad"), rows);
        h("code", null, r, f.name); h("span", null, r, f.expected); h("span", null, r, f.actual); h("i", "pt-mark", r);
        return r;
      });
      var seal = h("div", "pt-seal", card, c.pass ? "kept" : "rejected");
      cards.push({ card: card, fields: fieldEls, seal: seal, ci: ci });
    });
    return {
      el: el,
      start: function () {
        cards.forEach(function (c) {
          tl.at(200 + c.ci * 2600, function () { c.card.classList.add("is-in"); });
          c.fields.forEach(function (f, fi) { tl.at(700 + c.ci * 2600 + fi * 520, function () { f.classList.add("is-in"); }); });
          tl.at(900 + c.ci * 2600 + c.fields.length * 520, function () { c.card.classList.add("is-sealed"); });
        });
      },
      stop: function () { tl.clear(); }
    };
  }

  function visFilter(st) {
    var el = h("div", "pt-filter"), tl = timeline();
    /* colour by screen family: the home screen grey, each app its own hue */
    var families = {}, familyKeys = [];
    function family(route) {
      var f = route === "home" ? "home" : route.split("/")[0];
      if (!(f in families)) { families[f] = f === "home" ? "home" : "r" + (familyKeys.length % 3); familyKeys.push(f); }
      return families[f];
    }
    function shortRoute(r) { return r === "home" ? "home screen" : r.replace(/^notes\/note\/.*/, "notes/note/\u2026").replace(/\/$/, ""); }
    /* rules, lit one after the other */
    var rules = h("div", "pt-rules", el);
    var ruleEls = {};
    st.rules.forEach(function (r, i) {
      var b = h("div", "pt-rule is-" + r.key, rules);
      h("span", "pt-rule-n", b, "rule " + (i + 1));
      h("b", null, b, r.label);
      h("span", null, b, r.text);
      ruleEls[r.key] = b;
    });
    /* the screen trace: one chip per action, coloured by the screen it ends on */
    var trace = h("div", "pt-trace", el);
    var traceChips = st.steps.map(function (s) {
      var c = h("span", "pt-trace-chip " + family(s.route), trace);
      c.title = "after step " + s.n + ": " + shortRoute(s.route);
      return c;
    });
    /* the table */
    var table = h("div", "pt-ftable", el);
    var head = h("div", "pt-frow pt-frow-h", table);
    ["step", "action", "screen after", "state", "decision"].forEach(function (t) { h("span", null, head, t); });
    var inLoop = function (s) { return s.n >= st.loop[0] && s.n <= st.loop[1]; };
    var rows = st.steps.map(function (s) {
      var r = h("div", "pt-frow is-" + (s.kind === "tool" ? "tool" : "gui"), table);
      h("b", null, r, String(s.n));
      var act = h("span", "pt-fact", r);
      h("code", null, act, s.kind === "tool" ? s.name.split("__").slice(1).join("__") : kindLabel(s.kind) + (s.arg ? " " + s.arg : ""));
      if (s.failed) h("i", "pt-ftag", act, "failed");
      var sc = h("span", "pt-fscreen " + family(s.route), r); h("i", null, sc); h("span", null, sc, shortRoute(s.route));
      h("span", "pt-fstate " + (s.changed ? "is-changed" : "is-same"), r, s.kind === "tool" ? (s.effect || "changed") : (s.changed ? "new screen" : "unchanged"));
      var dec = h("span", "pt-fdec", r, "");
      return { el: r, s: s, dec: dec, noop: !s.changed && s.kind !== "tool", loop: inLoop(s) };
    });
    var foot = h("div", "pt-filter-foot", el);
    var result = h("span", "pt-filter-result", foot, "");
    var cut = rows.filter(function (r) { return r.noop || r.loop; });
    var cutNoop = rows.filter(function (r) { return r.noop && !r.loop; }).length;
    var cutLoop = rows.filter(function (r) { return r.loop; }).length;
    return {
      el: el,
      start: function () {
        rows.forEach(function (r, i) { tl.at(100 + i * 90, function () { r.el.classList.add("is-in"); traceChips[i].classList.add("is-in"); }); });
        tl.at(2200, function () {
          ruleEls.noop.classList.add("is-on");
          rows.forEach(function (r) { if (r.noop) { r.el.classList.add("is-noop"); r.dec.textContent = "cut \u00b7 no change"; traceChips[rows.indexOf(r)].classList.add("is-cut"); } });
        });
        tl.at(4400, function () {
          ruleEls.loop.classList.add("is-on");
          rows.forEach(function (r) { if (r.loop) { r.el.classList.add("is-loop"); if (!r.noop) r.dec.textContent = "cut \u00b7 loop"; traceChips[rows.indexOf(r)].classList.add("is-cut"); } });
          trace.classList.add("is-bracket");
        });
        tl.at(6600, function () {
          rows.forEach(function (r) { if (r.noop || r.loop) r.el.classList.add("is-gone"); else { r.el.classList.add("is-kept"); r.dec.textContent = "kept"; } });
          result.textContent = cut.length + " of " + rows.length + " steps cut (" + cutLoop + " in the loop, " + cutNoop + " without a state change), " + (rows.length - cut.length) + " kept";
          result.classList.add("is-in");
        });
      },
      stop: function () { tl.clear(); }
    };
  }

  function visOutputs(st, base, episodeId) {
    var el = h("div", "pt-outputs"), tl = timeline();
    var cards = st.outputs.map(function (o, i) {
      var card = h("div", "pt-product is-" + o.key, el);
      if (o.key === "sft") {
        var shot = h("div", "pt-product-shot", card);
        var img = h("img", null, shot); img.alt = ""; img.loading = "lazy"; img.src = base + "posters/" + episodeId + ".jpg";
      }
      var body = h("div", "pt-product-body", card);
      h("h5", null, body, o.label);
      h("p", "pt-product-sub", body, o.sub);
      var ul = h("ul", "pt-product-list", body);
      o.items.forEach(function (t) { h("li", null, ul, t); });
      var a = h("a", "wt-btn", body, o.linkLabel); a.href = o.link + (o.key === "sft" ? "#ep=" + episodeId : "");
      if (/^https?:/.test(o.link)) { a.target = "_blank"; a.rel = "noopener"; }
      return card;
    });
    return {
      el: el,
      start: function () { cards.forEach(function (c, i) { tl.at(200 + i * 420, function () { c.classList.add("is-in"); }); }); },
      stop: function () { tl.clear(); }
    };
  }

  /* ------------------------------------------------------------ widget */
  function pipelineFlow(target, opts) {
    var host = typeof target === "string" ? document.querySelector(target) : target;
    if (!host) { if (window.console) console.warn("OM2Widgets.pipelineFlow: no host for", target); return null; }
    opts = opts || {};
    var data = opts.data || (window.OM2 && window.OM2.pipelineTour);
    if (!data || !data.stations) return null;
    var base = opts.base || "viewer/";
    var stations = data.stations, n = stations.length;
    host.innerHTML = "";
    var root = h("div", "pt", host);
    root.setAttribute("tabindex", "0");
    root.setAttribute("aria-label", "Data pipeline tour");

    /* track */
    var track = h("div", "pt-track", root);
    var rail = h("div", "pt-rail", track);
    var fill = h("i", "pt-rail-fill", rail);
    var packet = h("i", "pt-packet", rail);
    var list = h("ol", "pt-stations", track);
    var btns = stations.map(function (st, i) {
      var li = h("li", "pt-station", list);
      var b = h("button", "pt-station-btn", li); b.type = "button";
      b.setAttribute("aria-label", "Stage " + (i + 1) + ": " + st.label);
      var ic = h("span", "pt-station-ico", b); ic.appendChild(icon(st.icon, 18));
      h("span", "pt-station-label", b, st.label);
      b.addEventListener("click", function () { manual(); go(i); });
      return b;
    });

    /* stage panel */
    var stage = h("div", "pt-stage", root);
    var visual = h("div", "pt-visual", stage);
    var copy = h("div", "pt-copy", stage);
    var stepEl = h("span", "pt-step", copy);
    var title = h("h4", "pt-title", copy);
    var caption = h("p", "pt-caption", copy);
    var extra = h("div", "pt-extra", copy);

    /* controls */
    var controls = h("div", "wt-controls pt-controls", root);
    var prev = h("button", "wt-btn", controls); prev.type = "button"; prev.setAttribute("aria-label", "Previous stage"); prev.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3 5 8l5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var playBtn = h("button", "wt-btn", controls); playBtn.type = "button";
    var next = h("button", "wt-btn", controls); next.type = "button"; next.setAttribute("aria-label", "Next stage"); next.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 3 5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var dots = h("ol", "wt-dots", controls);
    var dotBtns = stations.map(function (st, i) {
      var li = h("li", null, dots); var d = h("button", null, li); d.type = "button"; d.setAttribute("aria-label", st.label);
      d.addEventListener("click", function () { manual(); go(i); });
      return d;
    });
    var count = h("span", "wt-count", controls);
    function setPlayIcon() {
      playBtn.innerHTML = playing
        ? '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>'
        : '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>';
      playBtn.setAttribute("aria-label", playing ? "Pause the tour" : "Play the tour");
    }

    /* visuals are built once, started when their station shows */
    var cur = -1, playing = false, wanted = false, timer = null, visuals = [], userDrove = false;
    function build(i) {
      if (visuals[i]) return visuals[i];
      var st = stations[i], v;
      if (st.key === "sources") v = visSources(st);
      else if (st.key === "graph") v = visKnowledge(st, manual);
      else if (st.key === "goals") v = visGoals(st);
      else if (st.key === "rollout") v = visRollout(st, base, data.episode, function () { if (playing && cur === i) advance(); });
      else if (st.key === "verify") v = visVerify(st);
      else if (st.key === "filter") v = visFilter(st);
      else v = visOutputs(st, base, data.episode);
      visuals[i] = v;
      return v;
    }
    function layoutRail() {
      var tr = track.getBoundingClientRect();
      var centers = btns.map(function (b) { var r = b.querySelector(".pt-station-ico").getBoundingClientRect(); return r.left + r.width / 2 - tr.left; });
      var x = centers[Math.max(0, cur)];
      rail.style.left = Math.round(centers[0]) + "px";
      rail.style.width = Math.round(centers[n - 1] - centers[0]) + "px";
      fill.style.width = Math.round(x - centers[0]) + "px";
      packet.style.left = Math.round(x - centers[0]) + "px";
    }
    function go(i, keep) {
      i = (i + n) % n;
      if (cur >= 0 && visuals[cur]) { visuals[cur].stop(); }
      cur = i;
      var st = stations[i];
      btns.forEach(function (b, k) { b.parentNode.classList.toggle("is-current", k === i); b.parentNode.classList.toggle("is-done", k < i); b.setAttribute("aria-current", k === i ? "step" : "false"); });
      dotBtns.forEach(function (d, k) { if (k === i) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current"); });
      stepEl.textContent = "Stage " + (i + 1) + " of " + n;
      title.textContent = st.label;
      caption.textContent = st.caption;
      extra.innerHTML = "";
      if (st.key === "goals") { h("span", "pt-tag is-pop", extra, "teacher: " + st.teacher); }
      if (st.key === "rollout") { var a = h("a", "wt-btn", extra, "Every step, in the viewer"); a.href = "viewer.html#ep=" + data.episode; }
      count.textContent = (i + 1) + " / " + n;
      visual.innerHTML = "";
      var v = build(i);
      visual.appendChild(v.el);
      visual.className = "pt-visual is-" + st.key;
      stage.classList.remove("is-swap"); void stage.offsetWidth; stage.classList.add("is-swap");
      layoutRail();
      v.start(playing);
      if (playing && !keep) schedule();
    }
    function advance() { go(cur + 1); }
    function schedule() {
      clearTimeout(timer);
      var st = stations[cur];
      timer = setTimeout(advance, DWELL[st.key] || 7000);
    }
    function play() {
      if (reduced()) return;
      playing = true; setPlayIcon(); root.classList.add("is-playing");
      if (cur < 0) go(0); else { var v = visuals[cur]; if (v && stations[cur].key === "rollout") v.start(true); schedule(); }
    }
    function pause() {
      playing = false; setPlayIcon(); root.classList.remove("is-playing");
      clearTimeout(timer);
      var v = visuals[cur]; if (v && stations[cur].key === "rollout") v.stop();
    }
    function manual() { userDrove = true; if (playing) pause(); }
    prev.addEventListener("click", function () { manual(); go(cur - 1); });
    next.addEventListener("click", function () { manual(); go(cur + 1); });
    playBtn.addEventListener("click", function () { userDrove = true; if (playing) pause(); else play(); });
    root.addEventListener("keydown", function (e) {
      if (e.target !== root && !/pt-station-btn|wt-dots/.test(e.target.className || "")) return;
      if (e.key === "ArrowRight") { manual(); go(cur + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { manual(); go(cur - 1); e.preventDefault(); }
      else if (e.key === " ") { if (playing) pause(); else play(); e.preventDefault(); }
    });

    /* auto-play while in view, unless the reader took over */
    var visible = false;
    function setVisible(v) {
      if (v === visible) return;
      visible = v;
      if (v) { if (!userDrove && !playing) play(); }
      else if (playing) { wanted = true; pause(); }
      if (v && wanted && !userDrove) { wanted = false; play(); }
    }
    var io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (es) { es.forEach(function (en) { setVisible(en.isIntersecting); }); }, { threshold: 0.25 });
      io.observe(root);
    } else { setVisible(true); }
    var ro = ("ResizeObserver" in window) ? new ResizeObserver(layoutRail) : null;
    if (ro) ro.observe(track); else window.addEventListener("resize", layoutRail);

    go(0, true);
    setPlayIcon();

    return {
      el: root, go: function (i) { manual(); go(i); }, play: play, pause: pause,
      destroy: function () {
        pause(); if (io) io.disconnect(); if (ro) ro.disconnect(); else window.removeEventListener("resize", layoutRail);
        visuals.forEach(function (v) { if (v && v.destroy) v.destroy(); });
        host.innerHTML = "";
      }
    };
  }

  W.pipelineFlow = pipelineFlow;
})();
