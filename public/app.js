const I18N = {
  en: { intake: "Patient intake", name: "Name", age: "Age (months)", weight: "Weight (kg)", sex: "Sex", temp: "Temp °C", rr: "Resp rate", spo2: "SpO₂ %", symptoms: "Symptoms (free text, any language)", result: "Assessment" },
  hi: { intake: "मरीज़ का विवरण", name: "नाम", age: "आयु (माह)", weight: "वज़न (किग्रा)", sex: "लिंग", temp: "तापमान °C", rr: "श्वसन दर", spo2: "SpO₂ %", symptoms: "लक्षण (किसी भी भाषा में लिखें)", result: "निर्धारण" },
  sw: { intake: "Taarifa ya mgonjwa", name: "Jina", age: "Umri (miezi)", weight: "Uzito (kg)", sex: "Jinsia", temp: "Joto °C", rr: "Mzunguko wa kupumua", spo2: "SpO₂ %", symptoms: "Dalili (lugha yoyote)", result: "Tathmini" },
};

const $ = (s) => document.querySelector(s);
const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function applyLang(l) {
  const dict = I18N[l] || I18N.en;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const k = el.dataset.i18n;
    if (!dict[k]) return;
    const t = el.firstChild;
    if (t && t.nodeType === 3) t.nodeValue = dict[k] + " ";
    else el.prepend(document.createTextNode(dict[k] + " "));
  });
}
$("#lang").addEventListener("change", (e) => applyLang(e.target.value));
applyLang("en");

const SAMPLES = [
  { name: "Amina", age: 10, weight: 7.8, sex: "F", temp: 39.1, rr: 58, spo2: 88,
    symptoms: "Mtoto hawezi kunyonya tangu jana, anakohoa sana, anapumua haraka." },
  { name: "Ravi", age: 30, weight: 12, sex: "M", temp: 38.4, rr: 36, spo2: 97,
    symptoms: "तीन दिन से दस्त, थोड़ा बुखार, खाने में रुचि कम।" },
  { name: "Joy", age: 48, weight: 15, sex: "F", temp: 37.0, rr: 24, spo2: 99,
    symptoms: "Mild cough for 2 days, eating well, playing normally." },
];
let sIdx = 0;
$("#sample").addEventListener("click", () => {
  const s = SAMPLES[sIdx++ % SAMPLES.length];
  $("#p-name").value = s.name; $("#p-age").value = s.age;
  $("#p-weight").value = s.weight; $("#p-sex").value = s.sex;
  $("#p-temp").value = s.temp; $("#p-rr").value = s.rr;
  $("#p-spo2").value = s.spo2; $("#p-symptoms").value = s.symptoms;
});
$("#clear").addEventListener("click", () => {
  ["p-name", "p-symptoms"].forEach((i) => ($("#" + i).value = ""));
  showEmpty();
});

function patientPayload() {
  return {
    name: $("#p-name").value, age_months: +$("#p-age").value,
    weight_kg: +$("#p-weight").value, sex: $("#p-sex").value,
    vitals: { temp_c: +$("#p-temp").value, respiratory_rate: +$("#p-rr").value, spo2: +$("#p-spo2").value },
    symptoms: $("#p-symptoms").value, lang: $("#lang").value,
  };
}

/* ---------- vital classification ---------- */
function rrThreshold(ageM) {
  if (ageM < 2) return 60;
  if (ageM < 12) return 50;
  return 40;
}
function vitalsClass(v, ageM) {
  const lim = rrThreshold(ageM);
  return {
    rr: v.respiratory_rate >= lim ? "danger" : v.respiratory_rate >= lim - 8 ? "warn" : "ok",
    spo2: v.spo2 < 90 ? "danger" : v.spo2 < 94 ? "warn" : "ok",
    temp: v.temp_c >= 38.5 ? "danger" : v.temp_c >= 37.5 ? "warn" : "ok",
    rrLim: lim,
  };
}

/* ---------- view-state ---------- */
function showEmpty() {
  $("#empty-state").hidden = false;
  $("#report-shell").hidden = true;
  $("#thinking").hidden = true;
  $("#output-card").classList.remove("report-mode");
}
function showThinking(active) {
  $("#empty-state").hidden = true;
  $("#report-shell").hidden = true;
  $("#thinking").hidden = false;
  $("#output-card").classList.remove("report-mode");
  document.querySelectorAll(".t-step").forEach((s, i) => {
    s.classList.toggle("done", i < active);
    s.classList.toggle("active", i === active);
  });
}

/* ---------- LEVEL meta ---------- */
const LEVEL_META = {
  RED: {
    badge: "EMERGENCY TRIAGE REPORT",
    meaning: "IMMEDIATE REFERRAL NEEDED",
    actionIcon: "🚨",
    actionTemplate: (subj) =>
      `<strong>REFER URGENTLY</strong> — ${subj} has critical signs. Transfer immediately to the nearest facility and begin pre-referral treatment per IMCI protocol en route.`,
  },
  YELLOW: {
    badge: "FOLLOW-UP REQUIRED",
    meaning: "TREAT & MONITOR",
    actionIcon: "📋",
    actionTemplate: (subj) =>
      `<strong>Start treatment</strong> per IMCI yellow-row guidelines for ${subj}. Schedule a follow-up visit in 2–5 days and advise the caregiver on warning signs to watch for.`,
  },
  GREEN: {
    badge: "ROUTINE CHECK",
    meaning: "HOME CARE — NO DANGER SIGNS",
    actionIcon: "✅",
    actionTemplate: (subj) =>
      `<strong>No danger signs found.</strong> ${subj} can be cared for at home. Advise on feeding, fluids, and rest. Return to clinic if symptoms worsen or new symptoms appear.`,
  },
};

/* ---------- card builders ---------- */
function vitalCardHTML({ icon, value, label, unit, cls, tag }) {
  return `<div class="vital-card ${cls}">
    <div class="vital-icon">${icon}</div>
    <span class="vital-value">${value}</span>
    <div class="vital-label">${label}${unit ? ` <span style="text-transform:none;font-weight:600;color:var(--r-muted)">${unit}</span>` : ""}</div>
    ${tag ? `<span class="danger-tag">${tag}</span>` : ""}
  </div>`;
}

function splitSymptoms(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n.;,•·]+|—|–/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
    .slice(0, 5);
}

/* ---------- main render ---------- */
function renderReport(data, patient) {
  const trace = data.trace || [];
  const findTool = (n) => trace.find((t) => t.tool === n)?.result;
  const cls = findTool("triage_classify");
  const danger = findTool("assess_danger_signs");
  const referral = findTool("generate_referral");
  const level = cls?.level || "GREEN";
  const meta = LEVEL_META[level] || LEVEL_META.GREEN;

  const shell = $("#report-shell");
  shell.hidden = false;
  $("#empty-state").hidden = true;
  $("#thinking").hidden = true;
  shell.classList.remove("level-RED", "level-YELLOW", "level-GREEN");
  shell.classList.add("level-" + level);

  // Header
  $("#r-badge-text").textContent = meta.badge;
  const subject = patient.name
    ? `${patient.name}, ${patient.age_months} months`
    : `Child, ${patient.age_months} months`;
  $("#r-subject").textContent = subject;

  // ---- STEP 1: Vitals ----
  const vc = vitalsClass(patient.vitals, patient.age_months);
  const v = patient.vitals;
  const vitalsHTML = [
    vitalCardHTML({
      icon: "🌡️",
      value: `${v.temp_c.toFixed(1)}°C`,
      label: "Temperature",
      cls: vc.temp,
      tag: vc.temp === "danger" ? "≥ 38.5°C ⚠" : vc.temp === "warn" ? "Mild fever" : "Normal ✓",
    }),
    vitalCardHTML({
      icon: "💨",
      value: `RR ${v.respiratory_rate}`,
      label: "Resp. Rate",
      unit: "/min",
      cls: vc.rr,
      tag: vc.rr === "danger" ? `≥ ${vc.rrLim} for age ⚠` : vc.rr === "warn" ? "Borderline" : "Normal ✓",
    }),
    vitalCardHTML({
      icon: "🩸",
      value: `${v.spo2}%`,
      label: "SpO₂",
      cls: vc.spo2,
      tag: vc.spo2 === "danger" ? "< 90% ⚠" : vc.spo2 === "warn" ? "Low" : "Normal ✓",
    }),
  ].join("");
  $("#r-vitals").innerHTML = vitalsHTML;

  // ---- STEP 1: Symptoms ----
  const sympList = splitSymptoms(patient.symptoms);
  const dangerMatched = (danger && danger.matched) || [];
  const dangerHaystack = dangerMatched.join(" ").toLowerCase();
  const sympHTML = sympList
    .map((s, i) => {
      const isDanger =
        level === "RED" &&
        (/breath|breathing|kunyonya|feed|suckle|cyanos|convulsion|lethargic|unconscious/i.test(s) ||
         dangerHaystack.includes(s.toLowerCase().slice(0, 12)));
      const cl = isDanger ? "danger-s" : level === "YELLOW" ? "warn-s" : "";
      const ico = cl === "danger-s" ? "⚠️" : cl === "warn-s" ? "•" : "✓";
      return `<div class="symptom ${cl}" style="animation-delay:${0.1 + i * 0.08}s">${ico} ${escapeHtml(s)}</div>`;
    })
    .join("");
  $("#r-symptoms").innerHTML = sympHTML || `<div class="symptom">No symptoms entered</div>`;

  // ---- STEP 2: Classification banner ----
  $("#r-level").textContent = level;
  $("#r-meaning").textContent = meta.meaning;
  const pills = dangerMatched.slice(0, 4).map((m) => `<span class="r-pill">${escapeHtml(m)}</span>`).join("");
  $("#r-pills").innerHTML = pills || `<span class="r-pill">No danger signs</span>`;

  // ---- STEP 3: Patient grid ----
  $("#r-patient").innerHTML = [
    ["Patient Name", patient.name || "—"],
    ["Age", patient.age_months + " months"],
    ["Sex", patient.sex === "F" ? "Female" : patient.sex === "M" ? "Male" : "—"],
    ["Weight", patient.weight_kg + " kg"],
  ].map(([k, val]) => `<div class="info-item"><div class="info-key">${k}</div><div class="info-val">${escapeHtml(val)}</div></div>`).join("");

  // ---- STEP 3: Findings (from referral note OR derived) ----
  const findings = [];
  if (referral && referral.referral_note) {
    const lines = referral.referral_note.split("\n");
    let inFindings = false;
    for (const l of lines) {
      if (/^Findings:/i.test(l)) { inFindings = true; continue; }
      if (inFindings) {
        if (/^[A-Z][A-Za-z ]+:/.test(l.trim())) break;
        const m = l.match(/^\s*-\s*(.+)$/);
        if (m) findings.push(m[1].trim());
      }
    }
  }
  if (!findings.length) {
    if (vc.temp === "danger") findings.push(`Fever ${v.temp_c.toFixed(1)}°C`);
    if (vc.rr === "danger") findings.push(`Fast breathing — RR ${v.respiratory_rate} (≥${vc.rrLim} for age)`);
    if (vc.spo2 === "danger") findings.push(`Hypoxemia — SpO₂ ${v.spo2}%`);
    sympList.forEach((s) => findings.length < 5 && findings.push(s));
  }
  $("#r-findings").innerHTML = findings.slice(0, 6)
    .map((f, i) => `<div class="finding" style="animation-delay:${0.05 + i * 0.08}s"><div class="finding-num">${i + 1}</div>${escapeHtml(f)}</div>`)
    .join("");

  // ---- STEP 3: Plan (markdown reply) ----
  $("#r-plan").innerHTML = window.renderMarkdown(data.reply || "");

  // ---- STEP 3: Action box ----
  $("#r-action-icon").textContent = meta.actionIcon;
  $("#r-action-text").innerHTML = meta.actionTemplate(patient.name || "the patient");

  // Trace
  $("#trace").textContent = JSON.stringify(trace, null, 2);

  // Show the designed full-bleed report (no double-frame)
  $("#output-card").classList.add("report-mode");

  // Reliable staggered reveal — no IntersectionObserver gating.
  const cards = document.querySelectorAll(".r-card");
  cards.forEach((c) => c.classList.remove("visible"));
  // Force a reflow so the browser sees the initial state before we transition.
  void shell.offsetWidth;
  cards.forEach((c, i) => setTimeout(() => c.classList.add("visible"), 80 + i * 180));

  // Bring the report into view
  requestAnimationFrame(() =>
    shell.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
}

/* ---------- run triage ---------- */
$("#run").addEventListener("click", async () => {
  const btn = $("#run");
  btn.disabled = true; btn.textContent = "Thinking…";
  showThinking(0);
  let step = 0;
  const stepper = setInterval(() => { step = Math.min(3, step + 1); showThinking(step); }, 4000);

  const p = patientPayload();
  const user = `Patient ${p.name || "[anon]"}, ${p.age_months} months, ${p.weight_kg} kg, ${p.sex}.
Vitals: temp ${p.vitals.temp_c}°C, RR ${p.vitals.respiratory_rate}, SpO2 ${p.vitals.spo2}%.
Symptoms (worker wrote in their language): "${p.symptoms}"
Caregiver language: ${p.lang}.
Run full IMCI triage. End with a clear plan and (if RED/YELLOW) a referral note.
Format the plan as concise markdown with short bullets. Do NOT use LaTeX math. Use plain ° for degrees. Keep it under 120 words.`;

  try {
    const r = await fetch("/api/triage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: user }] }),
    });
    const data = await r.json();
    renderReport(data, p);
  } catch (e) {
    $("#empty-state").hidden = false;
    $("#empty-state").innerHTML = `<p style="color:#b91c1c">Error: ${escapeHtml(e.message)}</p>`;
    $("#thinking").hidden = true;
    $("#report-shell").hidden = true;
  } finally {
    clearInterval(stepper);
    btn.disabled = false; btn.textContent = "▶ Run triage";
  }
});

/* ---------- net + PWA ---------- */
const dot = $("#online-dot"), txt = $("#online-text");
function updateNet() {
  if (navigator.onLine) { dot.className = "dot online"; txt.textContent = "online · still local"; }
  else { dot.className = "dot offline"; txt.textContent = "offline · running on-device"; }
}
window.addEventListener("online", updateNet); window.addEventListener("offline", updateNet); updateNet();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
