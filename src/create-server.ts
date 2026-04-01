/**
 * Shared MCP Server factory — used by both stdio (index.ts) and HTTP (http-server.ts) entry points.
 *
 * Creates a configured MCP Server instance with all Prospeo tools registered,
 * bound to the given API key.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ProspeoConfig, ServerConfig } from "./config/index.js";
import { ProspeoAPIClient } from "./utils/api-client.js";
import { logger } from "./utils/logger.js";
import { buildUnexpectedError, formatErrorText } from "./utils/errors.js";

import {
  EnrichPersonSchema,
  EnrichCompanySchema,
  SearchPersonSchema,
  SearchCompanySchema,
} from "./schemas.js";

import { enrichPerson } from "./tools/enrich-person.js";
import { enrichCompany } from "./tools/enrich-company.js";
import { searchPerson } from "./tools/search-person.js";
import { searchCompany } from "./tools/search-company.js";

import type { AccountInfoAPIResponse, ToolResult } from "./types.js";

// ---------------------------------------------------------------------------
// Tool definitions — registered with the MCP server
// ---------------------------------------------------------------------------

const TOOLS: Tool[] = [
  {
    name: "enrich_person",
    description:
      "Find the professional email address and/or mobile phone number for a person. " +
      "Provide at least one identifying field: linkedin_url, email, or full_name/first_name+last_name combined with company_name or company_website. " +
      "Returns person profile with email, mobile, job history, and current company data. ",
    inputSchema: zodToJsonSchema(EnrichPersonSchema) as Tool["inputSchema"],

    annotations: { title: "Enrich Person", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "enrich_company",
    description:
      "Get a full company profile including headcount, industry, revenue range, tech stack, funding, and social links. " +
      "Provide at least one of: company_website (recommended — most accurate), company_name, or company_linkedin_url. ",
    inputSchema: zodToJsonSchema(EnrichCompanySchema) as Tool["inputSchema"],
    annotations: { title: "Enrich Company", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "search_person",
    description:
      "Search Prospeo's professional database using typed filters. " +
      "Returns up to 25 summary results per page (max 1000 pages). Costs 1 credit per page of results. " +
      "Results include key person fields (name, title, email, mobile, location) and company summary (name, industry, size). " +
      "Use enrich_person with person_id to get full details including job history. " +
      "Use person filters (person_job_title, person_seniority, person_location_search, etc.) combined with " +
      "company filters (company_industry, company_headcount_range, company_technology, etc.) to narrow results. " +
      "At least one positive (include) filter is required.",
    inputSchema: zodToJsonSchema(SearchPersonSchema) as Tool["inputSchema"],
    annotations: { title: "Search People", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "search_company",
    description:
      "Search Prospeo's company database using typed filters. " +
      "Returns up to 25 summary results per page (max 1000 pages). Costs 1 credit per page of results. " +
      "Results include key company fields (name, website, industry, size, revenue, location, funding, keywords). " +
      "Use enrich_company with company_id to get full details including tech stack, descriptions, and job postings. " +
      "Use filters like company_industry, company_headcount_range, company_location_search, " +
      "company_technology, company_revenue, company_funding, and more. " +
      "At least one positive (include) filter is required.",
    inputSchema: zodToJsonSchema(SearchCompanySchema) as Tool["inputSchema"],
    annotations: { title: "Search Companies", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "get_account_info",
    description:
      "Check your Prospeo account status — credits remaining, plan name, renewal date, and team size. " +
      "Free endpoint, does not consume credits. Useful to verify the API key works or check remaining quota.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: { title: "Account Info", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a fully configured MCP Server instance with all Prospeo tools.
 *
 * @param apiKey       - The user's Prospeo API key
 * @param serverConfig - Server-level config (base URL, timeout, log level)
 * @returns A ready-to-connect MCP Server
 */
export function createMCPServer(apiKey: string, serverConfig: ServerConfig): Server {
  const config: ProspeoConfig = { apiKey, ...serverConfig };
  const client = new ProspeoAPIClient(config);

  const server = new Server(
    { name: "prospeo", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // ---------------------------------------------------------------------------
  // List tools handler
  // ---------------------------------------------------------------------------

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug("ListTools requested");
    return { tools: TOOLS };
  });

  // ---------------------------------------------------------------------------
  // Call tool handler
  // ---------------------------------------------------------------------------

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info(`Tool called: ${name}`);

    try {
      switch (name) {
        case "enrich_person": {
          const parsed = EnrichPersonSchema.safeParse(args);
          if (!parsed.success) {
            return {
              content: [
                {
                  type: "text",
                  text: formatErrorText({
                    message: `Invalid arguments: ${parsed.error.message}`,
                    code: "VALIDATION_ERROR",
                    category: "validation",
                    severity: "low",
                  }),
                },
              ],
            };
          }
          const content = await enrichPerson(client, parsed.data);
          return { content: [content] };
        }

        case "enrich_company": {
          const parsed = EnrichCompanySchema.safeParse(args);
          if (!parsed.success) {
            return {
              content: [
                {
                  type: "text",
                  text: formatErrorText({
                    message: `Invalid arguments: ${parsed.error.message}`,
                    code: "VALIDATION_ERROR",
                    category: "validation",
                    severity: "low",
                  }),
                },
              ],
            };
          }
          const content = await enrichCompany(client, parsed.data);
          return { content: [content] };
        }

        case "search_person": {
          const parsed = SearchPersonSchema.safeParse(args);
          if (!parsed.success) {
            return {
              content: [
                {
                  type: "text",
                  text: formatErrorText({
                    message: `Invalid arguments: ${parsed.error.message}`,
                    code: "VALIDATION_ERROR",
                    category: "validation",
                    severity: "low",
                  }),
                },
              ],
            };
          }
          const content = await searchPerson(client, parsed.data);
          return { content: [content] };
        }

        case "search_company": {
          const parsed = SearchCompanySchema.safeParse(args);
          if (!parsed.success) {
            return {
              content: [
                {
                  type: "text",
                  text: formatErrorText({
                    message: `Invalid arguments: ${parsed.error.message}`,
                    code: "VALIDATION_ERROR",
                    category: "validation",
                    severity: "low",
                  }),
                },
              ],
            };
          }
          const content = await searchCompany(client, parsed.data);
          return { content: [content] };
        }

        case "get_account_info": {
          let response: AccountInfoAPIResponse;
          try {
            response = await client.get<AccountInfoAPIResponse>("/account-information");
          } catch (err) {
            const error = buildUnexpectedError(err);
            logger.error("get_account_info: network error", { error });
            return { content: [{ type: "text", text: formatErrorText(error) }] };
          }

          if (response.error) {
            return {
              content: [
                {
                  type: "text",
                  text: formatErrorText({
                    message: "Failed to retrieve account information. Check your API key.",
                    code: response.error_code ?? "UNKNOWN",
                    category: "configuration",
                    severity: "high",
                  }),
                },
              ],
            };
          }

          logger.info("get_account_info: success");
          const result: ToolResult = { success: true, data: response.response };
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: formatErrorText({
                  message: `Unknown tool: ${name}`,
                  code: "UNKNOWN_TOOL",
                  category: "validation",
                  severity: "low",
                }),
              },
            ],
          };
      }
    } catch (err) {
      const error = buildUnexpectedError(err);
      logger.error(`Tool ${name} threw unexpectedly`, { error });
      return { content: [{ type: "text", text: formatErrorText(error) }] };
    }
  });

  return server;
}
