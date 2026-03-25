#!/usr/bin/env node
/**
 * Prospeo MCP HTTP Server — remote entry point for mcp.prospeo.io
 *
 * Hosts the MCP server over Streamable HTTP so clients connect remotely.
 * Each user authenticates with their own API key via the X-KEY header.
 *
 * Usage (client-side):
 *   claude mcp add prospeo --transport http --header "X-KEY: <key>" https://mcp.prospeo.io/
 */

import { createServer as createHTTPServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { loadServerConfig } from "./config/index.js";
import { createMCPServer } from "./create-server.js";
import { logger } from "./utils/logger.js";

const serverConfig = loadServerConfig();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ---------------------------------------------------------------------------
// Session management — one MCP Server + transport per session
// ---------------------------------------------------------------------------

interface Session {
  transport: StreamableHTTPServerTransport;
  server: Server;
}

const sessions = new Map<string, Session>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
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

function extractApiKey(req: IncomingMessage): string | null {
  const key = req.headers["x-key"];
  if (!key || typeof key !== "string") return null;
  return key.trim() || null;
}

function sendJSON(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const httpServer = createHTTPServer(async (req, res) => {
  // CORS — allow browser-based MCP clients and docs page
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-KEY, mcp-session-id, Last-Event-ID"
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === "/health") {
    sendJSON(res, 200, { status: "ok", sessions: sessions.size });
    return;
  }

  // MCP endpoint is the root path
  if (req.url !== "/") {
    sendJSON(res, 404, { error: "Not Found" });
    return;
  }

  // ---------------------------------------------------------------------------
  // Auth — require API key on every request
  // ---------------------------------------------------------------------------

  const apiKey = extractApiKey(req);
  if (!apiKey) {
    sendJSON(res, 401, {
      error:
        "Missing or invalid X-KEY header. " +
        "Use: X-KEY: <your_api_key>",
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // Route to existing session or create a new one
  // ---------------------------------------------------------------------------

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    if (sessionId && sessions.has(sessionId)) {
      // --- Existing session ---
      const session = sessions.get(sessionId)!;
      const body = req.method === "POST" ? await parseBody(req) : undefined;
      await session.transport.handleRequest(req, res, body);
    } else if (!sessionId && req.method === "POST") {
      // --- New initialization ---
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, server });
          logger.info("Session initialized", { sessionId: id });
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          sessions.delete(sid);
          logger.info("Session closed", { sessionId: sid });
        }
      };

      const server = createMCPServer(apiKey, serverConfig);
      await server.connect(transport);

      const body = await parseBody(req);
      await transport.handleRequest(req, res, body);
    } else if (sessionId) {
      // Session ID provided but not found — client should re-initialize
      sendJSON(res, 404, {
        error: "Session not found. Please re-initialize.",
        jsonrpc: "2.0",
      });
    } else {
      sendJSON(res, 400, { error: "Bad request" });
    }
  } catch (err) {
    logger.error("Request handler error", { error: String(err) });
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
