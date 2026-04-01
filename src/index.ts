#!/usr/bin/env node
/**
 * Prospeo MCP Server — stdio entry point
 *
 * Exposes Prospeo's lead search and enrichment capabilities as MCP tools
 * so AI agents (Claude, Cursor, etc.) can find emails, mobile numbers,
 * and company intelligence natively.
 *
 * Usage:
 *   claude mcp add prospeo --env PROSPEO_API_KEY=<key> -- npx -y @prospeo/prospeo-mcp-server
 *
 * Tools:
 *   - enrich_person    Find email + mobile for a person
 *   - enrich_company   Get full company profile
 *   - search_person    Search people with filters
 *   - search_company   Search companies with filters
 *   - get_account_info Check credits and plan status
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/index.js";
import { createMCPServer } from "./create-server.js";
import { logger } from "./utils/logger.js";

// ---------------------------------------------------------------------------
// Server setup — stdio transport for local subprocess mode (npx)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Validate environment and build config — throws on missing PROSPEO_API_KEY
  const config = loadConfig();

  logger.info("Prospeo MCP server starting", {
    version: "1.0.0",
    apiBaseUrl: config.apiBaseUrl,
    transport: "stdio",
  });

  const server = createMCPServer(config.apiKey, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Prospeo MCP server running on stdio");
}

// Run and handle startup errors
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[Prospeo MCP] Fatal startup error: ${message}\n`);
  process.exit(1);
});
