import { Sandbox } from "@vercel/sandbox";

const MAX_SOURCE = 30_000;

export async function runScienceSandbox(source: string) {
  const code = String(source || "").trim();
  if (!code) throw new Error("Sandbox source is required.");
  if (code.length > MAX_SOURCE) throw new Error(\`Sandbox source is limited to \${MAX_SOURCE} characters.\`);

  const started = Date.now();
  const sandbox = await Sandbox.create({
    persistent: false,
    timeout: 30_000,
    region: "iad1",
    networkPolicy: "deny-all",
  });

  try {
    await sandbox.writeFiles([{ path: "/vercel/sandbox/science-lab.mjs", content: Buffer.from(code, "utf8") }]);
    const command = await sandbox.runCommand({ cmd: "node", args: ["/vercel/sandbox/science-lab.mjs"] });
    return {
      ok: command.exitCode === 0,
      exitCode: command.exitCode,
      stdout: (await command.stdout()).slice(0, 12000),
      stderr: (await command.stderr()).slice(0, 8000),
      durationMs: Date.now() - started,
      sandboxName: sandbox.name,
      network: "deny-all",
      persistent: false,
    };
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}
