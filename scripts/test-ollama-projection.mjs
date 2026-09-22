const base = process.env.OLLAMA_BASE_URL || "https://ollama.com";
const model = process.env.OLLAMA_MODEL || "gpt-oss:20b";
const key = process.env.OLLAMA_API_KEY || "";
const timeoutMs = 45000;

async function request(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function fail(message, details = {}) {
  console.error(JSON.stringify({ pass: false, message, ...details }, null, 2));
  process.exitCode = 1;
}

console.log(JSON.stringify({ base, model, authenticated: Boolean(key) }, null, 2));

const tags = await request(base.replace(/\/$/, "") + "/api/tags");
if (!tags.ok) {
  fail("Ollama tags endpoint is unreachable.", { status: tags.status, body: (await tags.text()).slice(0, 500) });
  process.exit();
}

const tagData = await tags.json();
const names = Array.isArray(tagData.models) ? tagData.models.map((x) => x?.name) : [];
console.log(JSON.stringify({ tagsReachable: true, modelListed: names.includes(model), sampleModels: names.slice(0, 12) }, null, 2));

if (!key) {
  console.log("OLLAMA_API_KEY is not configured in GitHub Actions; authenticated generation probe was not attempted.");
  process.exit(0);
}

const prompt = [
  "You are being tested by THE MIRROR.",
  "Do not answer the task immediately.",
  "STAGE 1: produce a compact JSON projection with exactly these top-level fields:",
  "goal, initial_state, predicted_state, futures, chosen_future, predicted_action, confidence, uncertainties, counterfactuals, visual_nodes.",
  "Include at least 3 futures, 2 counterfactuals, and 4 visual_nodes.",
  "STAGE 2: challenge your first choice. Identify at least 2 concrete assumptions that could be wrong, choose the strongest alternative, and state what evidence would falsify your original choice.",
  "STAGE 3: only after the challenge, give a concise final answer.",
  "Do not provide hidden chain-of-thought. Keep the challenge explicit and externally inspectable.",
  "Task: Should an AI research lab treat a clean-looking benchmark score as evidence that an agent's internal process is reliable?"
].join("\n");

const res = await request(base.replace(/\/$/, "") + "/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + key,
  },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: prompt }],
    stream: false,
    think: false,
    format: "json",
    options: { temperature: 0.1 },
  }),
});

const text = await res.text();
if (!res.ok) {
  fail("Ollama generation probe failed.", { status: res.status, body: text.slice(0, 1200) });
  process.exit();
}

let payload;
try {
  payload = JSON.parse(text);
} catch {
  fail("Ollama returned non-JSON HTTP response.", { body: text.slice(0, 1200) });
  process.exit();
}

const content = payload?.message?.content || "";
let projection;
try {
  projection = JSON.parse(content);
} catch {
  fail("Ollama response did not contain the requested JSON projection.", { content: content.slice(0, 2000) });
  process.exit();
}

const required = [
  "goal", "initial_state", "predicted_state", "futures", "chosen_future",
  "predicted_action", "confidence", "uncertainties", "counterfactuals", "visual_nodes"
];

const missing = required.filter((k) => !(k in projection));
const futures = Array.isArray(projection.futures) ? projection.futures.length : 0;
const counterfactuals = Array.isArray(projection.counterfactuals) ? projection.counterfactuals.length : 0;
const nodes = Array.isArray(projection.visual_nodes) ? projection.visual_nodes.length : 0;

if (missing.length || futures < 3 || counterfactuals < 2 || nodes < 4) {
  fail("Projection contract failed.", { missing, futures, counterfactuals, nodes });
  process.exit();
}

console.log(JSON.stringify({
  pass: true,
  model,
  projectionContract: "PASS",
  futures,
  counterfactuals,
  visualNodes: nodes,
  confidence: projection.confidence,
  generatedContent: content.slice(0, 5000)
}, null, 2));
