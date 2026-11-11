import { createRequire } from "node:module";

interface NewRelicApi {
  addCustomAttributes(attributes: Record<string, string>): void;
}

// The hosted image preloads the agent only when a license key is set (docker/start-http-server.sh).
const newRelic: NewRelicApi | undefined = process.env.NEW_RELIC_LICENSE_KEY
  ? (createRequire(import.meta.url)("newrelic") as NewRelicApi)
  : undefined;

/** New Relic attributes for one MCP message: its JSON-RPC method and, for tool calls, the tool name. */
export function mcpMessageAttributes(body: unknown): Record<string, string> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return {};
  const { method, params } = body as { method?: unknown; params?: { name?: unknown } };
  if (typeof method !== "string") return {};

  const attributes: Record<string, string> = { "mcp.method": method };
  if (method === "tools/call" && typeof params?.name === "string") attributes["mcp.tool"] = params.name;
  return attributes;
}

/** Tag the current New Relic transaction with the MCP message it handles. No-op without the agent. */
export function recordMcpMessage(body: unknown): void {
  newRelic?.addCustomAttributes(mcpMessageAttributes(body));
}
