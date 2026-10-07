import type { ResearchProposalType } from "./researchProposalContract";

export interface LearningHandoff {
  schema_version: "automate.learning_handoff.v1";
  authority: "UNTRUSTED_LEARNING_EVIDENCE";
  request_id: string;
  correlation_id: string;
  source_revision: string | null;
  artifact_type: "research_proposal";
  artifact: ResearchProposalType;
  provenance: {
    source_repo: string;
    source_component: string;
  };
}

export function buildProposalLearningHandoff(
  proposal: ResearchProposalType,
  correlationId: string,
  sourceComponent = "mirror.discovery",
): LearningHandoff {
  return {
    schema_version: "automate.learning_handoff.v1",
    authority: "UNTRUSTED_LEARNING_EVIDENCE",
    request_id: "learning_" + proposal.proposal_id.slice("proposal_".length),
    correlation_id: correlationId,
    source_revision: proposal.source_revision,
    artifact_type: "research_proposal",
    artifact: proposal,
    provenance: {
      source_repo: "rynahmed101-sys/the-mirror",
      source_component: sourceComponent,
    },
  };
}

export async function submitProposalLearningHandoff(
  proposal: ResearchProposalType,
  correlationId: string,
): Promise<unknown> {
  if (process.env.MIRROR_DISCOVERY_HANDOFF_ENABLED !== "1") {
    throw new Error("Mirror discovery handoff is disabled");
  }
  const endpoint = String(process.env.MIRROR_LEARNING_HANDOFF_ENDPOINT || "").trim().replace(/\/$/, "");
  const token = String(process.env.MIRROR_LEARNING_HANDOFF_TOKEN || "").trim();
  if (!endpoint || !token) {
    throw new Error("Mirror learning handoff endpoint/token are required");
  }
  const response = await fetch(endpoint + "/learning", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(buildProposalLearningHandoff(proposal, correlationId)),
  });
  if (!response.ok) {
    throw new Error("Chanfana learning handoff rejected with HTTP " + response.status);
  }
  return response.json();
}
