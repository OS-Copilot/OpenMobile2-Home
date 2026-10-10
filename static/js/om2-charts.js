/* ==========================================================================
   OpenMobile-2 — charts
   Dependency-free inline SVG charts over window.OM2 (static/js/om2-data.js).
   API: OM2Widgets.<name>(elOrSelector, opts) -> { el, update(opts), destroy() }.
   Each chart renders at its container's width, re-renders on resize and on
   the "openmobile2:theme" event, reads colours from the CSS tokens at render
   time and shares one tooltip element. Styles: static/css/om2-charts.css.
   ========================================================================== */
(function (global) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var THEME_EVENT = "openmobile2:theme";
  var ANIM_MS = 300;
  var W = global.OM2Widgets = global.OM2Widgets || {};
  var reduced = !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var raf = global.requestAnimationFrame
    ? function (f) { global.requestAnimationFrame(f); }
    : function (f) { setTimeout(function () { f(Date.now()); }, 16); };

  /* ------------------------------------------------------------ 1. helpers */
  function cssVar(name, fallback) {
    var v = global.getComputedStyle(document.documentElement).getPropertyValue(name);
    v = v ? String(v).trim() : "";
    return v || fallback || "";
  }
  /* SVG element with attributes, appended to parent */
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function txt(s, attrs, parent) { var n = el("text", attrs, parent); n.textContent = s; return n; }
  /* HTML element (controls, legend, tooltip) */
  function html(tag, cls, parent, content) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (content != null) n.textContent = content;
    if (parent) parent.appendChild(n);
    return n;
  }
  function assign(t, s) { if (s) Object.keys(s).forEach(function (k) { t[k] = s[k]; }); return t; }
  function find(arr, pred) { for (var i = 0; i < arr.length; i++) if (pred(arr[i])) return arr[i]; return null; }
  function maxOf(arr, f) { return Math.max.apply(null, arr.map(f)); }
  /* result cell: number | {v, star, std} | null */
  function val(cell) { return cell == null ? null : (typeof cell === "number" ? cell : cell.v); }
  function meta(cell) { return (cell && typeof cell === "object") ? cell : { v: cell, star: false, std: null }; }
  function f1(v) { return v == null ? "–" : v.toFixed(1); }
  function signed(v) { return (v < 0 ? "-" : "+") + f1(Math.abs(v)); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function axisMax(v, step) { return Math.max(step, Math.ceil(v / step) * step); }
  function ticks(max, step) { var t = []; for (var v = 0; v <= max + 1e-9; v += step) t.push(v); return t; }
  function linear(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
  /* label width estimate at 12 px; layout only, never used for clipping */
  function textW(s, size) { return s.length * (size || 12) * 0.56; }
  function px(v) { return Math.round(v) + 0.5; }
  function shortStage(s) { return /^Base\b/.test(s) ? "Base" : s; }

  /* ------------------------------------------------------------ 2. axes */
  function hgrid(svg, tk, sy, x0, x1, fmt) {
    tk.forEach(function (t) {
      var y = px(sy(t));
      el("line", { x1: x0, x2: x1, y1: y, y2: y, class: t === 0 ? "ch-axis" : "ch-grid" }, svg);
      txt(fmt(t), { x: x0 - 8, y: y + 4, "text-anchor": "end", class: "ch-tick" }, svg);
    });
  }
  function vgrid(svg, tk, sx, y0, y1, fmt) {
    tk.forEach(function (t) {
      var x = px(sx(t));
      el("line", { x1: x, x2: x, y1: y0, y2: y1, class: t === 0 ? "ch-axis" : "ch-grid" }, svg);
      txt(fmt(t), { x: x, y: y1 + 16, "text-anchor": "middle", class: "ch-tick" }, svg);
    });
  }

  /* ------------------------------------------------------------ 3. tooltip
     One fixed-position .wt-tip for every chart; follows the pointer and flips
     at the viewport edges. Lines are strings or { t, small }. */
  var tip = (function () {
    var node = null;
    function get() {
      if (!node) {
        node = html("div", "wt-tip ch-tip", document.body);
        node.setAttribute("role", "tooltip");
      }
      return node;
    }
    function place(e) {
      var n = get(), pad = 14, w = n.offsetWidth, h = n.offsetHeight;
      var x = e.clientX + pad, y = e.clientY + pad;
      if (x + w > global.innerWidth - 8) x = e.clientX - pad - w;
      if (y + h > global.innerHeight - 8) y = e.clientY - pad - h;
      n.style.left = Math.max(4, x) + "px";
      n.style.top = Math.max(4, y) + "px";
    }
    return {
      show: function (lines, e) {
        var n = get();
        while (n.firstChild) n.removeChild(n.firstChild);
        lines.forEach(function (l, i) {
          if (l == null) return;
          var s = typeof l === "string" ? { t: l } : l;
          html(i === 0 ? "b" : (s.small ? "small" : "span"), "ch-tl", n, s.t);
        });
        n.classList.add("on");
        place(e);
      },
      move: place,
      hide: function () { if (node) node.classList.remove("on"); }
    };
  })();
  function hover(node, lines) {
    node.addEventListener("pointerenter", function (e) { tip.show(lines, e); });
    node.addEventListener("pointermove", tip.move);
    node.addEventListener("pointerleave", tip.hide);
    return node;
  }

  /* ------------------------------------------------------------ 4. legend */
  function legend(parent, items) {
    var box = html("div", "wt-legend ch-legend", parent);
    items.forEach(function (it) {
      var s = html("span", null, box);
      var i = html("i", it.kind ? "ch-" + it.kind : null, s);
      if (it.kind === "outline" || it.kind === "dash") i.style.color = it.color;
      else i.style.background = it.color;
      s.appendChild(document.createTextNode(it.label));
    });
  }

  /* ------------------------------------------------------------ 5. entrance
     Bars grow from zero over ANIM_MS the first time the chart is in view.
     Items: { node, dir: "w" | "v", size, base } (base = baseline y for "v"). */
  function zero(list) {
    list.forEach(function (b) {
      if (b.dir === "w") b.node.setAttribute("width", 0);
      else { b.node.setAttribute("height", 0); b.node.setAttribute("y", b.base); }
    });
  }
  function grow(list) {
    if (!list.length) return;
    zero(list);
    var t0 = null;
    raf(function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / ANIM_MS), k = 1 - Math.pow(1 - p, 3);
      list.forEach(function (b) {
        var s = b.size * k;
        if (b.dir === "w") b.node.setAttribute("width", s);
        else { b.node.setAttribute("height", s); b.node.setAttribute("y", b.base - s); }
      });
      if (p < 1) raf(step);
    });
  }

  /* ------------------------------------------------------------ 6. widget shell
     spec: { defaults, setup(root, st, rerender)?, draw(ctx, st) }. draw builds
     into ctx.box, which replaces the previous box on every render; anything
     setup appends to root (tabs) survives renders. */
  function make(target, opts, spec) {
    var root = typeof target === "string" ? document.querySelector(target) : target;
    if (!root) throw new Error("OM2Widgets: no element matches " + target);
    if (!global.OM2) throw new Error("OM2Widgets: window.OM2 is missing; load om2-data.js first");
    var o = assign(assign({}, spec.defaults), opts || {});
    var st = { width: 0, rootH: 0, extras: 0, box: null, drawn: false, seen: false, pending: null, dead: false, metric: o.metric };
    var ro = null, io = null, onResize = null;
    root.classList.add("ch-root");
    /* height "fill": the chart is as tall as its container (a flex item in a
       card that stretches to its grid row), never under opts.minHeight; the
       legend and notes below the svg are measured and subtracted */
    var fill = o.height === "fill";
    if (fill) root.classList.add("ch-fill");

    function width() { return Math.round(root.getBoundingClientRect().width); }
    function rootH() { return Math.round(root.getBoundingClientRect().height); }
    function chartHeight() {
      if (!fill) return o.height;
      /* the first pass draws at the floor height to measure the legend and
         notes; only then does the chart take the container's height, so a
         pass never grows the row by its own extras */
      if (!st.measured) return o.minHeight || 200;
      return Math.max(o.minHeight || 200, rootH() - st.extras);
    }
    function context(w) {
      var c = { root: root, opts: o, width: w, height: chartHeight(), anim: [], box: html("div", "ch-box") };
      c.svg = function (sw, sh, label) {
        var s = el("svg", { class: "ch-svg", width: sw, height: sh, viewBox: "0 0 " + sw + " " + sh,
          role: "img", "aria-label": label }, c.box);
        el("title", null, s).textContent = label;
        return s;
      };
      c.grow = function (node, dir, size, base) { c.anim.push({ node: node, dir: dir, size: size, base: base }); return node; };
      c.legend = function (items) { legend(c.box, items); };
      c.note = function (s) { html("p", "wt-note", c.box, s); };
      return c;
    }
    function render(animate) {
      if (st.dead) return;
      var w = width();
      if (!w) return;
      st.width = w;
      tip.hide();
      var c = context(w);
      spec.draw(c, st);
      if (st.box) root.replaceChild(c.box, st.box); else root.appendChild(c.box);
      st.box = c.box;
      if (fill) {
        var svgEl = c.box.querySelector("svg.ch-svg");
        var extras = svgEl ? Math.round(c.box.getBoundingClientRect().height - svgEl.getBoundingClientRect().height) : 0;
        st.rootH = rootH();
        var first = !st.measured;
        st.measured = true;
        if ((first || Math.abs(extras - st.extras) > 1) && (st.fillPass || 0) < 2) {
          st.extras = extras; st.fillPass = (st.fillPass || 0) + 1;
          return render(animate);
        }
        st.fillPass = 0;
      }
      var wantAnim = !reduced && (animate || !st.drawn || !!st.pending);
      st.drawn = true;
      st.pending = null;
      if (!wantAnim) return;
      if (st.seen) grow(c.anim);
      else { zero(c.anim); st.pending = c.anim; }
    }
    function onTheme() { render(false); }
    function onSize() { if (width() !== st.width || (fill && rootH() !== st.rootH)) render(false); }

    if (global.ResizeObserver) {
      ro = new global.ResizeObserver(function () { raf(onSize); });
      ro.observe(root);
    } else {
      onResize = onSize;
      global.addEventListener("resize", onResize);
    }
    global.addEventListener(THEME_EVENT, onTheme);
    if (!reduced && global.IntersectionObserver) {
      io = new global.IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        st.seen = true;
        io.disconnect(); io = null;
        if (st.pending) { grow(st.pending); st.pending = null; }
      }, { threshold: 0.15 });
      io.observe(root);
    } else {
      st.seen = true;
    }

    if (spec.setup) spec.setup(root, st, function () { render(true); });
    render(false);

    return {
      el: root,
      update: function (next) {
        assign(o, next);
        if (next && next.metric != null) st.metric = next.metric;
        if (st.sync) st.sync();
        render(false);
      },
      destroy: function () {
        st.dead = true;
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        if (onResize) global.removeEventListener("resize", onResize);
        global.removeEventListener(THEME_EVENT, onTheme);
        tip.hide();
        while (root.firstChild) root.removeChild(root.firstChild);
        root.classList.remove("ch-root");
      }
    };
  }

  /* ========================================================================
     7. domainCoverage — apps per domain, simulated clients vs emulator apps
     ======================================================================== */
  W.domainCoverage = function (target, opts) {
    return make(target, opts, { defaults: { height: 300 }, draw: function (c) {
      var D = global.OM2;
      var rows = D.domains.map(function (d) {
        var e = find(D.data.appsByDomain, function (r) { return r.key === d.key; }) || { sim: 0, emu: 0 };
        return { label: d.label, sim: e.sim, emu: e.emu, color: cssVar("--dom-" + d.key, d.color) };
      });
      var Wd = c.width, H = c.height;
      var m = { l: Math.ceil(maxOf(rows, function (r) { return textW(r.label); })) + 16, r: 34, t: 8, b: 34 };
      var max = axisMax(maxOf(rows, function (r) { return Math.max(r.sim, r.emu); }), 5);
      var sx = linear(0, max, m.l, Wd - m.r);
      var rowH = (H - m.t - m.b) / rows.length, barH = Math.min(11, rowH * 0.34), gap = 3;
      var svg = c.svg(Wd, H, "Apps per domain: MobileGym++ simulated clients and Android emulator apps");
      vgrid(svg, ticks(max, 5), sx, m.t, H - m.b, String);
      rows.forEach(function (r, i) {
        var cy = m.t + rowH * (i + 0.5), y1 = cy - gap / 2 - barH, y2 = cy + gap / 2;
        var w1 = sx(r.sim) - m.l, w2 = Math.max(0, sx(r.emu) - m.l - 1.5);
        txt(r.label, { x: m.l - 10, y: cy + 4, "text-anchor": "end", class: "ch-label" }, svg);
        c.grow(el("rect", { x: m.l, y: y1, width: w1, height: barH, rx: 2, fill: r.color, class: "ch-bar" }, svg), "w", w1);
        c.grow(el("rect", { x: m.l + 0.75, y: y2 + 0.75, width: w2, height: barH - 1.5, rx: 2, fill: "none",
          stroke: r.color, "stroke-width": 1.5, class: "ch-bar" }, svg), "w", w2);
        txt(String(r.sim), { x: sx(r.sim) + 6, y: y1 + barH - 1.5, class: "ch-value" }, svg);
        txt(String(r.emu), { x: sx(r.emu) + 6, y: y2 + barH - 1.5, class: "ch-value" }, svg);
        hover(el("rect", { x: m.l - 4, y: cy - rowH / 2, width: Wd - m.l - m.r + 8, height: rowH, class: "ch-hit" }, svg),
          [r.label, plural(r.sim, "simulated client", "simulated clients") + " · " + plural(r.emu, "emulator app", "emulator apps")]);
      });
      var dim = cssVar("--text-dim", "#8b98a8");
      c.legend([{ label: "MobileGym++ client", color: dim }, { label: "Android emulator app", color: dim, kind: "outline" }]);
    } });
  };

  /* ========================================================================
     8. benchComposition — MobileGym++ Bench by app count and by domain
     ======================================================================== */
  W.benchComposition = function (target, opts) {
    return make(target, opts, { defaults: { height: 300 }, draw: function (c) {
      var D = global.OM2, Wd = c.width, stacked = Wd < 600, total = D.bench.total;
      var L = stacked ? { x: 0, y: 0, w: Wd, h: 230 } : { x: 0, y: 0, w: Math.round(Wd * 0.4), h: c.height };
      var R = stacked ? { x: 0, y: 250, w: Wd, h: 290 } : { x: L.w + 28, y: 0, w: Wd - L.w - 28, h: c.height };
      var H = stacked ? R.y + R.h : c.height;
      var accent = cssVar("--accent-400", "#39cdb5");
      var svg = c.svg(Wd, H, "MobileGym++ Bench composition: tasks by number of apps and task incidences by domain");

      /* left: tasks by number of apps (vertical bars) */
      var by = D.bench.byApps, lm = { l: 36, r: 8, t: 28, b: 30 };
      var ymax = axisMax(maxOf(by, function (d) { return d.tasks; }), 25);
      var sy = linear(0, ymax, L.y + L.h - lm.b, L.y + lm.t);
      var band = (L.w - lm.l - lm.r) / by.length, bw = Math.min(44, band * 0.6);
      txt("Tasks by number of apps", { x: L.x + lm.l, y: L.y + 14, class: "ch-title" }, svg);
      hgrid(svg, ticks(ymax, 25), sy, L.x + lm.l, L.x + L.w - lm.r, String);
      by.forEach(function (d, i) {
        var cx = L.x + lm.l + band * (i + 0.5), y = sy(d.tasks), h = sy(0) - y;
        c.grow(el("rect", { x: cx - bw / 2, y: y, width: bw, height: h, rx: 2, fill: accent, class: "ch-bar" }, svg), "v", h, sy(0));
        txt(String(d.tasks), { x: cx, y: y - 6, "text-anchor": "middle", class: "ch-value" }, svg);
        txt(plural(d.apps, "app", "apps"), { x: cx, y: sy(0) + 16, "text-anchor": "middle" }, svg);
        hover(el("rect", { x: cx - bw / 2 - 5, y: y - 18, width: bw + 10, height: h + 18, class: "ch-hit" }, svg),
          [plural(d.apps, "app", "apps"), d.tasks + " of " + total + " tasks"]);
      });

      /* right: task incidences by domain (horizontal bars, domain colours) */
      var bd = D.bench.byDomain.map(function (d) {
        var dom = D.domainByKey[d.key] || { label: d.key, color: accent };
        return { label: dom.label, tasks: d.tasks, color: cssVar("--dom-" + d.key, dom.color) };
      });
      var rm = { l: Math.ceil(maxOf(bd, function (r) { return textW(r.label); })) + 16, r: 34, t: 28, b: 46 };
      var xmax = axisMax(maxOf(bd, function (d) { return d.tasks; }), 25);
      var sx = linear(0, xmax, R.x + rm.l, R.x + R.w - rm.r);
      var rowH = (R.h - rm.t - rm.b) / bd.length, bh = Math.min(14, rowH * 0.6);
      txt("Task incidences by domain", { x: R.x + rm.l, y: R.y + 14, class: "ch-title" }, svg);
      vgrid(svg, ticks(xmax, 25), sx, R.y + rm.t, R.y + R.h - rm.b, String);
      bd.forEach(function (d, i) {
        var cy = R.y + rm.t + rowH * (i + 0.5), w = sx(d.tasks) - sx(0);
        txt(d.label, { x: sx(0) - 10, y: cy + 4, "text-anchor": "end", class: "ch-label" }, svg);
        c.grow(el("rect", { x: sx(0), y: cy - bh / 2, width: w, height: bh, rx: 2, fill: d.color, class: "ch-bar" }, svg), "w", w);
        txt(String(d.tasks), { x: sx(d.tasks) + 6, y: cy + 4, class: "ch-value" }, svg);
        hover(el("rect", { x: sx(0) - 4, y: cy - rowH / 2, width: R.w - rm.l - rm.r + 8, height: rowH, class: "ch-hit" }, svg),
          [d.label, d.tasks + " of " + total + " tasks touch this domain"]);
      });
      var cap = "a cross-domain task counts in each domain it touches";
      if (textW(cap, 11.5) <= R.w - rm.l) txt(cap, { x: R.x + rm.l, y: R.y + R.h - 4, class: "ch-caption" }, svg);
      else c.note("A cross-domain task counts in each domain it touches.");
    } });
  };

  /* ========================================================================
     9. toolDumbbell — GUI-only vs hybrid success per model on MobileGym++
     ======================================================================== */
  function dumbbellRows() {
    var D = global.OM2, rows = [];
    function push(label, full, mgpp, ours, tu) {
      var g = mgpp && mgpp[0], h = mgpp && mgpp[1];
      if (val(g) == null || val(h) == null) return;
      rows.push({ label: label, full: full, gui: val(g), hyb: val(h), ours: ours, tu: tu,
        star: !!(meta(g).star || meta(h).star) });
    }
    D.results.groups.forEach(function (g) {
      g.rows.forEach(function (row) {
        if (row.family !== "ours") {
          push(row.name, row.name, row.mgpp, false,
            find(D.toolUse, function (t) { return t.model === row.name && t.stage == null; }));
          return;
        }
        /* "Base (Qwen3.5-9B)" names the base model; the tool-use table keys on it */
        var baseModel = (/^Base \((.+)\)$/.exec(row.stages[0].stage) || [])[1];
        row.stages.forEach(function (s) {
          var isBase = shortStage(s.stage) === "Base";
          var want = isBase ? "Base" : (s.stage === "Hybrid SFT" ? "+ Hybrid SFT" : null);
          var tu = want && find(D.toolUse, function (t) { return t.model === baseModel && t.stage === want; });
          push(row.name + " · " + shortStage(s.stage), row.name + " · " + s.stage, s.mgpp, !isBase, tu || null);
        });
      });
    });
    rows.sort(function (a, b) { return b.hyb - a.hyb; });
    return rows;
  }

  W.toolDumbbell = function (target, opts) {
    return make(target, opts, { defaults: { height: null }, draw: function (c) {
      var rows = dumbbellRows(), Wd = c.width, narrow = Wd < 560;
      var labelW = Math.min(240, Math.ceil(maxOf(rows, function (r) { return textW(r.label) * (r.ours ? 1.06 : 1); })) + 16);
      var m = { l: narrow ? 8 : labelW, r: 44, t: 6, b: 40 };
      var H = Math.max(c.height || 0, m.t + rows.length * (narrow ? 36 : 22) + m.b);
      var rowH = (H - m.t - m.b) / rows.length;
      var sx = linear(0, 100, m.l, Wd - m.r);
      var pop = cssVar("--pop-400", "#ff8f6b"), dim = cssVar("--text-dim", "#8b98a8"), faint = cssVar("--text-faint", "#65717f");
      var svg = c.svg(Wd, H, "GUI-only versus hybrid success on MobileGym++ Bench, per model and training stage");
      vgrid(svg, ticks(100, 20), sx, m.t, H - m.b, String);
      txt("Success on MobileGym++ Bench (%)", { x: (m.l + Wd - m.r) / 2, y: H - 6, "text-anchor": "middle", class: "ch-axis-title" }, svg);
      rows.forEach(function (r, i) {
        var top = m.t + i * rowH, cy = narrow ? top + rowH - 10 : top + rowH / 2;
        var cls = "ch-label" + (r.ours ? " ours" : ""), right = r.hyb >= r.gui;
        if (r.ours) el("rect", { x: 0, y: top, width: Wd, height: rowH, rx: 3, class: "ch-band" }, svg);
        if (narrow) txt(r.label, { x: m.l, y: top + 12, class: cls }, svg);
        else txt(r.label, { x: m.l - 10, y: cy + 4, "text-anchor": "end", class: cls }, svg);
        el("line", { x1: sx(r.gui), x2: sx(r.hyb), y1: cy, y2: cy, stroke: r.hyb > r.gui ? pop : faint, "stroke-width": 2 }, svg);
        el("circle", { cx: sx(r.gui), cy: cy, r: 5, fill: dim, class: "ch-dot" }, svg);
        el("circle", { cx: sx(r.hyb), cy: cy, r: 5, fill: pop, class: "ch-dot" }, svg);
        txt(f1(r.hyb), { x: sx(r.hyb) + (right ? 9 : -9), y: cy + 4, "text-anchor": right ? "start" : "end",
          class: "ch-value", style: "fill:" + pop }, svg);
        var lines = [r.full, "GUI-only " + f1(r.gui) + " · Hybrid " + f1(r.hyb) + " · " + signed(r.hyb - r.gui) + " points"];
        if (r.tu) lines.push(r.tu.callRate.toFixed(2) + " tool calls per task · " + r.tu.tools + " distinct tools · " +
          r.tu.tasks + " tasks with a tool call");
        if (r.star) lines.push({ t: "reproduced by the authors", small: true });
        hover(el("rect", { x: narrow ? 0 : m.l - 4, y: top, width: narrow ? Wd : Wd - m.l + 4, height: rowH, class: "ch-hit" }, svg), lines);
      });
      c.legend([{ label: "GUI-only", color: dim, kind: "dot" }, { label: "Hybrid", color: pop, kind: "dot" }]);
    } });
  };

  /* ========================================================================
     9b. toolSteps — GUI-only vs hybrid mean steps per task, for the rows
     with a measured step count (OM2.toolSteps); same order as toolDumbbell
     ======================================================================== */
  function stepRows() {
    var D = global.OM2, out = [];
    dumbbellRows().forEach(function (r) {
      var s = find(D.toolSteps || [], function (t) { return (t.stage ? t.model + " \u00b7 " + t.stage : t.model) === r.label; });
      if (s) out.push({ label: r.label, full: r.full, ours: r.ours, gui: s.gui, hyb: s.hyb, sGui: r.gui, sHyb: r.hyb });
    });
    return out;
  }

  W.toolSteps = function (target, opts) {
    return make(target, opts, { defaults: { height: null }, draw: function (c) {
      var rows = stepRows(), Wd = c.width, narrow = Wd < 560;
      if (!rows.length) return;
      var labelW = Math.min(240, Math.ceil(maxOf(rows, function (r) { return textW(r.label) * (r.ours ? 1.06 : 1); })) + 16);
      var m = { l: narrow ? 8 : labelW, r: 78, t: 6, b: 40 };
      var H = Math.max(c.height || 0, m.t + rows.length * (narrow ? 36 : 22) + m.b);
      var rowH = (H - m.t - m.b) / rows.length;
      var lo = 12, hi = 46;
      var sx = linear(lo, hi, m.l, Wd - m.r);
      var pop = cssVar("--pop-400", "#ff8f6b"), dim = cssVar("--text-dim", "#8b98a8"), faint = cssVar("--text-faint", "#65717f");
      var svg = c.svg(Wd, H, "GUI-only versus hybrid mean steps per task on MobileGym++ Bench, per model and training stage");
      vgrid(svg, [15, 25, 35, 45], sx, m.t, H - m.b, String);
      txt(narrow ? "Mean steps per task (lower is better)" : "Mean steps per task on MobileGym++ Bench (lower is better)",
        { x: (m.l + Wd - m.r) / 2, y: H - 6, "text-anchor": "middle", class: "ch-axis-title" }, svg);
      rows.forEach(function (r, i) {
        var top = m.t + i * rowH, cy = narrow ? top + rowH - 10 : top + rowH / 2;
        var cls = "ch-label" + (r.ours ? " ours" : ""), shorter = r.hyb < r.gui, d = r.hyb - r.gui;
        if (r.ours) el("rect", { x: 0, y: top, width: Wd, height: rowH, rx: 3, class: "ch-band" }, svg);
        if (narrow) txt(r.label, { x: m.l, y: top + 12, class: cls }, svg);
        else txt(r.label, { x: m.l - 10, y: cy + 4, "text-anchor": "end", class: cls }, svg);
        el("line", { x1: sx(r.gui), x2: sx(r.hyb), y1: cy, y2: cy, stroke: shorter ? pop : faint, "stroke-width": 2 }, svg);
        el("circle", { cx: sx(r.gui), cy: cy, r: 5, fill: dim, class: "ch-dot" }, svg);
        el("circle", { cx: sx(r.hyb), cy: cy, r: 5, fill: pop, class: "ch-dot" }, svg);
        /* the hybrid count, then the change against GUI-only, past the far dot */
        var t = txt(f1(r.hyb), { x: sx(Math.max(r.gui, r.hyb)) + 9, y: cy + 4, class: "ch-value", style: "fill:" + pop }, svg);
        var ts = el("tspan", { dx: 5, style: "fill:" + dim + ";font-weight:500" }, t);
        ts.textContent = signed(d);
        hover(el("rect", { x: narrow ? 0 : m.l - 4, y: top, width: narrow ? Wd : Wd - m.l + 4, height: rowH, class: "ch-hit" }, svg), [
          r.full,
          "GUI-only " + f1(r.gui) + " steps \u00b7 Hybrid " + f1(r.hyb) + " steps \u00b7 " + signed(d) + " steps",
          "Success: GUI-only " + f1(r.sGui) + " \u00b7 Hybrid " + f1(r.sHyb)
        ]);
      });
      c.legend([{ label: "GUI-only", color: dim, kind: "dot" }, { label: "Hybrid", color: pop, kind: "dot" }]);
    } });
  };

  /* ========================================================================
     10. coverageScaling — share of shared-app data per number of training
     apps (bars) and Pass@1 after training on 15 or 53 apps (slope chart)
     ======================================================================== */
  W.coverageScaling = function (target, opts) {
    return make(target, opts, { defaults: { height: 300 }, draw: function (c) {
      var D = global.OM2, pts = D.coverage.points, Wd = c.width, stacked = Wd < 560;
      var L = stacked ? { x: 0, y: 0, w: Wd, h: 250 } : { x: 0, y: 0, w: Math.round(Wd * 0.52), h: c.height };
      var R = stacked ? { x: 0, y: 270, w: Wd, h: 250 } : { x: L.w + 28, y: 0, w: Wd - L.w - 28, h: c.height };
      var H = stacked ? R.y + R.h : c.height;
      var accent = cssVar("--accent-400", "#39cdb5"), pop = cssVar("--pop-400", "#ff8f6b"), cyan = cssVar("--cyan-300", "#6fcfe0");
      var svg = c.svg(Wd, H, "Share of training data from the 15 shared apps against the number of training apps, " +
        "and held-out and in-distribution Pass@1 after training on 15 or 53 apps");
      c.legend([{ label: "share of training data from the 15 shared apps", color: accent },
        { label: "held-out Pass@1", color: pop, kind: "dot" }, { label: "InD Pass@1", color: cyan, kind: "dot" }]);

      /* left: share of the fixed budget that comes from the shared apps */
      var lm = { l: 44, r: 8, t: 34, b: 44 };
      var sy = linear(0, 100, L.y + L.h - lm.b, L.y + lm.t), band = (L.w - lm.l - lm.r) / pts.length, bw = Math.min(56, band * 0.5);
      var cx = function (i) { return L.x + lm.l + band * (i + 0.5); };
      txt("Share of training data from the 15 shared apps", { x: L.x + lm.l, y: L.y + 14, class: "ch-title" }, svg);
      hgrid(svg, ticks(100, 20), sy, L.x + lm.l, L.x + L.w - lm.r, function (t) { return t + "%"; });
      pts.forEach(function (p, i) {
        var share = Math.round(p.indShare * 100), y = sy(share), h = sy(0) - y, x = cx(i);
        c.grow(el("rect", { x: x - bw / 2, y: y, width: bw, height: h, rx: 2, fill: accent, class: "ch-bar" }, svg), "v", h, sy(0));
        txt(share + "%", { x: x, y: y - 6, "text-anchor": "middle", class: "ch-value ch-halo" }, svg);
        txt(String(p.trainApps), { x: x, y: sy(0) + 16, "text-anchor": "middle" }, svg);
        var lines = [p.trainApps + " training apps", share + "% of the training data from the 15 shared apps"];
        if (p.heldOut != null || p.ind != null) lines.push("held-out Pass@1 " + f1(p.heldOut) + " · InD Pass@1 " + f1(p.ind));
        hover(el("rect", { x: x - band / 2, y: L.y + lm.t, width: band, height: L.h - lm.t - lm.b, class: "ch-hit" }, svg), lines);
      });
      txt("training apps", { x: L.x + lm.l + (L.w - lm.l - lm.r) / 2, y: L.y + L.h - 6, "text-anchor": "middle", class: "ch-axis-title" }, svg);

      /* right: slope chart between the two settings that report Pass@1, y 50-80 */
      var ends = pts.filter(function (p) { return p.heldOut != null || p.ind != null; });
      if (ends.length < 2) return;
      var pA = ends[0], pB = ends[ends.length - 1];
      var rm = { l: 72, r: 100, t: 34, b: 44 }, x0 = R.x + rm.l, x1 = R.x + R.w - rm.r;
      var ry = linear(50, 80, R.y + R.h - rm.b, R.y + rm.t);
      txt("Pass@1 by number of training apps", { x: x0, y: R.y + 14, class: "ch-title" }, svg);
      [50, 60, 70, 80].forEach(function (t) {
        var y = px(ry(t));
        el("line", { x1: x0 - 14, x2: x1 + 14, y1: y, y2: y, class: "ch-grid" }, svg);
        txt(String(t), { x: R.x, y: y + 4, class: "ch-tick" }, svg);
      });
      [pA, pB].forEach(function (p, k) {
        txt(plural(p.trainApps, "app", "apps"), { x: k ? x1 : x0, y: ry(50) + 16, "text-anchor": "middle" }, svg);
      });
      [{ key: "heldOut", name: "held-out", color: pop }, { key: "ind", name: "InD", color: cyan }].forEach(function (s) {
        var vA = pA[s.key], vB = pB[s.key];
        if (vA == null || vB == null) return;
        var yA = ry(vA), yB = ry(vB);
        el("line", { x1: x0, x2: x1, y1: yA, y2: yB, stroke: s.color, "stroke-width": 2 }, svg);
        el("circle", { cx: x0, cy: yA, r: 5, fill: s.color, class: "ch-dot" }, svg);
        el("circle", { cx: x1, cy: yB, r: 5, fill: s.color, class: "ch-dot" }, svg);
        txt(f1(vA), { x: x0 - 10, y: yA + 4, "text-anchor": "end", class: "ch-value", style: "fill:" + s.color }, svg);
        txt(f1(vB) + " " + s.name, { x: x1 + 10, y: yB + 4, class: "ch-value", style: "fill:" + s.color }, svg);
        hover(el("line", { x1: x0, x2: x1, y1: yA, y2: yB, class: "ch-hit-stroke" }, svg), [s.name + " Pass@1",
          f1(vA) + " with " + pA.trainApps + " apps → " + f1(vB) + " with " + pB.trainApps + " apps · " + signed(vB - vA) + " points"]);
      });
    } });
  };

  /* ========================================================================
     11. stageChart — the two models across training stages, one metric at a time
     ======================================================================== */
  var METRICS = [
    { key: "aw/0", bench: "aw", idx: 0, label: "AndroidWorld Pass@1" },
    { key: "mw/0", bench: "mw", idx: 0, label: "MobileWorld GUI" },
    { key: "mg/0", bench: "mg", idx: 0, label: "MobileGym SR" },
    { key: "mgpp/1", bench: "mgpp", idx: 1, label: "MobileGym++ Hybrid" },
    { key: "spa", bench: "spa", idx: null, label: "SPA-Bench L3" }
  ];
  function cellOf(row, mt) { var b = row[mt.bench]; return mt.idx == null ? b : (b ? b[mt.idx] : null); }

  W.stageChart = function (target, opts) {
    return make(target, opts, {
      defaults: { height: 300, metric: "aw/0" },
      setup: function (root, st, rerender) {
        var tabs = html("div", "wt-tabs ch-tabs", root);
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", "Benchmark metric");
        var btns = METRICS.map(function (mt) {
          var b = html("button", "wt-tab", tabs, mt.label);
          b.type = "button";
          b.setAttribute("role", "tab");
          b.addEventListener("click", function () {
            if (st.metric === mt.key) return;
            st.metric = mt.key;
            st.sync();
            rerender();
          });
          return b;
        });
        st.sync = function () {
          btns.forEach(function (b, i) { b.setAttribute("aria-selected", String(METRICS[i].key === st.metric)); });
        };
        st.sync();
      },
      draw: function (c, st) {
        var D = global.OM2, mt = find(METRICS, function (x) { return x.key === st.metric; }) || METRICS[0];
        var ours = [], best = null;
        D.results.groups.forEach(function (g) {
          g.rows.forEach(function (row) {
            if (row.family === "ours") { ours.push(row); return; }
            var cell = cellOf(row, mt), v = val(cell);
            if (v != null && (!best || v > best.v)) best = { name: row.name, v: v, star: meta(cell).star };
          });
        });
        var stages = ours[0].stages.map(function (s) { return shortStage(s.stage); });
        var colors = [cssVar("--accent-300", "#6fe3cf"), cssVar("--accent-500", "#1fa893")];
        var all = [best ? best.v : 0];
        ours.forEach(function (r) { r.stages.forEach(function (s) { var v = val(cellOf(s, mt)); if (v != null) all.push(v); }); });
        /* next multiple of 10 above the tallest bar or the reference, plus 8 for labels */
        var ymax = axisMax(Math.max.apply(null, all) + 8, 10);
        var Wd = c.width, H = c.height, m = { l: 36, r: 12, t: 16, b: 30 };
        var sy = linear(0, ymax, H - m.b, m.t), band = (Wd - m.l - m.r) / stages.length;
        var gw = Math.min(band * 0.68, 100), bw = gw / ours.length - 3;
        var svg = c.svg(Wd, H, "OpenMobile-2 training stages on " + mt.label);
        hgrid(svg, ticks(ymax, ymax > 60 ? 20 : 10), sy, m.l, Wd - m.r, String);
        stages.forEach(function (name, i) {
          var gx = m.l + band * (i + 0.5) - gw / 2;
          txt(name, { x: m.l + band * (i + 0.5), y: sy(0) + 16, "text-anchor": "middle" }, svg);
          ours.forEach(function (r, j) {
            var s = find(r.stages, function (q) { return shortStage(q.stage) === name; });
            var cell = s ? cellOf(s, mt) : null, v = val(cell), x = gx + j * (bw + 3), cxb = x + bw / 2;
            if (v == null) { txt("–", { x: cxb, y: sy(0) - 6, "text-anchor": "middle", class: "ch-na" }, svg); return; }
            var y = sy(v), h = sy(0) - y, md = meta(cell);
            c.grow(el("rect", { x: x, y: y, width: bw, height: h, rx: 2, fill: colors[j], class: "ch-bar" }, svg), "v", h, sy(0));
            txt(f1(v), { x: cxb, y: y - 5, "text-anchor": "middle", class: "ch-value ch-halo" }, svg);
            var lines = [r.name + " · " + s.stage, mt.label + " " + f1(v) + (md.std != null ? " ± " + md.std : "")];
            if (md.star) lines.push({ t: "reproduced by the authors", small: true });
            hover(el("rect", { x: x - 4, y: y - 16, width: bw + 8, height: h + 16, class: "ch-hit" }, svg), lines);
          });
        });
        if (best) {
          var yr = px(sy(best.v));
          el("line", { x1: m.l, x2: Wd - m.r, y1: yr, y2: yr, class: "ch-ref" }, svg);
          txt(best.name + " " + f1(best.v), { x: Wd - m.r - 4, y: yr - 5, "text-anchor": "end", class: "ch-ref-label ch-halo" }, svg);
          hover(el("rect", { x: m.l, y: yr - 4, width: Wd - m.l - m.r, height: 8, class: "ch-hit" }, svg),
            [best.name, mt.label + " " + f1(best.v) + " · best model outside this work",
              best.star ? { t: "reproduced by the authors", small: true } : null]);
        }
        c.legend([{ label: ours[0].name, color: colors[0] }, { label: ours[1].name, color: colors[1] },
          { label: "best other model", color: cssVar("--text-dim", "#8b98a8"), kind: "dash" }]);
      }
    });
  };

  W.metrics = METRICS;
})(window);
