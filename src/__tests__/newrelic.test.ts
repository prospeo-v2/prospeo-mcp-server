import { describe, expect, it } from "vitest";
import { mcpMessageAttributes } from "../utils/newrelic.js";

const message = (method: unknown, params?: unknown) => ({ jsonrpc: "2.0", id: 1, method, params });

describe("mcpMessageAttributes", () => {
  it("adds the tool name to tool calls", () => {
    expect(mcpMessageAttributes(message("tools/call", { name: "enrich_person", arguments: {} }))).toEqual({
      "mcp.method": "tools/call",
      "mcp.tool": "enrich_person",
    });
  });

  it("omits the tool name when a tool call has none", () => {
    expect(mcpMessageAttributes(message("tools/call", {}))).toEqual({ "mcp.method": "tools/call" });
  });

  it.each(["initialize", "tools/list", "notifications/initialized"])("keeps only the method for %s", method => {
    expect(mcpMessageAttributes(message(method, { name: "not-a-tool" }))).toEqual({ "mcp.method": method });
  });

  it.each([undefined, null, "text", [message("tools/call")], { id: 1 }, message(7)])(
    "returns no attributes for a body without a single method: %j",
    body => {
      expect(mcpMessageAttributes(body)).toEqual({});
    },
  );
});
