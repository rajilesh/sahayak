const I18N = {
  en: { intake: "Patient intake", name: "Name", age: "Age (months)", weight: "Weight (kg)", sex: "Sex", temp: "Temp °C", rr: "Resp rate", spo2: "SpO₂ %", symptoms: "Symptoms (free text, any language)", result: "Assessment" },
  hi: { intake: "मरीज़ का विवरण", name: "नाम", age: "आयु (माह)", weight: "वज़न (किग्रा)", sex: "लिंग", temp: "तापमान °C", rr: "श्वसन दर", spo2: "SpO₂ %", symptoms: "लक्षण (किसी भी भाषा में लिखें)", result: "निर्धारण" },
  sw: { intake: "Taarifa ya mgonjwa", name: "Jina", age: "Umri (miezi)", weight: "Uzito (kg)", sex: "Jinsia", temp: "Joto °C", rr: "Mzunguko wa kupumua", spo2: "SpO₂ %", symptoms: "Dalili (lugha yoyote)", result: "Tathmini" },
};

const $ = (s) => document.querySelector(s);
const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let currentProviderKey = "ollama";

// Configurable API base URL — persisted in localStorage
let API_BASE = localStorage.getItem("sahayak_api_base") || "";
// Only auto-suggest localhost:3000 when actually running on localhost on a different port
// On remote hosts (Render, etc.), use relative URLs (empty string = same origin)
if (!API_BASE && window.location.hostname === "localhost" && window.location.port !== "3000") {
  API_BASE = "http://localhost:3000";
  localStorage.setItem("sahayak_api_base", API_BASE);
}
// If a stale localhost entry is stored but we're on a remote host, clear it
if (API_BASE.startsWith("http://localhost") && window.location.hostname !== "localhost") {
  API_BASE = "";
  localStorage.removeItem("sahayak_api_base");
}

// ── BROWSER-DIRECT LOCAL BRIDGE ──────────────────────────────────────────
// On Render (or any remote host), the server can NOT reach the user's
// localhost. So the browser talks DIRECTLY to local Ollama / LM Studio.
// Browsers treat http://localhost as a secure context exception, so this
// works from https:// pages — provided the local service sends CORS headers.
const IS_REMOTE = window.location.hostname !== "localhost" &&
                  window.location.hostname !== "127.0.0.1";
let LOCAL_OLLAMA   = localStorage.getItem("sahayak_local_ollama")   || "http://localhost:11434";
let LOCAL_LMSTUDIO = localStorage.getItem("sahayak_local_lmstudio") || "http://localhost:1234";
let LOCAL_JAN      = localStorage.getItem("sahayak_local_jan")      || "http://localhost:1337";

async function bridgeOllamaFetch(path, opts = {}) {
  const url = LOCAL_OLLAMA.replace(/\/$/, "") + path;
  const r = await fetch(url, opts);
  return r;
}

async function bridgeOllamaTags() {
  const r = await bridgeOllamaFetch("/api/tags");
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
  return r.json(); // { models: [{name, size, ...}] }
}

async function bridgeOllamaDelete(name) {
  const r = await bridgeOllamaFetch("/api/delete", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error(`Delete failed: ${r.status}`);
  return true;
}

async function bridgeOllamaChat(messages, model) {
  const r = await bridgeOllamaFetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  if (!r.ok) throw new Error(`Ollama chat failed: ${r.status}`);
  return r.json();
}

// Show API server URL field only when on localhost with a non-3000 port (dev mismatch scenario)
document.addEventListener("DOMContentLoaded", () => {
  const apiSec = document.getElementById("api-server-section");
  if (apiSec) {
    const needsField = window.location.hostname === "localhost" &&
      window.location.port !== "" && window.location.port !== "3000";
    apiSec.hidden = !needsField;
  }
  // Pre-fill bridge inputs + show CORS notice on remote hosts
  const ollamaInput = document.getElementById("ollama-url-input");
  if (ollamaInput) ollamaInput.value = LOCAL_OLLAMA;
  const corsNotice = document.getElementById("ollama-cors-notice");
  if (corsNotice && IS_REMOTE) corsNotice.hidden = false;
});
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
  const topbarLabel = $("#topbar-model-label");
  const modelName = topbarLabel ? topbarLabel.textContent.trim() : "";

  // Guard: require a model to be selected
  if (!modelName || modelName === "no model") {
    const es = $("#empty-state");
    es.hidden = false;
    es.innerHTML = `<p style="color:#b45309;font-weight:700">⚠ No model selected — click the model name in the top bar to choose one</p>`;
    $("#thinking").hidden = true;
    $("#report-shell").hidden = true;
    return;
  }

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
    let data;
    if (currentProviderKey === "chrome-ai") {
      data = await triageChromeAI(user);
    } else if (IS_REMOTE) {
      // Remote host (Render): the server can't reach local Ollama, so go direct
      data = await triageDirectOllama(user, p);
    } else {
      const r = await fetch(`${API_BASE}/api/triage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: user }] }),
      });
      data = await r.json();
    }
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

/* ---------- model settings modal ---------- */
const modelBtn         = $("#model-btn");
const modelModal       = $("#model-modal");
const modalClose       = $("#modal-close");
const dlProgressWrap   = $("#dl-progress-wrap");
const dlProgressFill   = $("#dl-progress-fill");
const dlProgressLabel  = $("#dl-progress-label");
const dlProgressSize   = $("#dl-progress-size");
const dlProgressStatus = $("#dl-progress-status");

const closeModal = () => (modelModal.hidden = true);
modelBtn.addEventListener("click", () => {
  modelModal.hidden = false;
  // Pre-fill API base input with current value
  const apiInput = $("#api-base-input");
  if (apiInput) apiInput.value = API_BASE || "http://localhost:3000";
  loadProviders();
});
modalClose.addEventListener("click", closeModal);
modelModal.addEventListener("click", (e) => { if (e.target === modelModal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
const refreshBtn = $("#refresh-models-btn");
if (refreshBtn) refreshBtn.addEventListener("click", loadModels);

/* ── API base URL save ── */
const apiBaseSaveBtn = $("#api-base-save-btn");
if (apiBaseSaveBtn) {
  apiBaseSaveBtn.addEventListener("click", async () => {
    const input = $("#api-base-input");
    const statusEl = $("#api-base-status");
    const val = (input?.value || "").trim().replace(/\/$/, "");
    API_BASE = val;
    localStorage.setItem("sahayak_api_base", val);
    if (statusEl) { statusEl.textContent = "Testing…"; statusEl.className = "prov-status"; }
    try {
      const d = await safeJsonFetch("/api/health");
      if (statusEl) { statusEl.textContent = `✓ Connected — model: ${d.model || "?"}  (${val || "relative"})`; statusEl.className = "prov-status ok"; }
      if (d.model) updateActiveBadge(d.model);
      loadModels();
    } catch (e) {
      if (statusEl) { statusEl.textContent = `✗ ${e.message}`; statusEl.className = "prov-status err"; }
    }
  });
}

/* ── Provider tab switching ── */
document.querySelectorAll(".prov-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".prov-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".prov-panel").forEach((p) => (p.hidden = true));
    tab.classList.add("active");
    const prov = tab.dataset.prov;
    const panel = $(`#panel-${prov}`);
    if (panel) panel.hidden = false;
    if (prov === "ollama") loadModels();
    else if (prov === "chrome-ai") detectChromeAI();
    else if (prov === "lmstudio") probeServerProvider("lmstudio", "http://localhost:1234", "openai");
    else if (prov === "jan") probeServerProvider("jan", "http://localhost:1337", "openai");
  });
});

/* Connect buttons */
const lmstudioConnectBtn = $("#lmstudio-connect-btn");
const janConnectBtn      = $("#jan-connect-btn");
const customConnectBtn   = $("#custom-connect-btn");
if (lmstudioConnectBtn) lmstudioConnectBtn.addEventListener("click", () => probeServerProvider("lmstudio", "http://localhost:1234", "openai"));
if (janConnectBtn)      janConnectBtn.addEventListener("click",      () => probeServerProvider("jan", "http://localhost:1337", "openai"));
if (customConnectBtn) {
  customConnectBtn.addEventListener("click", () => {
    const url = ($("#custom-url-input")?.value || "").trim();
    if (!url) { const s = $("#custom-status"); if (s) { s.textContent = "Enter a URL first"; s.className = "prov-status err"; } return; }
    probeServerProvider("custom", url, "openai");
  });
}

async function safeJsonFetch(url, opts) {
  const fullUrl = url.startsWith("/api") ? `${API_BASE}${url}` : url;
  let r;
  try {
    r = await fetch(fullUrl, opts);
  } catch (e) {
    const target = API_BASE || "http://localhost:3000";
    throw new Error(`Cannot reach Sahayak server at ${target} — run: npm start`);
  }
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(`Sahayak server not running at ${API_BASE || "http://localhost:3000"} — run: npm start`);
  }
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

const RECOMMENDED_MODELS = [
  { name: "gemma4:e2b", size: "~2.7 GB", desc: "Edge-optimised · phones & tablets" },
  { name: "gemma4:e4b", size: "~4.9 GB", desc: "Better clinical reasoning · Snapdragon 7+", recommended: true },
  { name: "gemma4:12b", size: "~8 GB",   desc: "High-end laptops & workstations" },
  { name: "gemma4:27b", size: "~16 GB",  desc: "Maximum accuracy · GPU recommended" },
];

async function loadModels() {
  const installedList = $("#installed-models-list");
  const downloadCards = $("#download-cards");
  const bridgeStatus  = $("#ollama-bridge-status");
  installedList.innerHTML = '<div class="installed-empty">Loading…</div>';
  downloadCards.innerHTML = "";
  if (bridgeStatus) { bridgeStatus.textContent = ""; bridgeStatus.className = "prov-status"; }

  let installedNames = new Set();
  let currentName = "";
  let useDirectBridge = IS_REMOTE; // On Render, always try direct bridge first

  // Helper that renders the installed-models list from a raw array
  const renderInstalled = (models, current) => {
    if (!models.length) {
      installedList.innerHTML = '<div class="installed-empty">No models installed — pull one below ↓</div>';
      return;
    }
    installedList.innerHTML = models.map((m) => {
      const sizeStr = m.size ? (m.size / 1e9).toFixed(1) + " GB" : "";
      const isActive = m.name === current;
      return `<div class="installed-item${isActive ? " is-active" : ""}">
        <div class="installed-info">
          <span class="installed-name">${escapeHtml(m.name)}</span>
          ${sizeStr ? `<span class="installed-size">${sizeStr}</span>` : ""}
          ${isActive ? '<span class="installed-tag">active</span>' : ""}
        </div>
        <div class="installed-actions">
          ${!isActive ? `<button class="switch-inline-btn" data-model="${escapeHtml(m.name)}">Use</button>` : ""}
          <button class="del-btn" data-model="${escapeHtml(m.name)}" title="Delete model">🗑</button>
        </div>
      </div>`;
    }).join("");
    installedList.querySelectorAll(".switch-inline-btn").forEach((b) =>
      b.addEventListener("click", () => switchModel(b.dataset.model)));
    installedList.querySelectorAll(".del-btn").forEach((b) =>
      b.addEventListener("click", () => deleteModel(b.dataset.model, b)));
  };

  // ── PATH A: Direct browser → localhost:11434 (used on Render or as fallback) ──
  const tryDirect = async () => {
    const data = await bridgeOllamaTags();
    const models = data.models || [];
    installedNames = new Set(models.map((m) => m.name));
    currentName = localStorage.getItem("sahayak_active_model") || (models[0] && models[0].name) || "";
    if (currentName) updateActiveBadge(currentName);
    renderInstalled(models, currentName);
    if (bridgeStatus) { bridgeStatus.textContent = `✓ Connected · ${models.length} model${models.length !== 1 ? "s" : ""}`; bridgeStatus.className = "prov-status ok"; }
    currentProviderKey = "ollama";
  };

  // ── PATH B: Server proxy (works on localhost) ──
  const tryServer = async () => {
    const data = await safeJsonFetch("/api/models");
    const models = data.models || [];
    installedNames = new Set(models.map((m) => m.name));
    currentName = data.current || "";
    if (currentName) updateActiveBadge(currentName);
    if (models.length) {
      renderInstalled(models, currentName);
    } else if (data.error) {
      installedList.innerHTML = `<div class="installed-empty err">⚠ Ollama not running — start with: <code>ollama serve</code></div>`;
      throw new Error("ollama-down");
    } else {
      renderInstalled(models, currentName);
    }
  };

  try {
    if (useDirectBridge) {
      try { await tryDirect(); }
      catch (e) {
        installedList.innerHTML = `<div class="installed-empty err">⚠ Can't reach local Ollama at <code>${escapeHtml(LOCAL_OLLAMA)}</code></div>`;
        if (bridgeStatus) { bridgeStatus.textContent = "✗ Not reachable"; bridgeStatus.className = "prov-status err"; }
        const hint = $("#model-ollama-hint");
        if (hint) hint.textContent = IS_REMOTE ? "Start: OLLAMA_ORIGINS='*' ollama serve" : "Ollama not reachable";
      }
    } else {
      try { await tryServer(); }
      catch (e) {
        // Server unreachable or Ollama down — try direct bridge as a fallback
        try { await tryDirect(); }
        catch (e2) {
          installedList.innerHTML = `<div class="installed-empty err">⚠ ${escapeHtml(e.message)}</div>`;
          const hint = $("#model-ollama-hint");
          if (hint) hint.textContent = "Ollama not reachable";
        }
      }
    }
  } catch (e) {
    installedList.innerHTML = `<div class="installed-empty err">⚠ ${escapeHtml(e.message)}</div>`;
  }

  // Always render download cards, marking installed ones
  downloadCards.innerHTML = RECOMMENDED_MODELS.map((m) => {
    const installed = installedNames.has(m.name);
    return `<div class="dl-card${m.recommended ? " dl-card--featured" : ""}${installed ? " dl-card--installed" : ""}">
      <div class="dl-info">
        <div class="dl-name">${escapeHtml(m.name)}${m.recommended ? ' <span class="dl-recommended">★ Rec</span>' : ""}</div>
        <div class="dl-desc">${m.size} · ${m.desc}</div>
      </div>
      ${installed
        ? '<span class="dl-installed-badge">✓ Installed</span>'
        : `<button class="dl-btn" data-model="${escapeHtml(m.name)}">↓ Pull</button>`}
    </div>`;
  }).join("");

  downloadCards.querySelectorAll(".dl-btn").forEach((b) =>
    b.addEventListener("click", () => startDownload(b.dataset.model, b)));
}

function updateActiveBadge(name) {
  const badge = $("#active-model-badge");
  const topbarLabel = $("#topbar-model-label");
  if (badge) badge.textContent = name;
  if (topbarLabel) topbarLabel.textContent = name;
}

async function switchModel(model) {
  if (IS_REMOTE) {
    // Direct mode: just remember the chosen model client-side
    localStorage.setItem("sahayak_active_model", model);
    updateActiveBadge(model);
    loadModels();
    return;
  }
  try {
    const data = await safeJsonFetch("/api/set-model", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (data.ok) { updateActiveBadge(data.model); loadModels(); }
    else alert(`Switch failed: ${data.error}`);
  } catch (e) {
    // Fallback to direct-bridge bookkeeping
    localStorage.setItem("sahayak_active_model", model);
    updateActiveBadge(model);
    loadModels();
  }
}

async function deleteModel(name, btn) {
  if (!confirm(`Delete "${name}" from Ollama?\nThis frees disk space. You can re-download anytime.`)) return;
  btn.textContent = "⏳"; btn.disabled = true;
  try {
    if (IS_REMOTE) {
      await bridgeOllamaDelete(name);
    } else {
      try {
        const data = await safeJsonFetch(`/api/models/${encodeURIComponent(name)}`, { method: "DELETE" });
        if (!data.ok) throw new Error(data.error || "Delete failed");
      } catch (e) {
        // Server unreachable — fall back to direct bridge
        await bridgeOllamaDelete(name);
      }
    }
    loadModels();
  } catch (e) {
    btn.textContent = "🗑"; btn.disabled = false;
    alert(`Delete failed: ${e.message}`);
  }
}

let dlActive = false;

async function startDownload(model, btn) {
  if (dlActive) return;
  dlActive = true;
  dlProgressWrap.hidden = false;
  dlProgressFill.style.width = "2%";
  dlProgressLabel.textContent = `Pulling ${model}…`;
  dlProgressSize.textContent = "";
  if (dlProgressStatus) dlProgressStatus.textContent = "Connecting to Ollama registry…";
  const allDlBtns = () => document.querySelectorAll(".dl-btn");
  allDlBtns().forEach((b) => (b.disabled = true));

  // Direct bridge: stream from local Ollama /api/pull (NDJSON)
  // Used on Render, and as a fallback on localhost if the Sahayak server is down.
  const pullDirect = async () => {
    const r = await bridgeOllamaFetch("/api/pull", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
    });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    return r;
  };

  const pullViaServer = async () => {
    const r = await fetch(`${API_BASE}/api/pull`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Server ${r.status}: ${txt}`);
    }
    return r;
  };

  try {
    const r = IS_REMOTE ? await pullDirect() : await pullViaServer().catch(() => pullDirect());

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const raw = line.replace(/^data:\s*/, "").trim();
        if (!raw) continue;
        try {
          const msg = JSON.parse(raw);
          if (msg.error) {
            dlProgressLabel.textContent = `✗ ${msg.error}`;
            if (dlProgressStatus) dlProgressStatus.textContent = "Check that Ollama is running: ollama serve";
            dlActive = false; allDlBtns().forEach((b) => (b.disabled = false));
            return;
          }
          if (typeof msg.completed === "number" && msg.total) {
            const pct = Math.max(2, Math.round((msg.completed / msg.total) * 100));
            dlProgressFill.style.width = pct + "%";
            const mb = (v) => (v / 1048576).toFixed(0);
            dlProgressSize.textContent = `${mb(msg.completed)} / ${mb(msg.total)} MB`;
          }
          if (msg.status) dlProgressLabel.textContent = msg.status;
          if (dlProgressStatus && msg.digest) dlProgressStatus.textContent = msg.digest.slice(0, 28) + "…";
          if (msg.status === "success") {
            dlProgressFill.style.width = "100%";
            dlProgressLabel.textContent = `✓ ${model} ready!`;
            dlProgressSize.textContent = "";
            if (dlProgressStatus) dlProgressStatus.textContent = "Tap Use in Installed Models to activate it.";
            dlActive = false;
            loadModels();
            return;
          }
        } catch { /* partial JSON — skip */ }
      }
    }
    dlActive = false; allDlBtns().forEach((b) => (b.disabled = false));
  } catch (e) {
    dlProgressLabel.textContent = `✗ ${e.message}`;
    if (dlProgressStatus) dlProgressStatus.textContent = IS_REMOTE
      ? `Start Ollama with CORS: OLLAMA_ORIGINS='*' ollama serve`
      : "Check that Ollama is running: ollama serve";
    dlActive = false; allDlBtns().forEach((b) => (b.disabled = false));
  }
}

// Sync topbar label with server's current model on page load (no popup)
safeJsonFetch("/api/health").then((d) => {
  if (d.model) updateActiveBadge(d.model);
  if (d.provider) currentProviderKey = d.provider;
}).catch(() => {
  const topbarLabel = $("#topbar-model-label");
  if (topbarLabel && !topbarLabel.textContent.trim()) topbarLabel.textContent = "no model";
});

/* ── loadProviders: called when modal opens ── */
async function loadProviders() {
  // Always refresh the Ollama panel (active by default)
  loadModels();
  detectChromeAI();
}

/* ── Probe a server-side provider (LM Studio / Jan / Custom) ── */
async function probeServerProvider(provId, baseUrl, _type) {
  const statusEl  = $(`#${provId}-status`);
  const modelsEl  = $(`#${provId}-models`);
  const connectBtn = $(`#${provId}-connect-btn`);
  if (statusEl)  { statusEl.textContent = "Connecting…"; statusEl.className = "prov-status"; }
  if (connectBtn) connectBtn.disabled = true;

  try {
    const res = await safeJsonFetch(`/api/set-provider`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: provId, baseUrl }),
    });
    // Fetch the model list for this provider
    const modData = await safeJsonFetch("/api/models");
    const models = modData.models || [];

    if (statusEl) { statusEl.textContent = `✓ Connected — ${models.length} model${models.length !== 1 ? "s" : ""} found`; statusEl.className = "prov-status ok"; }
    currentProviderKey = provId;
    updateActiveBadge(res.model || (models[0] && models[0].name) || provId);

    if (modelsEl) {
      if (models.length) {
        modelsEl.hidden = false;
        modelsEl.innerHTML = models.map((m) => `
          <div class="installed-item${m.name === res.model ? " is-active" : ""}">
            <div class="installed-info">
              <span class="installed-name">${escapeHtml(m.name)}</span>
              ${m.name === res.model ? '<span class="installed-tag">active</span>' : ""}
            </div>
            <div class="installed-actions">
              ${m.name !== res.model ? `<button class="switch-inline-btn" data-model="${escapeHtml(m.name)}" data-prov="${provId}">Use</button>` : ""}
            </div>
          </div>`).join("");
        modelsEl.querySelectorAll(".switch-inline-btn").forEach((b) =>
          b.addEventListener("click", async () => {
            await safeJsonFetch("/api/set-provider", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ provider: b.dataset.prov, model: b.dataset.model }),
            });
            updateActiveBadge(b.dataset.model);
            probeServerProvider(provId, baseUrl, _type);
          }));
      } else {
        modelsEl.hidden = false;
        modelsEl.innerHTML = '<div class="installed-empty">No models found. Load a model in the app first.</div>';
      }
    }
  } catch (e) {
    if (statusEl) { statusEl.textContent = `✗ ${e.message}`; statusEl.className = "prov-status err"; }
  } finally {
    if (connectBtn) connectBtn.disabled = false;
  }
}

/* ── Chrome Built-in AI (Gemini Nano) ── */
function detectChromeAI() {
  const statusEl  = $("#chrome-ai-status");
  const actionsEl = $("#chrome-ai-actions");
  if (!statusEl) return;

  const newAPI = typeof window.LanguageModel !== "undefined";
  const oldAPI = window.ai && window.ai.languageModel;
  const supported = newAPI || oldAPI;

  if (!supported) {
    statusEl.textContent = "✗ Chrome Built-in AI not available in this browser";
    statusEl.className = "prov-status err";
    if (actionsEl) actionsEl.innerHTML = '<p class="modal-note" style="margin-top:8px">Requires Chrome 127+ with <code>chrome://flags/#prompt-api-for-gemini-nano</code> enabled.</p>';
    return;
  }

  // Check availability
  const checkAvailability = newAPI
    ? () => window.LanguageModel.availability()
    : () => window.ai.languageModel.capabilities().then((c) => c.available === "readily" ? "available" : c.available);

  checkAvailability().then((avail) => {
    const ready = avail === "readily" || avail === "available";
    const downloading = avail === "after-download" || avail === "downloading";
    if (ready) {
      statusEl.textContent = "✓ Gemini Nano is ready on this device";
      statusEl.className = "prov-status ok";
      currentProviderKey = "chrome-ai";
      updateActiveBadge("Gemini Nano (Chrome)");
      if (actionsEl) actionsEl.innerHTML = '<button class="ghost-sm" id="chrome-ai-use-btn" style="margin-top:8px">Use Chrome AI for triage</button>';
      const useBtn = $("#chrome-ai-use-btn");
      if (useBtn) useBtn.addEventListener("click", () => {
        currentProviderKey = "chrome-ai";
        updateActiveBadge("Gemini Nano (Chrome)");
        closeModal();
      });
    } else if (downloading) {
      statusEl.textContent = "⏬ Gemini Nano is downloading — check back soon";
      statusEl.className = "prov-status";
    } else if (avail === "downloadable" || avail === "after-download") {
      statusEl.textContent = "⬇ Gemini Nano can be downloaded to this browser (~1.5 GB)";
      statusEl.className = "prov-status";
      if (actionsEl) actionsEl.innerHTML = '<button class="primary-sm" id="chrome-ai-dl-btn" style="margin-top:8px">Download Gemini Nano</button>';
      const dlBtn = $("#chrome-ai-dl-btn");
      if (dlBtn) dlBtn.addEventListener("click", () => window.downloadChromeAIModel());
    } else {
      statusEl.textContent = `⚠ Status: ${avail}`;
      statusEl.className = "prov-status err";
    }
  }).catch((e) => {
    statusEl.textContent = `✗ ${e.message}`;
    statusEl.className = "prov-status err";
  });
}

/* ── Chrome AI triage (structured-prompt, no tool-calling) ── */
async function triageChromeAI(userPrompt) {
  const systemPrompt = `You are Sahayak, a WHO IMCI pediatric triage assistant for community health workers.
Given a patient description, respond ONLY with valid JSON matching this schema exactly:
{
  "reply": "<brief triage plan in markdown, <120 words>",
  "trace": [
    { "tool": "assess_danger_signs",   "result": { "danger_signs": ["<sign1>", "<sign2>"] } },
    { "tool": "triage_classify",       "result": { "level": "RED|YELLOW|GREEN", "reason": "<one line>" } },
    { "tool": "weight_based_dose",     "result": { "drug": "<drug>", "dose": "<dose with unit>", "route": "<route>", "frequency": "<freq>" } },
    { "tool": "generate_referral",     "result": { "urgency": "immediate|soon|routine", "note": "<referral text>" } }
  ]
}
Only include trace tools that are relevant. triage_classify is always required.
Do NOT include any text outside the JSON object. Do NOT wrap in markdown code blocks.`;

  const newAPI = typeof window.LanguageModel !== "undefined";
  let session;
  if (newAPI) {
    session = await window.LanguageModel.create({ systemPrompt });
  } else {
    session = await window.ai.languageModel.create({ systemPrompt });
  }

  const raw = await session.prompt(userPrompt);
  session.destroy();

  // 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
  let clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  // 2. Find outermost { ... } using bracket counting (handles nested objects)
  let jsonStr = null;
  const start = clean.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < clean.length; i++) {
      if (clean[i] === "{") depth++;
      else if (clean[i] === "}") { depth--; if (depth === 0) { jsonStr = clean.slice(start, i + 1); break; } }
    }
  }

  if (jsonStr) {
    try { return JSON.parse(jsonStr); } catch { /* fall through to fallback */ }
  }

  // 3. Fallback: Chrome AI returned plain text — extract urgency level and wrap it
  const lvl = /\b(RED|YELLOW|GREEN)\b/i.exec(raw)?.[1]?.toUpperCase() || "GREEN";
  return {
    reply: raw.slice(0, 600),
    trace: [
      { tool: "triage_classify", result: { level: lvl, reason: "Assessed by Chrome AI" } },
    ],
  };
}

// ───────────── Direct Ollama triage (browser → localhost) ─────────────
async function triageDirectOllama(userPrompt, patient) {
  const model = localStorage.getItem("sahayak_active_model");
  if (!model) throw new Error("No Ollama model selected. Open the Model panel and choose one.");

  const systemPrompt = `You are Sahayak, a WHO IMCI pediatric triage assistant.
Respond with VALID JSON ONLY in this exact shape (no prose, no markdown fences):
{
  "reply": "<one short clinician-facing summary>",
  "trace": [
    { "tool": "assess_danger_signs",   "result": { "danger_signs": ["<sign>"] } },
    { "tool": "triage_classify",       "result": { "level": "RED|YELLOW|GREEN", "reason": "<one line>" } },
    { "tool": "weight_based_dose",     "result": { "drug": "<drug>", "dose": "<dose>", "route": "<route>", "frequency": "<freq>" } },
    { "tool": "generate_referral",     "result": { "urgency": "immediate|soon|routine", "note": "<referral text>" } }
  ]
}
Include only relevant trace tools. triage_classify is always required.`;

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    format: "json",
    options: { temperature: 0.2 },
  };

  const r = await bridgeOllamaFetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
  const data = await r.json();
  const raw = data?.message?.content || "";

  // Parse JSON with same robustness as Chrome AI path
  let clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let jsonStr = null;
  const start = clean.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < clean.length; i++) {
      if (clean[i] === "{") depth++;
      else if (clean[i] === "}") { depth--; if (depth === 0) { jsonStr = clean.slice(start, i + 1); break; } }
    }
  }
  if (jsonStr) { try { return JSON.parse(jsonStr); } catch {} }

  const lvl = /\b(RED|YELLOW|GREEN)\b/i.exec(raw)?.[1]?.toUpperCase() || "GREEN";
  return {
    reply: raw.slice(0, 600) || "Triage complete.",
    trace: [{ tool: "triage_classify", result: { level: lvl, reason: "Assessed via local Ollama (direct)." } }],
  };
}

// ───────────── Local Ollama URL test/save ─────────────
(function wireOllamaUrlInput() {
  const input = document.getElementById("ollama-url-input");
  const btn = document.getElementById("ollama-url-save-btn");
  const status = document.getElementById("ollama-bridge-status");
  if (!input || !btn) return;
  btn.addEventListener("click", async () => {
    const url = (input.value || "").replace(/\/$/, "").trim();
    if (!url) return;
    LOCAL_OLLAMA = url;
    localStorage.setItem("sahayak_local_ollama", url);
    if (status) { status.textContent = "Testing…"; status.className = "bridge-status testing"; }
    try {
      const r = await fetch(`${url}/api/tags`, { method: "GET" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const count = (j?.models || []).length;
      if (status) {
        status.textContent = count > 0 ? `✓ Connected · ${count} model(s)` : "✓ Connected · no models yet";
        status.className = "bridge-status ok";
      }
      loadModels();
    } catch (e) {
      if (status) {
        status.innerHTML = `✗ Cannot reach <code>${escapeHtml(url)}</code> — ${escapeHtml(e.message)}.<br>Start Ollama with CORS: <code>OLLAMA_ORIGINS='*' ollama serve</code>`;
        status.className = "bridge-status err";
      }
    }
  });
})();

// ───────────── Chrome AI download monitor enhancement ─────────────
async function downloadChromeAIModel() {
  const wrap = document.getElementById("chrome-dl-wrap");
  const lbl = document.getElementById("chrome-dl-label");
  const pctEl = document.getElementById("chrome-dl-pct");
  const fill = document.getElementById("chrome-dl-fill");
  if (!wrap || !lbl || !pctEl || !fill) return;
  if (typeof window.LanguageModel === "undefined" && typeof window.ai === "undefined") {
    alert("Chrome AI not available in this browser. Use Chrome 131+ or enable chrome://flags/#optimization-guide-on-device-model");
    return;
  }
  wrap.hidden = false;
  lbl.textContent = "Starting download…";
  pctEl.textContent = "0%";
  fill.style.width = "2%";
  try {
    const createFn = window.LanguageModel?.create || window.ai?.languageModel?.create;
    const session = await createFn.call(window.LanguageModel || window.ai.languageModel, {
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          const pct = Math.max(1, Math.round((e.loaded || 0) * 100));
          fill.style.width = pct + "%";
          pctEl.textContent = pct + "%";
          lbl.textContent = "Downloading Gemini Nano…";
        });
      },
    });
    fill.style.width = "100%"; pctEl.textContent = "100%";
    lbl.textContent = "✓ Chrome AI ready";
    session.destroy?.();
    // Re-probe so the UI shows it as available
    if (typeof detectChromeAI === "function") detectChromeAI();
  } catch (e) {
    lbl.textContent = "✗ " + (e.message || e);
  }
}
window.downloadChromeAIModel = downloadChromeAIModel;
