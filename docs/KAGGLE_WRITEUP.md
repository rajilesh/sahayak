# Sahayak: An Offline Multilingual Triage Co-Pilot for Frontline Health Workers

**Track:** Health & Sciences · Digital Equity & Inclusivity · Global Resilience  
**Code:** https://github.com/YOUR-HANDLE/sahayak  
**Video:** https://youtu.be/YOUR-VIDEO-ID  
**Demo:** Run locally — `git clone`, `npm install`, `ollama run gemma4:e2b`, `npm start`

---

## The Problem

Picture Amina. She's 10 months old. Her mother carried her two hours to the nearest community health post in rural Tanzania. The health worker there — a trained Community Health Volunteer — has a thermometer, a scale, and a paper WHO IMCI booklet in her bag. Amina is breathing fast and can't suckle. The CHV has five minutes to decide: home care, treatment at the post, or a 90-minute motorbike ride to the district hospital.

She has no internet. No phone signal. No specialist to call.

This is not a hypothetical. There are over two million community health workers like her across sub-Saharan Africa and South Asia, responsible for nearly two billion people, working with paper protocols and no decision support. Studies consistently show that the majority of preventable child deaths occur not because care was unavailable, but because the severity wasn't recognised in time.

The technology to change this exists today. **Gemma 4 is the first open model small enough to run on an entry-level tablet, capable enough to handle multilingual clinical reasoning, and now ships with native function calling.** Sahayak ("helper" in Hindi) puts those capabilities in the CHW's pocket.

---

## What Sahayak Does

A frontline worker opens the Progressive Web App, enters basic patient vitals — temperature, respiratory rate, SpO₂, weight, age — and types symptoms freely, **in whatever language they are comfortable with**: Hindi, Swahili, English, or code-switched text. Gemma 4 runs entirely on-device and returns in under 35 seconds:

1. A **RED / YELLOW / GREEN** triage classification grounded strictly in WHO IMCI protocol
2. The **exact danger signs matched** — visible, auditable, not a black box
3. **Weight-and-age-correct dosing** for any indicated medication
4. A **structured referral note** ready to hand to the receiving facility
5. A **caregiver explanation in the caregiver's own language**

**Zero patient data leaves the device. It works in airplane mode.**

---

## Architecture

Sahayak is intentionally minimal: a Node.js/Express server hosts a PWA and orchestrates a **tool-calling loop** against a local Ollama instance running `gemma4:e2b`.

```
PWA (service-worker cached)
    │
    └──▶ Express /api/triage
              │
              └──▶ Ollama /api/chat  ←──▶  Gemma 4 E2B (local)
                        │
              ┌─────────┴──────────────────────────────────┐
              │  Local deterministic tools (tools.js)       │
              │  ├─ assess_danger_signs   (WHO IMCI §1-3)   │
              │  ├─ triage_classify       (RED/YELLOW/GREEN) │
              │  ├─ weight_based_dose     (WHO Pocketbook)   │
              │  ├─ generate_referral     (structured note)  │
              │  └─ translate             (caregiver output) │
              └─────────────────────────────────────────────┘
```

### Why Native Function Calling Is the Core Design Decision

Gemma 4's `tools` API is first-class, not a prompt hack. We use it to **fence off every safety-critical calculation**:

- `assess_danger_signs` pattern-matches WHO IMCI general danger signs against the symptom text and applies age-banded RR thresholds (≥60 for <2 months, ≥50 for 2–12 months, ≥40 for 12–59 months). The rule list is sourced verbatim from the IMCI Chart Booklet.
- `weight_based_dose` is a lookup table, not arithmetic. It cites the WHO Pocketbook of Hospital Care for Children (2nd ed.), clips to `max_mg`, and handles age-band exceptions for zinc and artemether-lumefantrine. Pediatric dosing errors are the leading cause of medication harm in low-resource settings — we refuse to let a generative model improvise.
- `triage_classify` is deterministic: any matched danger sign → RED. Full stop.
- `generate_referral` produces a structured, parseable handoff note.
- `translate` is a semantic marker: the model replies in the caregiver's language naturally, but must call this tool for caregiver-facing text so the UI surfaces it distinctly.

The result: **Gemma 4 handles the hard parts** — reading free-text multilingual symptoms, mapping them to formal IMCI terms, selecting the right tools, and explaining the result in plain language. **The protocol rules are static, local code.** Every tool call is visible in the UI's "Tool-call trace" panel. A clinician can audit exactly why the model classified a case RED.

### Offline-First, Privacy by Design

The service worker precaches the entire app shell. Ollama and the model weights live on the device. No API keys, no network dependency, no data egress. A 2024-era Android tablet with 6 GB RAM can run `gemma4:e2b`. The same codebase supports `gemma4:e4b` via a config flag for higher-capacity devices.

---

## Worked Example

**Sample case (built into the app):**

> Amina, 10 months, 7.8 kg, F. Temp 39.1°C, RR 58, SpO₂ 88%.  
> Symptoms in Swahili: *"Mtoto hawezi kunyonya tangu jana, anakohoa sana, anapumua haraka."*  
> *(Child cannot suckle since yesterday, coughing a lot, breathing fast.)*

**What Gemma 4 does in ~30 seconds:**

1. Calls `assess_danger_signs` → matches `["fast breathing (≥50 for age 2–12 m)", "SpO₂ < 90%", "fever ≥38.5°C", "unable to drink/breastfeed"]`
2. Calls `triage_classify` → **RED — IMMEDIATE REFERRAL**
3. Calls `generate_referral` → structured note with vitals, findings, urgency level
4. Writes the caregiver explanation **in Swahili** — detected automatically from the symptom text

The UI responds: red animated banner, pulsing alert rings, bouncing referral icon. Nothing ambiguous. The CHV knows to go now. She hands the referral note to the motorbike driver.

For a GREEN case — a 24-month-old with a mild cold, no danger signs — the interface is calm: a green banner, static icons, warm copy that says "No danger signs found. Home care is appropriate."

---

## Key Challenges and Solutions

**Hallucinated clinical signs.** Early versions of the prompt allowed Gemma 4 to invent IMCI danger signs in its explanation pass. Fixed by: (a) a system prompt instruction that the model is forbidden from stating clinical findings not present in a tool result, and (b) returning a `matched[]` array the model is instructed to quote verbatim.

**Streaming vs. tool loops.** Ollama's `/api/chat` returns tool calls reliably only in non-streaming mode on E2B. We chose correctness over streaming UX and compensated with an animated thinking-step indicator.

**Tool arg format inconsistency.** Gemma 4 occasionally passes tool arguments as a JSON string rather than a parsed object. The tool-call executor handles both defensively: `typeof args === "string" ? JSON.parse(args) : args`.

**Multilingual symptom parsing.** Rather than building a language detector, we constrain tool-call arguments to English (the IMCI symptom enum is small and well-defined) while leaving the model free to respond in the caregiver's language. This works because Gemma 4 E2B handles this cross-lingual mapping reliably.

---

## What Gemma 4 Specifically Unlocks

Three things that were not true a year ago:

1. **Native function calling at 3B scale** — previous open models needed brittle prompt scaffolding for tool use. Gemma 4's `tools` API is first-class.
2. **Multilingual reasoning at edge size** — Hindi and Swahili comprehension at E2B removes the cloud dependency that has historically gated frontline health AI.
3. **Deployment rights** — Gemma's usage terms allow real NGO deployment without per-organisation cloud agreements or data sharing.

---

## Roadmap

- **Multimodal intake:** Gemma 4 supports image input. Next: photo assessment of skin rashes, wound infection, and child wasting via MUAC tape image.
- **Voice input:** On-device Whisper for workers with lower literacy, replacing the free-text area.
- **Domain fine-tuning:** LoRA adaptation on Indian ASHA Module 6 and Kenyan CHV training curricula to improve accuracy on regionally prevalent conditions (severe acute malnutrition, kala-azar).
- **Field pilot:** Discussions underway with a partner NGO for a 50-CHW pilot study.

---

## Closing

Sahayak is the size of a hackathon project but the shape of something deployable. It respects two things most health AI ignores: the intelligence of frontline workers and the privacy of patients. Gemma 4 is the first open model where the shape and the reality coincide. The CHW who carried Amina's case doesn't need the cloud. She needs a tool that works where she works.

*Word count: ~1,490*
