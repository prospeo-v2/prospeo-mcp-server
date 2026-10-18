/** Backend-owned tool schemas, compiled once and shared by all MCP connections. */
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { JsonSchemaValidator } from "@modelcontextprotocol/sdk/validation";
import { ToolSchema, type Tool, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ServerConfig } from "./config/index.js";
import type { ProspeoAPIClient } from "./utils/api-client.js";
import { logger } from "./utils/logger.js";

const legacyNames = new Set([
  "enrich_person", "enrich_person_bulk", "bulk_enrich_person", "enrich_company",
  "enrich_company_bulk", "bulk_enrich_company", "get_usage_and_credits",
  "get_account_info", "search_suggestions", "search_person", "search_company",
]);
const internalNames = new Set([
  "get_product_help", "navigate", "open_modal", "elicit_user", "render_ui", "show_download", "mailbox_setup",
]);
const endpointSchema = z.object({
  method: z.enum(["POST", "GET"]),
  // Only same-origin, literal paths. No URL, query, fragment, traversal, or encoded separators.
  path: z.string().regex(/^\/[a-zA-Z0-9][a-zA-Z0-9/-]*$/),
}).strict();
const tableSchema = z.object({ schemaVersion: z.literal(1), tools: z.array(z.unknown()).max(500) }).strict();

export interface PublicTool {
  tool: Tool;
  endpoint: z.infer<typeof endpointSchema>;
  validate: JsonSchemaValidator<Record<string, unknown>>;
}

/** Validate the entire table atomically; a partial catalog must not silently ship. */
export function compilePublicTools(value: unknown): PublicTool[] {
  const table = tableSchema.parse(value);
  const validator = new AjvJsonSchemaValidator();
  const seen = new Set<string>();
  const tools: PublicTool[] = [];
  for (const raw of table.tools) {
    const tool = ToolSchema.parse(raw);
    if (legacyNames.has(tool.name)) continue;
    if (internalNames.has(tool.name) || seen.has(tool.name)) throw new Error("Invalid public tool inventory");
    seen.add(tool.name);
    const endpoint = endpointSchema.parse((raw as Record<string, unknown>).endpoint);
    if (tool.inputSchema.additionalProperties !== false) throw new Error("Public input schema must be closed");
    // Explicitly select MCP fields so backend routing metadata never enters tools/list.
    const definition: Tool = {
      name: tool.name, description: tool.description, inputSchema: tool.inputSchema,
      annotations: tool.annotations, _meta: tool._meta,
    };
    tools.push({ tool: definition, endpoint, validate: validator.getValidator(tool.inputSchema) });
  }
  return tools;
}

/** Fetch public metadata at startup without sending any user's credentials. */
export async function loadPublicTools(config: ServerConfig): Promise<PublicTool[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.apiBaseUrl}${config.apiV2Prefix}/mcp/tools`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      signal: controller.signal, redirect: "error",
    });
    if (!response.ok) throw new Error("Public catalog unavailable");
    const tools = compilePublicTools(await response.json());
    logger.info("Public tool catalog loaded", { count: tools.length });
    return tools;
  } catch {
    logger.warn("Public tool catalog unavailable; serving legacy tools only");
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Return a machine-readable MCP failure without reflecting untrusted errors or arguments. */
function failure(code: string, message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ ok: false, code, message }) }] };
}

/** Validate locally, then execute once using the backend's public projection and caller key. */
export async function callPublicTool(binding: PublicTool, args: unknown, client: ProspeoAPIClient): Promise<CallToolResult> {
  const validated = binding.validate(args === undefined ? {} : args);
  if (!validated.valid) return failure("INVALID_ARGS", "The request arguments are invalid.");
  if (binding.endpoint.method === "GET" && Object.keys(validated.data).length > 0) {
    return failure("INVALID_ARGS", "This read does not accept arguments.");
  }
  try {
    const response = await client.requestPublicTool(binding.endpoint.method, binding.endpoint.path, validated.data);
    const body = response.body;
    if (response.status >= 500 || !body || typeof body !== "object" || !("ok" in body)) {
      return failure("UPSTREAM_ERROR", "The operation could not be completed. Please try again.");
    }
    return {
      isError: response.status !== 200 || body.ok !== true,
      content: [{ type: "text", text: JSON.stringify(body) }],
    };
  } catch {
    return failure("UPSTREAM_ERROR", "The operation could not be completed. Please try again.");
  }
}
