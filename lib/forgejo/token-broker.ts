import { ForgejoClient } from "./client";
import { getEnv } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import { mapAccessToken, type ApiAccessToken } from "./mappers";
import type { AccessTokenInfo, CreatedAccessToken } from "./model";

const log = childLogger({ module: "token-broker" });

/**
 * Isolated personal-access-token broker.
 *
 * Forgejo 15.0.12 refuses token-authenticated token issuance:
 * `POST /users/{login}/tokens` with an admin token + Sudo returns
 * `401 auth method not allowed` (verified against the pinned release). The
 * endpoint requires HTTP Basic authentication as an admin account.
 *
 * Keep therefore never holds the owner's password. Instead the operator creates
 * ONE dedicated admin account (`FORGEJO_BROKER_USER`) whose password is random,
 * rotatable and readable only by this module. Every token operation goes through
 * Sudo for the acting user, and the broker refuses to run when it is configured
 * with the owner's or the acting user's own login.
 *
 * Blast radius (documented in docs/SECURITY.md and DECISIONS.md D-017): the
 * broker account is a Forgejo admin, so a leak could mint tokens for any user.
 * It cannot be scope-limited because Forgejo has no scoped admin credential for
 * this endpoint. Mitigations: dedicated account, random password, server-only
 * env, single code path, audit trail, and rotation runbook.
 */

export class TokenBrokerUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "TokenBrokerUnavailableError";
    this.reason = reason;
  }
}

/**
 * Scopes a caller may request. `all` is intentionally absent: a token created
 * from Keep must never silently gain admin scope, and the UI only offers
 * repository/user/issue scopes. Requests for anything else are rejected by the
 * schema before reaching Forgejo.
 */
export const TOKEN_SCOPES = [
  "read:repository",
  "write:repository",
  "read:user",
  "write:user",
  "read:issue",
  "write:issue",
  "read:organization",
  "write:organization",
  "read:notification",
  "write:notification",
] as const;

export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** Least privilege: a new token can read repositories unless told otherwise. */
export const DEFAULT_TOKEN_SCOPES: TokenScope[] = ["read:repository"];

interface BrokerConfig {
  username: string;
  password: string;
  baseUrl: string;
  ownerLogin: string;
}

export interface BrokerStatus {
  configured: boolean;
  reason: string | null;
}

/**
 * Pure configuration check so it can be unit tested and reused by the settings
 * page without constructing a client or throwing during render.
 */
export function brokerStatus(input?: {
  brokerUser: string;
  brokerPassword: string;
  ownerLogin: string;
}): BrokerStatus {
  const env = getEnv();
  const brokerUser = (input?.brokerUser ?? env.FORGEJO_BROKER_USER).trim();
  const brokerPassword = input?.brokerPassword ?? env.FORGEJO_BROKER_PASSWORD;
  const ownerLogin = (input?.ownerLogin ?? env.KEEP_OWNER_LOGIN).trim();

  if (!brokerUser && !brokerPassword) {
    return {
      configured: false,
      reason:
        "Token management is disabled: set FORGEJO_BROKER_USER and FORGEJO_BROKER_PASSWORD to a dedicated admin service account.",
    };
  }
  if (!brokerUser || !brokerPassword) {
    return {
      configured: false,
      reason: "Token management is misconfigured: both FORGEJO_BROKER_USER and FORGEJO_BROKER_PASSWORD are required.",
    };
  }
  if (brokerPassword.length < 16) {
    return {
      configured: false,
      reason: "Token management is misconfigured: FORGEJO_BROKER_PASSWORD must be at least 16 characters.",
    };
  }
  if (ownerLogin && brokerUser.toLowerCase() === ownerLogin.toLowerCase()) {
    return {
      configured: false,
      reason:
        "Token management is disabled: the broker account must be a separate service account, never the owner's login (Keep must not hold the owner's password).",
    };
  }
  return { configured: true, reason: null };
}

export function tokenManagementConfigured(): boolean {
  return brokerStatus().configured;
}

class TokenBroker {
  constructor(private readonly config: BrokerConfig) {}

  private client(): ForgejoClient {
    return new ForgejoClient({
      baseUrl: this.config.baseUrl,
      token: "",
      basicAuth: { username: this.config.username, password: this.config.password },
    });
  }

  /** Sudo is only honoured for admin accounts; the broker is one by design. */
  private assertTarget(login: string): void {
    if (!login) throw new TokenBrokerUnavailableError("No acting user for token operation");
    if (login.toLowerCase() === this.config.username.toLowerCase()) {
      throw new TokenBrokerUnavailableError(
        "Refusing to issue tokens for the broker service account itself",
      );
    }
  }

  async list(login: string): Promise<AccessTokenInfo[]> {
    this.assertTarget(login);
    const { data } = await this.client().json<ApiAccessToken[]>(
      `/users/${encodeURIComponent(login)}/tokens`,
      { sudo: login },
    );
    return data.map(mapAccessToken);
  }

  async create(login: string, name: string, scopes: string[]): Promise<CreatedAccessToken> {
    this.assertTarget(login);
    const { data } = await this.client().send<ApiAccessToken>(
      "POST",
      `/users/${encodeURIComponent(login)}/tokens`,
      { name, scopes },
      { sudoHeader: login },
    );
    if (!data.sha1) {
      // Never hand back an empty secret as if it were usable.
      throw new TokenBrokerUnavailableError("Forgejo returned no token value");
    }
    log.info({ login, name, scopes }, "issued personal access token");
    return { id: data.id ?? 0, name: data.name ?? name, token: data.sha1, scopes };
  }

  async revoke(login: string, name: string): Promise<void> {
    this.assertTarget(login);
    await this.client().empty(
      "DELETE",
      `/users/${encodeURIComponent(login)}/tokens/${encodeURIComponent(name)}`,
      undefined,
      { sudoHeader: login },
    );
    log.info({ login, name }, "revoked personal access token");
  }
}

export function getTokenBroker(): TokenBroker {
  const env = getEnv();
  const status = brokerStatus();
  if (!status.configured) throw new TokenBrokerUnavailableError(status.reason ?? "not configured");
  return new TokenBroker({
    username: env.FORGEJO_BROKER_USER.trim(),
    password: env.FORGEJO_BROKER_PASSWORD,
    baseUrl: env.FORGEJO_INTERNAL_URL,
    ownerLogin: env.KEEP_OWNER_LOGIN,
  });
}
