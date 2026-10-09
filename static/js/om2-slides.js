/* ==========================================================================
   OpenMobile-2 — slides
   Panels on one horizontal track. The track scroll-snaps, so a swipe or a
   horizontal wheel moves between panels; a pager of labelled dots and two
   arrows does the same for a mouse. Each panel is a child with a
   data-label; the widget keeps the panels where they are and wraps them.

   OM2Widgets.slides(el, { labels })  ->  { el, go(i), index(), destroy() }
   Styles: .wt-slides* in static/css/main.css.
   ========================================================================== */
(function (global) {
  "use strict";

  var W = global.OM2Widgets = global.OM2Widgets || {};
  var ICON = {
    prev: "M10 3 5 8l5 5",
    next: "M6 3l5 5-5 5"
  };

  function h(tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function arrow(d) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 16 16"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.7"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path"); p.setAttribute("d", d); s.appendChild(p);
    return s;
  }

  W.slides = function (target, opts) {
    opts = opts || {};
    var root = typeof target === "string" ? document.querySelector(target) : target;
    if (!root) throw new Error("slides: mount target not found");
    var panels = Array.prototype.filter.call(root.children, function (n) { return n.classList.contains("wt-slide"); });
    if (panels.length < 2) return { el: root, go: function () {}, index: function () { return 0; }, destroy: function () {} };
    var labels = opts.labels || panels.map(function (p, i) { return p.getAttribute("data-label") || "Panel " + (i + 1); });
    var reduced = !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);

    var track = h("div", "wt-slides-track");
    track.setAttribute("tabindex", "0");
    track.setAttribute("aria-label", "Panels: " + labels.join(", ") + ". Swipe or use the arrow keys.");
    panels.forEach(function (p, i) {
      p.setAttribute("role", "group");
      p.setAttribute("aria-label", labels[i]);
      track.appendChild(p);
    });
    root.insertBefore(track, root.firstChild);

    var nav = h("div", "wt-slides-nav", root);
    var prev = h("button", "wt-btn", nav); prev.type = "button"; prev.setAttribute("aria-label", "Previous panel"); prev.appendChild(arrow(ICON.prev));
    var seg = h("div", "wt-slides-seg", nav);
    var dots = panels.map(function (p, i) {
      var b = h("button", "wt-slide-dot", seg); b.type = "button";
      h("i", null, b); h("span", null, b, labels[i]);
      b.addEventListener("click", function () { go(i); });
      return b;
    });
    var next = h("button", "wt-btn", nav); next.type = "button"; next.setAttribute("aria-label", "Next panel"); next.appendChild(arrow(ICON.next));

    var cur = 0;
    function index() { return Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); }
    /* the track is as tall as the panel in view, so the pager sits right
       under it whatever the panels' own heights */
    function fitHeight() { var hh = panels[cur].offsetHeight; if (hh) track.style.height = hh + "px"; }
    function mark(i) {
      cur = i;
      dots.forEach(function (d, j) { if (j === i) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); });
      prev.disabled = i === 0;
      next.disabled = i === panels.length - 1;
      fitHeight();
    }
    function go(i) {
      i = Math.max(0, Math.min(panels.length - 1, i));
      var x = panels[i].offsetLeft - track.offsetLeft;
      if (track.scrollTo) track.scrollTo({ left: x, behavior: reduced ? "auto" : "smooth" });
      else track.scrollLeft = x;
      mark(i);
    }
    var pending = null;
    function onScroll() {
      if (pending) return;
      pending = setTimeout(function () { pending = null; var i = index(); if (i !== cur) mark(i); }, 80);
    }
    function onKey(e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1); }
    }
    prev.addEventListener("click", function () { go(cur - 1); });
    next.addEventListener("click", function () { go(cur + 1); });
    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("keydown", onKey);
    /* a resize changes the panel width; keep the current panel in place */
    var onResize = function () { track.scrollLeft = panels[cur].offsetLeft - track.offsetLeft; fitHeight(); };
    var ro = null;
    if ("ResizeObserver" in global) {
      ro = new global.ResizeObserver(onResize);
      ro.observe(track);
      panels.forEach(function (p) { ro.observe(p); });
    } else global.addEventListener("resize", onResize);
    mark(0);

    return {
      el: root,
      go: go,
      index: function () { return cur; },
      destroy: function () {
        if (ro) ro.disconnect(); else global.removeEventListener("resize", onResize);
        track.removeEventListener("scroll", onScroll);
        track.removeEventListener("keydown", onKey);
        panels.forEach(function (p) { root.insertBefore(p, track); });
        root.removeChild(track); root.removeChild(nav);
      }
    };
  };
})(window);
