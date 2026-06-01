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
  SearchSuggestionsSchema,
  BulkEnrichPersonSchema,
  BulkEnrichCompanySchema,
} from "./schemas.js";

import { enrichPerson } from "./tools/enrich-person.js";
import { enrichCompany } from "./tools/enrich-company.js";
import { searchPerson } from "./tools/search-person.js";
import { searchCompany } from "./tools/search-company.js";
import { searchSuggestions } from "./tools/search-suggestions.js";
import { bulkEnrichPerson } from "./tools/bulk-enrich-person.js";
import { bulkEnrichCompany } from "./tools/bulk-enrich-company.js";

import type { AccountInfoAPIResponse, ToolResult } from "./types.js";

// ---------------------------------------------------------------------------
// Tool definitions — registered with the MCP server
// ---------------------------------------------------------------------------

const TOOLS: Tool[] = [
  {
    name: "search_suggestions",
    description:
      "Resolve canonical filter values BEFORE building a search. Free — no credit cost. " +
      "Use type='location' for person/company location filters, 'job_title' for job-title filters, " +
      "'technology' for company_technology, 'industry' for company_industry, 'naics' / 'sic' for the code filters. " +
      "Locations and technologies in particular cannot be guessed — call this first or your search will return zero results.",
    inputSchema: zodToJsonSchema(SearchSuggestionsSchema) as Tool["inputSchema"],
    annotations: { title: "Search Suggestions", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "enrich_person",
    description:
      "Enrich a SINGLE person — return their full profile with verified email and/or mobile, job history, and current company. " +
      "Provide at least one identifier: linkedin_url, email, person_id (from a prior search result), or full_name/first_name+last_name plus company_name/company_website. " +
      "Credits: 1 for email, 10 for email + mobile (set enrich_mobile=true; email is included free when mobile is requested). " +
      "Credits are only deducted when the requested contact data is actually returned. " +
      "No charge if no person is matched, and no charge if only_verified_email/only_verified_mobile is set but no verified contact exists. " +
      "Check free_enrichment in the response to confirm. " +
      "If you have MULTIPLE people to enrich (e.g. a full page of search_person results), use bulk_enrich_person instead — same per-record cost, one call.",
    inputSchema: zodToJsonSchema(EnrichPersonSchema) as Tool["inputSchema"],
    annotations: { title: "Enrich Person", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "bulk_enrich_person",
    description:
      "Enrich up to 25 people in ONE call — the canonical follow-up to search_person. " +
      "Pass each search result's person_id as a record; the matched.identifier in the response equals that person_id so you can stitch results back to the original list. " +
      "Per-record cost is identical to enrich_person (1 credit per matched email, 10 per matched email+mobile). " +
      "Response also includes free_enrichment per record so you can attribute credit consumption. " +
      "Returns a compact response per record (no job_history, no skills, abbreviated company summary) — use enrich_person if you need the full profile for a specific person. " +
      "For >25 records, call this multiple times — do not auto-batch.",
    inputSchema: zodToJsonSchema(BulkEnrichPersonSchema) as Tool["inputSchema"],
    annotations: { title: "Bulk Enrich People", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "enrich_company",
    description:
      "Enrich a company — return its full profile (headcount, industry, revenue, tech stack, funding, social links, HQ phone). " +
      "Provide at least one identifier: company_website (most accurate), company_linkedin_url, company_name, or company_id (from a prior search result). " +
      "Credits: 1 per successful match. No charge if no match is found. " +
      "Check free_enrichment in the response to confirm whether credits were deducted.",
    inputSchema: zodToJsonSchema(EnrichCompanySchema) as Tool["inputSchema"],
    annotations: { title: "Enrich Company", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "bulk_enrich_company",
    description:
      "Enrich up to 25 companies in ONE call — the canonical lookup tool when you already have a list of company names/domains (CRM exports, account lists, competitor maps). " +
      "Each record needs one of: company_id, company_website, company_linkedin_url, or company_name. " +
      "Returns the full company profile per match (tech stack, attributes, funding, job postings — same shape as enrich_company). " +
      "identifier defaults to company_id when provided so search_company → bulk_enrich_company chains correlate without extra bookkeeping. " +
      "Use search_company instead when you don't yet know which companies to target. 1 credit per matched company.",
    inputSchema: zodToJsonSchema(BulkEnrichCompanySchema) as Tool["inputSchema"],
    annotations: { title: "Bulk Enrich Companies", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "search_person",
    description:
      "Search Prospeo's professional database using typed filters. Returns up to 25 results per page (max 1000 pages). Costs 1 credit per page that returns results. " +
      "WORKFLOW: (1) for any filter value the user mentioned by description (location, technology, industry, job title, NAICS/SIC code), call search_suggestions first to get the canonical string. " +
      "(2) build filters mixing person fields (person_job_title, person_seniority, person_location_search) with company fields (company_industry, company_headcount_range, company_technology). " +
      "(3) take each result's person_id and pass it to bulk_enrich_person in one call to reveal verified emails/mobiles. " +
      "Each result includes person fields (name, title, location, linkedin_url) and a company summary. " +
      "email and mobile are obfuscated previews in search results (revealed=false) with status (VERIFIED / UNVERIFIED / null) — use status to gauge coverage before enriching. " +
      "At least one positive (include) filter is required.",
    inputSchema: zodToJsonSchema(SearchPersonSchema) as Tool["inputSchema"],
    annotations: { title: "Search People", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "search_company",
    description:
      "Search Prospeo's company database using typed filters. Returns up to 25 results per page (max 1000 pages). Costs 1 credit per page that returns results. " +
      "WORKFLOW: (1) call search_suggestions first for any location/technology/industry/NAICS/SIC the user mentioned. (2) build filters. (3) pass any company_id from results to enrich_company for full profile (tech stack, attributes, job postings — not included in search). " +
      "Available filters include firmographics (industry, headcount, technology, revenue, funding) and intent/event filters (company_news, company_key_execs, company_lookalike, company_icp, company_website_search, company_google_discovery) — see each filter's description for when to use it. " +
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
        case "search_suggestions": {
          const parsed = SearchSuggestionsSchema.safeParse(args);
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
          const content = await searchSuggestions(client, parsed.data);
          return { content: [content] };
        }

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

        case "bulk_enrich_person": {
          const parsed = BulkEnrichPersonSchema.safeParse(args);
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
          const content = await bulkEnrichPerson(client, parsed.data);
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

        case "bulk_enrich_company": {
          const parsed = BulkEnrichCompanySchema.safeParse(args);
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
          const content = await bulkEnrichCompany(client, parsed.data);
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
