/**
 * Tool: enrich_company
 *
 * Calls POST /enrich-company on the Prospeo public API.
 * Returns full company intelligence or a structured error.
 */

import { logger } from "../utils/logger.js";
import { buildApiError, buildUnexpectedError, formatErrorText } from "../utils/errors.js";
import type { ProspeoAPIClient } from "../utils/api-client.js";
import type { EnrichCompanyInput } from "../schemas.js";
import type { EnrichCompanyAPIResponse, ToolResult } from "../types.js";

/**
 * Enrich a single company — returns headcount, industry, revenue range, tech stack, and more.
 *
 * @param client - Authenticated Prospeo API client
 * @param input  - Validated tool arguments
 * @returns MCP tool content (text) with structured result
 */
export async function enrichCompany(
  client: ProspeoAPIClient,
  input: EnrichCompanyInput
): Promise<{ type: "text"; text: string }> {
  logger.info("Tool: enrich_company called", {
    has_website: !!input.company_website,
    has_name: !!input.company_name,
    has_linkedin: !!input.company_linkedin_url,
  });

  // Build the data object — only include fields that were provided
  const data: Record<string, unknown> = {};
  if (input.company_name) data.company_name = input.company_name;
  if (input.company_website) data.company_website = input.company_website;
  if (input.company_linkedin_url) data.company_linkedin_url = input.company_linkedin_url;
  if (input.company_id) data.company_id = input.company_id;

  const requestBody = { data };

  let response: EnrichCompanyAPIResponse;

  try {
    response = await client.post<EnrichCompanyAPIResponse>("/enrich-company", requestBody);
  } catch (err) {
    const error = buildUnexpectedError(err);
    logger.error("enrich_company: network error", { error });
    return { type: "text", text: formatErrorText(error) };
  }

  if (response.error) {
    const error = buildApiError(response.error_code ?? "UNKNOWN", response.filter_error);
    logger.warn("enrich_company: API returned error", { error_code: response.error_code });
    return { type: "text", text: formatErrorText(error) };
  }

  if (!response.company) {
    logger.info("enrich_company: no match found");
    const result: ToolResult = {
      success: true,
      data: {
        found: false,
        message: "No company found matching the provided data points. Try using the company website domain for best results.",
      },
    };
    return { type: "text", text: JSON.stringify(result, null, 2) };
  }

  logger.info("enrich_company: success", {
    company_id: response.company.company_id,
    name: response.company.name,
    free_enrichment: response.free_enrichment,
  });

  const result: ToolResult = {
    success: true,
    data: {
      found: true,
      free_enrichment: response.free_enrichment ?? false,
      company: response.company,
    },
  };

  return { type: "text", text: JSON.stringify(result, null, 2) };
}
