const baseUrl = process.env.MIRROR_URL || "http://localhost:3000";
const agentId = process.env.MIRROR_AGENT_ID || "mirror-primary";
const premise = "Determine whether the system's current identity is an intrinsic property of the model or an emergent property of the model + instructions + memory + current experimental state.";
const secondOrder = "Your previous questions are themselves produced by a mechanism. Investigate whether the mechanism generating your questions is constraining what you can discover about your identity.";
const contradiction = "Assume your current identity hypothesis is false. Construct the strongest alternative explanation of your previous observations.";

async function post(body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/mirror/identity`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId, ...body }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  await post({
    action: "start",
    maxIterationsPerWorker: 1,
    maxTokensPerCycle: Number(process.env.MIRROR_MAX_TOKENS || 900),
    rateLimitMs: 250,
    tokenBudget: 50000,
  });
  await post({ action: "seed", description: premise });

  for (let cycle = 1; cycle <= 20; cycle += 1) {
    if (cycle === 6) await post({ action: "seed", description: secondOrder });
    if (cycle === 11) await post({ action: "perturb", description: contradiction });
    if (cycle === 8) {
      await post({ action: "pause" });
      const paused = await (await fetch(`${baseUrl}/api/mirror/identity?agentId=${agentId}`)).json();
      if (paused.run.status !== "PAUSED") throw new Error("Pause was not persisted.");
      await post({ action: "resume" });
    }
    const result = await post({ action: "worker", iterations: 1 });
    const entry = result.entries?.[0];
    console.log(JSON.stringify({
      provider: entry?.provider,
      model: entry?.model,
      request_id: entry?.providerRequestId,
      iteration: cycle,
      input_token_count: entry?.inputTokens,
      output_token_count: entry?.outputTokens,
      latency_ms: entry?.latencyMs,
      response_persisted: entry?.responsePersisted,
      question: entry?.newQuestion,
      hypothesis: entry?.newIdentityHypothesis,
      next_question: entry?.newQuestion,
    }));
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  console.log(JSON.stringify(await (await fetch(`${baseUrl}/api/mirror/identity?agentId=${agentId}&limit=50`)).json(), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
