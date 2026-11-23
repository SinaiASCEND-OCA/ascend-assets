/* ASCEND "Last updated" button — at the top right of the masthead of every ASCEND page:

       Last updated Nov 22, 2026 · 3 files

   Clicking it opens the dashboard's update log: its recent updates, each with the date,
   one line on what changed and the files in that update. ascend-mast.js loads this file
   by itself; a page without the shared masthead includes it once, at the end of <body>:

     <script src="/ascend-assets/ascend-updated.js"></script>

   Where the log comes from
     updates/data/<dashboard>.json in this folder, rebuilt every 30 minutes for every
     dashboard repo of the organization (updates/build-updates.mjs). On *.github.io the
     dashboard is the first part of the address; a page on another host names it:
       data-log="Dashboard---Governance"   on the script tag (or on ascend-mast.js), or
       window.ASCEND_UPDATED = { log: "Dashboard---Governance" }.

   Which date is shown
     1. A date the page states, when it knows when its DATA was last rebuilt:
          <script>window.ASCEND_UPDATED = { date: "2026-11-12", note: "shelf sittings through Oct 27, 2026" };</script>
        or  data-updated="2026-11-12" data-updated-note="…"  on the script tag.
        A page that learns the date later (after loading or unlocking its data)
        calls  window.ascendUpdated({ date: "…", note: "…" }).
     2. Otherwise the date of the newest update in the log.
     3. Otherwise (no log, or the page was published after the log was last rebuilt) the
        web server's Last-Modified time for the page, which GitHub Pages sets on every publish.

   Where it goes: inside an element with id="ascend-updated" if the page has one; else at the
   top right of the shared masthead, or of a page's own masthead (header.mast); else at the
   top right of the page's first <header>; else as a last line of the page's <footer> or of
   the page. Nothing is shown when no date can be determined. */
(function () {
  if (window.ascendUpdated) return;
  var s = document.currentScript, d = (s && s.dataset) || {};
  var BASE = s && s.src ? s.src.replace(/[^\/]*$/, "") : "/ascend-assets/";
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); };
  var state = { opts: null, log: null, asked: "" }, btn = null, panel = null;

  function label(v, short) {               // "2026-11-12" or a Date -> "Nov 12, 2026"; other text passes through
    if (v instanceof Date) return isNaN(v) ? "" : MON[v.getMonth()] + " " + v.getDate() + (short ? "" : ", " + v.getFullYear());
    var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(v || ""));
    return m ? MON[+m[2] - 1] + " " + (+m[3]) + (short ? "" : ", " + m[1]) : String(v || "");
  }
  function published() {                   // the server's Last-Modified; null when the server sent none
    var t = new Date(document.lastModified);
    return (isNaN(t) || Math.abs(Date.now() - t.getTime()) < 5000) ? null : t;   // no header: the browser answers "now"
  }
  function files(n) { return n + (n === 1 ? " file" : " files"); }
  function options(o) {
    if (typeof o === "string") o = { date: o };
    o = o || window.ASCEND_UPDATED || (d.updated ? { date: d.updated, note: d.updatedNote } : null) || {};
    if (typeof o === "string") o = { date: o };
    return o;
  }
  function logName(o) {
    if (o.log === false || d.log === "none") return "";
    if (o.log || d.log) return String(o.log || d.log);
    return /\.github\.io$/i.test(location.hostname) ? decodeURIComponent(location.pathname.split("/")[1] || "") : "";
  }

  function css() {
    if (document.getElementById("ascend-updated-css")) return;
    var c = document.createElement("style"); c.id = "ascend-updated-css";
    var F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
    c.textContent =
      ".ascend-updated{font:600 12px/1.3 " + F + ";letter-spacing:.01em;cursor:pointer;white-space:nowrap;-webkit-appearance:none;appearance:none;margin:0}" +
      ".ascend-updated .au-sm{display:none}.ascend-updated .au-caret{font-size:9px;opacity:.8;margin-left:5px}" +
      ".ascend-updated:focus-visible{outline:2px solid #00AEEF;outline-offset:2px}" +
      /* on a masthead: a pill like its other buttons */
      ".ascend-updated--mast{color:#fff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.5);border-radius:999px;padding:7px 13px;min-height:32px}" +
      ".ascend-updated--mast:hover,.ascend-updated--mast[aria-expanded=true]{background:#d6117f;border-color:#d6117f;color:#fff}" +
      ".ascend-updated-slot{margin-left:auto;display:inline-flex;align-items:center;flex:0 0 auto}" +
      ".ascend-updated-slot ~ .hub,.ascend-updated-slot ~ a.hub{margin-left:8px!important}" +
      /* on a header this script does not know: same pill, pinned to its top right corner */
      ".ascend-updated--corner{position:absolute;top:10px;right:14px;z-index:5;color:#fff;background:rgba(17,24,39,.72);border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:7px 13px}" +
      ".ascend-updated--corner:hover,.ascend-updated--corner[aria-expanded=true]{background:#d6117f;border-color:#d6117f}" +
      ".ascend-updated-bar{display:flex;justify-content:flex-end;padding:6px 14px 0}" +
      /* in a footer, or alone at the foot of the page: a quiet link */
      ".ascend-updated--infoot,.ascend-updated--foot,.ascend-updated--bar{font-weight:400;color:inherit;background:none;border:0;padding:0;text-decoration:underline dotted;text-underline-offset:3px}" +
      ".ascend-updated--infoot{display:inline-block;margin-top:4px;opacity:.85;font-size:inherit}" +
      ".ascend-updated--foot{display:block;margin:0 auto;padding:14px 16px 18px;opacity:.7}" +
      "@media(max-width:767px){.ascend-updated{font-size:11px}.ascend-updated--mast,.ascend-updated--corner{padding:6px 10px}" +
      ".ascend-updated .au-lg{display:none}.ascend-updated .au-sm{display:inline}}" +
      /* the log */
      ".au-panel{position:absolute;z-index:2147483000;box-sizing:border-box;width:430px;max-width:calc(100vw - 16px);max-height:min(70vh,560px);overflow:auto;background:#fff;color:#1f2937;border:1px solid #d5d9e2;border-radius:12px;box-shadow:0 18px 48px rgba(10,20,45,.28);font:400 13px/1.45 " + F + ";text-align:left;letter-spacing:0;text-transform:none}" +
      ".au-panel *{box-sizing:border-box}.au-head{position:sticky;top:0;background:#fff;display:flex;align-items:center;gap:8px;padding:12px 14px 10px;border-bottom:1px solid #e5e7eb}" +
      ".au-head b{font-size:14px;color:#221F72;flex:1}.au-x{border:0;background:none;font-size:20px;line-height:1;cursor:pointer;color:#6b7280;padding:2px 6px;border-radius:6px}.au-x:hover{background:#f1f3f8;color:#111}" +
      ".au-note{margin:0;padding:10px 14px;background:#f6f7fb;border-bottom:1px solid #e5e7eb;color:#374151}" +
      ".au-list{list-style:none;margin:0;padding:0}.au-list>li{padding:10px 14px;border-bottom:1px solid #eef0f4}.au-list>li:last-child{border-bottom:0}" +
      ".au-date{font-weight:700;color:#221F72;font-size:12px}.au-times{color:#6b7280;font-weight:400}.au-title{margin:1px 0 3px;color:#111827}" +
      ".au-panel details summary{cursor:pointer;color:#B00A73;font-weight:600;font-size:12px}.au-panel details ul{list-style:none;margin:6px 0 2px;padding:0}" +
      ".au-panel details li{display:flex;gap:8px;padding:2px 0;font:400 12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#374151;word-break:break-all}" +
      ".au-st{flex:0 0 58px;font:600 10px/1.7 " + F + ";text-transform:uppercase;letter-spacing:.04em;color:#6b7280}.au-st.A{color:#0a7a3d}.au-st.D{color:#b42318}" +
      ".au-more{color:#6b7280;font-style:italic}.au-foot{margin:0;padding:9px 14px 12px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb}";
    document.head.appendChild(c);
  }

  /* What to show: the date, how many files, and why that date. */
  function current() {
    var o = state.opts || {}, own = label(o.date), pub = published(), log = state.log, top = log && log.updates && log.updates[0];
    var r = { own: own, note: o.note || "", label: o.label || "Last updated", when: "", whenShort: "", n: null, top: top, kind: "" };
    var stale = top && pub && pub.getTime() - new Date(top.at).getTime() > 2 * 3600 * 1000;   // published since the log was built
    if (own) { r.when = own; r.whenShort = label(o.date, true); r.kind = "data"; if (top && !stale) r.n = top.n; }
    else if (top && !stale) { r.when = label(top.date); r.whenShort = label(top.date, true); r.n = top.n; r.kind = "log"; }
    else if (pub) { r.when = label(pub); r.whenShort = label(pub, true); r.kind = "published"; }
    else if (top) { r.when = label(top.date); r.whenShort = label(top.date, true); r.n = top.n; r.kind = "log"; }
    return r;
  }

  function place() {                        // returns the button, already in the page
    var b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("aria-expanded", "false");
    var slot = document.getElementById("ascend-updated");
    var btns = document.querySelector("#ascend-masthead .am-btns");
    var top = document.querySelector("header.mast .top");
    var hdr = document.querySelector("body > header, body > .ascend-mast, header.mast, body header");
    if (slot) { b.className = "ascend-updated " + (slot.closest && slot.closest("header,.ascend-mast") ? "ascend-updated--mast" : "ascend-updated--infoot"); slot.textContent = ""; slot.appendChild(b); }
    else if (btns) { b.className = "ascend-updated ascend-updated--mast"; btns.insertBefore(b, btns.firstChild); }
    else if (top) {
      var w = document.createElement("span"); w.className = "ascend-updated-slot"; b.className = "ascend-updated ascend-updated--mast"; w.appendChild(b);
      var hub = top.querySelector(".hub"); if (hub && hub.parentNode === top) top.insertBefore(w, hub); else top.appendChild(w);
    }
    else if (hdr && hdr.getBoundingClientRect().height >= 36) {
      if (cornerFree(hdr)) { if (getComputedStyle(hdr).position === "static") hdr.style.position = "relative"; b.className = "ascend-updated ascend-updated--corner"; hdr.appendChild(b); }
      else { var bar = document.createElement("div"); bar.className = "ascend-updated-bar"; b.className = "ascend-updated ascend-updated--bar"; bar.appendChild(b); hdr.parentNode.insertBefore(bar, hdr.nextSibling); }
    }
    else {
      var feet = document.querySelectorAll("body > footer"), foot = feet[feet.length - 1];
      if (foot) { b.className = "ascend-updated ascend-updated--infoot"; foot.appendChild(b); keep(foot, b); }
      else { b.className = "ascend-updated ascend-updated--foot"; document.body.appendChild(b); }
    }
    b.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    return b;
  }
  function cornerFree(hdr) {                // nothing to click already sits in the header's top right corner
    var r = hdr.getBoundingClientRect(), xs = [r.right - 30, r.right - 120, r.right - 230], y = r.top + 24, i, el;
    if (!document.elementFromPoint) return true;
    for (i = 0; i < xs.length; i++) {
      el = document.elementFromPoint(Math.max(0, xs[i]), Math.max(0, y));
      if (el && el.closest && el.closest("a,button,select,input,label,nav")) return false;
    }
    return true;
  }
  function keep(foot, el) {                 // a page that redraws its footer keeps the line
    if (!window.MutationObserver) return;
    new MutationObserver(function () { if (el.parentNode !== foot) foot.appendChild(el); }).observe(foot, { childList: true });
  }

  function draw() {
    var c = current();
    if (!c.when) { if (btn) { close(); btn.remove(); btn = null; } return; }
    css();
    if (!btn || !document.documentElement.contains(btn)) {
      var old = document.querySelectorAll(".ascend-updated"); for (var i = 0; i < old.length; i++) if (!old[i].id) old[i].remove();
      btn = place();
    }
    var n = c.n != null ? " &middot; " + files(c.n) : "";
    btn.innerHTML = '<span class="au-lg">' + esc(c.label) + " " + esc(c.when) + n + '</span><span class="au-sm">Updated ' + esc(c.whenShort || c.when) + n + '</span><span class="au-caret" aria-hidden="true">&#9662;</span>';
    btn.title = "Show what was updated, and when";
    if (panel) fill();
  }

  var ST = { A: "added", M: "changed", D: "removed", R: "renamed" };
  function fill() {
    var c = current(), log = state.log, list = (log && log.updates) || [], h = "";
    h += '<div class="au-head"><b>Update log</b><button type="button" class="au-x" aria-label="Close">&times;</button></div>';
    if (c.kind === "data") h += '<p class="au-note">The data on this page was last rebuilt on <b>' + esc(c.own) + "</b>" + (c.note ? " (" + esc(c.note) + ")" : "") + ". Updates to the dashboard are listed below.</p>";
    else if (c.kind === "published" && list.length) h += '<p class="au-note">This dashboard was published again on <b>' + esc(c.when) + "</b>. The files in that update will be listed here within the hour.</p>";
    if (!list.length) h += '<p class="au-note">This dashboard was last published on <b>' + esc(c.when) + "</b>. A list of the files in each update is not available for this dashboard yet.</p>";
    else {
      h += '<ul class="au-list">';
      list.forEach(function (u, i) {
        var more = u.n - u.files.length;
        h += '<li><div class="au-date">' + esc(label(u.date)) + (u.times > 1 ? ' <span class="au-times">&middot; ' + u.times + " times</span>" : "") + "</div>" +
          '<div class="au-title">' + esc(u.title) + "</div>" +
          "<details" + (i === 0 ? " open" : "") + "><summary>" + files(u.n) + "</summary><ul>" +
          u.files.map(function (f) { return '<li><span class="au-st ' + esc(f.s) + '">' + (ST[f.s] || "changed") + "</span><span>" + esc(f.p) + "</span></li>"; }).join("") +
          (more > 0 ? '<li class="au-more">and ' + more + " more</li>" : "") + "</ul></details></li>";
      });
      h += "</ul>" + '<p class="au-foot">The ' + (list.length === 1 ? "only update" : "last " + list.length + " updates") + " to this dashboard, newest first.</p>";
    }
    panel.innerHTML = h;
    panel.querySelector(".au-x").addEventListener("click", function () { close(true); });
  }
  function position() {
    if (!panel || !btn) return;
    var r = btn.getBoundingClientRect(), w = Math.min(430, window.innerWidth - 16);
    var left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    panel.style.width = w + "px"; panel.style.left = (left + window.pageXOffset) + "px";
    var below = r.bottom + 8, h = panel.offsetHeight;
    var top = (below + h > window.innerHeight && r.top - 8 - h > 0) ? r.top - 8 - h : below;   // in a footer: open upward
    panel.style.top = (top + window.pageYOffset) + "px";
  }
  function open() {
    if (panel) return;
    panel = document.createElement("div"); panel.className = "au-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Update log"); panel.tabIndex = -1;
    panel.addEventListener("click", function (e) { e.stopPropagation(); });
    document.body.appendChild(panel); fill(); position();
    btn.setAttribute("aria-expanded", "true");
    try { panel.focus({ preventScroll: true }); } catch (e) {}
    document.addEventListener("click", away); document.addEventListener("keydown", key); window.addEventListener("resize", position);
  }
  function close(refocus) {
    if (!panel) return;
    panel.remove(); panel = null;
    document.removeEventListener("click", away); document.removeEventListener("keydown", key); window.removeEventListener("resize", position);
    if (btn) { btn.setAttribute("aria-expanded", "false"); if (refocus) try { btn.focus(); } catch (e) {} }
  }
  function toggle() { if (panel) close(true); else open(); }
  function away() { close(false); }
  function key(e) { if (e.key === "Escape") close(true); }

  function load() {
    var name = logName(state.opts || {});
    if (!name || state.asked === name || !window.fetch) return;
    state.asked = name;
    fetch(BASE + "updates/data/" + encodeURIComponent(name) + ".json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.updates && j.updates.length) { state.log = j; draw(); } })
      .catch(function () {});
  }
  function render(o) { state.opts = options(o); draw(); load(); }
  window.ascendUpdated = render;
  function start() { setTimeout(function () { render(); }, 0); }   // after the masthead has had its turn
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
