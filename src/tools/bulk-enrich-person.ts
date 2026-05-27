/**
 * Tool: bulk_enrich_person
 *
 * Calls POST /bulk-enrich-person on the Prospeo public API.
 * Enriches up to 25 people in one request and returns matched / not_matched /
 * invalid_datapoints, plus total credit cost and per-record free_enrichment flag.
 *
 * Identifier defaulting: if a record provides a person_id, that person_id is used
 * as the correlation identifier so the agent can stitch results back to the
 * original search_person results without threading extra state. Records without
 * a person_id fall back to "idx-N" assignment.
 */

import { logger } from "../utils/logger.js";
import { buildApiError, buildUnexpectedError, formatErrorText } from "../utils/errors.js";
import type { ProspeoAPIClient } from "../utils/api-client.js";
import type { BulkEnrichPersonInput } from "../schemas.js";
import type {
  BulkEnrichPersonAPIResponse,
  CompanyInfo,
  PersonInfo,
  ToolResult,
} from "../types.js";

/** Trim a person object to the search_person summary shape, keeping email/mobile intact. */
function compactPerson(person: PersonInfo): Record<string, unknown> {
  const { job_history, skills, ...rest } = person;
  void job_history;
  void skills;
  return rest;
}

/** Trim a company to the search_person summary shape. */
function compactCompany(company: CompanyInfo): Record<string, unknown> {
  return {
    company_id: company.company_id,
    name: company.name,
    website: company.website,
    domain: company.domain,
    industry: company.industry,
    employee_count: company.employee_count,
    employee_range: company.employee_range,
    location: company.location,
    revenue_range_printed: company.revenue_range_printed,
    founded: company.founded,
    linkedin_url: company.linkedin_url,
  };
}

export async function bulkEnrichPerson(
  client: ProspeoAPIClient,
  input: BulkEnrichPersonInput
): Promise<{ type: "text"; text: string }> {
  logger.info("Tool: bulk_enrich_person called", {
    count: input.data.length,
    enrich_mobile: input.enrich_mobile,
  });

  // Identifier defaulting: prefer explicit identifier, then person_id, then idx-N.
  const data = input.data.map((record, idx) => {
    const { identifier, ...rest } = record;
    const resolvedIdentifier = identifier ?? record.person_id ?? `idx-${idx}`;
    return {
      identifier: resolvedIdentifier,
      ...rest,
    };
  });

  const requestBody = {
    data,
    only_verified_email: input.only_verified_email ?? false,
    enrich_mobile: input.enrich_mobile ?? false,
    only_verified_mobile: input.only_verified_mobile ?? false,
  };

  let response: BulkEnrichPersonAPIResponse;

  try {
    response = await client.post<BulkEnrichPersonAPIResponse>("/bulk-enrich-person", requestBody);
  } catch (err) {
    const error = buildUnexpectedError(err);
    logger.error("bulk_enrich_person: network error", { error });
    return { type: "text", text: formatErrorText(error) };
  }

  if (response.error) {
    const error = buildApiError(response.error_code ?? "UNKNOWN", response.filter_error);
    logger.warn("bulk_enrich_person: API returned error", { error_code: response.error_code });
    return { type: "text", text: formatErrorText(error) };
  }

  const matched = (response.matched ?? []).map((m) => ({
    identifier: m.identifier,
    free_enrichment: m.free_enrichment ?? false,
    person: m.person ? compactPerson(m.person) : null,
    company: m.company ? compactCompany(m.company) : null,
  }));

  logger.info("bulk_enrich_person: success", {
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
