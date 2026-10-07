/* ==========================================================================
   OpenMobile-2 — page wiring
   Mounts every interactive component on its element. Each mount is guarded,
   so a missing widget file or element leaves the rest of the page working.
   ========================================================================== */
(function () {
  "use strict";

  function mount(id, fn) {
    var el = document.getElementById(id);
    var W = window.OM2Widgets || {};
    if (!el || typeof W[fn] !== "function") return;
    try { W[fn](el, arguments[2] || {}); }
    catch (e) { if (window.console) console.error("[om2] " + fn + " on #" + id, e); }
  }

  function init() {
    var D = window.OM2;
    if (!D) return;
    mount("app-wall", "appWall");
    mount("chart-domains", "domainCoverage");
    mount("crossapp", "crossApp", { items: D.crossApp });
    mount("construction-steps", "stepper", { steps: D.walkthroughs.construction.steps });
    mount("env-compare", "envCompare");
    mount("pipeline-flow", "pipelineFlow", { data: D.pipelineFlow });
    mount("task-lanes", "taskLanes", { task: D.walkthroughs.taobao });
    mount("tool-schemas", "toolSchemas", { schemas: D.toolSchemas });
    mount("chart-bench", "benchComposition");
    mount("results-table", "resultsTable");
    mount("chart-stages", "stageChart");
    mount("chart-coverage", "coverageScaling");
    mount("chart-tools", "toolDumbbell");
    mount("live-sim", "liveSim", {
      src: "sim/",
      iconBase: "sim/cdn/themes/af0f7f90-04fb-417b-941e-ae7b549fe5e5/icons/",
      /* Bilibili, RedNote, Spotify and Maps need the 2 GB media folders that
         stay out of the repository (see README); add them back when that
         media is hosted. */
      apps: [
        { id: "wechat", label: "WeChat", pkg: "com.tencent.mm" },
        { id: "alipay", label: "Alipay", pkg: "com.eg.android.AlipayGphone" },
        { id: "railway12306", label: "12306", pkg: "com.MobileTicket" },
        { id: "ebay", label: "eBay", pkg: "com.ebay.mobile" },
        { id: "notes", label: "Notes", pkg: "com.miui.notes" },
        { id: "settings", label: "Settings", pkg: "com.android.settings" }
      ]
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
