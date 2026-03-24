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

  logger.info("search_person: success", {
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
