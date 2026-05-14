# Sahayak — Offline Frontline Health Triage with Gemma 4

> Built for **The Gemma 4 Good Hackathon** · Tracks: Health & Sciences · Digital Equity · Global Resilience

**Sahayak** ("helper") turns any phone or tablet into an **offline, multilingual triage co-pilot**
for community health workers (ASHAs/CHWs) in low-resource settings. Everything runs on-device with
**Gemma 4 E2B** via Ollama — patient data never leaves the device.

![Sahayak triage screen — placeholder](docs/screenshot.png)

## Why this matters
A CHW in rural India, Tanzania, or Bolivia is often the **only** clinician a sick child meets.
They must spot pneumonia danger signs, compute pediatric doses, and decide on referral —
in their own language, with no internet, and no specialist on call. Sahayak makes Gemma 4
their second opinion.

## Demo (60 sec)
1. `ollama pull gemma4:e2b && ollama serve`
2. `npm install && npm start` → open <http://localhost:8787>
3. Click **Load sample** — first is a 10-month-old Swahili case with hypoxia.
4. Click **Run triage**. Watch the trace pane: Gemma 4 calls
   `assess_danger_signs → triage_classify → generate_referral`,
   classifies **RED**, and emits a referral note **in Swahili**.
5. Toggle Wi-Fi off, click **Run triage** again. Still works.

## Architecture
```
 ┌───────────────────────┐    HTTP    ┌─────────────────────┐    /api/chat   ┌──────────────┐
 │ PWA (offline cache,   │ ─────────▶ │ Express tool-call   │ ─────────────▶ │ Ollama       │
 │ i18n, install banner) │            │ executor (server/)  │ ◀───────────── │ Gemma 4 E2B  │
 └───────────────────────┘            └────────┬────────────┘   tool_calls   └──────────────┘
                                               │
                                               ▼
                                  WHO IMCI tool functions
                              (danger signs, dosing, referral)
```

### Why function calling, not free-form generation
Pediatric dosing and danger-sign rules are **safety-critical**. We do not want a 4B parameter
model "estimating" amoxicillin mg/kg. So we expose them as **deterministic local tools**:

| Tool | What it does | Source |
|------|--------------|--------|
| `assess_danger_signs` | Pattern-matches WHO IMCI general danger signs + vitals against age-banded thresholds | IMCI Chart Booklet |
| `triage_classify` | Returns RED/YELLOW/GREEN with reasons | IMCI |
| `weight_based_dose` | Computes dose from drug + weight + age (table for AL, mg/kg for amoxi/paracetamol, fixed for zinc) | WHO Pocketbook of Hospital Care for Children, 2nd ed |
| `generate_referral` | Produces a structured referral note | — |
| `translate` | Marks caregiver-facing strings for verbatim display | — |

Gemma 4 chooses **which** tools to call and **how** to explain the result in the caregiver's
language. Numbers come from rules; empathy and explanation come from the model. This is
deliberate: it makes the system **auditable** (the trace pane shows every tool call) and
gives Safety & Trust judges something concrete to review.

## Stack
- **Model:** `gemma4:e2b` (~3B params, edge-deployable) via Ollama
- **Server:** Node.js + Express tool-call loop (`server/index.js`, `server/tools.js`)
- **Client:** Vanilla PWA — service worker caches the shell, works fully offline
- **Languages:** UI in English / Hindi / Kiswahili; symptoms accepted in **any** language

## Project layout
```
sahayak/
├─ server/
│  ├─ index.js        # Express + Ollama tool-call loop
│  └─ tools.js        # WHO IMCI tool functions
├─ public/
│  ├─ index.html      # PWA shell
│  ├─ app.js          # Frontend, i18n, samples
│  ├─ styles.css
│  ├─ sw.js           # Service worker (offline shell cache)
│  ├─ manifest.webmanifest
│  └─ icons/icon.svg
├─ docs/
│  ├─ DEMO_SCRIPT.md  # 3-minute video script
│  └─ WRITEUP.md      # Kaggle writeup draft
└─ package.json
```

## Running
```bash
# 1. Prereqs
ollama pull gemma4:e2b      # ~4 GB; or gemma4:e4b for higher quality
ollama serve                 # http://localhost:11434

# 2. Sahayak
npm install
npm start                    # http://localhost:8787  (override with PORT=)
```

Env vars: `PORT`, `OLLAMA_URL`, `GEMMA_MODEL` (defaults `gemma4:e2b`).

## Roadmap
- **Vision input:** photo of rash/wound → Gemma 4 multimodal classification
- **Voice input** via on-device Whisper for non-literate CHWs
- **LoRA fine-tune** on India ASHA training manuals and Kenya CHV curriculum
- **Sync layer** that queues anonymized triage events for when connectivity returns

## Safety
Sahayak is a **decision support tool** for trained CHWs. It does not replace clinical judgement.
All recommendations cite WHO IMCI. Patient data is held in browser memory only; nothing leaves
the device unless the worker explicitly exports a referral note.

## License
MIT. Built on open models. Built for the people who carry health on their backs.
