/**
 * Typed application errors. Any thrown AppError becomes an RFC 9457 problem
 * response with the current request id; anything else becomes a generic 500 so
 * internal details never reach the client.
 */
export class AppError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly type: string;
  readonly errors?: Record<string, string[]>;

  constructor(
    status: number,
    title: string,
    detail?: string,
    type = "about:blank",
    errors?: Record<string, string[]>,
  ) {
    super(detail ?? title);
    this.name = "AppError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.type = type;
    this.errors = errors;
  }
}

export const badRequest = (detail: string) => new AppError(400, "Bad request", detail);
export const unauthorized = (detail = "Authentication required") =>
  new AppError(401, "Unauthorized", detail);
export const forbidden = (detail = "You do not have access to this resource") =>
  new AppError(403, "Forbidden", detail);
export const notFound = (detail = "Resource not found") => new AppError(404, "Not found", detail);
export const conflict = (detail: string) => new AppError(409, "Conflict", detail);
export const tooManyRequests = (detail: string) => new AppError(429, "Too many requests", detail);
export const upstreamError = (detail = "The Git engine request failed") =>
  new AppError(502, "Upstream error", detail);
