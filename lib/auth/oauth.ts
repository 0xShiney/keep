import { cookies } from "next/headers";
import { decryptSecret, encryptSecret, pkceChallenge, randomToken } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { AppError, upstreamError } from "@/lib/errors";
import { childLogger } from "@/lib/logger";

/**
 * Forgejo is the identity provider. Endpoints verified against
 * https://forgejo.org/docs/latest/user/oauth2-provider/ (see docs/DECISIONS.md):
 *   authorize  /login/oauth/authorize
 *   token      /login/oauth/access_token
 *   userinfo   /login/oauth/userinfo
 *   discovery  /.well-known/openid-configuration
 * PKCE S256 is supported by public clients.
 */

const log = childLogger({ module: "oauth" });
const STATE_COOKIE = "keep_oauth";
const STATE_TTL_SECONDS = 600;

export interface OAuthState {
  state: string;
  verifier: string;
  next: string;
  createdAt: number;
}

function stateCookieName(): string {
  return getEnv().APP_ORIGIN.startsWith("https://") ? `__Host-${STATE_COOKIE}` : STATE_COOKIE;
}

export function redirectUri(): string {
  return `${getEnv().APP_ORIGIN.replace(/\/+$/, "")}/api/auth/callback`;
}

/** Only same-site absolute paths may be used as a post-login destination. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\") || value.includes("\u0000")) return "/";
  return value;
}

export function buildAuthorizeUrl(state: OAuthState): string {
  const env = getEnv();
  const url = new URL("/login/oauth/authorize", env.FORGEJO_PUBLIC_URL);
  url.searchParams.set("client_id", env.FORGEJO_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state.state);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("code_challenge", pkceChallenge(state.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function beginOAuth(next: string): Promise<{ url: string }> {
  const state: OAuthState = {
    state: randomToken(24),
    verifier: randomToken(48),
    next: safeNextPath(next),
    createdAt: Date.now(),
  };

  const jar = await cookies();
  const secure = getEnv().APP_ORIGIN.startsWith("https://");
  jar.set(stateCookieName(), encryptSecret(JSON.stringify(state)), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  return { url: buildAuthorizeUrl(state) };
}

export async function consumeOAuthState(returnedState: string): Promise<OAuthState> {
  const jar = await cookies();
  const raw = jar.get(stateCookieName())?.value;
  jar.delete(stateCookieName());

  if (!raw) throw new AppError(400, "Invalid sign-in", "The sign-in attempt expired. Try again.");

  let parsed: OAuthState;
  try {
    parsed = JSON.parse(decryptSecret(raw)) as OAuthState;
  } catch {
    throw new AppError(400, "Invalid sign-in", "The sign-in state could not be verified.");
  }

  if (Date.now() - parsed.createdAt > STATE_TTL_SECONDS * 1000) {
    throw new AppError(400, "Invalid sign-in", "The sign-in attempt expired. Try again.");
  }
  if (!returnedState || returnedState !== parsed.state) {
    throw new AppError(400, "Invalid sign-in", "The sign-in state did not match.");
  }

  return parsed;
}

interface TokenEndpointResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenEndpointResponse> {
  const env = getEnv();
  const url = new URL("/login/oauth/access_token", env.FORGEJO_INTERNAL_URL);

  const payload = new URLSearchParams(body);
  if (env.FORGEJO_CLIENT_SECRET) payload.set("client_secret", env.FORGEJO_CLIENT_SECRET);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: payload,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    log.error({ err: (error as Error).message }, "token endpoint unreachable");
    throw upstreamError("Could not reach the identity provider");
  }

  const text = await response.text();
  let parsed: TokenEndpointResponse;
  try {
    parsed = JSON.parse(text) as TokenEndpointResponse;
  } catch {
    throw upstreamError("Identity provider returned a non-JSON token response");
  }

  if (!response.ok || parsed.error) {
    log.warn(
      { status: response.status, error: parsed.error ?? "unknown" },
      "token endpoint rejected request",
    );
    throw new AppError(401, "Sign-in failed", "The identity provider rejected the sign-in.");
  }

  return parsed;
}

export async function exchangeCodeForTokens(
  code: string,
  verifier: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresInSeconds: number }> {
  const env = getEnv();
  const response = await tokenRequest({
    client_id: env.FORGEJO_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });

  if (!response.access_token) {
    throw new AppError(401, "Sign-in failed", "The identity provider returned no access token.");
  }

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresInSeconds: response.expires_in && response.expires_in > 0 ? response.expires_in : 3600,
  };
}

export async function refreshTokenGrant(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresInSeconds: number }> {
  const env = getEnv();
  const response = await tokenRequest({
    client_id: env.FORGEJO_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  if (!response.access_token) {
    throw new AppError(401, "Session expired", "The identity provider rejected the refresh token.");
  }

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresInSeconds: response.expires_in && response.expires_in > 0 ? response.expires_in : 3600,
  };
}
