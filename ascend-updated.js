/* ASCEND "Last updated" line — one small line on any ASCEND page saying when the
   dashboard was last updated. ascend-mast.js loads this file by itself; a page
   without the shared masthead includes it once, at the end of <body>:

     <script src="/ascend-assets/ascend-updated.js"></script>

   Which date is shown
     1. A date the page states, when it knows when its DATA was last rebuilt:
          <script>window.ASCEND_UPDATED = { date: "2026-11-12", note: "shelf sittings through Oct 27, 2026" };</script>
        or  data-updated="2026-11-12" data-updated-note="…"  on the script tag.
        A page that learns the date later (after loading or unlocking its data)
        calls  window.ascendUpdated({ date: "…", note: "…" }).
     2. Otherwise the date this dashboard was last published: the web server's
        Last-Modified time for the page, which GitHub Pages sets on every publish.

   Where it goes: inside an element with id="ascend-updated" if the page has one,
   else in the shared masthead's utility row, else as a last line of the page's
   <footer>, else as a small line at the foot of the page. Nothing is shown when no date can be determined. */
(function () {
  if (window.ascendUpdated) return;
  var s = document.currentScript, d = (s && s.dataset) || {};
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); };
  function label(v) {                      // "2026-11-12" or a Date -> "Nov 12, 2026"; other text passes through
    if (v instanceof Date) return isNaN(v) ? "" : MON[v.getMonth()] + " " + v.getDate() + ", " + v.getFullYear();
    var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(v || ""));
    return m ? MON[+m[2] - 1] + " " + (+m[3]) + ", " + m[1] : String(v || "");
  }
  function published() {                   // the server's Last-Modified; blank when the server sent none
    var t = new Date(document.lastModified);
    if (isNaN(t) || Math.abs(Date.now() - t.getTime()) < 5000) return "";   // no header: the browser answers "now"
    return label(t);
  }
  function css() {
    if (document.getElementById("ascend-updated-css")) return;
    var c = document.createElement("style"); c.id = "ascend-updated-css";
    c.textContent =
      ".ascend-updated{font:400 12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:.01em}" +
      ".ascend-updated--infoot{font:inherit;letter-spacing:inherit;margin-top:4px;opacity:.85}" +
      ".ascend-updated--foot{display:block;clear:both;text-align:center;padding:14px 16px 18px;color:inherit;opacity:.62}" +
      ".ascend-mast .am-util .in .ascend-updated--mast{color:rgba(255,255,255,.7);white-space:nowrap;margin-left:14px}" +
      ".ascend-mast .am-util:has(.ascend-updated--mast){display:block}" +
      "@media(max-width:767px){.ascend-updated{font-size:11px}}";
    document.head.appendChild(c);
  }
  function render(o) {
    if (typeof o === "string") o = { date: o };
    o = o || window.ASCEND_UPDATED || (d.updated ? { date: d.updated, note: d.updatedNote } : null) || {};
    if (typeof o === "string") o = { date: o };
    var own = label(o.date), when = own || published();
    var old = document.querySelector(".ascend-updated");
    if (!when) { if (old && !old.id) old.remove(); return; }
    css();
    var html = esc(o.label || "Last updated") + " " + esc(when) + (o.note ? " &middot; " + esc(o.note) : "");
    var tip = own ? "When the data on this page was last updated" : "When this dashboard was last published";
    var slot = document.getElementById("ascend-updated");
    var bar = document.querySelector("#ascend-masthead .am-util .in");
    var el = slot || old;
    if (!el) {
      var feet = bar ? [] : document.querySelectorAll("body > footer"), foot = feet[feet.length - 1];
      el = document.createElement(bar ? "span" : "div");
      if (bar) { el.className = "ascend-updated ascend-updated--mast"; bar.insertBefore(el, bar.children[1] || null); }
      else if (foot) { el.className = "ascend-updated ascend-updated--infoot"; foot.appendChild(el); keep(foot, el); }
      else { el.className = "ascend-updated ascend-updated--foot"; document.body.appendChild(el); }
    } else if (slot) slot.classList.add("ascend-updated");
    el.innerHTML = html; el.title = tip;
  }
  function keep(foot, el) {                // a page that redraws its footer keeps the line
    if (!window.MutationObserver) return;
    new MutationObserver(function () { if (el.parentNode !== foot) foot.appendChild(el); }).observe(foot, { childList: true });
  }
  window.ascendUpdated = render;
  function start() { setTimeout(function () { render(); }, 0); }   // after the masthead has had its turn
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
