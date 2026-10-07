/* ==========================================================================
   OpenMobile-2 — app-native tools widgets
   taskLanes: one MobileGym++ task stepped through GUI-only and hybrid in
   lockstep, each lane with its own copy of the app state and the same
   checker at the end. toolSchemas: the app's tool catalogue as tabs.
   Data from om2-data.js; colours and the .wt-* controls from main.css.
   ========================================================================== */
(function (global) {
  "use strict";

  var W = global.OM2Widgets = global.OM2Widgets || {};
  var doc = global.document;
  var reduced = !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var uid = 0;

  /* ------------------------------------------------------------- helpers */
  function resolve(target) {
    var el = typeof target === "string" ? doc.querySelector(target) : target;
    if (!el && global.console) console.warn("OM2Widgets: mount point not found:", target);
    return el || null;
  }
  function h(tag, cls, text) {
    var el = doc.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function attr(el, map) {
    for (var k in map) if (map.hasOwnProperty(k)) el.setAttribute(k, map[k]);
    return el;
  }
  function on(el, type, fn) {
    el.addEventListener(type, fn);
    return function () { el.removeEventListener(type, fn); };
  }
  function icon(d) {
    return '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="' + d + '" fill="currentColor"/></svg>';
  }
  var ICON_PLAY = icon("M4 2.5v11l9-5.5z");
  var ICON_PAUSE = icon("M4 2.5h3v11H4zm5 0h3v11H9z");

  /* --------------------------------------------------------- 1. task lanes
     One time index t drives both lanes: lane i shows its first min(t, n_i)
     steps. The state chips are recomputed per lane from its revealed steps,
     so the two columns are two independent executions of the same task. */
  W.taskLanes = function (target, opts) {
    var host = resolve(target);
    var task = opts && opts.task;
    if (!host || !task || !task.lanes) return null;

    var interval = (opts && opts.interval) || 2600;
    var keys = ["gui", "hybrid"].filter(function (k) { return !!task.lanes[k]; });
    var stateDefs = task.state || [];
    var T = 0;
    keys.forEach(function (k) { T = Math.max(T, task.lanes[k].steps.length); });
    var t = 0, playing = false, hover = false, timer = null, offs = [];

    var root = h("div", "ln");

    /* goal, with the app as a chip */
    var goal = h("p", "ln-goal");
    if (task.app) goal.appendChild(h("span", "ln-app", task.app));
    goal.appendChild(h("span", "ln-goal-text", task.goal || ""));
    root.appendChild(goal);

    /* legend */
    var legend = h("div", "wt-legend ln-legend");
    [["gui", "GUI action"], ["tool", "app-native tool call"]].forEach(function (d) {
      var item = h("span");
      item.appendChild(h("i", "ln-dot is-" + d[0]));
      item.appendChild(doc.createTextNode(d[1]));
      legend.appendChild(item);
    });
    root.appendChild(legend);

    /* lanes */
    function phWidth(s) {
      var n = (s.label || "").length + (s.text || "").length;
      return Math.max(34, Math.min(72, Math.round(n * 0.9)));
    }
    function buildLane(key, lane) {
      var el = h("section", "ln-lane ln-lane-" + key);
      attr(el, { "data-lane": key, "aria-label": lane.label || key });
      var head = h("header", "ln-lane-head");
      head.appendChild(h("h4", "ln-lane-title", lane.label || key));
      el.appendChild(head);

      var list = h("ol", "ln-steps");
      var rows = lane.steps.map(function (s, i) {
        var kind = s.kind === "tool" ? "tool" : "gui";
        var li = h("li", "ln-step ln-step-" + kind);
        li.appendChild(h("span", "ln-idx", String(i + 1)));
        var mark = h("span", "ln-kind");
        mark.appendChild(h("i", "ln-dot is-" + kind));
        mark.appendChild(h("span", "ln-kind-label", kind === "tool" ? "tool" : "tap"));
        li.appendChild(mark);
        var ph = h("span", "ln-ph");
        ph.style.width = phWidth(s) + "%";
        li.appendChild(ph);
        var body = h("div", "ln-body");
        var label = h("span", "ln-label" + (kind === "tool" ? " ln-mono" : ""), s.label || "");
        if (s.call) label.title = s.call;
        body.appendChild(label);
        body.appendChild(h("span", "ln-text", s.text || ""));
        li.appendChild(body);
        list.appendChild(li);
        return li;
      });
      el.appendChild(list);

      var foot = h("div", "ln-foot");
      var chips = {};
      stateDefs.forEach(function (d) {
        var chip = attr(h("span", "ln-chip"), { "data-key": d.key });
        chip.appendChild(h("span", "ln-chip-k", d.label + ":"));
        chip.appendChild(h("span", "ln-chip-v", String(d.initial)));
        foot.appendChild(chip);
        chips[d.key] = chip;
      });
      var n = lane.steps.length;
      foot.appendChild(h("span", "ln-lane-tag", n + (n === 1 ? " step" : " steps")));
      el.appendChild(foot);
      return { el: el, steps: lane.steps, rows: rows, chips: chips };
    }
    var grid = h("div", "ln-lanes");
    var lanes = keys.map(function (k) { return buildLane(k, task.lanes[k]); });
    lanes.forEach(function (l) { grid.appendChild(l.el); });
    root.appendChild(grid);

    /* closing line: the one checker both lanes are judged by */
    var check = h("p", "ln-check");
    check.appendChild(h("span", "ln-check-label", "Same checker for both lanes:"));
    check.appendChild(doc.createTextNode(" " + (task.check || "")));
    root.appendChild(check);

    /* controls */
    var controls = h("div", "wt-controls ln-controls");
    var prevBtn = attr(h("button", "wt-btn ln-prev", "Prev"), { type: "button" });
    var playBtn = attr(h("button", "wt-btn ln-play"), { type: "button", "aria-pressed": "false" });
    var nextBtn = attr(h("button", "wt-btn ln-next", "Next"), { type: "button" });
    var dotsEl = h("ol", "wt-dots ln-dots");
    var dots = [];
    for (var i = 1; i <= T; i++) {
      var li = h("li");
      var b = attr(h("button"), { type: "button", "aria-label": "Step " + i + " of " + T });
      li.appendChild(b);
      dotsEl.appendChild(li);
      dots.push(b);
    }
    var count = attr(h("span", "wt-count ln-count"), { "aria-live": "polite" });
    var kbd = attr(h("span", "wt-kbd ln-kbd", "← → keys"), { "aria-hidden": "true" });
    [prevBtn, playBtn, nextBtn, dotsEl, count, kbd].forEach(function (c) { controls.appendChild(c); });
    root.appendChild(controls);

    function setPlayBtn() {
      playBtn.setAttribute("aria-pressed", String(playing));
      playBtn.innerHTML = (playing ? ICON_PAUSE : ICON_PLAY) + "<span>" + (playing ? "Pause" : "Play") + "</span>";
    }
    function pulse(chip) {
      chip.classList.remove("is-pulse");
      void chip.offsetWidth; /* restart the animation */
      chip.classList.add("is-pulse");
    }

    function render(animate) {
      lanes.forEach(function (l) {
        var n = Math.min(t, l.steps.length);
        l.rows.forEach(function (row, i) {
          row.classList.toggle("is-on", i < n);
          row.classList.toggle("is-current", i === n - 1);
        });
        l.el.classList.toggle("is-done", t >= l.steps.length);

        /* initial values, overridden by the last revealed step that writes the key */
        var vals = {}, by = {};
        stateDefs.forEach(function (d) { vals[d.key] = String(d.initial); by[d.key] = ""; });
        for (var i = 0; i < n; i++) {
          var st = l.steps[i].state;
          if (!st) continue;
          for (var k in st) {
            if (st.hasOwnProperty(k) && vals.hasOwnProperty(k)) {
              vals[k] = String(st[k]);
              by[k] = l.steps[i].kind === "tool" ? "tool" : "gui";
            }
          }
        }
        stateDefs.forEach(function (d) {
          var chip = l.chips[d.key], v = chip.lastChild;
          if (v.textContent === vals[d.key]) return;
          v.textContent = vals[d.key];
          chip.classList.toggle("is-set", vals[d.key] !== String(d.initial));
          chip.setAttribute("data-by", by[d.key]);
          if (animate && !reduced) pulse(chip);
        });
      });
      root.classList.toggle("is-end", t >= T);
      prevBtn.setAttribute("aria-disabled", String(t <= 0));
      nextBtn.setAttribute("aria-disabled", String(t >= T));
      dots.forEach(function (d, i) {
        if (i === t - 1) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current");
      });
      count.textContent = t + " / " + T;
    }

    /* autoplay: a timeout chain, so a hover can hold it without losing the
       playing state */
    function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
    function schedule() {
      clearTimer();
      if (!playing || hover) return;
      timer = setTimeout(function () { timer = null; go(t + 1); }, interval);
    }
    function go(n) {
      n = Math.max(0, Math.min(T, n | 0));
      if (n === t) return;
      t = n;
      render(true);
      if (playing) { if (t >= T) pause(); else schedule(); }
    }
    function play() {
      if (playing) return;
      if (t >= T) { t = 0; render(false); }
      playing = true;
      setPlayBtn();
      schedule();
    }
    function pause() {
      playing = false;
      clearTimer();
      setPlayBtn();
    }
    function reset() { pause(); t = 0; render(false); }
    function next() { go(t + 1); }
    function prev() { go(t - 1); }

    offs.push(on(prevBtn, "click", prev));
    offs.push(on(nextBtn, "click", next));
    offs.push(on(playBtn, "click", function () { if (playing) pause(); else play(); }));
    offs.push(on(dotsEl, "click", function (e) {
      var b = e.target;
      while (b && b !== dotsEl && dots.indexOf(b) < 0) b = b.parentNode;
      var i = dots.indexOf(b);
      if (i >= 0) go(i + 1);
    }));
    offs.push(on(root, "keydown", function (e) {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else return;
      e.preventDefault();
    }));
    /* hover over the columns holds autoplay; the controls stay live, since
       the pointer sits on them right after a click on Play */
    offs.push(on(grid, "mouseenter", function () { hover = true; clearTimer(); }));
    offs.push(on(grid, "mouseleave", function () { hover = false; schedule(); }));
    offs.push(on(grid, "animationend", function (e) {
      var n = e.target;
      if (n && n.classList && n.classList.contains("is-pulse")) n.classList.remove("is-pulse");
    }));

    function destroy() {
      pause();
      offs.forEach(function (off) { off(); });
      offs = [];
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    host.appendChild(root);
    setPlayBtn();
    render(false);
    return { el: root, go: go, next: next, prev: prev, play: play, pause: pause, reset: reset, destroy: destroy };
  };

  /* ------------------------------------------------------- 2. tool schemas
     A tablist over the app's tools: signature, kind and the one-line note.
     Roving tabindex; selection follows focus. */
  function shortName(name) {
    var p = name.indexOf("__");
    return p >= 0 ? name.slice(p + 2) : name;
  }
  W.toolSchemas = function (target, opts) {
    var host = resolve(target);
    var schemas = opts && opts.schemas;
    if (!host || !schemas || !schemas.length) return null;

    var id = "ts" + (++uid), offs = [], current = -1;
    var root = h("div", "ts");
    var tabs = attr(h("div", "wt-tabs ts-tabs"), { role: "tablist", "aria-label": opts.label || "Tool schemas" });
    var panels = h("div", "ts-panels");
    var tabEls = [], panelEls = [];

    schemas.forEach(function (s, i) {
      var name = s.name || "";
      var tab = attr(h("button", "wt-tab ts-tab", shortName(name)), {
        type: "button", role: "tab", id: id + "-tab-" + i, "aria-controls": id + "-panel-" + i,
        "aria-selected": "false", tabindex: "-1", title: name
      });
      var panel = attr(h("div", "ts-panel"), {
        role: "tabpanel", id: id + "-panel-" + i, "aria-labelledby": id + "-tab-" + i, tabindex: "0", hidden: ""
      });
      var sig = s.sig || name, p = sig.indexOf("(");
      var code = h("code");
      if (p > 0) {
        code.appendChild(h("span", "ts-fn", sig.slice(0, p)));
        code.appendChild(doc.createTextNode(sig.slice(p)));
      } else {
        code.textContent = sig;
      }
      var pre = h("pre", "ts-sig");
      pre.appendChild(code);
      panel.appendChild(pre);
      var note = h("p", "ts-note");
      if (s.kind) note.appendChild(h("span", "ts-kind is-" + s.kind, s.kind));
      note.appendChild(h("span", "ts-note-text", s.note || ""));
      panel.appendChild(note);
      tabs.appendChild(tab);
      panels.appendChild(panel);
      tabEls.push(tab);
      panelEls.push(panel);
    });
    root.appendChild(tabs);
    root.appendChild(panels);

    function select(i, focus) {
      var n = schemas.length;
      i = ((i % n) + n) % n;
      current = i;
      tabEls.forEach(function (tab, j) {
        tab.setAttribute("aria-selected", String(j === i));
        tab.setAttribute("tabindex", j === i ? "0" : "-1");
      });
      panelEls.forEach(function (panel, j) {
        if (j === i) panel.removeAttribute("hidden"); else panel.setAttribute("hidden", "");
      });
      if (focus) tabEls[i].focus();
    }

    offs.push(on(tabs, "click", function (e) {
      var b = e.target;
      while (b && b !== tabs && tabEls.indexOf(b) < 0) b = b.parentNode;
      var i = tabEls.indexOf(b);
      if (i >= 0) select(i, false);
    }));
    offs.push(on(tabs, "keydown", function (e) {
      if (e.key === "ArrowRight") select(current + 1, true);
      else if (e.key === "ArrowLeft") select(current - 1, true);
      else if (e.key === "Home") select(0, true);
      else if (e.key === "End") select(schemas.length - 1, true);
      else return;
      e.preventDefault();
    }));

    function destroy() {
      offs.forEach(function (off) { off(); });
      offs = [];
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    host.appendChild(root);
    select(0, false);
    return { el: root, select: function (i) { select(i, false); }, destroy: destroy };
  };
})(window);
