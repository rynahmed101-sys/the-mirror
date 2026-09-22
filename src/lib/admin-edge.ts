export function verifyEdgeAdminCredentials(username: string, credential: string): boolean {
  const expectedUsername = process.env.ADMIN_USERNAME || "admin";
  const expectedCredential = process.env.ADMIN_PASSWORD;
  return Boolean(
    expectedCredential &&
    username &&
    credential &&
    username === expectedUsername &&
    credential === expectedCredential
  );
}
