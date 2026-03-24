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

  logger.info("search_company: success", {
    result_count: response.results?.length ?? 0,
    total_count: response.pagination?.total_count,
    page: response.pagination?.current_page,
  });

  const result: ToolResult = {
    success: true,
    data: {
      results: response.results ?? [],
      pagination: response.pagination,
    },
  };

  return { type: "text", text: JSON.stringify(result, null, 2) };
}
