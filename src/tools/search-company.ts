/**
 * Tool: search_company
 *
 * Calls POST /search-company on the Prospeo public API.
 * Returns paginated list of companies matching the given filters.
 */

import { logger } from "../utils/logger.js";
import { buildApiError, buildUnexpectedError, formatErrorText } from "../utils/errors.js";
import type { ProspeoAPIClient } from "../utils/api-client.js";
import type { SearchCompanyInput } from "../schemas.js";
import type { SearchCompanyAPIResponse, ToolResult } from "../types.js";

/**
 * Search for companies using structured filters.
 *
 * @param client - Authenticated Prospeo API client
 * @param input  - Validated tool arguments (filters + page)
 * @returns MCP tool content (text) with paginated results
 */
export async function searchCompany(
  client: ProspeoAPIClient,
  input: SearchCompanyInput
): Promise<{ type: "text"; text: string }> {
  logger.info("Tool: search_company called", {
    filter_keys: Object.keys(input.filters as object),
    page: input.page,
  });

  const requestBody = {
    filters: input.filters,
    page: input.page ?? 1,
  };

  let response: SearchCompanyAPIResponse;

  try {
    response = await client.post<SearchCompanyAPIResponse>("/search-company", requestBody);
  } catch (err) {
    const error = buildUnexpectedError(err);
    logger.error("search_company: network error", { error });
    return { type: "text", text: formatErrorText(error) };
  }

  if (response.error) {
    const error = buildApiError(response.error_code ?? "UNKNOWN", response.filter_error);
    logger.warn("search_company: API returned error", { error_code: response.error_code });
    return { type: "text", text: formatErrorText(error) };
  }

  // Strip verbose fields to keep response small.
  // Full details are available via enrich_company with the returned company_id.
  const results = (response.results ?? []).map((r) => ({
    company: r.company
      ? {
          company_id: r.company.company_id,
          name: r.company.name,
          website: r.company.website,
          domain: r.company.domain,
          industry: r.company.industry,
          employee_count: r.company.employee_count,
          employee_range: r.company.employee_range,
          revenue_range_printed: r.company.revenue_range_printed,
          founded: r.company.founded,
          location: r.company.location,
          linkedin_url: r.company.linkedin_url,
          funding: r.company.funding,
          keywords: r.company.keywords,
        }
      : null,
  }));

  logger.info("search_company: success", {
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
