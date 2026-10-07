/* ==========================================================================
   OpenMobile-2 — data pipeline flow (#pipeline-flow)
   Two runtime lanes feed five stages that split into two released
   resources. While playing, dots travel the arrows (coral ones stand for
   runs with tool calls, grey ones are rejected at a drop stage). Selecting
   a node shows its caption under the canvas.

     OM2Widgets.pipelineFlow(elOrSelector, { data })
       -> { el, select(key), play(), pause(), destroy() }, or null without a host

   data: { lanes, stages, outputs }, default OM2.pipelineFlow.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var count = 0;

  function reduced() { return !!(mq && mq.matches); }

  /* ------------------------------------------------------------ geometry
     viewBox units: lanes at the left, five stages across the middle row,
     outputs at the right. Dots run under the nodes, so a node "absorbs" a
     dot on one side and releases it on the other. */
  var VIEW = "0 0 1080 290", MID = 146;
  var LANE = { x: 12, w: 156, h: 52, cy: [78, 214] };
  var STAGE = { x0: 220, w: 100, gap: 22, h: 54 };
  var OUT = { x: 858, w: 210, h: 58, cy: [78, 214] };
  var DROP_LEN = 45;                /* dashed exit below a drop stage */
  var SPEED = 78;                   /* units per second: about 1.5 s per stage hop */
  var SPAWN_MS = 700, DOT_R = 3.5, TOOL_SHARE = 0.34, DROP_SHARE = 0.2;

  /* lane icons, 16 x 16 outlines: a phone and a browser window */
  var ICON = {
    emu: "M5 1.5h6a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V3A1.5 1.5 0 0 1 5 1.5zM6.5 12.5h3",
    sim: "M2.5 3.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM1.5 6.5h13M3.5 5h1M5.5 5h1"
  };

  /* ------------------------------------------------------------- helpers */
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function html(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, cls, x, y, str) {
    var t = svg("text", { "class": cls, x: x, y: y }, parent);
    t.textContent = str;
    return t;
  }
  function stageX(i) { return STAGE.x0 + i * (STAGE.w + STAGE.gap); }
  function curve(x0, y0, x1, y1) {
    var dx = (x1 - x0) * 0.6;
    return "M" + x0 + " " + y0 + " C" + (x0 + dx) + " " + y0 + " " + (x1 - dx) + " " + y1 + " " + x1 + " " + y1;
  }

  /* -------------------------------------------------------------- widget */
  function pipelineFlow(target, opts) {
    var host = typeof target === "string" ? document.querySelector(target) : target;
    if (!host) {
      if (window.console) console.warn("OM2Widgets.pipelineFlow: no host for", target);
      return null;
    }
    var data = (opts && opts.data) || (window.OM2 && window.OM2.pipelineFlow) || {};
    var lanes = data.lanes || [], stages = data.stages || [], outs = data.outputs || [];
    var uid = "pf" + (++count);
    var nodes = {}, captions = {}, edgesOf = {}, edges = [];
    var selected = null, capTimer = 0;
    var wanted = false, visible = false, running = false, autoDone = false;
    var raf = 0, last = null, lastSpawn = -1e9, dots = [], spawned = 0, split = 0, io = null;

    /* a second mount on the same host replaces the first, listeners included */
    Array.prototype.slice.call(host.children).forEach(function (c) {
      if (!c.classList.contains("pf")) return;
      if (typeof c.pfDestroy === "function") c.pfDestroy(); else host.removeChild(c);
    });
    var root = html("div", "pf", host);
    var canvas = html("div", "pf-canvas", root);
    var pic = svg("svg", { "class": "pf-svg", viewBox: VIEW, width: "100%", preserveAspectRatio: "xMidYMid meet",
      role: "group", "aria-label": "Data collection pipeline" }, canvas);

    /* arrowheads: a default and an accent marker, swapped per edge */
    var defs = svg("defs", {}, pic);
    ["", "-on"].forEach(function (s) {
      var m = svg("marker", { id: uid + "-arrow" + s, viewBox: "0 0 10 10", refX: 9, refY: 5,
        markerWidth: 8, markerHeight: 8, markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
      svg("path", { "class": "pf-head" + (s ? " pf-head-on" : ""), d: "M0 0L10 5L0 10z" }, m);
    });
    var edgeLayer = svg("g", { "class": "pf-edges", "aria-hidden": "true" }, pic);
    var routeLayer = svg("g", { "class": "pf-routes", "aria-hidden": "true" }, pic);
    var dotLayer = svg("g", { "class": "pf-dots", "aria-hidden": "true" }, pic);
    var nodeLayer = svg("g", { "class": "pf-nodes" }, pic);

    function edge(d, keys, cls) {
      var p = svg("path", { "class": "pf-edge" + (cls ? " " + cls : ""), d: d }, edgeLayer);
      p.setAttribute("marker-end", "url(#" + uid + "-arrow)");
      keys.forEach(function (k) { (edgesOf[k] = edgesOf[k] || []).push(p); });
      edges.push(p);
      return p;
    }
    function route(d, kind) { return { el: svg("path", { "class": "pf-route", d: d }, routeLayer), kind: kind, len: 0 }; }
    function node(cls, key, label, x, y, w, h) {
      var g = svg("g", { "class": "pf-node " + cls, role: "button", tabindex: 0, "data-key": key,
        "aria-label": label, "aria-pressed": "false" }, nodeLayer);
      svg("rect", { "class": "pf-box", x: x, y: y, width: w, height: h, rx: 10 }, g);
      svg("path", { "class": "pf-lit", d: "M" + (x + 10) + " " + (y + 1) + "H" + (x + w - 10) }, g);
      nodes[key] = g;
      return g;
    }

    /* lanes */
    var routes = { lane: [], across: [], half: [], step: [], drop: [], split: [], into: [] };
    var s0 = stages[0], firstKey = s0 ? s0.key : null;
    lanes.forEach(function (ln, i) {
      var cy = LANE.cy[i] || MID;
      var g = node("pf-lane", ln.key, ln.label, LANE.x, cy - LANE.h / 2, LANE.w, LANE.h);
      svg("path", { "class": "pf-icon", d: ICON[ln.key] || ICON.emu,
        transform: "translate(" + (LANE.x + 12) + " " + (cy - 8) + ")" }, g);
      text(g, "pf-label", LANE.x + 36, cy + 5, ln.label);
      captions[ln.key] = ln.caption;
      var d = curve(LANE.x + LANE.w, cy, STAGE.x0, MID);
      edge(d, firstKey ? [ln.key, firstKey] : [ln.key]);
      routes.lane.push(route(d));
    });

    /* stages */
    stages.forEach(function (st, i) {
      var x = stageX(i), cx = x + STAGE.w / 2, y = MID - STAGE.h / 2;
      var g = node("pf-stage", st.key, st.label, x, y, STAGE.w, STAGE.h);
      text(g, "pf-label", cx, MID + 5, st.label);
      captions[st.key] = st.caption;
      routes.across.push(route("M" + x + " " + MID + "H" + (x + STAGE.w)));
      routes.half.push(route("M" + x + " " + MID + "H" + cx));
      if (i < stages.length - 1) {
        var d = "M" + (x + STAGE.w) + " " + MID + "H" + stageX(i + 1);
        edge(d, [st.key, stages[i + 1].key]);
        routes.step.push(route(d));
      }
      if (st.drop) {
        var y1 = y + STAGE.h, y2 = y1 + DROP_LEN;
        edge("M" + cx + " " + y1 + "V" + y2, [st.key], "pf-drop");
        svg("path", { "class": "pf-bin", d: "M" + (cx - 9) + " " + (y2 + 6) + "h18M" + (cx - 7) + " " + (y2 + 6) +
          "v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-11M" + (cx - 3) + " " + (y2 + 6) + "v-2h6v2" }, edgeLayer);
        routes.drop.push(route("M" + cx + " " + MID + "V" + (y2 + 8), "drop"));
      } else {
        routes.drop.push(null);
      }
      if (st.tag) {
        var tw = Math.round(st.tag.length * 6.3) + 20, ty = y + STAGE.h + 8;
        var tg = svg("g", { "class": "pf-tag", "aria-hidden": "true" }, pic);
        svg("rect", { x: cx - tw / 2, y: ty, width: tw, height: 18, rx: 9 }, tg);
        text(tg, "", cx, ty + 12.5, st.tag);
      }
    });

    /* outputs */
    var lastStage = stages[stages.length - 1];
    outs.forEach(function (o, i) {
      var cy = OUT.cy[i] || MID, cx = OUT.x + OUT.w / 2;
      var g = node("pf-out", o.key, o.label + (o.sub ? ", " + o.sub : ""), OUT.x, cy - OUT.h / 2, OUT.w, OUT.h);
      text(g, "pf-label", cx, cy - 3, o.label);
      if (o.sub) text(g, "pf-sub", cx, cy + 14, o.sub);
      captions[o.key] = o.caption;
      if (lastStage) {
        var d = curve(stageX(stages.length - 1) + STAGE.w, MID, OUT.x, cy);
        edge(d, [lastStage.key, o.key]);
        routes.split.push(route(d));
        routes.into.push(route("M" + OUT.x + " " + cy + "H" + cx, "into"));
      }
    });

    /* caption and controls */
    var cap = html("p", "pf-caption", root);
    cap.setAttribute("aria-live", "polite");
    var controls = html("div", "wt-controls pf-controls", root);
    var btn = html("button", "wt-btn pf-play", controls);
    btn.type = "button";
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="pf-play-ic" d="M5 3l8 5-8 5z"/>' +
      '<path class="pf-pause-ic" d="M4 3h3v10H4zM9 3h3v10H9z"/></svg><span>Play</span>';
    var legend = html("div", "wt-legend pf-legend", controls);
    legend.innerHTML = '<span><i class="pf-sw-gui"></i>GUI-only run</span>' +
      '<span><i class="pf-sw-tool"></i>run with tool calls</span><span><i class="pf-sw-drop"></i>rejected</span>';
    if (reduced()) { btn.disabled = true; btn.title = "Animation is off while reduced motion is on"; }

    /* --------------------------------------------------------- selection */
    function showCaption(str) {
      if (cap.textContent === str) return;
      clearTimeout(capTimer);
      cap.classList.add("pf-fade");
      capTimer = setTimeout(function () {
        cap.textContent = str;
        cap.classList.remove("pf-fade");
      }, reduced() ? 0 : 150);
    }
    function restCaption() { showCaption(captions[selected || firstKey] || ""); }
    function select(key) {
      if (key != null && !nodes[key]) return false;
      selected = key == null ? null : key;
      var on = edgesOf[selected] || [];
      root.classList.toggle("pf-has-sel", selected !== null);
      Object.keys(nodes).forEach(function (k) {
        var hit = k === selected;
        nodes[k].classList.toggle("pf-on", hit);
        nodes[k].setAttribute("aria-pressed", hit ? "true" : "false");
      });
      edges.forEach(function (p) {
        var hit = on.indexOf(p) >= 0;
        p.classList.toggle("pf-on", hit);
        p.setAttribute("marker-end", "url(#" + uid + "-arrow" + (hit ? "-on" : "") + ")");
      });
      restCaption();
      return true;
    }
    Object.keys(nodes).forEach(function (k) {
      var g = nodes[k];
      var preview = function () { showCaption(captions[k] || ""); };
      g.addEventListener("mouseenter", preview);
      g.addEventListener("focusin", preview);
      g.addEventListener("mouseleave", restCaption);
      g.addEventListener("focusout", restCaption);
      g.addEventListener("click", function () { select(selected === k ? null : k); });
      g.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
        e.preventDefault();
        select(selected === k ? null : k);
      });
    });

    /* -------------------------------------------------------------- dots */
    function len(seg) { return seg.len || (seg.len = seg.el.getTotalLength()); }
    function spawn() {
      var segs = [routes.lane[spawned++ % routes.lane.length]];
      var dropped = false;
      for (var i = 0; i < stages.length && !dropped; i++) {
        if (routes.drop[i] && Math.random() < DROP_SHARE) {
          segs.push(routes.half[i], routes.drop[i]);
          dropped = true;
        } else {
          segs.push(routes.across[i]);
          if (routes.step[i]) segs.push(routes.step[i]);
        }
      }
      if (!dropped && routes.split.length) {
        var o = split++ % routes.split.length;
        segs.push(routes.split[o], routes.into[o]);
      }
      if (!segs[0]) return;
      var tool = Math.random() < TOOL_SHARE;
      var el = svg("circle", { "class": "pf-dot" + (tool ? " pf-dot-tool" : ""), r: DOT_R }, dotLayer);
      dots.push({ el: el, segs: segs, i: 0, s: 0 });
    }
    function step(d, dt) {
      d.s += SPEED * dt;
      var seg = d.segs[d.i];
      while (seg && d.s > len(seg)) {
        d.s -= len(seg);
        seg = d.segs[++d.i];
        if (seg && seg.kind === "drop") d.el.classList.add("pf-dot-drop");
      }
      if (!seg) return false;
      var p = seg.el.getPointAtLength(d.s), f = d.s / (len(seg) || 1), op = 1;
      if (seg.kind === "into") op = 1 - f;
      else if (seg.kind === "drop") op = f < 0.55 ? 1 : 1 - (f - 0.55) / 0.45;
      d.el.setAttribute("cx", p.x.toFixed(1));
      d.el.setAttribute("cy", p.y.toFixed(1));
      d.el.setAttribute("opacity", Math.max(0, op).toFixed(2));
      return true;
    }
    function loop(now) {
      if (!running) return;
      if (last === null) last = now;
      var dt = Math.min(50, now - last) / 1000;
      last = now;
      if (now - lastSpawn >= SPAWN_MS) { lastSpawn = now; spawn(); }
      for (var i = dots.length - 1; i >= 0; i--) {
        if (!step(dots[i], dt)) { dotLayer.removeChild(dots[i].el); dots.splice(i, 1); }
      }
      raf = window.requestAnimationFrame(loop);
    }

    /* --------------------------------------------------------- play state
       wanted = the user's (or auto-start's) intent; running = intent gated
       by visibility, the hidden document and reduced motion. */
    function sync() {
      var should = wanted && visible && !document.hidden && !reduced() && !!window.requestAnimationFrame;
      btn.setAttribute("aria-pressed", wanted ? "true" : "false");
      btn.querySelector("span").textContent = wanted ? "Pause" : "Play";
      if (should === running) return;
      running = should;
      if (running) { last = null; raf = window.requestAnimationFrame(loop); }
      else if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    }
    function play() { if (reduced()) return; wanted = true; sync(); }
    function pause() { wanted = false; sync(); }
    btn.addEventListener("click", function () { autoDone = true; if (wanted) pause(); else play(); });

    function inView() {
      var r = root.getBoundingClientRect();
      var h = window.innerHeight || document.documentElement.clientHeight || 0;
      return r.bottom > 0 && r.top < h && r.width > 0;
    }
    function setVisible(v) {
      visible = v;
      if (v && !autoDone) { autoDone = true; wanted = !reduced(); }
      sync();
    }
    function onScroll() { setVisible(inView()); }
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (es) { setVisible(es[es.length - 1].isIntersecting); }, { threshold: 0.1 });
      io.observe(root);
    }
    /* observer callbacks can be late or throttled; scroll geometry is cheap */
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    document.addEventListener("visibilitychange", sync);
    /* the first observer callback can arrive late; measure once now */
    if (inView()) setVisible(true);

    function destroy() {
      wanted = false; sync();
      clearTimeout(capTimer);
      if (io) io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", sync);
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    root.pfDestroy = destroy;
    restCaption();
    return { el: root, select: select, play: play, pause: pause, destroy: destroy };
  }

  window.OM2Widgets = window.OM2Widgets || {};
  window.OM2Widgets.pipelineFlow = pipelineFlow;
})();
