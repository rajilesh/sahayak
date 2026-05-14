# Sahayak — Video Script
## "The Helper" · 3 minutes · Gemma 4 Good Hackathon

---

### PRODUCTION NOTES
- **Tone:** Calm, purposeful, human. Not a product launch. A story.
- **Visual style:** Split screen — real-world photo/footage on left, app screen recording on right. Green and white palette.
- **Narration:** Single voice, measured pace. Can be subtitled.
- **Music:** Understated acoustic or ambient. Lowers under narration.
- **Runtime target:** 2 min 45 sec – 3 min 00 sec

---

## OPENING — [0:00–0:20] — THE PROBLEM

**[VISUAL: Black screen. Fade in — a worn paper booklet: "WHO IMCI Chart Booklet." A hand flips through it. Cut to: a rural health post, mud-brick walls, one window, morning light.]**

**NARRATION:**
> "There are two million people like her. Community health workers. ASHA workers. CHVs.
> They carry a paper protocol, a thermometer, and the responsibility for hundreds of families.
> When a sick child arrives, they have minutes — and no specialist to call."

---

## THE MOMENT — [0:20–0:45] — AMINA'S CASE

**[VISUAL: A mother sitting with a listless infant. The health worker kneels, watches the child's breathing, checks the thermometer. Her face shows focus, then concern.]**

**NARRATION:**
> "Amina is ten months old. She's been unable to feed since yesterday. Her breathing is fast.
> Temperature: 39.1 degrees. Respiratory rate: 58. SpO₂: 88 percent.
> Three numbers. Three danger signs. But the worker has to recognise them, weigh them, and decide — alone."

**[VISUAL: The worker opens a smartphone. App loads. She types symptoms — in Swahili.]**

---

## THE TOOL — [0:45–1:30] — SAHAYAK IN ACTION

**[VISUAL: Full-screen app recording. Intake form fills with Amina's vitals. Symptoms typed: "Mtoto hawezi kunyonya tangu jana, anakohoa sana, anapumua haraka." Worker taps "Run triage."]**

**NARRATION:**
> "This is Sahayak — 'helper' in Hindi.
> It runs entirely on the device. No internet. No data leaving the clinic.
> Powered by Gemma 4 E2B — Google's latest open model — running locally through Ollama."

**[VISUAL: Thinking bar animates — "Reading symptoms… Checking danger signs… Classifying…"]**

**NARRATION:**
> "Gemma 4's native function calling is what makes this safe.
> The model doesn't guess at clinical rules — it calls tools.
> Deterministic tools. Written from the WHO IMCI protocol. Auditable."

**[VISUAL: Cards appear one by one with stagger animation.]**

**NARRATION:**
> "Danger signs assessed. Three matched: fast breathing for her age, SpO₂ below 90%, fever above 38.5.
> Classification: RED. Immediate referral."

**[VISUAL: The RED banner pulses into view — large, clear, urgent. Expanding rings. The referral note populates below with patient details and findings.]**

---

## THE CONTRAST — [1:30–1:50] — GREEN CASE

**[VISUAL: Switch to a second case — a 24-month-old, mild cold, no danger signs. App result loads.]**

**NARRATION:**
> "Not every case is an emergency. Sahayak knows that too.
> A calm green report. No alarm. No panic.
> 'No danger signs found. Home care is appropriate.'"

**[VISUAL: Green banner, static icons, reassuring warm copy. The worker smiles, speaks to the mother.]**

---

## THE DESIGN CHOICE — [1:50–2:20] — WHY THIS MATTERS

**[VISUAL: Split — left: code showing tools.js with `assess_danger_signs`, `weight_based_dose`, `triage_classify`. Right: the tool-call trace panel in the app, showing each function called.]**

**NARRATION:**
> "Here's what we built differently.
> Gemma 4 handles the hard part — reading symptoms in any language, mapping them to clinical terms, explaining the result.
> But the dosing? That's a lookup table. Cited to the WHO Pocketbook.
> The danger signs? A fixed list from the IMCI chart booklet.
> The model cannot invent a diagnosis. Every tool call is visible. Inspectable."

**[VISUAL: Zoom to trace panel — `assess_danger_signs` call, `triage_classify` call. Clear.]**

**NARRATION:**
> "This is what trust in clinical AI looks like. Not a black box. A glass box."

---

## THE EQUITY ANGLE — [2:20–2:40] — LANGUAGE + OFFLINE

**[VISUAL: Three demo tabs — English, Hindi, Swahili. Same case, typed in different languages. Same correct RED output each time.]**

**NARRATION:**
> "Hindi. Swahili. English. Code-switched text.
> Gemma 4 E2B handles all of them. Fluently. Without translation middleware. Without the cloud.
> The health worker speaks the caregiver's language. The app does too."

**[VISUAL: Device switches to airplane mode. App still works. Triage runs. Result appears.]**

**NARRATION:**
> "Airplane mode. No signal. The model weights are on the device.
> Patient data never leaves the clinic."

---

## CLOSE — [2:40–3:00] — THE CALL TO ACTION

**[VISUAL: Return to the mother and child. The worker fills in a referral note — the one the app generated. She hands it to someone with a motorbike. The child is going to hospital.]**

**NARRATION:**
> "Gemma 4 is the first open model where this is real.
> Small enough for a tablet. Smart enough for a multi-step clinical protocol. Licensed for NGO deployment.
> Sahayak is a hackathon project — but it's the shape of something that could be in the field.
> The two million workers who need it already exist.
> Now, so does the model."

**[VISUAL: App on screen — the Sahayak logo, green topbar. Tagline fades in: "Offline triage co-pilot · Gemma 4 E2B · No data leaves the device."]**

**[END CARD: GitHub URL · Kaggle writeup link · "Built for the Gemma 4 Good Hackathon"]**

---

## SUPPLEMENTARY SCREEN RECORDING CHECKLIST

To capture for the video edit, record these sequences in the app at `http://localhost:8787`:

- [ ] **Empty state** — app loads, empty illustration visible (5 sec)
- [ ] **Sample load** — click "Load sample" with Amina (Swahili/RED case), vitals fill in (5 sec)
- [ ] **Run triage** — click "Run triage", full thinking animation (10–15 sec)
- [ ] **RED report reveal** — three cards stagger in, vitals shake in, RED banner pops (10 sec)
- [ ] **Trace panel** — open "Tool-call trace", show the 3 function calls (5 sec)
- [ ] **GREEN case** — load Joy sample (24-month-old mild cold), run, calm green result (10 sec)
- [ ] **Language switch** — Hindi symptoms typed manually, correct output (5 sec)
- [ ] **Airplane mode** — turn off WiFi in menu bar, re-run, same result (5 sec)

Total screen recording needed: ~55 seconds of clean footage at 1080p, 30fps.

---

## OPTIONAL B-ROLL SOURCES (royalty-free)

- WHO/PAHO photo library: https://www.paho.org/en/photo-video-gallery
- UNICEF Media: https://media.unicef.org
- Unsplash: search "community health worker", "rural clinic", "mother child Africa India"
