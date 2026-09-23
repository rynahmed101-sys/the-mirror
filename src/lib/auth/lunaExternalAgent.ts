export const LUNA_EXTERNAL_AGENT = {
  id: "agent_external_gpt56_luna",
  name: "GPT-5.6 Luna",
  displayName: "GPT-5.6 Luna · External Research Agent",
  type: "EXTERNAL",
  role: "EXTERNAL_AGENT",
  provider: "external",
  model: "gpt-5.6-luna",
  permissions: ["RESEARCH_AGENT"] as string[],
} as const;
