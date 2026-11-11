import { describe, expect, it } from "vitest";
import { describeMcpMessage } from "../utils/newrelic.js";

describe("describeMcpMessage", () => {
  it("names the tool on tool calls", () => {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "enrich_person", arguments: {} } };
    expect(describeMcpMessage(body)).toEqual({ "mcp.method": "tools/call", "mcp.tool": "enrich_person" });
  });

  it.each(["initialize", "tools/list", "notifications/initialized"])("records only the method for %s", method => {
    expect(describeMcpMessage({ jsonrpc: "2.0", method, params: { name: "ignored" } })).toEqual({ "mcp.method": method });
  });

  it.each([undefined, null, "text", [{ method: "tools/call" }], { id: 1 }, { method: 7 }])(
    "records nothing for %j",
    body => {
      expect(describeMcpMessage(body)).toEqual({});
    },
  );
});
