/* ==========================================================================
   OpenMobile-2 — table widgets
   OM2Widgets.resultsTable: the main results table (Table 2) with grouped
   headers, per-metric sorting and best-value marks.
   OM2Widgets.envCompare:   the environment comparison (Table 1).
   Both read window.OM2 and build their DOM with createElement only.
   ========================================================================== */
(function (global) {
  "use strict";

  var W = global.OM2Widgets = global.OM2Widgets || {};
  var SVG_NS = "http://www.w3.org/2000/svg";
  var DASH = "–";   /* en dash: value not reported */
  var TILDE = "∼";  /* partial support */

  /* -------------------------------------------------------------- helpers */
  function node(sel) {
    return typeof sel === "string" ? document.querySelector(sel) : sel;
  }
  /* element with optional class, parent and text content */
  function h(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  function svgIcon(d, cls, label) {
    var s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("viewBox", "0 0 16 16");
    s.setAttribute("width", "15");
    s.setAttribute("height", "15");
    s.setAttribute("class", cls);
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", label);
    var p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "2");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    s.appendChild(p);
    return s;
  }

  /* ======================================================================
     1. Results table
     ====================================================================== */
  /* cell: number | {v, star, std} | null -> number or null */
  function cellValue(cell) {
    if (cell == null) return null;
    return typeof cell === "number" ? cell : cell.v;
  }
  function fmt(v) { return v.toFixed(1); }

  /* one column per benchmark metric; key "<bench>.<metric>", e.g. "aw.p1" */
  function columns(benchmarks) {
    var cols = [];
    benchmarks.forEach(function (b) {
      b.metrics.forEach(function (m, i) {
        cols.push({ key: b.key + "." + m.key, bench: b.key, index: i, label: m.label, first: i === 0 });
      });
    });
    return cols;
  }
  /* a row's cells keyed by column; spa holds one cell, the others arrays */
  function rowCells(row, cols) {
    var out = {};
    cols.forEach(function (c) {
      var cells = row[c.bench];
      if (!Array.isArray(cells)) cells = [cells];
      out[c.key] = cells[c.index] == null ? null : cells[c.index];
    });
    return out;
  }

  function resultsTable(sel) {
    var host = node(sel);
    var D = global.OM2;
    if (!host || !D || !D.results || !D.benchmarks) {
      if (global.console) console.warn("OM2Widgets.resultsTable: mount point or OM2 data missing");
      return null;
    }
    var cols = columns(D.benchmarks);
    var ncols = cols.length + 1;

    /* --- data model. A unit is one plain row or one of our models with its
       stages; sorting moves units, never single stage rows. */
    var groups = D.results.groups.map(function (g) {
      return {
        label: g.label,
        units: g.rows.map(function (r) {
          if (r.family === "ours") {
            var stages = r.stages.map(function (s) {
              return { label: s.stage, final: !!s.final, cells: rowCells(s, cols) };
            });
            var fin = null;
            stages.forEach(function (s) { if (s.final) fin = s; });
            return { kind: "ours", name: r.name, stages: stages,
                     sortCells: (fin || stages[stages.length - 1]).cells };
          }
          var cells = rowCells(r, cols);
          return { kind: "plain", name: r.name, cells: cells, sortCells: cells };
        })
      };
    });

    /* --- best per column over every scored row, stage rows included */
    var best = {};
    cols.forEach(function (c) {
      var max = null;
      groups.forEach(function (g) {
        g.units.forEach(function (u) {
          (u.kind === "ours" ? u.stages : [u]).forEach(function (r) {
            var v = cellValue(r.cells[c.key]);
            if (v != null && (max == null || v > max)) max = v;
          });
        });
      });
      best[c.key] = max;
    });

    /* --- header */
    host.classList.add("rt");
    var shell = h("div", "table-shell", host);
    var scroll = h("div", "table-scroll", shell);
    var table = h("table", "data rt-table", scroll);
    var thead = h("thead", null, table);

    var gr = h("tr", "group", thead);
    h("th", null, gr);
    D.benchmarks.forEach(function (b) {
      var th = h("th", "rt-bstart", gr, b.label);
      th.colSpan = b.metrics.length;
      th.setAttribute("scope", "colgroup");
    });

    var hr = h("tr", null, thead);
    h("th", null, hr, "Model").setAttribute("scope", "col");
    var ths = {};
    cols.forEach(function (c) {
      var th = h("th", "sortable" + (c.first ? " rt-bstart" : ""), hr);
      th.setAttribute("scope", "col");
      th.setAttribute("tabindex", "0");
      th.setAttribute("data-col", c.key);
      h("span", null, th, c.label);
      h("span", "arrow", th, "▼").setAttribute("aria-hidden", "true");
      ths[c.key] = th;
    });

    /* --- body rows, built once and reordered on sort */
    var tbody = h("tbody", null, table);

    function numCell(tr, cells, c) {
      var cell = cells[c.key];
      var td = h("td", "rt-num" + (c.first ? " rt-bstart" : ""), tr);
      td.setAttribute("data-col", c.key);
      var v = cellValue(cell);
      if (v == null) {
        td.className += " rt-null";
        td.textContent = DASH;
        return td;
      }
      if (v === best[c.key]) td.className += " best";
      h("span", "rt-v", td, fmt(v));
      if (typeof cell === "object") {
        if (cell.star) h("sup", "rt-star", td, "*");
        if (cell.std != null) h("span", "rt-std", td, "± " + fmt(cell.std));
      }
      return td;
    }
    function valueRow(cls, firstCls, label, cells) {
      var tr = h("tr", cls);
      h("td", firstCls, tr, label);
      cols.forEach(function (c) { numCell(tr, cells, c); });
      return tr;
    }
    groups.forEach(function (g) {
      g.tr = h("tr", "rt-group");
      var td = h("td", null, g.tr);
      td.colSpan = ncols;
      h("span", null, td, g.label);
      g.units.forEach(function (u) {
        if (u.kind === "plain") {
          u.trs = [valueRow("rt-row", "rt-name", u.name, u.cells)];
          return;
        }
        var head = h("tr", "ours rt-model");
        var name = h("td", "rt-name", head, u.name);
        h("td", null, head).colSpan = cols.length;
        u.trs = [head];
        u.stages.forEach(function (s) {
          u.trs.push(valueRow("ours rt-stage" + (s.final ? " rt-final" : ""), "rt-stage-label", s.label, s.cells));
        });
      });
    });

    /* --- footnote */
    var notes = D.results.notes || {};
    var note = h("p", "wt-note rt-note", host);
    var fn = h("span", "rt-fn", note);
    h("sup", "rt-star rt-key", fn, "*");
    fn.appendChild(document.createTextNode(" " + (notes.star || "Reproduced by the authors.")));
    fn = h("span", "rt-fn", note);
    h("span", "rt-key", fn, "±");
    fn.appendChild(document.createTextNode(" " + (notes.std || "Standard deviation across seeds.")));
    fn = h("span", "rt-fn", note);
    h("span", "rt-key", fn, DASH);
    fn.appendChild(document.createTextNode(" Not reported."));

    /* --- sorting */
    var state = { col: null, dir: null };

    function orderUnits(units) {
      if (!state.col) return units.slice();
      var sign = state.dir === "asc" ? 1 : -1;
      return units.map(function (u, i) {
        return { u: u, i: i, v: cellValue(u.sortCells[state.col]) };
      }).sort(function (a, b) {
        if (a.v == null && b.v == null) return a.i - b.i;
        if (a.v == null) return 1;
        if (b.v == null) return -1;
        return a.v === b.v ? a.i - b.i : (a.v - b.v) * sign;
      }).map(function (x) { return x.u; });
    }
    function render() {
      clear(tbody);
      groups.forEach(function (g) {
        tbody.appendChild(g.tr);
        orderUnits(g.units).forEach(function (u) {
          u.trs.forEach(function (tr) { tbody.appendChild(tr); });
        });
      });
      cols.forEach(function (c) {
        var th = ths[c.key];
        var arrow = th.lastChild;
        if (c.key === state.col) {
          th.setAttribute("aria-sort", state.dir === "asc" ? "ascending" : "descending");
          arrow.textContent = state.dir === "asc" ? "▲" : "▼";
        } else {
          th.removeAttribute("aria-sort");
          arrow.textContent = "▼";
        }
      });
    }
    /* sortBy(null) restores the data order */
    function sortBy(colKey, dir) {
      if (colKey == null) {
        state.col = null; state.dir = null;
      } else {
        if (!ths[colKey]) return;
        state.col = colKey;
        state.dir = dir === "asc" ? "asc" : "desc";
      }
      render();
    }
    /* click: first sort is descending; a second click on the same column flips it */
    function toggle(th) {
      var key = th.getAttribute("data-col");
      sortBy(key, state.col === key && state.dir === "desc" ? "asc" : "desc");
    }
    function onClick(e) {
      var th = e.target.closest("th.sortable");
      if (th) toggle(th);
    }
    function onKey(e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var th = e.target.closest("th.sortable");
      if (th) { e.preventDefault(); toggle(th); }
    }
    thead.addEventListener("click", onClick);
    thead.addEventListener("keydown", onKey);
    render();

    return {
      el: host,
      sortBy: sortBy,
      destroy: function () {
        thead.removeEventListener("click", onClick);
        thead.removeEventListener("keydown", onKey);
        host.classList.remove("rt");
        clear(host);
      }
    };
  }

  /* ======================================================================
     2. Environment comparison
     ====================================================================== */
  var CHECK = "M3 8.5l3.2 3.2L13 4.8";
  var CROSS = "M4 4l8 8M12 4l-8 8";

  function envCompare(sel) {
    var host = node(sel);
    var D = global.OM2;
    if (!host || !D || !D.envCompare) {
      if (global.console) console.warn("OM2Widgets.envCompare: mount point or OM2 data missing");
      return null;
    }
    var E = D.envCompare;
    /* column field, alignment class and renderer, in the order of E.columns */
    var spec = [
      { key: "name",     cls: "ec-name" },
      { key: "platform", cls: "ec-text" },
      { key: "apps",     cls: "ec-num" },
      { key: "tasks",    cls: "ec-num" },
      { key: "cross",    cls: "ec-c" },
      { key: "gui",      cls: "ec-c" },
      { key: "tools",    cls: "ec-c" },
      { key: "control",  cls: "ec-c" }
    ];

    function mark(td, v) {
      if (v === "partial") {
        var s = h("span", "ec-partial", td, TILDE);
        s.setAttribute("title", "limited");
        s.setAttribute("aria-label", "limited");
      } else if (v) {
        td.appendChild(svgIcon(CHECK, "ec-yes", "yes"));
      } else {
        td.appendChild(svgIcon(CROSS, "ec-no", "no"));
      }
    }

    host.classList.add("ec");
    var shell = h("div", "table-shell", host);
    var scroll = h("div", "table-scroll", shell);
    var table = h("table", "data ec-table", scroll);
    var hr = h("tr", null, h("thead", null, table));
    E.columns.forEach(function (label, i) {
      var th = h("th", spec[i] ? spec[i].cls : null, hr, label);
      th.setAttribute("scope", "col");
    });

    var tbody = h("tbody", null, table);
    E.rows.forEach(function (r) {
      var tr = h("tr", r.ours ? "ours" : null, tbody);
      spec.forEach(function (c, i) {
        var td = h("td", c.cls, tr);
        var v = r[c.key];
        if (i === 0) {
          h(r.ours ? "strong" : "span", null, td, v);
        } else if (c.cls === "ec-c") {
          mark(td, v);
        } else {
          td.textContent = v == null ? DASH : String(v);
        }
      });
    });

    return {
      el: host,
      destroy: function () {
        host.classList.remove("ec");
        clear(host);
      }
    };
  }

  W.resultsTable = resultsTable;
  W.envCompare = envCompare;
})(window);
