/**
 * THE MIRROR — Isolated execution chamber.
 *
 * Generated or untrusted code never runs inside the primary application process.
 * Vercel Sandbox provides an ephemeral Firecracker microVM for the probe.
 */

import { Sandbox } from "@vercel/sandbox";

const DEFAULT_PROBE = [
  "const result = {",
  "  mirror: 'sandbox-ok',",
  "  isolated: true,",
  "  value: 2 + 2,",
  "};",
  "console.log(JSON.stringify(result));",
].join("\n");

export async function runSandboxProbe(code = DEFAULT_PROBE) {
  const source = String(code || DEFAULT_PROBE);
  if (source.length > 20000) throw new Error("Sandbox probe is limited to 20,000 characters.");

  const started = Date.now();
  let sandbox: Sandbox | null = null;

  try {
    sandbox = await Sandbox.create({
      persistent: false,
      timeout: 30_000,
      region: "iad1",
    });
    await sandbox.writeFiles([
      {
        path: "/vercel/sandbox/mirror-probe.mjs",
        content: Buffer.from(source, "utf8"),
      },
    ]);
    const command = await sandbox.runCommand({
      cmd: "node",
      args: ["/vercel/sandbox/mirror-probe.mjs"],
    });
    const stdout = await command.stdout();
    const stderr = await command.stderr();

    return {
      ok: command.exitCode === 0,
      exitCode: command.exitCode,
      stdout: stdout.slice(0, 10000),
      stderr: stderr.slice(0, 5000),
      durationMs: Date.now() - started,
      sandboxName: sandbox.name,
    };
  } finally {
    if (sandbox) {
      try { await sandbox.stop(); } catch {}
    }
  }
}
