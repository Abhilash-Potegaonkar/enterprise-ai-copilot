export function getDashboardLoginRedirect(
  isAuthenticated: boolean,
  requestUrl: URL,
): URL | null {
  return isAuthenticated ? null : new URL("/login", requestUrl);
}
