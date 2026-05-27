/**
 * Tool: bulk_enrich_company
 *
 * Calls POST /bulk-enrich-company on the Prospeo public API.
 * Enriches up to 50 companies in a single request and returns matched /
 * not_matched / invalid_datapoints, plus total credit cost.
 *
 * Identifier defaulting: if a record provides a company_id, that company_id
 * is used as the correlation identifier so the agent can stitch results back
 * to its original list. Records without a company_id fall back to "idx-N".
 *
 * Unlike bulk_enrich_person, the full company profile is returned per match
 * (no compaction) — full profile is the whole point of enrichment over search.
 */

import { logger } from "../utils/logger.js";
import { buildApiError, buildUnexpectedError, formatErrorText } from "../utils/errors.js";
import type { ProspeoAPIClient } from "../utils/api-client.js";
import type { BulkEnrichCompanyInput } from "../schemas.js";
import type { BulkEnrichCompanyAPIResponse, ToolResult } from "../types.js";

export async function bulkEnrichCompany(
  client: ProspeoAPIClient,
  input: BulkEnrichCompanyInput
): Promise<{ type: "text"; text: string }> {
  logger.info("Tool: bulk_enrich_company called", { count: input.data.length });

  const data = input.data.map((record, idx) => {
    const { identifier, ...rest } = record;
    const resolvedIdentifier = identifier ?? record.company_id ?? `idx-${idx}`;
    return {
      identifier: resolvedIdentifier,
      ...rest,
    };
  });

  const requestBody = { data };

  let response: BulkEnrichCompanyAPIResponse;

  try {
    response = await client.post<BulkEnrichCompanyAPIResponse>("/bulk-enrich-company", requestBody);
  } catch (err) {
    const error = buildUnexpectedError(err);
    logger.error("bulk_enrich_company: network error", { error });
    return { type: "text", text: formatErrorText(error) };
  }

  if (response.error) {
    const error = buildApiError(response.error_code ?? "UNKNOWN", response.filter_error);
    logger.warn("bulk_enrich_company: API returned error", { error_code: response.error_code });
    return { type: "text", text: formatErrorText(error) };
  }

  const matched = (response.matched ?? []).map((m) => ({
    identifier: m.identifier,
    free_enrichment: m.free_enrichment ?? false,
    company: m.company ?? null,
  }));

  logger.info("bulk_enrich_company: success", {
    matched_count: matched.length,
    not_matched_count: response.not_matched?.length ?? 0,
    invalid_count: response.invalid_datapoints?.length ?? 0,
    total_cost: response.total_cost,
  });

  const result: ToolResult = {
    success: true,
    data: {
      total_cost: response.total_cost ?? 0,
      matched,
      not_matched: response.not_matched ?? [],
      invalid_datapoints: response.invalid_datapoints ?? [],
    },
  };

  return { type: "text", text: JSON.stringify(result, null, 2) };
}
