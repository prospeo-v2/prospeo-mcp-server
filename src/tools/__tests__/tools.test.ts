import { describe, it, expect, vi } from "vitest";
import { searchPerson } from "../search-person.js";
import { searchCompany } from "../search-company.js";
import { enrichPerson } from "../enrich-person.js";
import { enrichCompany } from "../enrich-company.js";
import { searchSuggestions } from "../search-suggestions.js";
import { bulkEnrichPerson } from "../bulk-enrich-person.js";
import { bulkEnrichCompany } from "../bulk-enrich-company.js";
import {
  SearchPersonSchema,
  BulkEnrichPersonSchema,
  BulkEnrichCompanySchema,
  SearchSuggestionsSchema,
} from "../../schemas.js";
import type { ProspeoAPIClient } from "../../utils/api-client.js";

// Helper to create a minimal mock client
function mockClient(returnValue: unknown): ProspeoAPIClient {
  return { post: vi.fn().mockResolvedValue(returnValue) } as unknown as ProspeoAPIClient;
}

// ─── Test 1: searchPerson returns paginated results on success ────────────────
describe("searchPerson", () => {
  it("returns paginated results when API responds successfully", async () => {
    const client = mockClient({
      error: false,
      results: [{ person_id: "p1", first_name: "Alice" }],
      pagination: { total_count: 1, current_page: 1 },
    });

    const result = await searchPerson(client, { filters: { person_job_title: { include: ["Engineer"] } } });
    const parsed = JSON.parse(result.text);

    expect(result.type).toBe("text");
    expect(parsed.success).toBe(true);
    expect(parsed.data.results).toHaveLength(1);
    expect(parsed.data.pagination.total_count).toBe(1);
  });

  // ─── Test 2: searchPerson propagates API error ────────────────────────────
  it("returns error text when API responds with an error code", async () => {
    const client = mockClient({ error: true, error_code: "INVALID_FILTERS" });

    const result = await searchPerson(client, { filters: { person_job_title: { include: ["Engineer"] } } });
    const parsed = JSON.parse(result.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("INVALID_FILTERS");
  });
});

// ─── Test 3: searchCompany returns results on success ─────────────────────────
describe("searchCompany", () => {
  it("returns paginated company results on success", async () => {
    const client = mockClient({
      error: false,
      results: [{ company: { company_id: "c1", name: "Acme", website: "https://acme.com" } }],
      pagination: { total_count: 1, current_page: 1 },
    });

    const result = await searchCompany(client, { filters: { company_industry: { include: ["Software"] } } });
    const parsed = JSON.parse(result.text);

    expect(parsed.success).toBe(true);
    expect(parsed.data.results[0].company.name).toBe("Acme");
  });
});

// ─── Test 4: enrichPerson returns not-found when person is absent ─────────────
describe("enrichPerson", () => {
  it("returns found:false when API returns no person", async () => {
    const client = mockClient({ error: false, person: null });

    const result = await enrichPerson(client, { linkedin_url: "https://linkedin.com/in/nobody" });
    const parsed = JSON.parse(result.text);

    expect(parsed.success).toBe(true);
    expect(parsed.data.found).toBe(false);
  });
});

// ─── Test 5: enrichCompany handles network error ──────────────────────────────
describe("enrichCompany", () => {
  it("returns error text on network failure", async () => {
    const client = {
      post: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    } as unknown as ProspeoAPIClient;

    const result = await enrichCompany(client, { company_website: "acme.com" });
    const parsed = JSON.parse(result.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("NETWORK_ERROR");
  });
});

// ─── Test 6: searchSuggestions routes type to correct request field ───────────
describe("searchSuggestions", () => {
  it("returns location suggestions and includes type/query metadata", async () => {
    const client = mockClient({
      error: false,
      location_suggestions: [{ name: "New York, United States", type: "STATE" }],
    });

    const result = await searchSuggestions(client, { type: "location", query: "new york" });
    const parsed = JSON.parse(result.text);

    expect(parsed.success).toBe(true);
    expect(parsed.data.type).toBe("location");
    expect(parsed.data.query).toBe("new york");
    expect(parsed.data.suggestions).toEqual([{ name: "New York, United States", type: "STATE" }]);
  });

  it("posts to the matching backend field for technology", async () => {
    const post = vi.fn().mockResolvedValue({
      error: false,
      technology_suggestions: ["Snowflake", "Snowplow Analytics"],
    });
    const client = { post } as unknown as ProspeoAPIClient;

    await searchSuggestions(client, { type: "technology", query: "snow" });

    expect(post).toHaveBeenCalledWith("/search-suggestions", { technology_search: "snow" });
  });

  it("returns naics code/label pairs", async () => {
    const client = mockClient({
      error: false,
      naics_suggestions: [{ code: "511210", label: "Software Publishers" }],
    });

    const result = await searchSuggestions(client, { type: "naics", query: "5112" });
    const parsed = JSON.parse(result.text);

    expect(parsed.data.suggestions[0]).toEqual({ code: "511210", label: "Software Publishers" });
  });
});

// ─── Test 7: bulkEnrichPerson identifier default ──────────────────────────────
describe("bulkEnrichPerson", () => {
  it("defaults identifier to person_id when no explicit identifier is given", async () => {
    const post = vi.fn().mockResolvedValue({
      error: false,
      matched: [],
      not_matched: [],
      invalid_datapoints: [],
      total_cost: 0,
    });
    const client = { post } as unknown as ProspeoAPIClient;

    await bulkEnrichPerson(client, {
      data: [{ person_id: "abc123" }, { linkedin_url: "https://linkedin.com/in/foo" }],
    });

    expect(post).toHaveBeenCalledWith(
      "/bulk-enrich-person",
      expect.objectContaining({
        data: [
          expect.objectContaining({ identifier: "abc123", person_id: "abc123" }),
          expect.objectContaining({ identifier: "idx-1", linkedin_url: "https://linkedin.com/in/foo" }),
        ],
      })
    );
  });

  it("surfaces per-record free_enrichment in matched results", async () => {
    const client = mockClient({
      error: false,
      matched: [
        {
          identifier: "abc123",
          free_enrichment: true,
          person: { person_id: "abc123", first_name: "Alice", job_history: [], skills: [] },
          company: { company_id: "c1", name: "Acme" },
        },
      ],
      not_matched: [],
      invalid_datapoints: [],
      total_cost: 0,
    });

    const result = await bulkEnrichPerson(client, { data: [{ person_id: "abc123" }] });
    const parsed = JSON.parse(result.text);

    expect(parsed.data.matched[0].free_enrichment).toBe(true);
    expect(parsed.data.matched[0].identifier).toBe("abc123");
  });
});

// ─── Test 8: bulkEnrichCompany identifier default and full profile passthrough ─
describe("bulkEnrichCompany", () => {
  it("defaults identifier to company_id when no explicit identifier is given", async () => {
    const post = vi.fn().mockResolvedValue({
      error: false,
      matched: [],
      not_matched: [],
      invalid_datapoints: [],
      total_cost: 0,
    });
    const client = { post } as unknown as ProspeoAPIClient;

    await bulkEnrichCompany(client, {
      data: [{ company_id: "ccccabc123" }, { company_website: "acme.com" }],
    });

    expect(post).toHaveBeenCalledWith(
      "/bulk-enrich-company",
      expect.objectContaining({
        data: [
          expect.objectContaining({ identifier: "ccccabc123", company_id: "ccccabc123" }),
          expect.objectContaining({ identifier: "idx-1", company_website: "acme.com" }),
        ],
      })
    );
  });

  it("returns full company profile per match (no compaction)", async () => {
    const client = mockClient({
      error: false,
      matched: [
        {
          identifier: "ccccabc123",
          free_enrichment: false,
          company: {
            company_id: "ccccabc123",
            name: "Acme",
            website: "https://acme.com",
            technology: { primary: ["React", "AWS"] },
            funding: { total_raised: 50000000 },
            attributes: { has_soc2: true },
          },
        },
      ],
      not_matched: [],
      invalid_datapoints: [],
      total_cost: 1,
    });

    const result = await bulkEnrichCompany(client, { data: [{ company_id: "ccccabc123" }] });
    const parsed = JSON.parse(result.text);

    expect(parsed.data.matched[0].company.technology).toEqual({ primary: ["React", "AWS"] });
    expect(parsed.data.matched[0].company.funding.total_raised).toBe(50000000);
    expect(parsed.data.matched[0].company.attributes.has_soc2).toBe(true);
  });

  it("rejects more than 25 records", () => {
    const parsed = BulkEnrichCompanySchema.safeParse({
      data: Array.from({ length: 26 }, (_, i) => ({ company_id: `c${i}` })),
    });
    expect(parsed.success).toBe(false);
  });
});

// ─── Test 9: schema validation — clean break on legacy fields ─────────────────
describe("schema validation", () => {
  it("rejects unknown keys in person_job_title", () => {
    const parsed = SearchPersonSchema.safeParse({
      filters: {
        person_job_title: { include: ["CEO"], match_only_exact_job_titles: true },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid seniority values", () => {
    const parsed = SearchPersonSchema.safeParse({
      filters: { person_seniority: { include: ["VP"] } }, // canonical is "Vice President"
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts new person_search filter with SMART mode", () => {
    const parsed = SearchPersonSchema.safeParse({
      filters: { person_search: { include: ["John"], match_mode: "SMART" } },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects bulk enrich with more than 25 records", () => {
    const parsed = BulkEnrichPersonSchema.safeParse({
      data: Array.from({ length: 26 }, (_, i) => ({ person_id: `p${i}` })),
    });
    expect(parsed.success).toBe(false);
  });

  it("requires search_suggestions query of at least 2 chars", () => {
    const parsed = SearchSuggestionsSchema.safeParse({ type: "technology", query: "s" });
    expect(parsed.success).toBe(false);
  });
});
