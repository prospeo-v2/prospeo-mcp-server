import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { compilePublicTools, loadPublicTools, callPublicTool } from "../public-tools.js";
import { createMCPServer } from "../create-server.js";
import { ProspeoAPIClient } from "../utils/api-client.js";
import { loadServerConfig } from "../config/index.js";

const config = { apiBaseUrl: "https://api.example.test", apiV2Prefix: "/api/v2", timeoutMs: 100, logLevel: "ERROR" };
const row = {
  name: "invoice_list", description: "Read invoices.",
  inputSchema: { type: "object", additionalProperties: false, properties: { page: { type: "integer", minimum: 1 } } },
  endpoint: { method: "POST", path: "/api/v2/tools/invoice-list" },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { "prospeo/approvalRecommended": false },
};
const table = (rows: unknown[] = [row]) => ({ schemaVersion: 1, tools: rows });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("public API configuration", () => {
  it.each([undefined, "/test-api"])("loads prefix %s without changing the legacy base", prefix => {
    vi.stubEnv("PROSPEO_API_V2_PREFIX", prefix);
    vi.stubEnv("PROSPEO_API_BASE_URL", "https://api.example.test/");
    expect(loadServerConfig()).toMatchObject({
      apiBaseUrl: "https://api.example.test", apiV2Prefix: prefix ?? "/api/v2",
    });
  });
});

describe("backend tool catalog", () => {
  it.each(["/api/v2", "/test-api"])("loads credential-free POST metadata under %s", async apiV2Prefix => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(table())));
    vi.stubGlobal("fetch", fetch);
    const bindings = await loadPublicTools({ ...config, apiV2Prefix });
    expect(bindings).toHaveLength(1);
    expect(bindings[0].tool).toEqual({ name: row.name, description: row.description, inputSchema: row.inputSchema, annotations: row.annotations, _meta: row._meta });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://api.example.test${apiV2Prefix}/mcp/tools`);
    expect(init).toMatchObject({ method: "POST", body: "{}" });
    expect(init.headers).not.toHaveProperty("X-KEY");
    expect(init.redirect).toBe("error");
  });

  it.each([null, {}, { schemaVersion: 2, tools: [] }, table([row, row]), table([{ ...row, name: "get_product_help" }]), table([{ ...row, inputSchema: { type: "object" } }])])("degrades atomically for invalid metadata %j", async value => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(value))));
    expect(await loadPublicTools(config)).toEqual([]);
  });

  it.each(["https://other.test/steal", "//other.test/steal", "/../secrets", "/%2e%2e/secrets", "/safe?redirect=bad", "/safe\\bad"]) ("rejects a credential-exfiltration endpoint: %s", path => {
    expect(() => compilePublicTools(table([{ ...row, endpoint: { method: "POST", path } }]))).toThrow();
  });

  it("suppresses all legacy semantic aliases", () => {
    const names = ["enrich_person", "enrich_person_bulk", "enrich_company", "enrich_company_bulk", "get_usage_and_credits", "search_suggestions"];
    expect(compilePublicTools(table(names.map(name => ({ ...row, name }))))).toEqual([]);
  });

  it("degrades on HTTP failure, timeout, and transport failure", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 })).mockRejectedValueOnce(new Error("private transport detail"));
    vi.stubGlobal("fetch", fetch);
    expect(await loadPublicTools(config)).toEqual([]);
    expect(await loadPublicTools(config)).toEqual([]);
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))))));
    expect(await loadPublicTools({ ...config, timeoutMs: 1 })).toEqual([]);
  });
});

describe("generated execution", () => {
  const client = new ProspeoAPIClient({ ...config, apiKey: "test-user-key" });

  it.each([{ page: 0 }, { page: "1" }, { page: true }, { unknown: true }, null, []])("rejects strict arguments before network access: %j", async args => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await callPublicTool(compilePublicTools(table())[0], args, client);
    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["/api/v2/tools/invoice-list", "/test-api/tools/invoice-list"])("forwards the advertised path exactly once: %s", async path => {
    const body = { ok: true, summary: "Invoices found.", payload: { invoices: [] } };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal("fetch", fetch);
    const binding = compilePublicTools(table([{ ...row, endpoint: { method: "POST", path } }]))[0];
    const result = await callPublicTool(binding, { page: 2 }, client);
    expect(result.isError).toBe(false);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(body);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(`https://api.example.test${path}`);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", headers: { "X-KEY": "test-user-key" }, body: '{"page":2}', redirect: "error" });
  });

  it.each([400, 429])("preserves a public HTTP %i as an MCP tool error", async status => {
    const body = { ok: false, code: "REJECTED", message: "Request rejected.", retryable: status === 429 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
    const result = await callPublicTool(compilePublicTools(table())[0], {}, client);
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(body);
  });

  it("does not reflect arbitrary upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private server trace", { status: 500 })));
    const result = await callPublicTool(compilePublicTools(table())[0], {}, client);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private server trace");
  });

  it("supports parameterless GET bindings", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, payload: {} })));
    vi.stubGlobal("fetch", fetch);
    const binding = compilePublicTools(table([{ ...row, endpoint: { method: "GET", path: "/v2/read" } }]))[0];
    expect((await callPublicTool(binding, { page: 1 }, client)).isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    await callPublicTool(binding, {}, client);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "GET", body: undefined });
  });
});

describe("MCP registration", () => {
  it("shares one compiled catalog across connections while keeping keys separate", async () => {
    const publicTools = compilePublicTools(table());
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true, payload: {} })));
    vi.stubGlobal("fetch", fetch);
    for (const key of ["first-key", "second-key"]) {
      const server = createMCPServer(key, config, publicTools);
      const client = new Client({ name: "test", version: "1" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      try {
        const listed = await client.listTools();
        expect(listed.tools).toHaveLength(9);
        expect(listed.tools.filter(tool => tool.name === "get_account_info")).toHaveLength(1);
        expect(listed.tools.find(tool => tool.name === row.name)).not.toHaveProperty("endpoint");
        await client.callTool({ name: row.name, arguments: {} });
        expect(fetch.mock.lastCall?.[1].headers["X-KEY"]).toBe(key);
      } finally { await client.close(); await server.close(); }
    }
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["/api/v2", "/test-api"])("preserves legacy tools and root URLs with prefix %s", async apiV2Prefix => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: false, response: {} })));
    vi.stubGlobal("fetch", fetch);
    const server = createMCPServer("key", { ...config, apiV2Prefix });
    const client = new Client({ name: "test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
    try {
      expect((await client.listTools()).tools).toHaveLength(8);
      await client.callTool({ name: "get_account_info", arguments: {} });
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0][0]).toBe("https://api.example.test/account-information");
    }
    finally { await client.close(); await server.close(); }
  });

  it.skipIf(!process.env.PROSPEO_PUBLIC_TABLE_PATH)("registers the complete enabled catalog using the exact backend artifact", async () => {
    const path = process.env.PROSPEO_PUBLIC_TABLE_PATH!;
    const bindings = compilePublicTools(JSON.parse(readFileSync(path, "utf8")));
    expect(bindings.length).toBeGreaterThan(0);
    expect(bindings.find(binding => binding.tool.name === "tag_list")?.validate({ scope: "deal" }).valid).toBe(true);
    expect(bindings.find(binding => binding.tool.name === "tag_list")?.validate({}).valid).toBe(false);
    expect(bindings.find(binding => binding.tool.name === "find_mobile")?.validate({ data: { person_id: "111111111111111111111111" } }).valid).toBe(true);
    const server = createMCPServer("test-key", config, bindings);
    const client = new Client({ name: "cross-surface-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
    try {
      const listed = (await client.listTools()).tools;
      expect(listed).toHaveLength(bindings.length + 8);
      expect(new Set(listed.map(tool => tool.name)).size).toBe(bindings.length + 8);
      expect(listed.some(tool => tool.name === "get_usage_and_credits")).toBe(false);
      expect(listed.some(tool => tool.name === "get_account_info")).toBe(true);
    } finally { await client.close(); await server.close(); }
  });
});
