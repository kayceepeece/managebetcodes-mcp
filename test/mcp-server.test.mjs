import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { McpServer, MCP_TOOLS, MCP_RESOURCES, MCP_PROMPTS } from "../dist/index.js";

function createMockApi(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const parsed = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: req.method,
      path: req.url,
      headers: req.headers,
      body: parsed,
    });
    const out = handler(req, parsed) ?? { status: 200, json: { ok: true } };
    res.writeHead(out.status ?? 200, {
      "Content-Type": out.contentType ?? "application/json",
      ...(out.headers ?? {}),
    });
    if (out.raw) {
      res.end(out.raw);
    } else {
      res.end(JSON.stringify(out.json ?? { ok: true }));
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}/v1`,
        requests,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

test("initialize, tools/list, resources/list, and prompts/list work and enforce vocabulary rules", async () => {
  const mcp = new McpServer({ apiKey: "mbc_live_test" });

  const init = await mcp.handleMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18" },
  });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(init.result.serverInfo.name, "managebetcodes-mcp");

  const notif = await mcp.handleMessage({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  assert.equal(notif, null);

  const tools = await mcp.handleMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  });
  assert.equal(tools.result.tools.length, 16);
  for (const t of MCP_TOOLS) {
    assert.equal(t.description.toLowerCase().includes("legs"), false, t.name);
  }
  assert.equal(MCP_RESOURCES.length, 4);
  assert.equal(MCP_PROMPTS.length, 4);
});

test("missing API key on paid tool returns actionable isError result", async () => {
  const mcp = new McpServer({ apiKey: "" });
  const res = await mcp.handleMessage({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "mbc_convert_code",
      arguments: {
        code: "7B9A2F",
        from_bookmaker: "sportybet",
        to_bookmakers: "1xng",
      },
    },
  });
  assert.equal(res.result.isError, true);
  assert.equal(res.result.structuredContent.error.code, "invalid_key");
});

test("tools/call maps split, convert_to_all, bulk_convert, and image view to /v1 routes", async (t) => {
  const api = await createMockApi((req) => {
    if (req.url?.startsWith("/v1/view/image")) {
      return {
        status: 200,
        contentType: "image/png",
        headers: { "X-MBC-Credits-Charged": "2" },
        raw: Buffer.from([137, 80, 78, 71]),
      };
    }
    return {
      status: 200,
      json: {
        success: true,
        source_code: "7B9A2F",
        created_count: 2,
        count: 2,
        new_codes: ["SP1", "SP2"],
        successful_pairs: 2,
        pairs: 2,
        credits_charged: 4,
      },
    };
  });
  t.after(() => api.close());

  const mcp = new McpServer({ apiKey: "mbc_live_test", baseUrl: api.baseUrl });

  const splitRes = await mcp.handleMessage({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: {
      name: "mbc_split_code",
      arguments: {
        code: "7B9A2F",
        bookmaker: "sportybet",
        method: "target_odds",
        order: "by_start_time",
        target_odds: 5.0,
      },
    },
  });
  assert.equal(splitRes.result.isError, false);
  assert.deepEqual(splitRes.result.structuredContent.new_codes, ["SP1", "SP2"]);

  const allRes = await mcp.handleMessage({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: {
      name: "mbc_convert_to_all",
      arguments: {
        code: "7B9A2F",
        from_bookmaker: "sportybet",
        targets: ["1xng", "bet9ja"],
      },
    },
  });
  assert.equal(allRes.result.isError, false);

  const bulkRes = await mcp.handleMessage({
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: {
      name: "mbc_bulk_convert",
      arguments: {
        codes: [
          { code: "7B9A2F", from_bookmaker: "sportybet" },
          { code: "B9JA12", from_bookmaker: "bet9ja" },
        ],
        targets: ["1xng"],
      },
    },
  });
  assert.equal(bulkRes.result.isError, false);

  const imgRes = await mcp.handleMessage({
    jsonrpc: "2.0",
    id: 13,
    method: "tools/call",
    params: {
      name: "mbc_view_slip_image",
      arguments: { code: "7B9A2F", bookmaker: "sportybet" },
    },
  });
  assert.equal(imgRes.result.isError, false);
  assert.equal(imgRes.result.content[0].type, "image");
  assert.equal(imgRes.result.content[0].mimeType, "image/png");

  assert.deepEqual(
    api.requests.map((r) => [r.method, r.path.split("?")[0]]),
    [
      ["POST", "/v1/split"],
      ["POST", "/v1/convert/all"],
      ["POST", "/v1/convert/bulk"],
      ["GET", "/v1/view/image"],
    ],
  );
  assert.equal(api.requests[0].body.pattern, "target_odds");
  assert.equal(api.requests[0].body.order, "by_start_time");
  assert.equal(api.requests[0].body.target_odds, 5.0);
});
