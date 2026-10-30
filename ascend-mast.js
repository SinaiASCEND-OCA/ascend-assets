/* ASCEND masthead injector — the Programmatic Assessment house style for any
   ASCEND page, from one file. Include once, at the end of <body>:

     <script src="/ascend-assets/ascend-mast.js"
             data-title="Phase 2 Dashboard"
             data-site="Programmatic Assessment · Phase 2"
             data-nav='[{"l":"Clerkships","h":"./","on":1},{"l":"Site reports","h":"sites.html"}]'
             data-hide="header.old, .old-topbar"></script>

   data-title  masthead <h1> (defaults to document.title)
   data-site   left text of the utility row (site · view)
   data-nav    JSON list of section links for the utility row; "on" marks the current one
   data-hide   CSS selector(s) for the page's own header, hidden so there is one masthead
   data-full   present = full-height masthead instead of the compact variant
   data-home   URL of this dashboard's home page for the "Dashboard home" button. Without
               it the button points at the dashboard's own folder (/<dashboard>/); it
               stays hidden on that page itself.
   The stylesheet, logo and stats script load from the same folder as this file. */
(function () {
  var s = document.currentScript; if (!s) return;
  var d = s.dataset, BASE = s.src.replace(/[^\/]*$/, "");
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); };
  if (!document.querySelector('link[href$="ascend-mast.css"]')) {
    var css = document.createElement("link"); css.rel = "stylesheet"; css.href = BASE + "ascend-mast.css?v=2"; document.head.appendChild(css);
  }
  if (!window.__ascendStats) {                    // site stats, see ascend-stats.js
    var st0 = document.createElement("script"); st0.async = true; st0.src = BASE + "ascend-stats.js"; document.head.appendChild(st0);
  }
  if (!document.getElementById("am-btn-css")) {
    var bc = document.createElement("style"); bc.id = "am-btn-css";
    bc.textContent = ".ascend-mast .am-btns{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}" +
      ".ascend-mast .am-btns .am-hub{margin-left:0}.ascend-mast .am-hub[hidden],.ascend-mast .am-hub .am-sm{display:none}" +
      "@media(max-width:767px){.ascend-mast .am-btns{flex:0 0 auto;flex-wrap:nowrap;gap:6px}" +
      ".ascend-mast .am-hub .am-lg{display:none}.ascend-mast .am-hub .am-sm{display:inline}}";
    document.head.appendChild(bc);
  }
  if (d.hide) { var st = document.createElement("style"); st.textContent = d.hide + "{display:none!important}"; document.head.appendChild(st); }
  function render() {
    if (document.getElementById("ascend-masthead")) return;
    var nav = []; try { nav = JSON.parse(d.nav || "[]"); } catch (e) {}
    var h = document.createElement("header");
    h.id = "ascend-masthead"; h.className = "ascend-mast" + (d.full != null ? "" : " ascend-mast--compact");
    h.innerHTML =
      '<img class="am-logo" src="' + BASE + 'oca-mountain.png" alt="">' +
      '<div class="am-wrap"><div class="am-top"><span class="am-dot"></span>' +
      '<div class="am-eyebrow">ICAHN SCHOOL OF MEDICINE AT MOUNT SINAI<br><span class="am-dept">OFFICE OF CURRICULAR AFFAIRS &middot; ASCEND CURRICULUM</span></div>' +
      '<span class="am-btns"><a class="am-hub am-home" id="am-home" href="#" hidden>&#8962; <span class="am-lg">Dashboard home</span><span class="am-sm">Home</span></a></span></div>' +
      '<h1>' + esc(d.title || document.title) + '</h1>' +
      '<div class="am-motto"><span class="a">Climb higher.</span><span class="b">Reach further.</span><span class="c">Care deeper.</span></div></div>' +
      '<div class="am-util"><div class="in"><span>' + esc(d.site || "") + '</span>' +
      (nav.length ? '<span class="am-nav">' + nav.map(function (n) { return '<a href="' + esc(n.h) + '"' + (n.on ? ' class="on"' : '') + '>' + esc(n.l) + '</a>'; }).join("") + '</span>' : "") +
      '</div></div><div class="am-stripe"><i></i><i></i><i></i></div>';
    document.querySelectorAll("nav.cq-nav,nav.ss-nav,nav.pp-nav,nav.pl-nav").forEach(function (n) { n.remove(); });
    document.body.insertBefore(h, document.body.firstChild);
    var home = d.home ? new URL(d.home, location.href).href : location.origin + "/" + (location.pathname.split("/")[1] || "") + "/";
    var a = document.getElementById("am-home");
    if (a && !same(home, location.href)) { a.href = home; a.hidden = false; }
  }
  function same(a, b) { var n = function (u) { return String(u).split(/[?#]/)[0].replace(/\/index\.html$/, "/"); }; return n(a) === n(b); }
  if (document.body) render(); else document.addEventListener("DOMContentLoaded", render);
})();
