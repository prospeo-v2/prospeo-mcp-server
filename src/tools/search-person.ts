/**
 * Tool: search_person
 *
 * Calls POST /search-person on the Prospeo public API.
 * Returns paginated list of people matching the given filters.
 */

import { logger } from "../utils/logger.js";
import { buildApiError, buildUnexpectedError, formatErrorText } from "../utils/errors.js";
import type { ProspeoAPIClient } from "../utils/api-client.js";
import type { SearchPersonInput } from "../schemas.js";
import type { SearchPersonAPIResponse, ToolResult } from "../types.js";

/**
 * Search for people using structured filters.
 *
 * @param client - Authenticated Prospeo API client
 * @param input  - Validated tool arguments (filters + page)
 * @returns MCP tool content (text) with paginated results
 */
export async function searchPerson(
  client: ProspeoAPIClient,
  input: SearchPersonInput
): Promise<{ type: "text"; text: string }> {
  logger.info("Tool: search_person called", {
    filter_keys: Object.keys(input.filters as object),
    page: input.page,
  });

  const requestBody = {
    filters: input.filters,
    page: input.page ?? 1,
  };

  let response: SearchPersonAPIResponse;

  try {
    response = await client.post<SearchPersonAPIResponse>("/search-person", requestBody);
  } catch (err) {
    const error = buildUnexpectedError(err);
    logger.error("search_person: network error", { error });
    return { type: "text", text: formatErrorText(error) };
  }

  if (response.error) {
    const error = buildApiError(response.error_code ?? "UNKNOWN", response.filter_error);
    logger.warn("search_person: API returned error", { error_code: response.error_code });
    return { type: "text", text: formatErrorText(error) };
  }

  // Strip verbose fields to keep response small.
  // Full details are available via enrich_person / enrich_company with the returned IDs.
  const results = (response.results ?? []).map((r) => {
    const { job_history, skills, ...person } = r.person ?? {} as Record<string, unknown>;
    const company = r.company
      ? {
          company_id: r.company.company_id,
          name: r.company.name,
          website: r.company.website,
          domain: r.company.domain,
          industry: r.company.industry,
          employee_count: r.company.employee_count,
          employee_range: r.company.employee_range,
          location: r.company.location,
          revenue_range_printed: r.company.revenue_range_printed,
          founded: r.company.founded,
          linkedin_url: r.company.linkedin_url,
        }
      : null;
    return { person, company };
  });

  logger.info("search_person: success", {
    result_count: results.length,
    total_count: response.pagination?.total_count,
    page: response.pagination?.current_page,
  });

  const result: ToolResult = {
    success: true,
    data: {
      results,
      pagination: response.pagination,
    },
  };

  return { type: "text", text: JSON.stringify(result, null, 2) };
}
