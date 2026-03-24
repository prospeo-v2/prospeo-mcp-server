/**
 * Tool: enrich_person
 *
 * Calls POST /enrich-person on the Prospeo public API.
 * Returns the enriched person + company data, or a structured error.
 */

import { logger } from "../utils/logger.js";
import { buildApiError, buildUnexpectedError, formatErrorText } from "../utils/errors.js";
import type { ProspeoAPIClient } from "../utils/api-client.js";
import type { EnrichPersonInput } from "../schemas.js";
import type { EnrichPersonAPIResponse, ToolResult } from "../types.js";

/**
 * Enrich a single person — find their professional email and/or mobile number.
 *
 * @param client - Authenticated Prospeo API client
 * @param input  - Validated tool arguments
 * @returns MCP tool content (text) with structured result
 */
export async function enrichPerson(
  client: ProspeoAPIClient,
  input: EnrichPersonInput
): Promise<{ type: "text"; text: string }> {
  logger.info("Tool: enrich_person called", {
    has_linkedin: !!input.linkedin_url,
    has_email: !!input.email,
    has_person_id: !!input.person_id,
    has_name: !!(input.first_name || input.full_name),
    enrich_mobile: input.enrich_mobile,
  });

  // Build the data object — only include fields that were provided
  const data: Record<string, unknown> = {};
  if (input.linkedin_url) data.linkedin_url = input.linkedin_url;
  if (input.email) data.email = input.email;
  if (input.person_id) data.person_id = input.person_id;
  if (input.first_name) data.first_name = input.first_name;
  if (input.last_name) data.last_name = input.last_name;
  if (input.full_name) data.full_name = input.full_name;
  if (input.company_name) data.company_name = input.company_name;
  if (input.company_website) data.company_website = input.company_website;
  if (input.company_linkedin_url) data.company_linkedin_url = input.company_linkedin_url;

  const requestBody = {
    data,
    only_verified_email: input.only_verified_email ?? false,
    enrich_mobile: input.enrich_mobile ?? false,
    only_verified_mobile: input.only_verified_mobile ?? false,
  };

  let response: EnrichPersonAPIResponse;

  try {
    response = await client.post<EnrichPersonAPIResponse>("/enrich-person", requestBody);
  } catch (err) {
    const error = buildUnexpectedError(err);
    logger.error("enrich_person: network error", { error });
    return { type: "text", text: formatErrorText(error) };
  }

  // Prospeo returns error:true with an error_code on failures
  if (response.error) {
    const error = buildApiError(response.error_code ?? "UNKNOWN", response.filter_error);
    logger.warn("enrich_person: API returned error", { error_code: response.error_code });
    return { type: "text", text: formatErrorText(error) };
  }

  // Person not found — return a clear not-found message rather than null
  if (!response.person) {
    logger.info("enrich_person: no match found");
    const result: ToolResult = {
      success: true,
      data: {
        found: false,
        message: "No person found matching the provided data points. Try adding more identifying information.",
      },
    };
    return { type: "text", text: JSON.stringify(result, null, 2) };
  }

  logger.info("enrich_person: success", {
    person_id: response.person.person_id,
    has_email: !!response.person.email,
    has_mobile: !!response.person.mobile,
    free_enrichment: response.free_enrichment,
  });

  const result: ToolResult = {
    success: true,
    data: {
      found: true,
      free_enrichment: response.free_enrichment ?? false,
      person: response.person,
      company: response.company ?? null,
    },
  };

  return { type: "text", text: JSON.stringify(result, null, 2) };
}
