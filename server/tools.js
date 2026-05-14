/**
 * Sahayak tool functions — grounded in WHO IMCI / Pocketbook of Hospital Care.
 * These run locally on the device; the model calls them via function calling.
 */

// --- WHO IMCI general danger signs (under-5) ---
const DANGER_SIGNS = [
  "unable to drink or breastfeed",
  "vomits everything",
  "convulsions",
  "convulsing now",
  "lethargic",
  "unconscious",
  "stridor in calm child",
  "severe respiratory distress",
  "central cyanosis",
  "grunting",
  "severe pallor",
  "stiff neck",
];

const RESP_RATE_FAST = { "0-2m": 60, "2-12m": 50, "12-59m": 40 };

function ageBand(age_months) {
  if (age_months < 2) return "0-2m";
  if (age_months < 12) return "2-12m";
  return "12-59m";
}

async function assess_danger_signs({ symptoms = [], age_months = 24, vitals = {} }) {
  const text = symptoms.join(" | ").toLowerCase();
  const hits = DANGER_SIGNS.filter((s) => text.includes(s));
  const band = ageBand(age_months);
  if (typeof vitals.respiratory_rate === "number" && vitals.respiratory_rate >= RESP_RATE_FAST[band]) {
    hits.push(`fast breathing (>=${RESP_RATE_FAST[band]} for age ${band})`);
  }
  if (typeof vitals.spo2 === "number" && vitals.spo2 < 90) hits.push("SpO2 < 90%");
  if (typeof vitals.temp_c === "number" && vitals.temp_c >= 38.5) hits.push("fever >=38.5C");
  return {
    danger_signs_present: hits.length > 0,
    matched: hits,
    source: "WHO IMCI Chart Booklet (general danger signs, under-5)",
    action: hits.length ? "Refer URGENTLY to hospital — give pre-referral treatment." : "No general danger signs detected.",
  };
}

async function triage_classify({ vitals = {}, symptoms = [], age_months = 24 }) {
  const danger = await assess_danger_signs({ symptoms, age_months, vitals });
  if (danger.danger_signs_present) {
    return { level: "RED", reason: danger.matched, recommendation: "Immediate referral. Begin pre-referral treatment per IMCI." };
  }
  const text = symptoms.join(" ").toLowerCase();
  const yellow = /cough|diarrh|fever|ear pain|low weight|anaemia|anemia/.test(text);
  if (yellow) {
    return { level: "YELLOW", reason: ["IMCI yellow-row condition"], recommendation: "Treat at facility and follow up in 2–5 days." };
  }
  return { level: "GREEN", reason: ["No danger signs, no IMCI yellow indicators"], recommendation: "Home care + caregiver counselling. Return if condition worsens." };
}

// Pediatric dosing per WHO Pocketbook of Hospital Care for Children (2nd ed).
const DOSING = {
  amoxicillin: { mg_per_kg: 40, freq: "BID", duration_days: 5, max_mg: 1000, note: "Pneumonia (non-severe) — WHO IMCI." },
  ors: { ml_per_kg: 75, freq: "over 4h", duration_days: 1, max_mg: null, note: "Some dehydration — Plan B." },
  zinc_under6m: { mg_per_kg: null, fixed_mg: 10, freq: "OD", duration_days: 14, note: "Diarrhoea, <6 months." },
  zinc_over6m: { mg_per_kg: null, fixed_mg: 20, freq: "OD", duration_days: 14, note: "Diarrhoea, >=6 months." },
  paracetamol: { mg_per_kg: 15, freq: "Q6H PRN", duration_days: 3, max_mg: 1000, note: "Fever/pain." },
  artemether_lumefantrine: { mg_per_kg: null, weight_table: true, freq: "BID", duration_days: 3, note: "Uncomplicated P. falciparum malaria." },
};

async function weight_based_dose({ drug, weight_kg, age_months }) {
  const key = drug.toLowerCase().replace(/[^a-z_]/g, "_");
  let spec = DOSING[key];
  if (!spec && key === "zinc") spec = age_months < 6 ? DOSING.zinc_under6m : DOSING.zinc_over6m;
  if (!spec) return { error: `No protocol for "${drug}". Refer for prescription.` };
  if (spec.weight_table) {
    const bands = [[5, 14, "1 tab"], [15, 24, "2 tabs"], [25, 34, "3 tabs"], [35, 999, "4 tabs"]];
    const band = bands.find(([lo, hi]) => weight_kg >= lo && weight_kg < hi);
    return { drug, dose_per_administration: band ? band[2] : "refer", frequency: spec.freq, duration_days: spec.duration_days, source: spec.note };
  }
  if (spec.ml_per_kg) {
    return { drug, dose_ml_total: Math.round(spec.ml_per_kg * weight_kg), schedule: spec.freq, source: spec.note };
  }
  if (spec.fixed_mg) {
    return { drug, dose_mg: spec.fixed_mg, frequency: spec.freq, duration_days: spec.duration_days, source: spec.note };
  }
  let mg = Math.round(spec.mg_per_kg * weight_kg);
  if (spec.max_mg) mg = Math.min(mg, spec.max_mg);
  return { drug, dose_mg: mg, frequency: spec.freq, duration_days: spec.duration_days, source: spec.note };
}

async function generate_referral({ patient = {}, findings = [], urgency = "YELLOW", pre_referral_given = [] }) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 16);
  const lines = [
    `SAHAYAK REFERRAL NOTE — ${ts}`,
    `Patient: ${patient.name || "[unnamed]"}  Age: ${patient.age_months ?? "?"} mo  Weight: ${patient.weight_kg ?? "?"} kg  Sex: ${patient.sex || "?"}`,
    `Urgency: ${urgency}`,
    `Findings:`,
    ...findings.map((f) => `  - ${f}`),
    `Pre-referral treatment given:`,
    ...(pre_referral_given.length ? pre_referral_given.map((p) => `  - ${p}`) : ["  - none"]),
    `CHW: ${patient.chw_id || "[id]"}   Facility: ${patient.facility || "[name]"}`,
  ];
  return { referral_note: lines.join("\n"), urgency };
}

async function translate({ text, target_lang }) {
  // Pass-through: real translation is performed by Gemma 4 itself.
  // The tool exists so the model can mark patient-handout strings explicitly.
  return { text, target_lang, note: "Render this verbatim to caregiver." };
}

const handlers = { assess_danger_signs, triage_classify, weight_based_dose, generate_referral, translate };

const specs = [
  {
    type: "function",
    function: {
      name: "assess_danger_signs",
      description: "Check WHO IMCI general danger signs for an under-5 child. Always call first for pediatric cases.",
      parameters: {
        type: "object",
        properties: {
          symptoms: { type: "array", items: { type: "string" } },
          age_months: { type: "number" },
          vitals: { type: "object", properties: { respiratory_rate: { type: "number" }, spo2: { type: "number" }, temp_c: { type: "number" } } },
        },
        required: ["symptoms", "age_months"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "triage_classify",
      description: "Classify the case as RED/YELLOW/GREEN per IMCI.",
      parameters: {
        type: "object",
        properties: {
          symptoms: { type: "array", items: { type: "string" } },
          age_months: { type: "number" },
          vitals: { type: "object" },
        },
        required: ["symptoms"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "weight_based_dose",
      description: "Compute pediatric dose for a drug given weight and age. Never guess doses.",
      parameters: {
        type: "object",
        properties: {
          drug: { type: "string" },
          weight_kg: { type: "number" },
          age_months: { type: "number" },
        },
        required: ["drug", "weight_kg"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_referral",
      description: "Produce a structured referral note for the receiving facility.",
      parameters: {
        type: "object",
        properties: {
          patient: { type: "object" },
          findings: { type: "array", items: { type: "string" } },
          urgency: { type: "string", enum: ["RED", "YELLOW", "GREEN"] },
          pre_referral_given: { type: "array", items: { type: "string" } },
        },
        required: ["findings", "urgency"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "translate",
      description: "Mark a string as a caregiver-facing handout in the target language.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" }, target_lang: { type: "string" } },
        required: ["text", "target_lang"],
      },
    },
  },
];

module.exports = { handlers, specs };
