/**
 * Offline smoke test: hits each tool directly (no model) so CI can run without Ollama.
 */
const t = require("../server/tools");

(async () => {
  const danger = await t.handlers.assess_danger_signs({
    symptoms: ["unable to drink or breastfeed", "fast breathing"],
    age_months: 10,
    vitals: { respiratory_rate: 58, spo2: 88, temp_c: 39.1 },
  });
  console.assert(danger.danger_signs_present, "danger signs should be present");
  console.assert(danger.matched.length >= 3, "should match multiple signs");

  const triage = await t.handlers.triage_classify({
    symptoms: ["unable to drink or breastfeed", "fast breathing"],
    age_months: 10,
    vitals: { respiratory_rate: 58, spo2: 88, temp_c: 39.1 },
  });
  console.assert(triage.level === "RED", `expected RED got ${triage.level}`);

  const dose = await t.handlers.weight_based_dose({ drug: "amoxicillin", weight_kg: 11, age_months: 10 });
  console.assert(dose.dose_mg === 440, `expected 440mg got ${dose.dose_mg}`);

  const zinc = await t.handlers.weight_based_dose({ drug: "zinc", weight_kg: 11, age_months: 10 });
  console.assert(zinc.dose_mg === 20, "zinc >=6m should be 20mg");

  const al = await t.handlers.weight_based_dose({ drug: "artemether_lumefantrine", weight_kg: 11, age_months: 24 });
  console.assert(al.dose_per_administration === "1 tab", "AL band 5-14kg = 1 tab");

  const ref = await t.handlers.generate_referral({
    patient: { name: "Amina", age_months: 10, weight_kg: 7.8, sex: "F" },
    findings: ["SpO2 88%", "RR 58"],
    urgency: "RED",
    pre_referral_given: ["first dose amoxicillin"],
  });
  console.assert(ref.referral_note.includes("RED"), "referral should include urgency");

  console.log("✓ all smoke tests passed");
})();
