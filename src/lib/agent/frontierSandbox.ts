/** Isolated Automate coding/verification chamber for Mirror frontier work.
 *
 * The sandbox receives an exact Automate revision and a model-produced unified diff.
 * It can fetch the public repository, apply the diff, run bounded tests, and return
 * the resulting diff. It never pushes, opens a PR, or changes canonical state.
 */
import { Sandbox } from "@vercel/sandbox";

const AUTOMATE_REPOSITORY = "https://github.com/rynahmed101-sys/automate.git";
const MAX_PATCH_BYTES = 1_500_000;
const MAX_TEST_COMMANDS = 4;

const ALLOWED_TEST = /^(python -m pytest(?:\s+.*)?|python -m automate\.cli(?:\s+.*)?|pytest(?:\s+.*)?)$/;

function checkedRevision(value: unknown): string {
  const revision = String(value || "");
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("baseRevision must be an exact 40-character lowercase Git SHA");
  }
  return revision;
}

function checkedPatch(value: unknown): string {
  const patch = String(value || "");
  if (!patch.trim()) throw new Error("patch is required");
  if (new TextEncoder().encode(patch).byteLength > MAX_PATCH_BYTES) {
    throw new Error("patch exceeds 1.5MB");
  }
  return patch;
}

export async function runAutomatePatchProbe(input: {
  baseRevision: string;
  patch: string;
  tests?: string[];
}) {
  const baseRevision = checkedRevision(input.baseRevision);
  const patch = checkedPatch(input.patch);
  const requestedTests = Array.isArray(input.tests) ? input.tests.map(String).filter(Boolean).slice(0, MAX_TEST_COMMANDS) : [];
  const invalid = requestedTests.filter((command) => !ALLOWED_TEST.test(command));
  if (invalid.length) {
    throw new Error("unsupported test command: " + invalid[0]);
  }

  const sandbox = await Sandbox.create({
    persistent: false,
    timeout: 240_000,
    region: "iad1",
  });

  const worktree = "/vercel/sandbox/automate";
  const patchPath = "/vercel/sandbox/frontier.patch";

  try {
    const commands: Array<[string,string[]]> = [
      ["git", ["init", worktree]],
      ["git", ["-C", worktree, "remote", "add", "origin", AUTOMATE_REPOSITORY]],
      ["git", ["-C", worktree, "fetch", "--depth", "1", "origin", baseRevision]],
      ["git", ["-C", worktree, "checkout", "--detach", baseRevision]],
    ];

    for (const [cmd, args] of commands) {
      const result = await sandbox.runCommand({ cmd, args });
      if (result.exitCode !== 0) {
        throw new Error(cmd + " failed: " + (await result.stderr()).slice(-4000));
      }
    }

    await sandbox.writeFiles([{
      path: patchPath,
      content: Buffer.from(patch, "utf8"),
    }]);

    const check = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", "git -C " + worktree + " apply --check --whitespace=error < " + patchPath],
    });
    if (check.exitCode !== 0) {
      return {
        status: "PATCH_REJECTED",
        base_revision: baseRevision,
        error: (await check.stderr()).slice(-6000),
      };
    }

    const apply = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", "git -C " + worktree + " apply --whitespace=error < " + patchPath],
    });
    if (apply.exitCode !== 0) {
      return {
        status: "PATCH_APPLY_FAILED",
        base_revision: baseRevision,
        error: (await apply.stderr()).slice(-6000),
      };
    }

    const testResults: Array<Record<string, unknown>> = [];
    if (requestedTests.length) {
      const install = await sandbox.runCommand({
        cmd: "bash",
        args: ["-lc", "cd " + worktree + " && python -m pip install -e '.[dev]'"],
      });
      if (install.exitCode !== 0) {
        return {
          status: "ENVIRONMENT_SETUP_FAILED",
          base_revision: baseRevision,
          error: (await install.stderr()).slice(-6000),
        };
      }
    }
    for (const command of requestedTests) {
      const test = await sandbox.runCommand({
        cmd: "bash",
        args: ["-lc", "cd " + worktree + " && " + command],
      });
      testResults.push({
        command,
        status: test.exitCode === 0 ? "passed" : "failed",
        exitCode: test.exitCode,
        stdout: (await test.stdout()).slice(-12000),
        stderr: (await test.stderr()).slice(-8000),
      });
      if (test.exitCode !== 0) break;
    }

    const diff = await sandbox.runCommand({
      cmd: "git",
      args: ["-C", worktree, "diff", "--binary", "--no-ext-diff"],
    });
    const diffStdout = (await diff.stdout()).slice(0, 1_900_000);
    const status = testResults.some((t) => t.status === "failed")
      ? "PATCH_TEST_FAILED"
      : "PATCH_VALIDATED";

    return {
      status,
      base_revision: baseRevision,
      tests: testResults,
      proposal: {
        diff: { stdout: diffStdout },
        changed_files: diffStdout ? diffStdout.split(/^diff --git /m).filter(Boolean).length : 0,
      },
      authority: "UNTRUSTED_MIRROR_PROPOSAL",
    };
  } finally {
    try { await sandbox.stop(); } catch {}
  }
}
