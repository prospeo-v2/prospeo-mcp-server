#!/usr/bin/env node
/**
 * Prospeo MCP HTTP Server — remote entry point for mcp.prospeo.io
 *
 * Stateless Streamable HTTP transport: each POST creates a fresh MCP server
 * and transport, handles the request, and tears down. No sessions, no memory
 * overhead per connected user.
 *
 * Dual auth — both methods are first-class:
 *   1. Authorization: Bearer <jwt>  — OAuth 2.0 (for Claude directory listing)
 *   2. X-KEY: <api_key>            — direct API key (for programmatic access)
 *
 * Usage (client-side):
 *   claude mcp add prospeo --transport http https://mcp.prospeo.io/
 *   claude mcp add prospeo --transport http --header "X-KEY: <key>" https://mcp.prospeo.io/
 */

import { createServer as createHTTPServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { loadServerConfig } from "./config/index.js";
import { createMCPServer } from "./create-server.js";
import { validateBearerToken } from "./utils/jwt.js";
import { logger } from "./utils/logger.js";

const serverConfig = loadServerConfig();
const PORT = parseInt(process.env.PORT || "3000", 10);

/** Maximum request body size in bytes (1 MB). */
const MAX_BODY_SIZE = 1 * 1024 * 1024;

/**
 * Resource metadata URL returned in WWW-Authenticate header when auth is missing.
 * Tells MCP clients where to discover the OAuth authorization server.
 */
const RESOURCE_METADATA_URL = process.env.RESOURCE_METADATA_URL || "";
if (!RESOURCE_METADATA_URL) {
  logger.warn("RESOURCE_METADATA_URL not set — 401 responses will have an empty WWW-Authenticate hint");
}

/**
 * Parse ALLOWED_ORIGINS env var into a set for CORS validation.
 * Defaults to "*" (allow all) for open-source self-hosting.
 */
const ALLOWED_ORIGINS: Set<string> | "*" = (() => {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw || raw.trim() === "*") return "*";
  return new Set(raw.split(",").map((o) => o.trim()).filter(Boolean));
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the request body as JSON with a size limit to prevent memory exhaustion.
 * Rejects with an error if the body exceeds MAX_BODY_SIZE.
 */
function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("PAYLOAD_TOO_LARGE"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      try {
        resolve(raw ? JSON.parse(raw) : undefined);
      } catch (e) {
        reject(e);
      }
    });

    req.on("error", reject);
  });
}

/** Extract X-KEY header value, or null if missing/invalid. */
function extractApiKey(req: IncomingMessage): string | null {
  const key = req.headers["x-key"];
  if (!key || typeof key !== "string") return null;
  return key.trim() || null;
}

/** Extract Bearer token from Authorization header, or null if missing. */
function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers["authorization"];
  if (!auth || typeof auth !== "string") return null;
  const match = auth.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * Resolve the user's API key from a Bearer JWT by calling the backend.
 * The backend validates the JWT and returns the dedicated MCP API key.
 */
const RESOLVE_API_KEY_URL = process.env.RESOLVE_API_KEY_URL || "";
if (!RESOLVE_API_KEY_URL) {
  logger.warn("RESOLVE_API_KEY_URL not set — Bearer JWT auth will not work");
}

async function resolveApiKeyFromBearer(token: string): Promise<string | null> {
  try {
    await validateBearerToken(token); // verify signature + expiry locally first
  } catch (err) {
    logger.warn("Bearer token validation failed", { error: String(err) });
    return null;
  }

  try {
    const response = await fetch(RESOLVE_API_KEY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      logger.warn("Backend resolve-api-key failed", { status: response.status });
      return null;
    }

    const data = (await response.json()) as { response?: { api_key?: string }; api_key?: string };
    const apiKey = data?.response?.api_key ?? data?.api_key;
    if (!apiKey || typeof apiKey !== "string") {
      logger.warn("Backend resolve-api-key returned no api_key");
      return null;
    }

    logger.info("Auth resolved via Bearer JWT + backend");
    return apiKey;
  } catch (err) {
    logger.error("Failed to call resolve-api-key endpoint", { error: String(err) });
    return null;
  }
}

/**
 * Resolve the user's API key from the request using dual auth.
 * Checks in order: Bearer JWT (via backend) → X-KEY header.
 * Returns the API key string or null if no valid auth is present.
 */
async function resolveApiKey(req: IncomingMessage): Promise<string | null> {
  // 1. Check Bearer JWT — resolve API key via backend
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const resolved = await resolveApiKeyFromBearer(bearerToken);
    if (resolved) return resolved;
    // Bearer failed — fall through to X-KEY as fallback
  }

  // 2. Check X-KEY header — use directly
  const apiKey = extractApiKey(req);
  if (apiKey) {
    logger.info("Auth resolved via X-KEY header");
    return apiKey;
  }

  return null;
}

/** Send a JSON response with the given status code. */
function sendJSON(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Set CORS headers on the response. Uses ALLOWED_ORIGINS env var to
 * restrict origins for hosted deployment, or "*" for self-hosted.
 */
function setCORSHeaders(req: IncomingMessage, res: ServerResponse): void {
  if (ALLOWED_ORIGINS === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, X-KEY, Mcp-Protocol-Version, Mcp-Session-Id"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Mcp-Session-Id"
  );
}

/** Set security headers that apply to all responses. */
function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
}

// ---------------------------------------------------------------------------
// Protected resource metadata (RFC 9728)
// ---------------------------------------------------------------------------

/** OAuth protected resource metadata — tells clients where to find the AS. */
const RESOURCE_URL = process.env.RESOURCE_URL || "https://mcp.prospeo.io";
const AUTHORIZATION_SERVER_URL = process.env.AUTHORIZATION_SERVER_URL || "https://prod.prospeo.io";

const PROTECTED_RESOURCE_METADATA = {
  resource: RESOURCE_URL,
  authorization_servers: [RESOURCE_URL],
  bearer_methods_supported: ["header"],
};

/** OAuth authorization server metadata (RFC 8414) — served directly from the MCP server. */
const AUTHORIZATION_SERVER_METADATA = {
  issuer: AUTHORIZATION_SERVER_URL,
  authorization_endpoint: `${AUTHORIZATION_SERVER_URL}/api/v2/oauth/authorize`,
  token_endpoint: `${AUTHORIZATION_SERVER_URL}/api/v2/oauth/token`,
  registration_endpoint: `${AUTHORIZATION_SERVER_URL}/api/v2/oauth/register`,
  revocation_endpoint: `${AUTHORIZATION_SERVER_URL}/api/v2/oauth/revoke`,
  jwks_uri: `${AUTHORIZATION_SERVER_URL}/.well-known/jwks.json`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
  scopes_supported: ["mcp"],
};

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const httpServer = createHTTPServer(async (req, res) => {
  // Apply security and CORS headers to every response
  setSecurityHeaders(res);
  setCORSHeaders(req, res);

  // Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ---- Well-known endpoints (public, no auth) ----

  if (req.url === "/.well-known/oauth-protected-resource") {
    sendJSON(res, 200, PROTECTED_RESOURCE_METADATA);
    return;
  }

  if (req.url === "/.well-known/oauth-authorization-server") {
    sendJSON(res, 200, AUTHORIZATION_SERVER_METADATA);
    return;
  }

  // Proxy/redirect OAuth endpoints to the authorization server.
  // Some MCP clients call these on the resource server URL directly.
  const oauthPaths = ["/authorize", "/token", "/register", "/revoke"];
  const matchedPath = oauthPaths.find((p) => req.url?.startsWith(p));
  if (matchedPath && AUTHORIZATION_SERVER_URL) {
    const targetUrl = `${AUTHORIZATION_SERVER_URL}/api/v2/oauth${req.url}`;

    // GET requests (browser redirects like /authorize) — redirect
    if (req.method === "GET") {
      res.writeHead(302, { Location: targetUrl });
      res.end();
      return;
    }

    // POST requests (/token, /register, /revoke) — proxy to avoid redirect issues
    const rawBody = await new Promise<string>((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) { req.destroy(); reject(new Error("PAYLOAD_TOO_LARGE")); return; }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });

    try {
      const headers: Record<string, string> = {
        "Content-Type": req.headers["content-type"] || "application/json",
      };
      if (req.headers.authorization) {
        headers["Authorization"] = req.headers.authorization as string;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const upstream = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: rawBody || undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const responseBody = await upstream.text();
      res.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
      });
      res.end(responseBody);
    } catch (err) {
      const message = err instanceof Error && err.name === "AbortError"
        ? "Authorization server timed out"
        : "Failed to reach authorization server";
      sendJSON(res, 502, { error: message });
    }
    return;
  }

  // Health check
  if (req.url === "/health") {
    sendJSON(res, 200, { status: "ok" });
    return;
  }

  // ---- MCP endpoint is the root path ----

  if (req.url !== "/") {
    sendJSON(res, 404, { error: "Not Found" });
    return;
  }

  // HEAD/GET — return 200 (used by clients to check server liveness after OAuth)
  if (req.method === "HEAD" || req.method === "GET") {
    sendJSON(res, 200, { status: "ok", name: "prospeo-mcp-server" });
    return;
  }

  // Only POST is allowed for MCP messages
  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "POST, GET, HEAD" });
    res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
    return;
  }

  // ---------------------------------------------------------------------------
  // Auth — resolve API key via Bearer JWT or X-KEY header
  // ---------------------------------------------------------------------------

  const apiKey = await resolveApiKey(req);
  if (!apiKey) {
    res.writeHead(401, {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`,
    });
    res.end(
      JSON.stringify({
        error:
          "Missing or invalid authentication. " +
          "Use Authorization: Bearer <token> or X-KEY: <your_api_key>",
      })
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Stateless per-request handling — create transport + server, handle, cleanup
  // ---------------------------------------------------------------------------

  try {
    const body = await parseBody(req);

    // Create a fresh transport and server for this request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — no session tracking
    });
    const server = createMCPServer(apiKey, serverConfig);
    await server.connect(transport);

    // Handle the MCP request
    await transport.handleRequest(req, res, body);

    // Cleanup when the HTTP response closes
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    const errMsg = String(err);
    if (errMsg.includes("PAYLOAD_TOO_LARGE")) {
      logger.warn("Request body too large", { maxBytes: MAX_BODY_SIZE });
      if (!res.headersSent) {
        sendJSON(res, 413, { error: "Payload too large. Maximum body size is 1 MB." });
      }
      return;
    }

    logger.error("Request handler error", { error: errMsg });
    if (!res.headersSent) {
      sendJSON(res, 500, { error: "Internal server error" });
    }
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  logger.info("Prospeo MCP HTTP server started", {
    port: PORT,
    endpoint: `http://localhost:${PORT}/`,
  });
});
