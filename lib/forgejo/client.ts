import { getEnv } from "@/lib/env";
import { childLogger } from "@/lib/logger";

export class ForgejoApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly path: string;

  constructor(status: number, body: string, path: string) {
    super(`Forgejo request failed (${status}) for ${path}`);
    this.name = "ForgejoApiError";
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

export interface ForgejoClientOptions {
  baseUrl: string;
  token: string;
  /**
   * HTTP Basic credentials for the isolated token broker only. Forgejo requires
   * Basic auth (not a bearer token) to mint personal access tokens, and Sudo is
   * honoured for admin accounts. Never construct this from the owner's login.
   */
  basicAuth?: { username: string; password: string };
  /** Sudo header lets the server act as a user for PAT issuance only. */
  sudo?: string;
  timeoutMs?: number;
}

type QueryValue = string | number | boolean | undefined | null;

const log = childLogger({ module: "forgejo-client" });

export function encodePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

/**
 * The one thin client module. Nothing else in the app performs fetch() against
 * Forgejo. The access token never leaves the server and is never logged.
 */
export class ForgejoClient {
  private readonly baseUrl: string;
  private readonly authorization: string | null;
  private readonly sudo: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: ForgejoClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.authorization = options.basicAuth
      ? `Basic ${Buffer.from(`${options.basicAuth.username}:${options.basicAuth.password}`).toString("base64")}`
      : options.token
        ? `Bearer ${options.token}`
        : null;
    this.sudo = options.sudo;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  static fromEnv(token: string, sudo?: string): ForgejoClient {
    const env = getEnv();
    return new ForgejoClient({ baseUrl: env.FORGEJO_INTERNAL_URL, token, sudo });
  }

  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    headers.set("accept", "application/json");
    headers.set("user-agent", "keep/0.1 (+self-hosted)");
    if (this.authorization) headers.set("authorization", this.authorization);
    if (this.sudo) headers.set("sudo", this.sudo);
    return headers;
  }

  private url(path: string, query?: Record<string, QueryValue>): string {
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}/api/v1${suffix}${buildQuery(query)}`;
  }

  async rawRequest(
    path: string,
    init: RequestInit & { query?: Record<string, QueryValue>; sudo?: string } = {},
  ): Promise<Response> {
    const { query, sudo, ...rest } = init;
    const headers = this.headers(rest.headers);
    if (sudo) headers.set("sudo", sudo);
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(this.url(path, query), {
        ...rest,
        headers,
        signal: rest.signal ?? AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      log.error({ path, err: (error as Error).message }, "forgejo request failed");
      throw new ForgejoApiError(0, "network_error", path);
    }

    log.debug({ path, status: response.status, ms: Date.now() - started }, "forgejo request");
    return response;
  }

  private async ensureOk(response: Response, path: string): Promise<void> {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    // The body is Forgejo's validation message; useful when a write is rejected.
    // Debug level only: it can echo client-supplied values.
    log.debug({ path, status: response.status, body: body.slice(0, 500) }, "forgejo rejected request");
    throw new ForgejoApiError(response.status, body.slice(0, 2000), path);
  }

  async json<T>(
    path: string,
    init: RequestInit & { query?: Record<string, QueryValue>; sudo?: string } = {},
  ): Promise<{ data: T; headers: Headers }> {
    const response = await this.rawRequest(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers as Record<string, string>) },
    });
    await this.ensureOk(response, path);
    const data = (await response.json()) as T;
    return { data, headers: response.headers };
  }

  async send<T>(
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    options: { query?: Record<string, QueryValue>; sudoHeader?: string } = {},
  ): Promise<{ data: T; headers: Headers }> {
    const init: RequestInit = { method, headers: {} };
    if (body !== undefined) {
      // Forgejo rejects JSON bodies without this header (422 Unsupported Content-Type).
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const response = await this.rawRequest(path, {
      ...init,
      query: options.query,
      sudo: options.sudoHeader,
    });
    await this.ensureOk(response, path);
    const text = await response.text();
    const data = (text ? JSON.parse(text) : null) as T;
    return { data, headers: response.headers };
  }

  async text(
    path: string,
    init: RequestInit & { query?: Record<string, QueryValue>; sudo?: string } = {},
  ): Promise<string> {
    const response = await this.rawRequest(path, {
      ...init,
      headers: { accept: "text/plain", ...(init.headers as Record<string, string>) },
    });
    await this.ensureOk(response, path);
    return response.text();
  }

  async empty(
    method: "DELETE" | "POST",
    path: string,
    body?: unknown,
    options: { sudoHeader?: string } = {},
  ): Promise<void> {
    const init: RequestInit = { method, headers: {} };
    if (body !== undefined) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    if (options.sudoHeader) init.headers = { ...init.headers, sudo: options.sudoHeader };
    const response = await this.rawRequest(path, init);
    await this.ensureOk(response, path);
  }
}
