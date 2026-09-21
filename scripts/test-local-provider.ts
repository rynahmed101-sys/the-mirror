import { LocalProvider } from "../src/lib/ai/local";

const originalFetch = globalThis.fetch;
let requests: Array<{ url: string; body?: any }> = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ url, body });
  if (url.endsWith("/api/tags")) {
    return new Response(JSON.stringify({ models: [{ name: "test-local", size: 1, details: { family: "test" } }] }), { status: 200 });
  }
  return new Response(JSON.stringify({
    message: { content: "{\"new_question\":\"q\",\"current_answer\":\"a\"}" },
    model: "test-local",
    done_reason: "stop",
    prompt_eval_count: 11,
    eval_count: 7,
  }), { status: 200 });
}) as typeof fetch;

async function main() {
  try {
    const provider = new LocalProvider("http://local.test", "test-local");
    const models = await provider.listModels();
    const response = await provider.complete([{ role: "user", content: "return JSON" }], { temperature: 0.2, maxTokens: 32 });
    if (provider.name !== "local" || !provider.isLocal || models[0]?.id !== "test-local" || response.provider !== "local" ||
        response.inputTokens !== 11 || response.outputTokens !== 7 || response.latencyMs === undefined || requests.length !== 2 ||
        requests[1].body.model !== "test-local" || requests[1].body.stream !== false) {
      throw new Error("Local provider adapter telemetry or request contract failed.");
    }
    console.log(JSON.stringify({ provider: provider.name, model: response.model, isLocal: provider.isLocal, telemetry: true, structuredRequest: requests[1].body }, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
