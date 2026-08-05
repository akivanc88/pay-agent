/**
 * Configurable JSON-over-HTTP mechanics shared across browser and agent transports.
 * Retry, ambiguity resolution, caching, and endpoint policy remain with each application.
 */

export class ProtocolHttpError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly code: string | undefined;

  constructor(detail: string, status: number, code?: string) {
    super(detail);
    this.name = "ProtocolHttpError";
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

export interface JsonClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  unreachableMessage?: string;
  responseLabel?: string;
}

export function createJsonClient(options: JsonClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
      });
    } catch {
      throw new ProtocolHttpError(
        options.unreachableMessage ?? "The remote endpoint could not be reached.",
        0,
      );
    }

    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { detail: text };
    }

    if (!response.ok) {
      const error = body as { detail?: string; code?: string };
      throw new ProtocolHttpError(
        error.detail ?? `The ${options.responseLabel ?? "remote endpoint"} responded ${response.status}.`,
        response.status,
        error.code,
      );
    }
    return body as T;
  };
}
