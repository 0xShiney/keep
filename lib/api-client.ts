export class ApiProblemError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly requestId?: string;
  readonly errors?: Record<string, string[]>;

  constructor(problem: {
    status: number;
    title: string;
    detail?: string;
    requestId?: string;
    errors?: Record<string, string[]>;
  }) {
    super(problem.detail ?? problem.title);
    this.name = "ApiProblemError";
    this.status = problem.status;
    this.title = problem.title;
    this.detail = problem.detail;
    this.requestId = problem.requestId;
    this.errors = problem.errors;
  }

  fieldError(field: string): string | undefined {
    return this.errors?.[field]?.[0];
  }
}

/** Browser-side fetch helper. Uses same-origin credentials and parses problem JSON. */
export async function apiRequest<T>(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: {
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("json") ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const problem = (payload ?? {}) as {
      title?: string;
      detail?: string;
      requestId?: string;
      errors?: Record<string, string[]>;
    };
    throw new ApiProblemError({
      status: response.status,
      title: problem.title ?? `Request failed (${response.status})`,
      detail: problem.detail,
      requestId: problem.requestId,
      errors: problem.errors,
    });
  }

  return payload as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiProblemError) {
    const requestSuffix = error.requestId ? ` (request ${error.requestId.slice(0, 8)})` : "";
    return `${error.detail ?? error.title}${requestSuffix}`;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
