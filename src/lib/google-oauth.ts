/**
 * Google OAuth2 helpers — fetch-based (no googleapis dependency).
 */

const SCOPES = ["https://www.googleapis.com/auth/drive"];

function getRedirectUri() {
  const baseUrl = process.env.VITE_BASE_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/auth/google/callback`;
}

export function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  }>;
}

/**
 * Ensure we have a valid access token, refreshing if expired.
 */
export async function getValidAccessToken(tokens: {
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | Date | null;
}): Promise<string> {
  const expiresAt = tokens.token_expires_at
    ? new Date(tokens.token_expires_at).getTime()
    : 0;

  // If token is still valid (with 60s margin), use it
  if (expiresAt > Date.now() + 60_000) {
    return tokens.access_token;
  }

  // Refresh the token
  if (!tokens.refresh_token) {
    throw new Error("Token expired and no refresh_token available");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}
