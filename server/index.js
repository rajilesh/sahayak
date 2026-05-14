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

/* ── Multi-provider config ── */
const PROVIDERS = {
  ollama:   { id: "ollama",   name: "Ollama",    type: "ollama", baseUrl: process.env.OLLAMA_URL    || "http://localhost:11434" },
  lmstudio: { id: "lmstudio", name: "LM Studio", type: "openai", baseUrl: process.env.LMSTUDIO_URL  || "http://localhost:1234"  },
  jan:      { id: "jan",      name: "Jan.ai",     type: "openai", baseUrl: process.env.JAN_URL       || "http://localhost:1337"  },
  custom:   { id: "custom",   name: "Custom",     type: "openai", baseUrl: process.env.CUSTOM_URL    || ""                      },
};

// Back-compat alias for code that still references OLLAMA directly
const OLLAMA = PROVIDERS.ollama.baseUrl;

let currentProviderKey = "ollama";
let currentModel = process.env.GEMMA_MODEL || "gemma4:e2b";

const SYSTEM_PROMPT = `You are Sahayak, an offline triage co-pilot for community health workers in low-resource settings. You ground every clinical recommendation in WHO IMCI protocols. Be concise, structured, and safety-first.

Always:
1. Call assess_danger_signs first on any pediatric/maternal case.
2. Classify with triage_classify (RED=immediate referral, YELLOW=urgent care, GREEN=home care).
3. If meds are indicated, call weight_based_dose — never guess pediatric doses.
4. End with generate_referral when urgency is RED or YELLOW.
5. If the worker writes in Hindi, Swahili, or another language, respond in that language; use translate() for patient handouts.

Never invent danger signs or doses. If unsure, recommend referral.`;

const TOOL_SPECS = tools.specs;

async function chatOnceOllama(messages, baseUrl) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: currentModel,
      messages,
      tools: TOOL_SPECS,
      stream: false,
      options: { temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  return res.json();
}

async function chatOnceOpenAI(messages, baseUrl) {
  // Normalize messages to OpenAI format (tool role needs tool_call_id)
  const oaiMessages = messages.map((m, i) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: `call_${i}`, content: m.content || "" };
    }
    if (m.tool_calls) {
      return {
        role: m.role, content: m.content || "",
        tool_calls: m.tool_calls.map((tc, j) => ({
          id: `call_${i}_${j}`, type: "function",
          function: { name: tc.function.name, arguments: typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments) },
        })),
      };
    }
    return { role: m.role, content: m.content || "" };
  });

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: currentModel, messages: oaiMessages, tools: TOOL_SPECS, stream: false, temperature: 0.2 }),
  });
  if (!res.ok) throw new Error(`${currentProviderKey} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  // Normalize to Ollama-style response
  return {
    message: {
      role: msg.role || "assistant",
      content: msg.content || "",
      tool_calls: (msg.tool_calls || []).map((tc) => ({
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    },
  };
}

async function chatOnce(messages) {
  const prov = PROVIDERS[currentProviderKey];
  if (!prov || !prov.baseUrl) throw new Error(`Provider "${currentProviderKey}" has no base URL configured`);
  if (prov.type === "ollama") return chatOnceOllama(messages, prov.baseUrl);
  return chatOnceOpenAI(messages, prov.baseUrl);
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
  res.json({ ok: true, model: currentModel, provider: currentProviderKey, ollama: OLLAMA }),
);

/* ── Probe all providers (availability + model list) ── */
app.get("/api/providers", async (_req, res) => {
  const signal = (ms) => AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
  const results = {};

  for (const [key, prov] of Object.entries(PROVIDERS)) {
    if (!prov.baseUrl) { results[key] = { available: false, models: [] }; continue; }
    try {
      let models = [];
      if (prov.type === "ollama") {
        const r = await fetch(`${prov.baseUrl}/api/tags`, { signal: signal(2500) });
        if (r.ok) {
          const d = await r.json();
          models = (d.models || []).map((m) => ({ id: m.name, name: m.name, size: m.size }));
        }
      } else {
        const r = await fetch(`${prov.baseUrl}/v1/models`, { signal: signal(2500) });
        if (r.ok) {
          const d = await r.json();
          models = (d.data || []).map((m) => ({ id: m.id, name: m.id }));
        }
      }
      results[key] = { available: true, models };
    } catch {
      results[key] = { available: false, models: [] };
    }
  }
  res.json({ providers: results, current: currentProviderKey, currentModel });
});

/* ── Switch active provider ── */
app.post("/api/set-provider", (req, res) => {
  const { provider, model, baseUrl } = req.body || {};
  if (!PROVIDERS[provider]) return res.status(400).json({ error: "unknown provider" });
  currentProviderKey = provider;
  if (baseUrl && provider === "custom") PROVIDERS.custom.baseUrl = baseUrl;
  if (model) currentModel = model;
  console.log(`Provider switched to: ${currentProviderKey}  model: ${currentModel}`);
  res.json({ ok: true, provider: currentProviderKey, model: currentModel });
});

/* ── List installed models (active provider) ── */
app.get("/api/models", async (_req, res) => {
  const prov = PROVIDERS[currentProviderKey];
  try {
    let models = [];
    if (prov.type === "ollama") {
      const r = await fetch(`${prov.baseUrl}/api/tags`);
      if (!r.ok) throw new Error(`Ollama ${r.status}`);
      const data = await r.json();
      models = data.models || [];
    } else {
      const r = await fetch(`${prov.baseUrl}/v1/models`);
      if (!r.ok) throw new Error(`${prov.name} ${r.status}`);
      const data = await r.json();
      models = (data.data || []).map((m) => ({ name: m.id, size: null }));
    }
    res.json({ models, current: currentModel, provider: currentProviderKey });
  } catch (e) {
    // Return 200 with empty list so the client shows a graceful "Ollama not running" message
    // instead of a generic fetch error
    res.json({ models: [], current: currentModel, provider: currentProviderKey, error: e.message });
  }
});

/* ── Switch active model ── */
app.post("/api/set-model", (req, res) => {
  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: "model required" });
  currentModel = model;
  console.log(`Model switched to: ${currentModel}`);
  res.json({ ok: true, model: currentModel });
});

/* ── Pull (download) a model — SSE progress stream ── */
app.post("/api/pull", async (req, res) => {
  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: "model required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (res.socket) res.socket.setNoDelay(true);
  res.flushHeaders();

  const write = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const upstream = await fetch(`${PROVIDERS.ollama.baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
    });

    if (!upstream.ok) {
      write({ error: `Ollama ${upstream.status}: ${await upstream.text()}` });
      return res.end();
    }

    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          write(obj);
          if (obj.status === "success") { res.end(); return; }
        } catch { /* skip malformed line */ }
      }
    }
    write({ status: "success" });
  } catch (e) {
    write({ error: e.message });
  }
  res.end();
});

/* ── Delete a model from Ollama ── */
app.delete("/api/models/:model", async (req, res) => {
  const model = decodeURIComponent(req.params.model);
  try {
    const r = await fetch(`${PROVIDERS.ollama.baseUrl}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}: ${await r.text()}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, async () => {
  console.log(`Sahayak running at http://localhost:${port}`);
  // Auto-detect the best available Ollama model on startup
  try {
    const r = await fetch(`${PROVIDERS.ollama.baseUrl}/api/tags`);
    if (r.ok) {
      const data = await r.json();
      const names = (data.models || []).map((m) => m.name);
      if (names.length) {
        const priority = ["gemma4:e4b", "gemma4:e2b", "gemma4:12b", "gemma4:27b"];
        currentModel = priority.find((p) => names.includes(p)) || names[0];
        console.log(`Auto-detected model: ${currentModel}`);
      }
    }
  } catch { /* Ollama not running yet — use env default */ }
  console.log(`Model: ${currentModel}  Ollama: ${OLLAMA}`);
});
