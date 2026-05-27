/**
 * Tool: search_suggestions
 *
 * Calls POST /search-suggestions on the Prospeo public API.
 * Resolves filter values that are too large to inline in the tool schema
 * (locations, job titles, technologies, NAICS, SIC) and small but useful
 * autocomplete enums (industries).
 *
 * Free endpoint — does not consume credits.
 */

import { logger } from "../utils/logger.js";
import { buildApiError, buildUnexpectedError, formatErrorText } from "../utils/errors.js";
import type { ProspeoAPIClient } from "../utils/api-client.js";
import type { SearchSuggestionsInput } from "../schemas.js";
import type { SearchSuggestionsAPIResponse, ToolResult } from "../types.js";

const TYPE_TO_FIELD: Record<SearchSuggestionsInput["type"], keyof Omit<SearchSuggestionsAPIResponse, "error" | "error_code" | "filter_error">> = {
  location: "location_suggestions",
  job_title: "job_title_suggestions",
  technology: "technology_suggestions",
  industry: "industry_suggestions",
  naics: "naics_suggestions",
  sic: "sic_suggestions",
};

const TYPE_TO_BODY_KEY: Record<SearchSuggestionsInput["type"], string> = {
  location: "location_search",
  job_title: "job_title_search",
  technology: "technology_search",
  industry: "industry_search",
  naics: "naics_search",
  sic: "sic_search",
};

export async function searchSuggestions(
  client: ProspeoAPIClient,
  input: SearchSuggestionsInput
): Promise<{ type: "text"; text: string }> {
  logger.info("Tool: search_suggestions called", { type: input.type, query: input.query });

  const requestBody: Record<string, string> = {
    [TYPE_TO_BODY_KEY[input.type]]: input.query,
  };

  let response: SearchSuggestionsAPIResponse;

  try {
    response = await client.post<SearchSuggestionsAPIResponse>("/search-suggestions", requestBody);
  } catch (err) {
    const error = buildUnexpectedError(err);
    logger.error("search_suggestions: network error", { error });
    return { type: "text", text: formatErrorText(error) };
  }

  if (response.error) {
    const error = buildApiError(response.error_code ?? "UNKNOWN", response.filter_error);
    logger.warn("search_suggestions: API returned error", { error_code: response.error_code });
    return { type: "text", text: formatErrorText(error) };
  }

  const fieldKey = TYPE_TO_FIELD[input.type];
  const suggestions = response[fieldKey] ?? [];

  logger.info("search_suggestions: success", { type: input.type, count: Array.isArray(suggestions) ? suggestions.length : 0 });

  const result: ToolResult = {
    success: true,
    data: {
      type: input.type,
      query: input.query,
      suggestions,
    },
  };

  return { type: "text", text: JSON.stringify(result, null, 2) };
}
