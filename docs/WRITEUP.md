# Sahayak — Kaggle Writeup (draft, ≤1500 words)

**Track:** Health & Sciences (primary), Digital Equity & Inclusivity, Global Resilience
**Live demo:** http://localhost:8787 (run locally — by design)
**Code:** https://github.com/YOUR-HANDLE/sahayak
**Video:** https://youtu.be/YOUR-VIDEO-ID

---

## The problem

In rural India, an ASHA worker carries a paper IMCI booklet, a thermometer, and the
responsibility for several hundred mothers and children. In northern Tanzania, a CHV does
the same with a Swahili manual. When a 10-month-old shows up refusing to feed with fast
breathing, they have **minutes** to decide: home care, urgent treatment, or 90-minute
motorbike ride to the district hospital. Connectivity is unreliable. Specialists are
unreachable. The cost of a missed danger sign is a dead child.

Existing digital tools either (a) require cloud connectivity, (b) ship dosing calculators
that aren't grounded in protocols, or (c) speak only English. Gemma 4 changes the floor:
a 3B-parameter open model with strong multilingual reasoning and **native tool calling**
that runs on a mid-range Android tablet. We built **Sahayak** ("helper") to use exactly
those capabilities.

## What Sahayak does

A frontline worker opens the PWA, enters vitals (temp, RR, SpO₂, weight, age), and types
symptoms **in whatever language is comfortable** — Hindi, Swahili, English, code-switched.
Within seconds, on-device Gemma 4 returns:

1. A **RED / YELLOW / GREEN** classification grounded in WHO IMCI.
2. The **specific danger signs** matched (auditable, not a black box).
3. **Weight-and-age-correct dosing** for any indicated drug.
4. A **structured referral note** ready to hand off at the receiving facility.
5. A **caregiver explanation in the caregiver's language**.

All of this works with the device in airplane mode. Patient data never leaves the device.

## Architecture

Sahayak is intentionally small: a Node.js Express server that hosts a static PWA and
orchestrates a tool-calling loop against a local Ollama instance running `gemma4:e2b`.
The model never produces clinical numbers itself; it **chooses** tools and **explains**
their outputs.

```
PWA (offline-cached) → Express tool-loop → Ollama → Gemma 4 E2B
                            │
                            └─ Local tools: assess_danger_signs,
                               triage_classify, weight_based_dose,
                               generate_referral, translate
```

### Why function calling is the central design choice

Gemma 4 ships with native function calling. We use it to **fence off the safety-critical
parts** of the workflow:

- `assess_danger_signs` pattern-matches WHO IMCI general danger signs against the symptom
  text and age-banded respiratory-rate thresholds. The list is sourced verbatim from the
  IMCI Chart Booklet.
- `weight_based_dose` is a lookup with explicit citations to the WHO Pocketbook of
  Hospital Care for Children (2nd ed.). Pediatric dosing is the #1 medication error in
  low-resource settings — we refuse to let a generative model invent it.
- `triage_classify` enforces the RED/YELLOW/GREEN logic deterministically.
- `generate_referral` produces a templated, parseable referral note.
- `translate` is a marker — the model itself does the multilingual generation, but it
  must call `translate(text, target_lang)` to flag caregiver-facing handouts, which the
  UI then renders verbatim.

This split means: **Gemma 4 is responsible for understanding the worker's free-text
symptoms, mapping them to formal symptom strings, picking the right tools, and
explaining the result in plain language. The protocol rules themselves are static, local,
and inspectable.** The frontend's "Tool-call trace" panel shows every call — judges (and
real clinicians) can audit exactly why the model classified a case RED.

### Multilinguality and digital equity

We tested with three live samples — Hindi, Swahili, English — and the E2B model handles
all three fluently, including code-switching within a single symptom string. The UI also
localises into the three languages. The CHW can speak the caregiver's language and let
Gemma 4 act as a real-time clinical translator.

### Offline-first

The PWA registers a service worker that caches the shell on first load. Ollama runs on
the device. Anything from a Steam Deck-class tablet to a Snapdragon 7+ Gen-class phone
can host the E2B model. We tested on an M-series MacBook for development and the model
returns a complete triage in ~30 seconds for a multi-tool case — fast enough to fit in
the workflow.

For higher-capacity tablets we ship a config flag to switch to `gemma4:e4b`. Same code,
same tools — just better reasoning in exchange for ~3× the memory.

## Real-world utility — a worked example

Sample case (loaded by the **Sample** button):

> Amina, 10 months, 7.8 kg, F. Temp 39.1°C, RR 58, SpO₂ 88%.
> Symptoms (Swahili): *"Mtoto hawezi kunyonya tangu jana, anakohoa sana, anapumua haraka."*

What Gemma 4 does:

1. Calls `assess_danger_signs` with the symptoms and vitals. The tool returns
   `["unable to drink or breastfeed", "fast breathing (>=50 for age 2-12m)", "SpO2 < 90%", "fever >=38.5C"]`.
2. Calls `triage_classify` → **RED**, reasons attached.
3. Calls `generate_referral` with urgency RED.
4. Writes the explanation **in Swahili** because the caregiver speaks Swahili.

This is exactly what an experienced clinical officer would do. It now happens in 30
seconds, in the village, in the caregiver's language, with a paper trail.

## Challenges we overcame

**Tool-call stability.** Early prompts let Gemma 4 hallucinate IMCI signs in the
explanation pass. We fixed this by (a) instructing the system prompt that the model is
forbidden from inventing danger signs and (b) returning structured `matched[]` arrays
from `assess_danger_signs` that the model is told to quote verbatim. The trace pane
verifies it.

**Pediatric dose safety.** We refused to let the model do mg/kg math even though it can.
Every drug goes through `weight_based_dose` which clips to `max_mg`, branches on
age-bands for zinc, and uses a weight-band table for artemether-lumefantrine — the WHO
standard for an unblister-pack.

**Streaming vs. tool loops.** Ollama's `/api/chat` returns tool calls in non-streaming
mode cleanly. Streaming would force us to assemble partial tool-call JSON, which is
flaky on E2B. We chose non-streaming for correctness and added a single optimistic UI
state to keep the worker informed.

**Language detection.** Rather than build a separate detector, we let Gemma 4 detect
the language implicitly and reply in kind, while constraining the *tool calls* to be in
English (the symptom enum is English). This works because IMCI symptom strings are
small and well-defined.

## What Gemma 4 specifically unlocks

- **3B-parameter quality**: a year ago, E2B-class models couldn't follow multi-step
  tool-call instructions reliably. They can now.
- **Native function calling**: previous open models needed brittle prompt scaffolding;
  Gemma 4's `tools` API is first-class.
- **Multilingual reasoning at small scale**: Hindi/Swahili comprehension at E2B size
  removes the cloud dependency that has gated frontline health AI.
- **License**: Gemma's terms allow real deployment by NGOs without negotiating per-org
  agreements with a major cloud.

## Roadmap

- **Multimodal:** Gemma 4 supports image input. Next step: photo-based assessment of
  skin rashes, wound infection, child wasting via MUAC tape image.
- **Voice:** On-device Whisper for CHWs with low literacy, replacing the textarea.
- **LoRA fine-tune** on the Indian ASHA Module 6 and Kenyan CHV training curricula to
  raise diagnostic accuracy on regionally common conditions (e.g., kala-azar, severe
  acute malnutrition).
- **Field study** with a partner NGO (under discussion) for a 50-CHW pilot.

## Closing

Sahayak is small on purpose. It's the size of a hackathon project, but the **shape** of
something real: a local, multilingual, auditable clinical co-pilot that respects the
intelligence of frontline workers and the privacy of patients. Gemma 4 is the first
open model where this shape is genuinely deployable on the devices these workers
already carry. We hope the judges see it the same way.

— *The Sahayak team*
