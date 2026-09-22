export function buildJsonAuthHeaders(controlToken?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = controlToken?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
