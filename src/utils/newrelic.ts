import { createRequire } from "node:module";

interface NewRelicApi {
  addCustomAttributes(attributes: Record<string, string>): void;
}

// The hosted image preloads the agent only when a license key is set (docker/start-http-server.sh).
const agent: NewRelicApi | undefined = process.env.NEW_RELIC_LICENSE_KEY
  ? (createRequire(import.meta.url)("newrelic") as NewRelicApi)
  : undefined;

/** The JSON-RPC method of an MCP message and, for tool calls, the tool name. */
export function describeMcpMessage(body: unknown): Record<string, string> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return {};
  const { method, params } = body as { method?: unknown; params?: { name?: unknown } };
  if (typeof method !== "string") return {};
  const toolName = method === "tools/call" ? params?.name : undefined;
  return typeof toolName === "string" ? { "mcp.method": method, "mcp.tool": toolName } : { "mcp.method": method };
}

/** Tag the current New Relic transaction with the MCP message it handles. */
export function recordMcpMessage(body: unknown): void {
  agent?.addCustomAttributes(describeMcpMessage(body));
}
