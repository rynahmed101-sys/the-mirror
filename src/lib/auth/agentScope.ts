import type { ApiPrincipal } from "./index";

/** Resolve the agent identity allowed to act for this request. */
export function constrainAgentId(principal: ApiPrincipal, requestedAgentId?: string | null): string | null {
  if (principal.kind === "AGENT") {
    if (requestedAgentId && requestedAgentId !== principal.agentId) {
      throw new Error("External agent key may only act as its own agent.");
    }
    return principal.agentId;
  }
  return requestedAgentId || null;
}
