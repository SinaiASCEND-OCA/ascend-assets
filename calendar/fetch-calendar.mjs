#!/usr/bin/env node
/* ASCEND Class Calendar — data fetch.
   Reads calendars.json, downloads each Google Calendar's public iCal feed, expands
   recurring events, and writes data/events.json for index.html to render.

     node fetch-calendar.mjs            # writes data/events.json
     WINDOW_BACK=460 WINDOW_AHEAD=730   # optional: days kept before / after today

   No credentials are needed: every calendar in calendars.json must be set to
   "Make available to public" in Google Calendar settings. The GitHub Actions
   workflow in .github/workflows/refresh.yml runs this every 15 minutes and
   redeploys the site, so the page is never more than about 30 minutes behind
   the calendar. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

/* Practice of Medicine modules are POM 1/2/3 (OCA naming, 18 Oct 2026); some calendar titles still say POM I/II/III. */
const POM_NUM = { I: "1", II: "2", III: "3" };
const arabicPOM = s => s.replace(/\bPOM I\/II\/III\b/g, "POM 1/2/3")
  .replace(/\bPOM([ -]?)(III|II|I)\b/g, (m, sep, r) => "POM" + (sep || " ") + POM_NUM[r])
  .replace(/\bPractice of Medicine (III|II|I)\b/g, (m, r) => "Practice of Medicine " + POM_NUM[r]);
import ical from "node-ical";

const calendars = JSON.parse(readFileSync("calendars.json", "utf8"));
const DAY = 86400000;
const now = new Date();
const winStart = new Date(now.getTime() - (Number(process.env.WINDOW_BACK) || 460) * DAY);   /* 15 months back covers the previous academic year from BaseCamp onward */
const winEnd = new Date(now.getTime() + (Number(process.env.WINDOW_AHEAD) || 730) * DAY);

const OSCE_HOURS = 3;             /* per student, however long the OSCE day runs */
const PROCTORED_EXAM_HOURS = 4;   /* allotted block for an all-day proctored exam entry */
const feedUrl = id => `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`;
const pad = n => String(n).padStart(2, "0");
const tzFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const ymdLocalTZ = d => { const p = {}; for (const x of tzFmt.formatToParts(d)) p[x.type] = x.value; return `${p.year}-${p.month}-${p.day}`; };
const ymdLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* Google puts HTML in descriptions (Zoom links, SharePoint links). Keep the text,
   pull the links out separately so the page can show them as buttons. */
function cleanDescription(html) {
  if (!html) return { text: "", links: [] };
  const s = String(html);
  const links = [];
  const seen = new Set();
  for (const m of s.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
    const u = m[0].replace(/[),.;]+$/, "");
    if (!seen.has(u)) { seen.add(u); links.push(u); }
  }
  const text = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, links };
}

/* Classify by the codes schedulers already use in titles, and pull the module name
   (the words before the session code: "Gastro LEC 8: …" -> Gastro). */
const CODE = /\b(LEC|LAB|SGD|CCSG|INT|REV|PTP|PAN|PNL|LGD|QUIZ|TA|ACS|SLF-STD|OFC-HRS|PRE-?CHECK|EXAM|SESSION)\b/i;
const CODE_KIND = { LEC:"lec", LGD:"lec", LAB:"lab", ACS:"acs", SGD:"sgd", CCSG:"ccsg", INT:"int", REV:"rev", TA:"rev", PTP:"pnl", PAN:"pnl", PNL:"pnl",
  QUIZ:"quiz", "PRE-CHECK":"precheck", PRECHECK:"precheck", EXAM:"exam", OSCE:"osce", "SLF-STD":"open", "OFC-HRS":"open" };
const INSTR_KINDS = new Set(["lec","sgd","ccsg","lab","acs","pnl","rev","int","clinical","session"]);
function classify(title) {
  const t = title.toUpperCase();
  const mandatory = /MANDATORY/.test(t);
  let kind = "other";
  const code = t.match(/\b(LEC|LGD|LAB|ACS|SGD|CCSG|INT|REV|TA|PTP|PAN|PNL|QUIZ|PRE-?CHECK|EXAM|OSCE|SLF-STD|OFC-HRS)\b/);
  if (/\bMODULE\s*$/.test(t) && !code) kind = "module";
  else if (/PRE-?CHECK|CCSG BASICS/.test(t)) kind = "precheck";   /* assignment windows, even when titled "CCSG Basics n (Closes …)" */
  else if (code) kind = CODE_KIND[code[1].replace("PRECHECK", "PRE-CHECK")] || "other";
  else if (/(OBJECTIVE|OBSERVED) STRUCTURED CLINICAL/.test(t)) kind = "osce";
  else if (/ASSESSMENT|PROCTORED|\bCAS\b|NBME|CBSE|\bPRACTICAL\s*$|END-OF-MODULE PRACTICAL/.test(t)) kind = "exam";
  else if (/MODULE INTRODUCTION|ORIENTATION/.test(t)) kind = "int";
  else if (/REVIEW SESSION|TA REVIEW|TA SESSION/.test(t)) kind = "rev";
  else if (/PANEL|PATIENT PRESENTATION/.test(t)) kind = "pnl";
  else if (/DISSECTION|CADAVER/.test(t)) kind = "lab";
  else if (/SMALL GROUP|\bSG\b/.test(t)) kind = "sgd";
  else if (/LECTURE/.test(t)) kind = "lec";
  else if (/LUNCH|L\s+U\s+N\s+C\s+H|FLEXTIME|FLEX TIME|INDEPENDENT LEARNING|INDEPEDENT LEARNING|SELF STUDY|OPEN OFFICE|OFFICE HOURS|TUTORING|HOLIDAY|NO CLASS|\bBREAK\b|PAUSE/.test(t)) kind = "open";
  else if (/CLASS MEETING|TOWN HALL|CEREMONY|OATH|MATCH|RETREAT|GATHERING/.test(t)) kind = "meeting";
  else if (/\bPOM\b|PEAKS|CLINICAL SKILLS|PRECEPTOR/.test(t)) kind = "clinical";
  else if (/INFO SESSION|WORKSHOP|\bIF\d|REGROUP|BCAMP|BOOT ?CAMP|SESSION/.test(t)) kind = "session";
  /* an assessment day entered under a teaching code ("POM SGD: History Taking and Writeup: Observed Structured Clinical
     Examination Assessment (Full Day)", "POM 2 CCSG 21: End of Module Exam") is an assessment, not 7-10 h of small group;
     reviews and prep for an OSCE or exam, and physical-exam teaching ("Core Physical Exam II"), stay instructional */
  if (INSTR_KINDS.has(kind) && !/REVIEW|\bPREP/.test(t)) {
    if (/(OBJECTIVE|OBSERVED) STRUCTURED CLINICAL EXAM/.test(t)) kind = "osce";
    else if (/\b(END|MID)[- ]?(OF[- ])?MODULE EXAM\b/.test(t)) kind = "exam";
  }
  const module = moduleOf(title);
  if (kind === "exam" && /^POM \d/.test(module)) kind = "osce";   /* POM has no written exam: its assessments are OSCEs */
  return { kind, mandatory, module };
}
const MODULE_NAMES = { GASTRO:"Gastroenterology", ENDO:"Endocrinology", RENAL:"Renal", MSK:"Musculoskeletal", ANAT:"Anatomy", MCG:"MCG", PHYSIO:"Physiology", PHYSIOLOGY:"Physiology",
  "GU-SRH":"GUSRH", GUSRH:"GUSRH", GRS:"GUSRH", CARDIO:"Cardiology", PULM:"Pulmonary", NEURO:"Neuroscience", HEME:"Hematology", PATH:"Pathology", PHARM:"Pharmacology",
  BEHAV:"Behavioral Science", THINQ:"THINQ", "POM-1":"POM 1", "POM-2":"POM 2", "POM-3":"POM 3", POM1:"POM 1", POM2:"POM 2", POM3:"POM 3", "PEAKS-1":"PEAKS 1", PEAKS1:"PEAKS 1", BCAMP:"Boot Camp", IF8:"InFocus 8" };
function moduleOf(title) {
  if (/\bAPEX\b/i.test(title)) return "APEX";
  if (/PIZZA PARTY/i.test(title)) return "Student Services";   /* social events coded as sessions on the Class of 2028 calendar */
  /* Phase 2 calendar (Class of 2028): TP2 is coded TRSNCLRK, CAMP weeks "CAMP 1" / "CAMP-4", Research Day "CEP2" */
  if (/\bTRSNCLRK\b|TRANSITIONS? TO (CLERKSHIPS?|PHASE 2)\b|\bTP2\b/i.test(title)) return "TP2";
  const camp = title.match(/(?:^|[\s)\-])CAMP[\s-]?(\d)\b/i); if (camp) return "CAMP " + camp[1];
  if (/\bCEP2\b|CUR-?EVNTS/i.test(title)) return "Curriculum Events";
  if (/PROSECTION/i.test(title)) return "Anatomy";
  const pom = title.replace(/^\s*\([^)]*\)\s*/, "").match(/^(?:Restricted Date:?\s*)?POM[ -]?(I{1,3}|[123])\b/i);
  if (pom) return "POM " + ({I:1, II:2, III:3}[pom[1].toUpperCase()] || pom[1]);
  const pomLong = title.match(/\bPractice of Medicine ([123])\b/i);   /* "Practice of Medicine 2 Mid-Module OSCE", "Restricted Date: Practice of Medicine 2 Assessment Week" */
  if (pomLong) return "POM " + pomLong[1];
  if (/^\s*(\((?:mandatory|optional)[^)]*\)\s*)?(bcamp|base ?camp)\b/i.test(title)) return "BaseCamp";
  let t = title.replace(/^\s*\((?:mandatory|optional|tentative)[^)]*\)\s*/i, "").replace(/^\s*\((?:mstp|md\/phd|non[- ]?mstp)[^)]*\)\s*-?\s*/i, "").replace(/^\s*(mandatory|optional|canceled|cancelled|hold)\s*[-:–]?\s*/i, "").trim();
  const m = t.match(/^([A-Za-z0-9][A-Za-z0-9&\/.\-]*(?:\s+[A-Za-z0-9][A-Za-z0-9&\/.\-]*){0,2}?)\s*(?:Grp\.?|Group)?\s*[AB]?(?:\s*&\s*[AB])?\s*:?\s*(?=(?:LEC|LAB|SGD|CCSG|INT|REV|PTP|PAN|PNL|LGD|QUIZ|TA|ACS|SLF-STD|OFC-HRS|PRE-?CHECK|EXAM|SESSION|Semester)\b)/i);
  if (!m) return "";
  let name = m[1].replace(/[:\-–]+$/, "").replace(/\s+(end|mid)[- ]of[- ]module\s*$/i, "").replace(/\s+(mid|end)[- ]module\s*$/i, "").trim();
  if (!name) return "";
  const U = name.toUpperCase();
  if (/^(THE|A|AN|CLASS|YEAR|M\d|STUDENT|MED|TA|MID|DESIGNATED|RESTRICTED|CANCELED|CANCELLED|HOLD)$/.test(U)) return "";
  if (/^(TA|MID|DESIGNATED|RESTRICTED)\b/.test(U)) return "";
  if (/STU-?SRV|STU\.? ?SVCS|STUDENT[- ]?SERVICES/.test(U)) return "Student Services";
  if (/^CUR-?EVNTS|CURRICULUM EVENTS/.test(U)) return "Curriculum Events";
  if (/^THINQ/.test(U)) return "THINQ";
  if (/^POM[ -]?(1|I)$/.test(U)) return "POM 1";
  if (/^POM[ -]?(2|II)$/.test(U)) return "POM 2";
  if (/^POM[ -]?(3|III)$/.test(U)) return "POM 3";
  if (/^PEAKS?[ -]?1/.test(U)) return "PEAKS 1";
  if (/^BEHAV/.test(U)) return "Behavioral Science";
  if (/^PULM/.test(U)) return "Pulmonary";
  if (/^CARDIO/.test(U)) return "Cardiology";
  if (/^NEURO/.test(U)) return "Neuroscience";
  if (/^HEME|^HEMAT/.test(U)) return "Hematology";
  if (/^ANAT/.test(U)) return "Anatomy";
  if (/^ENDO/.test(U)) return "Endocrinology";
  if (/^GASTRO|^GI$|^GI\/LIVER/.test(U)) return "Gastroenterology";
  if (/^SRH$|^GU\/SRH/.test(U)) return "GUSRH";
  if (/^MSK/.test(U)) return "Musculoskeletal";
  if (/^GU[- ]?SRH|^GUSRH|^GRS$/.test(U)) return "GUSRH";   /* schedulers use GRS, Gu-Srh and GUSRH for the same module */
  if (/^PATH/.test(U)) return "Pathology";
  if (/^PHYSIO/.test(U)) return "Physiology";
  if (/^PHARM/.test(U)) return "Pharmacology";
  if (/^BCAMP|^BOOT ?CAMP|^BASE ?CAMP/.test(U)) return "BaseCamp";
  if (/^INFO$/.test(U)) return "";
  if (/^IF ?8|^INFOCUS/.test(U)) return "InFocus 8";
  const key = U.replace(/\s+/g, "");
  if (MODULE_NAMES[key]) return MODULE_NAMES[key];
  return name.length <= 4 ? U : name.charAt(0).toUpperCase() + name.slice(1);
}

function pushEvent(out, cal, ev, start, end, uidSuffix) {
  if (!start) return;
  const allDay = ev.datetype === "date";
  if (!end) end = allDay ? new Date(start.getTime() + DAY) : new Date(start.getTime() + 3600000);
  if (end < winStart || start > winEnd) return;
  if (ev.status && String(ev.status).toUpperCase() === "CANCELLED") return;
  const title = arabicPOM(String(ev.summary || "(untitled)").replace(/\s+/g, " ").trim());
  const { text, links } = cleanDescription(ev.description);
  let { kind, mandatory, module } = classify(title);
  const rec = {
    id: (ev.uid || "") + (uidSuffix || ""),
    cal: cal.id,
    title,
    allDay,
    start: allDay ? ymdLocal(start) : start.toISOString(),
    end: allDay ? ymdLocal(end) : end.toISOString(),
    kind, mandatory
  };
  /* parallel groups: "Anat Grp. A: LAB 7" / "Anat Group B: LAB 7" are one session for a student */
  const gm = title.match(/\b(?:Grp\.?|Group)\s*([AB])\b(?:\s*(?:&|and|\/)\s*(?:Grp\.?|Group)?\s*([AB])\b)?/i);
  if (gm) { rec.group = gm[2] ? "AB" : gm[1].toUpperCase();
    if (!gm[2]) rec.gkey = title.replace(/\b(?:Grp\.?|Group)\s*[AB]\b\s*:?/i, "").replace(/^\s*\((?:mandatory|optional)[^)]*\)\s*/i, "").replace(/\s+/g, " ").trim().toLowerCase(); }
  /* Phase 2 calendar: the same small group is offered in several slots (three CaPD debriefs on one
     afternoon, eight skills-session repeats); a student attends one, so repeats count once, like Group A/B. */
  if (cal.repeatSlots && !rec.gkey && /^(ccsg|sgd)$/.test(kind) && (end.getTime() - start.getTime()) <= 2 * 3600000) {   /* the 4-hour TP2 afternoon blocks are distinct days, not repeats */
    rec.gkey = title.replace(/\([^)]*\)/g, " ").replace(/\b(LEC|LGD|LAB|SGD|CCSG|INT|REV|PTP|PAN|PNL|QUIZ|EXAM|OSCE)\s*\d*\s*:?/gi, " ")
      .replace(/\b(small )?groups?\s*\d+(\s*(&|and)\s*\d+)?\b/gi, " ").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
    rec.group = "R";
  }
  /* sessions open only to a subgroup (MD/PhD students, clerkship reps) are not class-wide contact hours */
  if (/\b(MSTP|MD\/?PHD)\s*(students\s*)?only\b|\bREPS?\s+ONLY\b|CLERKSHIP REPS?\b/i.test(title)) rec.subset = true;
  /* optional sessions ("(Optional) Robotic Anatomy", "(Optional Zoom) Financial Advising") are not required contact hours */
  else if (/\bOPTIONAL\b/i.test(title)) rec.optional = true;
  if (module === "POM" && !allDay) {   /* older titles say just "POM SGD": semester 1 = POM 1, semester 2 = POM 2, year-2 calendar = POM 3 */
    const ymd = ymdLocalTZ(start), mo = +ymd.slice(5,7), ay = mo >= 7 ? +ymd.slice(0,4) : +ymd.slice(0,4) - 1;
    /* a calendar that follows one class (calendars.json "classOf") was that class's year-2 calendar in AY classOf-3 */
    const year = cal.classOf ? ay - cal.classOf + 5 : cal.year;
    rec.module = year === 2 ? "POM 3" : (mo >= 7 ? "POM 1" : "POM 2");
  } else if (module) rec.module = module;
  if (kind === "exam" && /^POM \d/.test(rec.module || "")) rec.kind = kind = "osce";   /* "POM SGD: Mid-Module Exam" resolves to POM 1/2/3 only here */
  /* per-student assessment time (user rule 2026-09-27): an OSCE is 3 h per student however long the
     day runs; an all-day proctored exam counts its allotted block (calendar entries state none, so
     the standard 4 h block is used); make-up / re-take days and deadlines are not counted */
  if (kind === "osce") { const dur = allDay ? null : (end - start)/3600000; if (allDay || dur > OSCE_HOURS) rec.hours = OSCE_HOURS; }
  else if (kind === "exam" && allDay) { if (!/MAKE-?UP|RE-?TAKE|LAST DAY|INCOMPLETE/i.test(title)) rec.hours = PROCTORED_EXAM_HOURS; }
  /* an assessment spread over several days (daily OSCE slots, an "assessment week" entered day by day, plus its
     all-day restricted-date marker) is ONE assessment for a student: dedupe by normalised title within module + year */
  if (rec.hours > 0 && !rec.gkey) rec.gkey = "assess|" + title.replace(/^\s*\((?:mandatory|optional)[^)]*\)\s*/i, "").replace(/^\s*restricted date:?\s*/i, "").replace(/\s+week\s*$/i, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (ev.location) rec.location = String(ev.location).trim();
  if (text) rec.desc = text;
  if (links.length) rec.links = links;
  if (ev.url) rec.url = String(ev.url);
  out.push(rec);
}

const events = [];
const meta = [];
for (const cal of calendars) {
  const url = feedUrl(cal.id);
  const res = await fetch(url, { headers: { "user-agent": "ascend-class-calendar" } });
  if (!res.ok) throw new Error(`${cal.label}: HTTP ${res.status} fetching ${url}`);
  const ics = await res.text();
  const parsed = ical.sync.parseICS(ics);
  const tz = (ics.match(/^X-WR-TIMEZONE:(.+)$/m) || [])[1]?.trim() || "America/New_York";
  const name = (ics.match(/^X-WR-CALNAME:(.+)$/m) || [])[1]?.trim() || cal.label;
  let n = 0;
  for (const ev of Object.values(parsed)) {
    if (ev.type !== "VEVENT") continue;
    if (!ev.rrule) { pushEvent(events, cal, ev, ev.start, ev.end); n++; continue; }
    /* Recurring: expand within the window, honour EXDATEs and per-instance overrides. */
    const duration = ev.end && ev.start ? ev.end.getTime() - ev.start.getTime() : 3600000;
    const overrides = ev.recurrences || {};
    const exdates = ev.exdate || {};
    const dates = ev.rrule.between(new Date(winStart.getTime() - DAY), winEnd, true);
    const done = new Set();
    for (const d of dates) {
      const key = ymdLocal(d);
      if (exdates[key]) continue;
      done.add(key);
      const o = overrides[key];
      if (o) pushEvent(events, cal, o, o.start, o.end, "_" + key);
      else pushEvent(events, cal, ev, d, new Date(d.getTime() + duration), "_" + key);
      n++;
    }
    for (const [key, o] of Object.entries(overrides)) {
      if (done.has(key)) continue;
      pushEvent(events, cal, o, o.start, o.end, "_" + key); n++;
    }
  }
  meta.push({ key: cal.key || cal.id, id: cal.id, label: cal.label, year: cal.year || null, classOf: cal.classOf || null, phase: cal.phase || null, repeatSlots: !!cal.repeatSlots, short: cal.short || cal.label, color: cal.color || "#D6177F", name, tz,
    embed: `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(cal.id)}&ctz=${encodeURIComponent(tz)}` });
  console.log(`${cal.label}: ${n} base events read, feed name "${name}", tz ${tz}`);
}
/* an all-day "Restricted Date" assessment marker and the timed exam / OSCE entry on the same day are one
   assessment for a student ("Restricted Date POM 3 Mid-Module OSCE" + "POM-3 EXAM 1: Mid-Module OSCE Day"):
   the timed entry carries the hours, the marker is shown but not counted */
const timedAssess = new Set(events.filter(e => !e.allDay && (e.kind === "exam" || e.kind === "osce")).map(e => e.cal + "|" + ymdLocalTZ(new Date(e.start))));
for (const e of events) if (e.allDay && e.hours > 0 && timedAssess.has(e.cal + "|" + e.start)) { delete e.hours; delete e.gkey; }
events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title)));
mkdirSync("data", { recursive: true });
const out = { generated: now.toISOString(), window: { from: ymdLocal(winStart), to: ymdLocal(winEnd) }, calendars: meta, events };
writeFileSync("data/events.json", JSON.stringify(out));
console.log(`wrote data/events.json: ${events.length} events in window ${out.window.from} → ${out.window.to}`);
