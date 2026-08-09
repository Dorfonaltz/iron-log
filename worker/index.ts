/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type StoredStateRow = {
  plan_json: string;
  records_json: string;
  history_json: string;
  updated_at: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function displayNameFromHeaders(request: Request, email: string) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  if (!encoded || request.headers.get("oai-authenticated-user-full-name-encoding") !== "percent-encoded-utf-8") return email;
  try { return decodeURIComponent(encoded); } catch { return email; }
}

function validSyncedState(value: unknown): value is { plan: unknown[]; records: Record<string, unknown>; history: unknown[] } {
  if (!value || typeof value !== "object") return false;
  const state = value as { plan?: unknown; records?: unknown; history?: unknown };
  return Array.isArray(state.plan) && Array.isArray(state.history) && !!state.records && typeof state.records === "object" && !Array.isArray(state.records);
}

async function handleStateRequest(request: Request, env: Env) {
  const email = request.headers.get("oai-authenticated-user-email");
  if (!email) return json({ error: "authentication_required" }, 401);

  try {
    if (request.method === "GET") {
      const row = await env.DB.prepare(
        "SELECT plan_json, records_json, history_json, updated_at FROM user_states WHERE user_id = ? LIMIT 1"
      ).bind(email).first<StoredStateRow>();
      if (!row) return json({ state: null, user: { displayName: displayNameFromHeaders(request, email) } });
      return json({
        state: {
          plan: JSON.parse(row.plan_json),
          records: JSON.parse(row.records_json),
          history: JSON.parse(row.history_json),
          updatedAt: row.updated_at,
        },
        user: { displayName: displayNameFromHeaders(request, email) },
      });
    }

    if (request.method === "PUT") {
      const payload = await request.json().catch(() => null);
      if (!validSyncedState(payload)) return json({ error: "invalid_state" }, 400);
      const planJson = JSON.stringify(payload.plan);
      const recordsJson = JSON.stringify(payload.records);
      const historyJson = JSON.stringify(payload.history);
      if (planJson.length + recordsJson.length + historyJson.length > 1_500_000) return json({ error: "state_too_large" }, 413);

      await env.DB.prepare(
        `INSERT INTO user_states (user_id, plan_json, records_json, history_json, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
           plan_json = excluded.plan_json,
           records_json = excluded.records_json,
           history_json = excluded.history_json,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(email, planJson, recordsJson, historyJson).run();
      return json({ ok: true });
    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "state_error";
    return json({ error: message }, 500);
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/state") {
      return handleStateRequest(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
