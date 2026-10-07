/* ==========================================================================
   OpenMobile-2 — walkthrough stepper
   A data-driven stepper: a track of numbered nodes, a detail panel for the
   current step, and the shared wt-* controls. Mounted on #pipeline-steps and
   #construction-steps with OM2.walkthroughs.*.steps.

     OM2Widgets.stepper(elOrSelector, { steps, autoplayMs, start, label })
       -> { el, go(i), next(), prev(), play(), pause(), update(opts), destroy() }

   Every instance keeps its own state; the only document-level listener is
   visibilitychange, removed on destroy(). Nothing is exposed on window
   except OM2Widgets.
   ========================================================================== */
(function (global) {
  "use strict";

  var DEFAULT_MS = 4200;
  var OUT_MS = 90;      /* panel fade-out before the content swap */
  var HEIGHT_MS = 260;  /* matches the .st-panel height transition */

  var SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" ';
  var ICON = {
    prev: SVG + 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>',
    next: SVG + 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>',
    play: SVG + 'fill="currentColor"><path d="M4.5 2.6v10.8l8.5-5.4z"/></svg>',
    pause: SVG + 'fill="currentColor"><path d="M4 2.5h3v11H4zm5 0h3v11H9z"/></svg>'
  };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(cls, html, label) {
    var b = el("button", cls);
    b.type = "button";
    if (html) b.innerHTML = html;
    if (label) b.setAttribute("aria-label", label);
    return b;
  }
  function reducedMotion() {
    return !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function msOf(v) {
    var x = +v;
    return x > 0 ? x : DEFAULT_MS;
  }

  function stepper(target, opts) {
    var root = typeof target === "string" ? document.querySelector(target) : target;
    if (!root) {
      if (global.console) console.warn("OM2Widgets.stepper: mount not found", target);
      return null;
    }
    opts = opts || {};

    var state = {
      steps: opts.steps || [],
      autoplayMs: msOf(opts.autoplayMs),
      index: 0,
      playing: false,
      hold: false,   /* pointer over the panel: autoplay waits */
      dead: false
    };
    var ui = {};
    var tick = null, swapTimer = null, heightTimer = null;

    function n() { return state.steps.length; }
    function clamp(i) { return n() ? Math.max(0, Math.min(n() - 1, i | 0)) : 0; }
    function wrap(i) { return n() ? ((i % n()) + n()) % n() : 0; }

    /* ------------------------------------------------------------ build */
    function build() {
      var total = n();
      root.innerHTML = "";
      ui.steps = [];
      ui.dots = [];

      var track = el("div", "st-track");
      var nodes = el("ol", "st-nodes");
      nodes.setAttribute("role", "list");
      state.steps.forEach(function (s, i) {
        var li = el("li", "st-step");
        var b = button("st-node", null, "Step " + (i + 1) + " of " + total + ": " + s.label);
        b.appendChild(el("span", "st-num", String(i + 1)));
        b.appendChild(el("span", "st-label", s.label));
        b.addEventListener("click", function () { go(i); });
        li.appendChild(b);
        nodes.appendChild(li);
        ui.steps.push({ li: li, btn: b });
      });
      track.appendChild(nodes);

      var panel = el("div", "st-panel");
      panel.setAttribute("aria-live", "polite");
      panel.setAttribute("aria-atomic", "true");
      var inner = el("div", "st-panel-in");
      panel.appendChild(inner);
      /* a mouse resting on the text holds autoplay; a tap must not, or a
         phone would hold it until the next tap elsewhere */
      panel.addEventListener("pointerenter", function (e) {
        if (e.pointerType === "touch") return;
        state.hold = true;
        arm();
      });
      panel.addEventListener("pointerleave", function () {
        state.hold = false;
        arm();
      });

      var controls = el("div", "wt-controls st-controls");
      var prev = button("wt-btn st-prev", ICON.prev, "Previous step");
      var play = button("wt-btn st-play", null, null);
      play.setAttribute("aria-pressed", "false");
      var next = button("wt-btn st-next", ICON.next, "Next step");
      var dots = el("div", "wt-dots st-dots");
      dots.setAttribute("role", "group");
      dots.setAttribute("aria-label", "Jump to step");
      state.steps.forEach(function (s, i) {
        var d = button(null, null, "Step " + (i + 1) + ": " + s.label);
        d.addEventListener("click", function () { go(i); });
        dots.appendChild(d);
        ui.dots.push(d);
      });
      var kbd = el("span", "wt-kbd st-kbd", "← → to step");
      var count = el("span", "wt-count st-count");
      prev.addEventListener("click", function () { api.prev(); });
      next.addEventListener("click", function () { api.next(); });
      play.addEventListener("click", function () { setPlaying(!state.playing); });
      [prev, play, next, dots, kbd, count].forEach(function (c) { controls.appendChild(c); });

      root.appendChild(track);
      root.appendChild(panel);
      root.appendChild(controls);
      ui.panel = panel;
      ui.inner = inner;
      ui.play = play;
      ui.count = count;
      paintPlay();
    }

    function renderPanel(i) {
      var s = state.steps[i];
      var inner = ui.inner;
      inner.innerHTML = "";
      if (!s) return;
      var head = el("div", "st-head");
      head.appendChild(el("h4", "st-title", s.label));
      if (s.tag) head.appendChild(el("span", "st-tag", s.tag));
      inner.appendChild(head);
      if (s.text) inner.appendChild(el("p", "st-text", s.text));
      if (s.code) {
        var pre = el("pre", "st-code");
        pre.appendChild(el("code", null, s.code));
        inner.appendChild(pre);
      }
    }

    /* ------------------------------------------------------------ paint */
    function paintTrack() {
      var i = state.index;
      ui.steps.forEach(function (s, k) {
        s.li.className = "st-step" + (k < i ? " st-done" : k === i ? " st-current" : "");
        if (k === i) s.btn.setAttribute("aria-current", "step");
        else s.btn.removeAttribute("aria-current");
      });
      ui.dots.forEach(function (d, k) {
        if (k === i) d.setAttribute("aria-current", "step");
        else d.removeAttribute("aria-current");
      });
      ui.count.textContent = (i + 1) + " / " + n();
    }

    function paintPlay() {
      var on = state.playing;
      root.classList.toggle("st-playing", on);
      ui.play.setAttribute("aria-pressed", String(on));
      ui.play.innerHTML = (on ? ICON.pause : ICON.play) + "<span>" + (on ? "Pause" : "Play") + "</span>";
    }

    /* Fade the old content out, swap, then fade the new content in while the
       panel's height moves from the old value to the new one. */
    function fade() {
      var panel = ui.panel, inner = ui.inner;
      clearTimeout(swapTimer);
      inner.classList.remove("st-in");
      inner.classList.add("st-out");
      swapTimer = setTimeout(function () {
        var h0 = panel.offsetHeight;
        panel.style.height = "";
        renderPanel(state.index);
        inner.classList.remove("st-out");
        inner.classList.add("st-in");
        var h1 = panel.offsetHeight;
        if (h1 !== h0) {
          panel.style.height = h0 + "px";
          void panel.offsetHeight; /* commit h0, then transition to h1 */
          panel.style.height = h1 + "px";
          clearTimeout(heightTimer);
          heightTimer = setTimeout(function () { panel.style.height = ""; }, HEIGHT_MS);
        }
        void inner.offsetWidth;
        inner.classList.remove("st-in");
      }, OUT_MS);
    }

    function set(i, instant) {
      if (state.dead || !n()) return;
      var changed = i !== state.index;
      state.index = i;
      paintTrack();
      if (instant || reducedMotion()) {
        clearTimeout(swapTimer);
        clearTimeout(heightTimer);
        ui.panel.style.height = "";
        ui.inner.className = "st-panel-in";
        renderPanel(i);
      } else if (changed) {
        fade();
      }
      arm();
    }

    /* --------------------------------------------------------- autoplay */
    function arm() {
      clearTimeout(tick);
      tick = null;
      if (!state.playing || state.hold || document.hidden) return;
      tick = setTimeout(function () { set(wrap(state.index + 1), false); }, state.autoplayMs);
    }
    function setPlaying(on) {
      if (state.dead) return;
      state.playing = !!on;
      paintPlay();
      arm();
    }

    /* ----------------------------------------------------------- events */
    function onKey(e) {
      var k = e.key;
      if (k === "ArrowRight") api.next();
      else if (k === "ArrowLeft") api.prev();
      else if (k === "Home") go(0);
      else if (k === "End") go(n() - 1);
      else return;
      e.preventDefault();
    }
    /* Safari leaves a clicked button unfocused, so a click anywhere in the
       widget moves focus to the root (tabindex -1) and the arrow keys work */
    function onClick() {
      var a = document.activeElement;
      if (a === root || root.contains(a)) return;
      try { root.focus({ preventScroll: true }); } catch (e) { root.focus(); }
    }
    function onVisibility() {
      if (document.hidden) setPlaying(false);
    }

    /* -------------------------------------------------------------- api */
    function go(i) {
      set(clamp(i), false);
      return api;
    }
    var api = {
      el: root,
      go: go,
      next: function () { set(wrap(state.index + 1), false); return api; },
      prev: function () { set(wrap(state.index - 1), false); return api; },
      play: function () { setPlaying(true); return api; },
      pause: function () { setPlaying(false); return api; },
      update: function (o) {
        if (state.dead) return api;
        o = o || {};
        if (o.autoplayMs != null) state.autoplayMs = msOf(o.autoplayMs);
        if (o.label) root.setAttribute("aria-label", o.label);
        if (o.steps) {
          state.steps = o.steps;
          build();
          set(clamp(o.start != null ? o.start : state.index), true);
        } else if (o.start != null) {
          set(clamp(o.start), false);
        }
        arm();
        return api;
      },
      destroy: function () {
        if (state.dead) return;
        state.dead = true;
        state.playing = false;
        clearTimeout(tick);
        clearTimeout(swapTimer);
        clearTimeout(heightTimer);
        document.removeEventListener("visibilitychange", onVisibility);
        root.removeEventListener("keydown", onKey);
        root.removeEventListener("click", onClick);
        root.innerHTML = "";
        root.classList.remove("st", "st-playing");
        ["role", "aria-label", "tabindex"].forEach(function (a) { root.removeAttribute(a); });
      }
    };

    /* ------------------------------------------------------------- init */
    root.classList.add("st");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", opts.label || "Walkthrough");
    root.setAttribute("tabindex", "-1");
    root.addEventListener("keydown", onKey);
    root.addEventListener("click", onClick);
    document.addEventListener("visibilitychange", onVisibility);
    build();
    set(clamp(opts.start || 0), true);
    return api;
  }

  global.OM2Widgets = global.OM2Widgets || {};
  global.OM2Widgets.stepper = stepper;
})(window);
