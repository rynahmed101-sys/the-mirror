import { NextResponse } from "next/server";
import { runAutopilot } from "@/lib/agent/autopilot";
import { validateMirrorFrontierJob } from "@/lib/agent/frontierContract";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const expected = process.env.MIRROR_FRONTIER_JOB_TOKEN?.trim();
  return Boolean(expected) && req.headers.get("authorization") === "Bearer " + expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Mirror frontier front door is disabled or unauthorized." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const job = validateMirrorFrontierJob(body);

    if (job.permissions.remote_git_mutation || job.permissions.canonical_mutation) {
      return NextResponse.json({ error: "frontier permissions violate canonical mutation boundary" }, { status: 400 });
    }
    if (job.capability.base_revision === job.capability.id) {
      return NextResponse.json({ error: "invalid frontier revision" }, { status: 400 });
    }

    const objective = [
      "Act as Mirror's autonomous engineering worker for Automate.",
      "Capability: " + job.capability.name + " (" + job.capability.id + ").",
      "Exact Automate base revision: " + job.capability.base_revision + ".",
      "Task: " + job.capability.task,
      "Required action: " + String(job.mission.required_action || "implement") + ".",
      job.mission.repair_required ? "A repair is explicitly required; diagnose before changing behavior." : "",
      "Current backlog: " + job.mission.current_backlog.join(", "),
      "Ledger frontier: " + job.mission.ledger_frontier.join(", "),
      "Automate requests: " + job.mission.automate_requests.join(", "),
      "Research mature approaches and failure modes before implementing when useful.",
      "Use implement_automate_change to create the smallest useful unified diff. The tool will apply and test it in an isolated sandbox.",
      "Iterate on the patch only when evidence justifies the change.",
      "Return evidence, unresolved issues, and the proposed change. Never claim certification or canonical promotion.",
    ].filter(Boolean).join("\n");

    const run = await runAutopilot({
      agentId: "mirror-primary",
      objective,
      maxCycles: 1,
      maxToolSteps: job.limits.max_tool_steps,
      requestSource: "SYSTEM",
      mode: "FRONTIER",
      frontierContext: {
        repository: "rynahmed101-sys/automate",
        baseRevision: job.capability.base_revision,
        capabilityId: job.capability.id,
        task: job.capability.task,
      },
    });

    const traces = run.results.flatMap((cycle: any) => Array.isArray(cycle.trace) ? cycle.trace : []);
    const patchCalls = traces.filter((entry: any) => entry.tool === "implement_automate_change");
    const lastPatch = patchCalls.length ? patchCalls[patchCalls.length - 1].result : null;
    const probe = lastPatch?.probe;
    const diff = typeof probe?.proposal?.diff?.stdout === "string" ? probe.proposal.diff.stdout : "";
    const tests = Array.isArray(probe?.tests) ? probe.tests : [];

    const status = probe?.status === "PATCH_VALIDATED"
      ? "PROPOSED"
      : probe?.status === "PATCH_TEST_FAILED"
        ? "TEST_FAILED"
        : probe?.status === "PATCH_REJECTED"
          ? "PATCH_REJECTED"
          : "NO_CHANGE_PROPOSED";

    return NextResponse.json({
      schema_version: "mirror.frontier_result.v1",
      authority: "UNTRUSTED_MIRROR_PROPOSAL",
      request_id: job.request_id,
      action_cycle_id: job.action_cycle_id,
      correlation_id: job.provenance.correlation_id,
      capability_id: job.capability.id,
      base_revision: job.capability.base_revision,
      status,
      proposal: {
        summary: run.output.slice(0, 8000),
        diff: { stdout: diff },
        tests,
        tool_trace_count: traces.length,
        changed_files: Number(probe?.proposal?.changed_files || 0),
      },
      provenance: {
        source_repo: "rynahmed101-sys/the-mirror",
        source_component: "frontier-engine",
        parent_ids: job.provenance.parent_ids,
      },
      unresolved: patchCalls.length
        ? []
        : ["Mirror frontier run did not produce an implementation patch within the tool-step bound."],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({
      schema_version: "mirror.frontier_result.v1",
      authority: "UNTRUSTED_MIRROR_PROPOSAL",
      status: "FRONTIER_FAILED",
      error: error?.message || String(error),
    }, { status: 400 });
  }
}
