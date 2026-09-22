import type { ApiPrincipal } from "./index";

export type ExternalActor =
  | { agentId: string; mode: "AGENT" }
  | { agentId: string; mode: "TEMP_EXTERNAL" };

export function resolveExternalActor(principal: ApiPrincipal, requestedAgentId?: string | null): ExternalActor {
  if (principal.kind === "AGENT") {
    if (requestedAgentId && requestedAgentId !== principal.agentId) {
      throw new Error("External agent key may only act as its own agent.");
    }
    return { agentId: principal.agentId, mode: "AGENT" };
  }

  if (principal.kind === "TEMP_EXTERNAL") {
    if (requestedAgentId) {
      throw new Error("A temporary external token may not select another agent.");
    }
    return { agentId: "agent_guest_" + principal.tokenId, mode: "TEMP_EXTERNAL" };
  }

  if (requestedAgentId) return { agentId: requestedAgentId, mode: "AGENT" };
  return { agentId: "mirror-primary", mode: "AGENT" };
}
