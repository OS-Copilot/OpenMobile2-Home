/* MobileGym++ inside the hero phone. Created only after the visitor enters. */
(function () {
  "use strict";
  var W = window.OM2Widgets = window.OM2Widgets || {};
  var instances = new WeakMap();
  var locales = new WeakMap();
  var SCREEN_W = 360, SCREEN_H = 800, BOOT_TIMEOUT = 60000;

  function h(tag, cls, parent, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }
  function icon(path, fill) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("fill", fill || "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", path); svg.appendChild(p);
    return svg;
  }

  W.heroSim = function (target, opts) {
    var screen = typeof target === "string" ? document.querySelector(target) : target;
    if (!screen) return null;
    if (instances.has(screen)) return instances.get(screen);
    opts = opts || {};
    var locale = /^zh/i.test(opts.locale || locales.get(screen) || "en") ? "zh-Hans" : "en";
    var disposed = false, ready = false, attempt = 0;
    var frame = null, readyDocument = null, poll = null, deadline = null, observer = null;
    var frameCleanup = null, stopLocaleWatch = null, listeners = [];
    var root = h("div", "hs is-loading", screen);
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "MobileGym++ playground");
    root.setAttribute("aria-busy", "true");
    var viewport = h("div", "hs-viewport", root);

    function on(el, event, fn, options) {
      el.addEventListener(event, fn, options);
      listeners.push(function () { el.removeEventListener(event, fn, options); });
    }
    var loading = h("div", "hs-loading", root);
    loading.setAttribute("role", "status");
    loading.setAttribute("aria-live", "polite");
    loading.setAttribute("aria-atomic", "true");
    var spinner = h("span", "hs-spinner", loading);
    spinner.setAttribute("aria-hidden", "true");
    var title = h("span", "hs-title", loading, "Opening MobileGym++");
    var detail = h("span", "hs-detail", loading, "Your playground is getting ready.");
    var actions = h("div", "hs-actions", loading);
    actions.hidden = true;
    var retry = h("button", "hs-retry", actions, "Retry");
    retry.type = "button";
    var back = h("button", "hs-back", actions, "Back");
    back.type = "button";
    var controls = h("div", "hs-controls", opts.controlsHost || screen.parentNode);
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Playground controls");
    var closeButton = h("button", "hs-control hs-close", controls);
    closeButton.type = "button";
    closeButton.title = "Return to app wall";
    closeButton.setAttribute("aria-label", "Return to app wall");
    closeButton.appendChild(icon("M10 6l-6 6 6 6M4 12h16"));
    h("span", "", closeButton, "Back to app wall");
    var languageButton = h("button", "hs-control hs-language", controls);
    languageButton.type = "button";
    languageButton.disabled = true;
    languageButton.appendChild(icon("M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3a16 16 0 0 1 0 18 16 16 0 0 1 0-18Z"));
    var languageLabel = h("span", "", languageButton);
    function updateLanguageButton() {
      var chinese = locale === "zh-Hans";
      languageLabel.textContent = chinese ? "English" : "中文";
      languageLabel.setAttribute("lang", chinese ? "en" : "zh-Hans");
      languageButton.title = chinese ? "Switch simulator to English" : "Switch simulator to Chinese";
      languageButton.setAttribute("aria-label", languageButton.title);
    }
    updateLanguageButton();

    function clearBootTimers() {
      clearInterval(poll); poll = null;
      clearTimeout(deadline); deadline = null;
    }
    function clearLocaleWatch() {
      if (stopLocaleWatch) { stopLocaleWatch(); stopLocaleWatch = null; }
    }
    function removeFrame() {
      clearLocaleWatch();
      if (frameCleanup) { frameCleanup(); frameCleanup = null; }
      if (frame) { frame.remove(); frame = null; }
      readyDocument = null;
    }
    function setReady(value) {
      ready = value;
      languageButton.disabled = !value;
      if (frame) { frame.inert = !value; frame.tabIndex = value ? 0 : -1; }
      root.classList.toggle("is-ready", value);
    }
    function fit() {
      if (disposed) return;
      /* Match the simulator's native 360×800 viewport exactly, so it never
         letterboxes itself. Fractional layout width avoids subpixel seams. */
      var width = parseFloat(window.getComputedStyle(screen).width);
      if (!width) return;
      var scale = width / SCREEN_W;
      viewport.style.width = SCREEN_W + "px";
      viewport.style.height = SCREEN_H + "px";
      viewport.style.transform = scale === 1 ? "none" : "scale(" + scale + ")";
      viewport.style.transformOrigin = "top left";
    }
    function fail(message) {
      if (disposed) return;
      clearBootTimers();
      removeFrame();
      setReady(false);
      root.classList.remove("is-loading");
      root.classList.add("is-error");
      root.setAttribute("aria-busy", "false");
      loading.hidden = false; spinner.hidden = true; actions.hidden = false;
      title.textContent = "Let's try that again";
      detail.textContent = message || "The playground couldn't connect. Check your connection and retry.";
    }
    function checkReady(candidate, serial) {
      if (disposed || ready || candidate !== frame || serial !== attempt) return;
      try {
        var win = candidate.contentWindow;
        var os = win && win.__OS__, sim = win && win.__SIM__;
        if (!os || !sim ||
            typeof os.handleBack !== "function" || typeof os.goHome !== "function" ||
            typeof os.showRecents !== "function" || typeof sim.getState !== "function" ||
            typeof sim.setState !== "function" || !sim.getState()) return;
        var runtime = W.simRuntime;
        if (!runtime) return;
        runtime.confineScrolling(candidate);
        var doc = candidate.contentDocument;
        if (doc && !doc.getElementById("om2-hero-scroll")) {
          var containment = doc.createElement("style");
          containment.id = "om2-hero-scroll";
          /* Confine scrolling at the phone boundary. Inner overflow:hidden
             cards must still pass wheel/trackpad gestures to their list. */
          containment.textContent = "html,body,#root{overscroll-behavior:none}";
          (doc.head || doc.documentElement).appendChild(containment);
        }
        runtime.applyLocale(win, locale);
        if (os.locale && typeof os.locale.getLocale === "function" && typeof os.locale.subscribe === "function") {
          clearLocaleWatch();
          stopLocaleWatch = os.locale.subscribe(function () {
            if (disposed || candidate !== frame || candidate.contentDocument !== doc) return;
            locale = /^en/i.test(os.locale.getLocale()) ? "en" : "zh-Hans";
            locales.set(screen, locale);
            updateLanguageButton();
          });
        }
        runtime.applyPreset(win, opts.weather || runtime.weather);
        clearBootTimers();
        readyDocument = doc;
        setReady(true);
        root.classList.remove("is-loading", "is-error");
        root.setAttribute("aria-busy", "false");
        loading.hidden = true;
        fit();
      } catch (err) {
        /* The same-origin document can be between navigation and mounting. */
        return;
      }
      if (typeof opts.onReady === "function") opts.onReady();
    }
    function watchBoot(candidate, serial) {
      clearBootTimers();
      /* Ready does not wait for load: remote app images can keep it pending. */
      poll = setInterval(function () { checkReady(candidate, serial); }, 100);
      deadline = setTimeout(function () {
        if (candidate === frame && serial === attempt && !ready) {
          fail("Loading is taking longer than expected. Check your connection and retry.");
        }
      }, BOOT_TIMEOUT);
    }
    function start() {
      if (disposed) return;
      clearBootTimers(); removeFrame(); setReady(false);
      var serial = ++attempt;
      root.classList.remove("is-error"); root.classList.add("is-loading");
      root.setAttribute("aria-busy", "true");
      loading.hidden = false; spinner.hidden = false; actions.hidden = true;
      title.textContent = "Opening MobileGym++";
      detail.textContent = "Your playground is getting ready.";
      var url;
      try {
        url = new URL(opts.src || "/OpenMobile2-Sim/", window.location.href);
        if (url.origin !== window.location.origin) {
          fail("The playground needs to be served alongside this page.");
          return;
        }
        /* Keep this playground's app state separate from the lower live demo. */
        url.searchParams.set("storageIsolation", "load");
      } catch (err) { fail("The playground address is unavailable."); return; }
      var candidate = document.createElement("iframe");
      candidate.className = "hs-frame";
      candidate.title = "MobileGym++ interactive playground";
      candidate.tabIndex = -1;
      candidate.inert = true;
      candidate.setAttribute("allow", "clipboard-write");
      candidate.width = SCREEN_W;
      candidate.height = SCREEN_H;
      candidate.style.width = SCREEN_W + "px";
      candidate.style.height = SCREEN_H + "px";
      var loaded = function () {
        if (disposed || candidate !== frame || serial !== attempt) return;
        try {
          /* A late first load may follow ready. A later navigation is a new
             document, whose window API and scroll patches need reapplying. */
          if (ready && candidate.contentDocument === readyDocument) return;
          if (ready) {
            clearLocaleWatch();
            setReady(false); readyDocument = null;
            root.classList.add("is-loading");
            root.setAttribute("aria-busy", "true");
            loading.hidden = false;
            watchBoot(candidate, serial);
          }
          checkReady(candidate, serial);
        } catch (err) { fail("The playground was interrupted. Try opening it again."); }
      };
      var errored = function () {
        if (candidate === frame && serial === attempt) fail();
      };
      candidate.addEventListener("load", loaded);
      candidate.addEventListener("error", errored);
      frameCleanup = function () {
        candidate.removeEventListener("load", loaded);
        candidate.removeEventListener("error", errored);
      };
      frame = candidate;
      candidate.src = url.href;
      viewport.appendChild(candidate);
      fit();
      watchBoot(candidate, serial);
      checkReady(candidate, serial);
    }
    function destroy() {
      if (disposed) return;
      disposed = true; attempt++;
      clearBootTimers(); removeFrame();
      if (observer) observer.disconnect();
      listeners.forEach(function (off) { off(); }); listeners = [];
      controls.remove(); root.remove(); instances.delete(screen);
    }
    function close() {
      if (disposed) return;
      destroy();
      if (typeof opts.onClose === "function") opts.onClose();
    }

    on(retry, "click", start);
    on(back, "click", close);
    on(closeButton, "click", close);
    on(languageButton, "click", function () {
      if (disposed || !ready || !frame) return;
      var os = frame.contentWindow.__OS__;
      var current = os && os.locale && typeof os.locale.getLocale === "function" ? os.locale.getLocale() : locale;
      locale = /^en/i.test(current) ? "zh-Hans" : "en";
      W.simRuntime.applyLocale(frame.contentWindow, locale);
      locales.set(screen, locale);
      updateLanguageButton();
    });
    if ("ResizeObserver" in window) {
      observer = new ResizeObserver(fit); observer.observe(screen);
    } else on(window, "resize", fit);
    var api = { el: root, destroy: destroy, close: close };
    instances.set(screen, api);
    start();
    closeButton.focus({ preventScroll: true });
    return api;
  };
})();
