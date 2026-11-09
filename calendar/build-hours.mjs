#!/usr/bin/env node
/* Builds data/contact-hours.json from data/events.json: scheduled contact hours per class cohort,
   academic year (July–June) and module, with the same rules as the Contact hours button on the
   calendar page. Read by the Phase 1 Programmatic Assessment dashboard (assets/calendar-hours.js).

   Rules: hours = scheduled duration of same-day timed sessions. Instructional = LEC, SGD, CCSG,
   LAB, ACS (applied clinical session), PNL, REV, INT, clinical skills, other sessions; assessment = EXAM, OSCE, timed QUIZ. Not
   counted: open time / breaks / office hours, module-period banners, all-day items, multi-day
   quiz or pre-check windows, modules that are not curriculum (Student Services, Curriculum
   Events, APEX, and BaseCamp, which is orientation), optional sessions, sessions
   with no module in the title, and modules still ahead whose calendar holds only their exam / OSCE dates. POM assessments are OSCEs; EXAM is the NBME CAS exam.
   Two measures per module (OCA definitions, 2026-10-31):
     allotted   = the time the module holds on the calendar: per day, the union of its counted sessions (all groups,
                  sections and windows), plus the per-student time of all-day assessments.
     perStudent = the time one student spends: per session, one group's time when Group A and B meet at different
                  times, one section's time when the class is split within a block ("Groups 1–5" / "Groups 6–10", or
                  overlapping copies), one window for slot sessions (GU/GYN exam), 3 h per OSCE and 4 h per all-day
                  proctored exam. Staggered windows ("see Blackboard roster for assigned start time") do not show a
                  student's slot, so they count the window (an upper bound) and are counted in `staggered`.
     total (and instructional / assessment / byType hours) = perStudent. Content hours are not computed here.
   A calendar reused every year derives its class cohort from its curriculum year (year 1 calendar
   in AY 2026–27 = Class of 2030); a calendar that belongs to one class carries "classOf" in
   calendars.json (the Phase 2 calendar is the Class of 2028's own, Feb 2025 onward). */
import { readFileSync, writeFileSync } from "node:fs";
const data = JSON.parse(readFileSync("data/events.json", "utf8"));
const TZ = (data.calendars[0] && data.calendars[0].tz) || "America/New_York";
const KINDS = { lec:"Lecture", sgd:"Small group discussion", ccsg:"Clinical correlation small group", lab:"Lab", acs:"Applied clinical session", pnl:"Panel / patient presentation", rev:"Review / TA session", int:"Module introduction",
  clinical:"Clinical skills", session:"Other session", exam:"NBME CAS exam", osce:"OSCE", quiz:"Quiz", precheck:"Pre-check window", open:"Open time / break", meeting:"Class meeting / event", module:"Module period", other:"Other" };
const CODE = { lec:"LEC", sgd:"SGD", ccsg:"CCSG", lab:"LAB", acs:"ACS", pnl:"PNL", rev:"REV", int:"INT", clinical:"CLIN", session:"SESSION", exam:"EXAM", osce:"OSCE", quiz:"QUIZ", precheck:"PRE-CHECK", open:"OPEN", meeting:"EVENT", module:"MODULE", other:"OTHER" };
const INSTR = new Set(["lec","sgd","ccsg","lab","acs","pnl","rev","int","clinical","session"]), ASSESS = new Set(["exam","osce","quiz"]);
const EXCLUDED = new Set(["Student Services", "Curriculum Events", "APEX", "BaseCamp"]);   /* not curriculum (BaseCamp = orientation): left out entirely */
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false });
const local = iso => { const p = {}; for (const x of fmt.formatToParts(new Date(iso))) p[x.type] = x.value; const h = p.hour === "24" ? 0 : +p.hour; return { ymd:`${p.year}-${p.month}-${p.day}`, min: h*60 + +p.minute }; };
const ayOf = ymd => { const y = +ymd.slice(0,4), m = +ymd.slice(5,7); return m >= 7 ? y : y - 1; };
const r2 = n => Math.round(n*100)/100;
const TODAY = local(new Date().toISOString()).ymd;

const out = { generated: data.generated, source: "ASCEND Class Calendar (Google Calendar, public iCal feed)", tz: TZ,
  rules: "Per-student scheduled curricular hours (total) and the module's allotted calendar time (allotted). Scheduled durations of same-day timed sessions; a session run separately for Group A and Group B, or split into sections within a block, is counted once, at one group's or section's time; a slot session offered in several windows is counted once; staggered windows count the full window (upper bound, see staggered); an all-day restricted-date marker is not counted when the timed exam or OSCE entry is on the same day. instructional = LEC/SGD/CCSG/LAB/ACS (applied clinical session)/PNL/REV/INT/clinical/other sessions; assessment = EXAM/OSCE/timed QUIZ; an OSCE counts 3 h per student and an all-day proctored exam its allotted 4 h block (make-up/re-take days not counted); a timed exam counts its scheduled block, which is longer than the NBME CAS testing time of 1.5 min per item. Excluded: open time, breaks, office hours, module-period banners, all-day items, multi-day quiz/pre-check windows, Student Services, Curriculum Events and APEX (not curriculum), BaseCamp (orientation), optional sessions, sessions open only to a subgroup (MD/PhD students, clerkship reps), and sessions with no module in the title. Planning estimate, not the curriculum map of record.",
  cohorts: {} };
for (const cal of data.calendars) {
  const seen = new Set();
  for (const e of data.events) {
    if (e.cal !== cal.id) continue;
    if (e.allDay && !(e.hours > 0)) continue;              /* all-day items count only when a per-student time applies (OSCE, proctored exam) */
    const a = e.allDay ? { ymd: e.start, min: 0 } : local(e.start), b = e.allDay ? { ymd: e.start, min: 0 } : local(e.end);
    let eYmd = b.ymd, eMin = b.min; if (eYmd > a.ymd && b.min === 0) { eMin = 1440; eYmd = a.ymd; }
    if (eYmd !== a.ymd) continue;                         /* multi-day window */
    if (e.kind === "module") continue;
    /* a calendar that belongs to one class (calendars.json "classOf") keeps that cohort in every year */
    const ay = ayOf(a.ymd), classOf = cal.classOf || (cal.year ? ay + 5 - cal.year : null);
    const ck = classOf ? `c${classOf}` : cal.key;
    const C = out.cohorts[ck] || (out.cohorts[ck] = { classOf, years: {} });
    const Y = C.years[ay] || (C.years[ay] = { label: `AY ${ay}–${String(ay+1).slice(2)}`, calendar: cal.key, calendarName: cal.name, curriculumYear: cal.year || null, modules: {} });
    if (EXCLUDED.has(e.module)) continue;
    const mname = e.module || "No module named";
    const M = Y.modules[mname] || (Y.modules[mname] = { official: !!e.module, first: a.ymd, last: a.ymd, sessions: 0, groupDuplicates: 0, instructional: 0, assessment: 0, total: 0, byType: {} });
    const ab = e.group === "A" || e.group === "B";
    let repeat = false;
    if (e.gkey) { const gk = ck + "|" + ay + "|" + mname + "|" + e.gkey; if (seen.has(gk)) { M.groupDuplicates++; repeat = true; } else seen.add(gk); }
    const counted = !e.subset && !e.optional && (INSTR.has(e.kind) || ASSESS.has(e.kind));
    if (a.ymd < M.first) M.first = a.ymd; if (a.ymd > M.last) M.last = a.ymd;
    if (!repeat) M.sessions++;
    const tk = e.subset ? "subset" : e.optional ? "optional" : e.kind;
    const T = M.byType[tk] || (M.byType[tk] = e.subset ? { code: "SUBSET", label: "Subgroup-only session (MD/PhD, clerkship reps)", sessions: 0, mandatory: 0, hours: 0, countedAs: "not counted" }
      : e.optional ? { code: "OPTIONAL", label: "Optional session", sessions: 0, mandatory: 0, hours: 0, countedAs: "not counted" }
      : { code: CODE[e.kind] || e.kind.toUpperCase(), label: KINDS[e.kind] || e.kind, sessions: 0, mandatory: 0, hours: 0, countedAs: INSTR.has(e.kind) ? "instructional" : ASSESS.has(e.kind) ? "assessment" : "not counted" });
    if (!repeat) { T.sessions++; if (e.mandatory) T.mandatory++; }
    (M._ev || (M._ev = [])).push({ e, tk, counted, ymd: a.ymd, s: a.min, f: e.allDay ? a.min : eMin, ab, repeat });
  }
}
/* per-session hours: allotted (module footprint) and per student */
const SECT = /\b(?:groups?\s*\d+\s*[–-]\s*\d+|grp\.?\s*[AB](?:\s*&\s*[AB])?|group\s*[A-Z0-9]+(?:\s*&\s*[A-Z0-9]+)?|section\s*\w+)\b\s*:?/gi;
const STAG = /assigned (start |arrival )?time|blackboard roster|ccsg roster|for assigned students|individual schedule|assignment roster/i;
const SLOT = /GU\/?GYN EXAM/i;
const unionMin = iv => { iv = iv.slice().sort((x, y) => x[0] - y[0]); let t = 0, cs = null, ce = null;
  for (const [s0, f0] of iv) { if (cs === null) { cs = s0; ce = f0; } else if (s0 <= ce) ce = Math.max(ce, f0); else { t += ce - cs; cs = s0; ce = f0; } } if (cs !== null) t += ce - cs; return t; };
function sessionKey(t) {
  const clean = t.replace(/^\s*\((?:mandatory|optional)[^)]*\)\s*/i, "").trim();
  if (SLOT.test(clean)) return "slot|" + clean.replace(/\b(LAB|LEC|SGD)\s*\d+\s*:?/gi, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
  return clean.replace(SECT, " ").replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}
for (const C of Object.values(out.cohorts)) for (const Y of Object.values(C.years)) for (const M of Object.values(Y.modules)) {
  const ev = (M._ev || []).filter(x => x.counted); delete M._ev;
  /* allotted: per day, the union of counted timed sessions; all-day assessments add their per-student time */
  const byDay = {}; let allot = 0;
  for (const x of ev) { if (x.e.allDay) continue; (byDay[x.ymd] = byDay[x.ymd] || []).push([x.s, x.f]); }
  for (const iv of Object.values(byDay)) allot += unionMin(iv) / 60;
  const allDayKeys = new Set();
  for (const x of ev) if (x.e.allDay && x.e.hours > 0) { const k = x.e.gkey || x.e.title; if (!allDayKeys.has(k)) { allDayKeys.add(k); allot += x.e.hours; } }
  /* per student, session by session */
  const sess = {};
  for (const x of ev) { const k = sessionKey(x.e.title); (sess[k] = sess[k] || []).push(x); }
  let per = 0, instr = 0, assess = 0, staggered = 0, split = 0;
  for (const T of Object.values(M.byType)) T.hours = 0;
  for (const list of Object.values(sess)) {
    let h;
    const hrs = list.map(x => x.e.hours).filter(n => n > 0);
    const timed = list.filter(x => !x.e.allDay);
    if (hrs.length) h = Math.max(...hrs);
    else if (list.some(x => SLOT.test(x.e.title))) { h = Math.max(...timed.map(x => (x.f - x.s) / 60)); staggered++; }
    else {
      const groups = [...new Set(timed.map(x => x.e.group).filter(g => g === "A" || g === "B"))];
      const daysOf = arr => { const d = {}; for (const x of arr) (d[x.ymd] = d[x.ymd] || []).push(x); return Object.values(d); };
      const dayHours = arr => daysOf(arr).reduce((acc, t) => {
        const ov = t.length > 1 && t.some((p, i) => t.some((q, j) => i !== j && p.s < q.f && q.s < p.f));
        const sec = t.length > 1 && (ov || t.some(x => { SECT.lastIndex = 0; return SECT.test(x.e.title); }));
        if (sec) split++;
        return acc + (sec ? Math.max(...t.map(x => (x.f - x.s) / 60)) : unionMin(t.map(x => [x.s, x.f])) / 60); }, 0);
      if (groups.length) { h = Math.max(...groups.map(g => dayHours(timed.filter(x => x.e.group === g || x.e.group === "AB" || !x.e.group)))); split++; }
      else h = dayHours(timed);
      if (list.some(x => STAG.test(x.e.title))) staggered++;
    }
    const k0 = list[0].tk, T = M.byType[k0]; if (T) T.hours += h;
    per += h; if (INSTR.has(list[0].e.kind)) instr += h; else assess += h;
    /* a session split into sections on one day ("Groups 1–5" / "Groups 6–10") is one session per student, not one per section */
    if (T) { const days = {}; for (const x of list) { if (x.repeat || x.e.group === "A" || x.e.group === "B") continue; (days[x.ymd] = days[x.ymd] || []).push(x); }
      for (const t of Object.values(days)) if (t.length > 1 && t.some(x => { SECT.lastIndex = 0; return SECT.test(x.e.title); })) {
        const extra = t.length - 1; T.sessions -= extra; M.sessions -= extra; T.mandatory -= Math.max(0, t.filter(x => x.e.mandatory).length - (t.some(x => x.e.mandatory) ? 1 : 0)); } }
  }
  M.allotted = r2(Math.max(allot, per)); M.perStudent = r2(per); M.staggered = staggered; M.splitSessions = split;
  M.instructional = instr; M.assessment = assess; M.total = per;
}
for (const C of Object.values(out.cohorts)) for (const Y of Object.values(C.years)) {
  /* a module still ahead whose calendar holds only its exam / OSCE dates (spring modules are entered as placeholder blocks
     until the schedule is built) is not yet scheduled: its assessment hours alone would understate it, so it is not counted */
  for (const M of Object.values(Y.modules)) if (M.official && !M.instructional && M.assessment && M.first > TODAY) { M.official = false; M.pending = true; }
  let yt = 0; for (const M of Object.values(Y.modules)) if (M.official) yt += M.total;
  Y.officialTotal = r2(yt);
  for (const M of Object.values(Y.modules)) { M.instructional = r2(M.instructional); M.assessment = r2(M.assessment); M.total = r2(M.total); M.pctOfYear = M.official && yt ? r2(M.total/yt*100) : null;
    for (const T of Object.values(M.byType)) { T.hours = r2(T.hours); T.pctOfModule = T.countedAs !== "not counted" && M.total ? r2(T.hours/M.total*100) : null; } }
}
writeFileSync("data/contact-hours.json", JSON.stringify(out));
const n = Object.entries(out.cohorts).map(([k, C]) => `${k}: ${Object.entries(C.years).map(([y, Y]) => `${Y.label} ${Object.keys(Y.modules).length} modules, ${Y.officialTotal} h`).join("; ")}`).join("\n  ");
console.log(`wrote data/contact-hours.json\n  ${n}`);
