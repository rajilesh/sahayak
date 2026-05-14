/**
 * Sahayak — Offline Frontline Health Triage with Gemma 4
 * Express server: proxies to local Ollama, executes tool calls in a loop.
 */
const express = require("express");
const cors = require("cors");
const path = require("path");
const tools = require("./tools");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const OLLAMA = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.GEMMA_MODEL || "gemma4:e2b";

const SYSTEM_PROMPT = `You are Sahayak, an offline triage co-pilot for community health workers in low-resource settings. You ground every clinical recommendation in WHO IMCI protocols. Be concise, structured, and safety-first.

Always:
1. Call assess_danger_signs first on any pediatric/maternal case.
2. Classify with triage_classify (RED=immediate referral, YELLOW=urgent care, GREEN=home care).
3. If meds are indicated, call weight_based_dose — never guess pediatric doses.
4. End with generate_referral when urgency is RED or YELLOW.
5. If the worker writes in Hindi, Swahili, or another language, respond in that language; use translate() for patient handouts.

Never invent danger signs or doses. If unsure, recommend referral.`;

const TOOL_SPECS = tools.specs;

async function chatOnce(messages) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOL_SPECS,
      stream: false,
      options: { temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  return res.json();
}

app.post("/api/triage", async (req, res) => {
  const { messages: userMessages = [] } = req.body || {};
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...userMessages,
  ];

  const trace = [];
  try {
    for (let step = 0; step < 6; step++) {
      const out = await chatOnce(messages);
      const msg = out.message || {};
      messages.push(msg);
      trace.push({ step, content: msg.content, tool_calls: msg.tool_calls });

      const calls = msg.tool_calls || [];
      if (!calls.length) {
        return res.json({ reply: msg.content, trace });
      }
      for (const call of calls) {
        const name = call.function?.name;
        let args = call.function?.arguments || {};
        if (typeof args === "string") {
          try { args = JSON.parse(args); } catch { args = {}; }
        }
        const fn = tools.handlers[name];
        const result = fn ? await fn(args) : { error: `unknown tool: ${name}` };
        messages.push({
          role: "tool",
          name,
          content: JSON.stringify(result),
        });
        trace.push({ step, tool: name, args, result });
      }
    }
    res.json({ reply: "[max tool steps reached]", trace });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message, trace });
  }
});

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, model: MODEL, ollama: OLLAMA }),
);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Sahayak running at http://localhost:${port}`);
  console.log(`Model: ${MODEL}  Ollama: ${OLLAMA}`);
});
