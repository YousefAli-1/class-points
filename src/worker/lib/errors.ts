import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode } from "@shared/types.ts";

/** An error the API reports as `{ error: { code, message } }` with `status` (see app.ts onError). */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;
  readonly retryAfterMs?: number;

  constructor(status: ContentfulStatusCode, code: ErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export const badRequest = (msg: string) => new AppError(400, "BAD_REQUEST", msg);

export const notFound = (what = "That item") => new AppError(404, "NOT_FOUND", `${what} wasn't found.`);

export const conflict = (msg: string) => new AppError(409, "CONFLICT", msg);

/** No valid session, or (with a message) a wrong setup code, password or PIN. */
export const unauthorized = (msg = "Please log in.") => new AppError(401, "UNAUTHORIZED", msg);

export const adminLocked = () => new AppError(403, "ADMIN_LOCKED", "Enter your PIN to open admin.");

export const rateLimited = (retryAfterMs: number) =>
  new AppError(429, "RATE_LIMITED", "Too many tries. Please wait a little and try again.", retryAfterMs);

export const setupDisabled = () =>
  new AppError(503, "SETUP_DISABLED", "Setup is turned off because no setup code is configured on the server.");
