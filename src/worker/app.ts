import { Hono, type MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import type { ApiErrorBody } from "@shared/types.ts";
import { getDb } from "./db/client.ts";
import { AppError } from "./lib/errors.ts";
import { type AppEnv, loadSession } from "./lib/session.ts";
import { authRoutes } from "./routes/auth.ts";

const db: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("db", getDb(c.env));
  await next();
};

/** API responses are JSON only: nothing in them may run, be framed or be cached. */
const apiSecureHeaders = secureHeaders({
  contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  xFrameOptions: "DENY",
  referrerPolicy: "same-origin",
  xContentTypeOptions: "nosniff",
});

const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await apiSecureHeaders(c, next);
  c.header("Cache-Control", "no-store");
};

const SAFE_METHODS = new Set(["GET", "HEAD"]);

/** Spec §5: changes must be JSON (a form can't send that cross-site) and come from our own origin. */
const csrf: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin !== undefined && origin !== new URL(c.req.url).origin) {
      throw new AppError(403, "BAD_REQUEST", "This request came from another site.");
    }
    const type = c.req.header("content-type") ?? "";
    if (!/^application\/json\s*(;|$)/i.test(type)) {
      throw new AppError(415, "BAD_REQUEST", "Send the request as JSON.");
    }
  }
  await next();
};

export const app = new Hono<AppEnv>().basePath("/api");

app.use(db, securityHeaders, csrf, loadSession);

app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", authRoutes);

// Data routes are mounted below this marker, each wrapped in requireAuth.
// ROUTES

app.notFound((c) => c.json<ApiErrorBody>({ error: { code: "NOT_FOUND", message: "There's nothing here." } }, 404));

app.onError((err, c) => {
  if (err instanceof AppError) {
    const { code, message, retryAfterMs } = err;
    const body: ApiErrorBody = { error: { code, message } };
    if (retryAfterMs !== undefined) {
      body.error.retryAfterMs = retryAfterMs;
      c.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    }
    return c.json(body, err.status);
  }
  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? "Please check the details and try again.";
    return c.json<ApiErrorBody>({ error: { code: "BAD_REQUEST", message } }, 400);
  }
  console.error(err);
  return c.json<ApiErrorBody>({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, 500);
});
