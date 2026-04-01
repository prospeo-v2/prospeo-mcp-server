import { describe, it, expect, vi } from "vitest";
import { searchPerson } from "../search-person.js";
import { searchCompany } from "../search-company.js";
import { enrichPerson } from "../enrich-person.js";
import { enrichCompany } from "../enrich-company.js";
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
