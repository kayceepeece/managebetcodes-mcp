import { randomUUID } from "node:crypto";
import {
  MCP_PROMPTS,
  MCP_RESOURCES,
  MCP_TOOLS,
} from "./catalog.js";

export const VERSION = "1.0.0";
export const BASE_URL = "https://api.managebetcodes.app/v1";
export const SERVER_NAME = "managebetcodes-mcp";

const SUPPORTED_PROTOCOLS = new Set([
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);
const DEFAULT_PROTOCOL = "2025-06-18";
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const NON_RETRYABLE_CODES = new Set([
  "api_quota_exhausted",
  "plan_quota_exhausted",
  "search_quota_exhausted",
]);
const MAX_BACKOFF_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const cap = MAX_BACKOFF_MS / 1000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(0, seconds), cap);
  }
  const when = Date.parse(value);
  if (Number.isNaN(when)) return undefined;
  return Math.min(Math.max(0, (when - Date.now()) / 1000), cap);
}

export interface McpServerOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface HttpError extends Error {
  status?: number;
  code?: string;
  nextAction?: string;
  requestId?: string;
  payload?: Record<string, unknown>;
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function okToolResult(
  summary: string,
  structured: Record<string, unknown>,
  imageB64?: string,
): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [];
  if (imageB64) {
    const raw = imageB64.includes(",") ? imageB64.split(",")[1]! : imageB64;
    content.push({
      type: "image",
      data: raw,
      mimeType: "image/png",
    });
  }
  content.push({
    type: "text",
    text: `${summary}\n\n\`\`\`json\n${JSON.stringify(structured, null, 2)}\n\`\`\``,
  });
  return {
    isError: false,
    content,
    structuredContent: structured,
  };
}

function errorToolResult(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  nextAction?: string,
  requestId?: string,
): Record<string, unknown> {
  const envelope = {
    error: compact({
      code,
      message,
      next_action: nextAction,
      request_id: requestId,
      docs: "https://managebetcodes.app/docs/errors",
      details,
    }),
  };
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Error (${code}): ${message}\n\n\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\``,
      },
    ],
    structuredContent: envelope,
  };
}

export class McpServer {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: McpServerOptions = {}) {
    this.apiKey = (options.apiKey ?? process.env["MBC_API_KEY"] ?? "").trim();
    this.baseUrl = (options.baseUrl ?? process.env["MBC_BASE_URL"] ?? BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.timeoutMs = options.timeoutMs ?? 65_000;
  }

  private async apiRequest(
    method: "GET" | "POST" | "DELETE",
    path: string,
    options: {
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
      authRequired?: boolean;
      rawBytes?: boolean;
    } = {},
  ): Promise<any> {
    if (options.authRequired !== false && !this.apiKey) {
      const err: HttpError = new Error(
        "Missing MBC_API_KEY. Create a key at https://managebetcodes.app/dashboard/api and set MBC_API_KEY.",
      );
      err.code = "invalid_key";
      err.status = 401;
      throw err;
    }

    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(options.query ?? {})) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = {
      Accept: options.rawBytes ? "image/png" : "application/json",
      "User-Agent": `managebetcodes-mcp/${VERSION}`,
    };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    let bodyStr: string | undefined;
    if (options.body !== undefined) {
      bodyStr = JSON.stringify(options.body);
      headers["Content-Type"] = "application/json";
    }
    if (method === "POST") {
      headers["Idempotency-Key"] = `mcp_${randomUUID()}`;
    }

    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: bodyStr,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (RETRY_STATUSES.has(response.status) && attempt < 3) {
        let peek: any = null;
        if (response.status === 429) {
          try {
            peek = await response.clone().json();
          } catch {
            peek = null;
          }
          const code = peek?.error?.code;
          if (typeof code === "string" && NON_RETRYABLE_CODES.has(code)) {
            break;
          }
        }
        const retryAfter = retryAfterSeconds(response.headers.get("retry-after"));
        const delayMs =
          retryAfter === undefined
            ? Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS)
            : retryAfter * 1000;
        await response.body?.cancel();
        await sleep(delayMs);
        continue;
      }

      if (response.ok) {
        if (options.rawBytes) {
          const buf = new Uint8Array(await response.arrayBuffer());
          return {
            bytes: buf,
            base64: Buffer.from(buf).toString("base64"),
            creditsCharged: Number(
              response.headers.get("x-mbc-credits-charged") ?? 2,
            ),
          };
        }
        const text = await response.text();
        return text ? JSON.parse(text) : {};
      }

      let parsed: Record<string, any> | null = null;
      try {
        parsed = (await response.json()) as Record<string, any>;
      } catch {
        parsed = null;
      }
      const errObj = parsed?.["error"] ?? {};
      const err: HttpError = new Error(
        typeof errObj.message === "string"
          ? errObj.message
          : `HTTP ${response.status}`,
      );
      err.status = response.status;
      err.code =
        typeof errObj.code === "string"
          ? errObj.code
          : `http_${response.status}`;
      err.nextAction =
        typeof errObj.next_action === "string" ? errObj.next_action : undefined;
      err.requestId =
        typeof errObj.request_id === "string" ? errObj.request_id : undefined;
      err.payload =
        typeof errObj.details === "object" && errObj.details
          ? errObj.details
          : {};
      throw err;
    }
    throw new Error("Exhausted retries");
  }

  private async callTool(
    name: string,
    args: Record<string, any>,
  ): Promise<Record<string, unknown>> {
    try {
      if (name === "mbc_list_bookmakers") {
        const data = await this.apiRequest("GET", "/bookmakers", {
          authRequired: false,
        });
        return okToolResult(
          `Loaded ${data.count ?? 0} supported bookmakers.`,
          data,
        );
      }

      if (name === "mbc_list_markets") {
        const data = await this.apiRequest("GET", "/markets", {
          authRequired: false,
        });
        return okToolResult(
          `Loaded ${data.count ?? 0} canonical betting markets.`,
          data,
        );
      }

      if (name === "mbc_get_usage") {
        const data = await this.apiRequest("GET", "/usage");
        return okToolResult(
          `Plan: ${data?.plan?.name ?? "Unknown"} (${data?.charge_order ?? "api_first"}) · API credits remaining: ${data?.api_credits?.total_remaining ?? 0}.`,
          data,
        );
      }

      if (name === "mbc_view_slip") {
        const data = await this.apiRequest("GET", "/view", {
          query: { code: args["code"], bookmaker: args["bookmaker"] },
        });
        const gamesCount = Array.isArray(data?.selections)
          ? data.selections.length
          : 0;
        return okToolResult(
          `Slip ${data?.code} on ${data?.bookmaker?.name ?? args["bookmaker"]}: ${gamesCount} games · Total odds: ${data?.total_odds ?? "N/A"}.`,
          data,
        );
      }

      if (name === "mbc_view_slip_image") {
        const res = await this.apiRequest("GET", "/view/image", {
          query: { code: args["code"], bookmaker: args["bookmaker"] },
          rawBytes: true,
        });
        const structured = {
          code: String(args["code"] ?? ""),
          bookmaker: String(args["bookmaker"] ?? ""),
          mime_type: "image/png",
          credits_charged: res.creditsCharged,
        };
        return okToolResult(
          `Rendered PNG slip for ${structured.code} on ${structured.bookmaker} (${res.creditsCharged} credits).`,
          structured,
          res.base64,
        );
      }

      if (name === "mbc_convert_code") {
        const data = await this.apiRequest("POST", "/convert", {
          body: {
            code: args["code"],
            from: args["from_bookmaker"] ?? args["from"],
            to: args["to_bookmakers"] ?? args["to"],
          },
        });
        const summary = data?.target
          ? `Converted ${data?.source?.code} -> ${data?.target?.code} (${data?.target?.name}) · ${data?.counts?.converted}/${data?.counts?.original} games.`
          : `Batch converted ${data?.source?.code}: ${Array.isArray(data?.results) ? data.results.filter((r: any) => r.success).length : 0} target codes created.`;
        return okToolResult(summary, data);
      }

      if (name === "mbc_convert_to_all") {
        const data = await this.apiRequest("POST", "/convert/all", {
          body: compact({
            code: args["code"],
            from: args["from_bookmaker"] ?? args["from"],
            to: args["targets"] ?? args["to"],
            include_card: args["include_card"],
          }),
        });
        return okToolResult(
          `Converted ${args["code"]} to ${data?.successful_pairs ?? 0}/${data?.pairs ?? 0} bookmakers (${data?.credits_charged ?? 0} credits).`,
          data,
          typeof data?.card === "string" ? data.card : undefined,
        );
      }

      if (name === "mbc_bulk_convert") {
        const rawCodes = Array.isArray(args["codes"]) ? args["codes"] : [];
        const codes = rawCodes.map((c: any) => ({
          code: c?.code,
          from: c?.from_bookmaker ?? c?.from ?? c?.source,
        }));
        const data = await this.apiRequest("POST", "/convert/bulk", {
          body: compact({
            codes,
            to: args["targets"] ?? args["to"],
            include_card: args["include_card"],
          }),
        });
        return okToolResult(
          `Bulk converted ${codes.length} slips: ${data?.successful_pairs ?? 0}/${data?.pairs ?? 0} target codes created.`,
          data,
          typeof data?.card === "string" ? data.card : undefined,
        );
      }

      if (name === "mbc_split_code") {
        const data = await this.apiRequest("POST", "/split", {
          body: compact({
            code: args["code"],
            bookmaker: args["bookmaker"],
            count: args["count"] ?? 2,
            pattern: args["method"] ?? args["pattern"] ?? "equal",
            order: args["order"],
            target_odds: args["target_odds"],
            counts: args["counts"],
          }),
        });
        return okToolResult(
          `Split ${data?.source_code} into ${data?.created_count}/${data?.count} codes (${data?.mode_label ?? data?.mode}): ${(data?.new_codes ?? []).join(", ")}.`,
          data,
        );
      }

      if (name === "mbc_merge_codes") {
        const data = await this.apiRequest("POST", "/merge", {
          body: compact({
            pairs: args["pairs"],
            target: args["target"],
          }),
        });
        return okToolResult(
          `Merged ${data?.codes_combined} codes into ${data?.target_code} (${data?.selections_count} games).`,
          data,
        );
      }

      if (name === "mbc_search_events") {
        const data = await this.apiRequest("POST", "/events/search", {
          body: compact({
            bookmaker: args["bookmaker"],
            queries: args["queries"],
            sport: args["sport"] ?? "football",
            include_markets: args["include_markets"] ?? true,
            market_filter: args["market_filter"],
            detail: "agent",
          }),
        });
        return okToolResult(
          `Searched ${Array.isArray(args["queries"]) ? args["queries"].length : 0} queries on ${args["bookmaker"]}.`,
          data,
        );
      }

      if (name === "mbc_get_event_markets") {
        const eventId = encodeURIComponent(String(args["event_id"] ?? ""));
        const data = await this.apiRequest("GET", `/events/${eventId}/markets`, {
          query: { bookmaker: args["bookmaker"] },
        });
        return okToolResult(
          `Loaded ${Array.isArray(data?.markets) ? data.markets.length : 0} markets for ${args["event_id"]}.`,
          data,
        );
      }

      if (name === "mbc_resolve_picks") {
        const data = await this.apiRequest("POST", "/resolve", {
          body: compact({
            bookmaker: args["bookmaker"],
            picks: args["picks"],
            strict: args["strict"] ?? true,
            accept_odds_change: args["accept_odds_change"] ?? false,
            detail: "agent",
          }),
        });
        return okToolResult(
          `Resolved plan ${data?.plan_id} (${data?.status}).`,
          data,
        );
      }

      if (name === "mbc_book_code") {
        const data = await this.apiRequest("POST", "/book", {
          body: compact({
            bookmaker: args["bookmaker"],
            plan_id: args["plan_id"],
            picks: args["picks"],
            to: args["to"],
            strict: args["strict"],
            accept_odds_change: args["accept_odds_change"],
          }),
        });
        return okToolResult(
          `Booked code ${data?.code ?? "fan-out"} (verified: ${data?.verified ?? true}).`,
          data,
        );
      }

      if (name === "mbc_manage_tracking") {
        const action = String(args["action"] ?? "");
        if (action === "start") {
          const data = await this.apiRequest("POST", "/track", {
            body: compact({
              code: args["code"],
              bookmaker: args["bookmaker"] ?? "sportybet",
              mode: args["mode"] ?? "ticket",
              label: args["label"],
              webhook_url: args["webhook_url"],
            }),
          });
          return okToolResult(`Started tracking ${data?.id}.`, data);
        }
        if (action === "get") {
          const id = encodeURIComponent(String(args["track_id"] ?? ""));
          const data = await this.apiRequest("GET", `/track/${id}`);
          return okToolResult(`Track ${data?.id} (${data?.status}).`, data);
        }
        if (action === "stop") {
          const id = encodeURIComponent(String(args["track_id"] ?? ""));
          const data = await this.apiRequest("DELETE", `/track/${id}`);
          return okToolResult(`Stopped track ${id}.`, data);
        }
        if (action === "list") {
          const data = await this.apiRequest("GET", "/tracks", {
            query: { status: args["status"] },
          });
          return okToolResult(`Listed ${data?.count ?? 0} tracks.`, data);
        }
        return errorToolResult("invalid_request", `Unknown tracking action: ${action}`);
      }

      if (name === "mbc_manage_jobs_and_history") {
        const action = String(args["action"] ?? "");
        if (action === "create_job") {
          const data = await this.apiRequest("POST", "/jobs", {
            body: (args["job_payload"] as Record<string, unknown>) ?? {},
          });
          return okToolResult(`Created job ${data?.id}.`, data);
        }
        if (action === "get_job") {
          const id = encodeURIComponent(String(args["job_id"] ?? ""));
          const data = await this.apiRequest("GET", `/jobs/${id}`);
          return okToolResult(`Job ${data?.id} (${data?.status}).`, data);
        }
        if (action === "list_jobs") {
          const data = await this.apiRequest("GET", "/jobs", {
            query: {
              limit: args["limit"],
              offset: args["offset"],
              status: args["status"],
            },
          });
          return okToolResult(`Listed ${(data?.items ?? []).length} jobs.`, data);
        }
        if (action === "cancel_job") {
          const id = encodeURIComponent(String(args["job_id"] ?? ""));
          const data = await this.apiRequest("DELETE", `/jobs/${id}`);
          return okToolResult(`Cancelled job ${id}.`, data);
        }
        if (action === "list_history") {
          const data = await this.apiRequest("GET", "/history", {
            query: {
              limit: args["limit"],
              offset: args["offset"],
              bookmaker: args["bookmaker"],
              target: args["target"],
              status: args["status"],
            },
          });
          return okToolResult(`Listed ${(data?.items ?? []).length} history rows.`, data);
        }
        if (action === "get_history") {
          const id = encodeURIComponent(String(args["row_id"] ?? ""));
          const data = await this.apiRequest("GET", `/history/${id}`);
          return okToolResult(`Loaded history row ${data?.id}.`, data);
        }
        if (action === "list_books") {
          const data = await this.apiRequest("GET", "/books", {
            query: { limit: args["limit"], offset: args["offset"] },
          });
          return okToolResult(`Listed ${(data?.items ?? []).length} books.`, data);
        }
        if (action === "get_book") {
          const id = encodeURIComponent(String(args["row_id"] ?? ""));
          const data = await this.apiRequest("GET", `/books/${id}`);
          return okToolResult(`Loaded book ${data?.id}.`, data);
        }
        return errorToolResult("invalid_request", `Unknown action: ${action}`);
      }

      return errorToolResult("invalid_request", `Unknown tool: ${name}`);
    } catch (err) {
      const httpErr = err as HttpError;
      return errorToolResult(
        httpErr.code ?? "internal_error",
        httpErr.message ?? String(err),
        httpErr.payload ?? {},
        httpErr.nextAction,
        httpErr.requestId,
      );
    }
  }

  private async readResource(uri: string): Promise<Record<string, unknown>> {
    let payload: unknown;
    if (uri === "mbc://catalog/bookmakers") {
      payload = await this.apiRequest("GET", "/bookmakers", { authRequired: false });
    } else if (uri === "mbc://catalog/markets") {
      payload = await this.apiRequest("GET", "/markets", { authRequired: false });
    } else if (uri === "mbc://catalog/capabilities") {
      payload = await this.apiRequest("GET", "/capabilities", { authRequired: false });
    } else if (uri === "mbc://account/usage") {
      payload = await this.apiRequest("GET", "/usage");
    } else {
      throw new Error(`Unknown resource URI: ${uri}`);
    }
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  }

  private getPrompt(
    name: string,
    args: Record<string, string>,
  ): Record<string, unknown> {
    if (name === "convert-to-all-bookmakers") {
      const code = args["code"] ?? "<CODE>";
      const from = args["from_bookmaker"] ?? "sportybet";
      const targets = args["targets"]
        ? ` to targets [${args["targets"]}]`
        : " to all supported bookmakers";
      return {
        description: `Convert ${code} from ${from}${targets}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Call \`mbc_convert_to_all\` with \`code='${code}'\` and \`from_bookmaker='${from}'\`${targets}. Present a table of Bookmaker, Converted Code, Games Converted, Target Odds, and Status. Use 'games' (never 'legs').`,
            },
          },
        ],
      };
    }
    if (name === "bulk-convert-codes") {
      return {
        description: "Bulk convert multiple booking codes",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Parse these source codes: ${args["codes_list"] ?? ""}. Call \`mbc_bulk_convert\` and show the converted codes grouped by each source slip.`,
            },
          },
        ],
      };
    }
    if (name === "split-slip") {
      return {
        description: "Split a booking code into smaller codes",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Split booking code \`${args["code"] ?? ""}\` on \`${args["bookmaker"] ?? "sportybet"}\` using \`mbc_split_code\` with method='${args["method"] ?? "equal"}', order='${args["order"] ?? "mixed"}', and value='${args["value"] ?? "2"}'.`,
            },
          },
        ],
      };
    }
    if (name === "build-slip-from-text") {
      return {
        description: "Resolve games and book a verified slip",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Build a new booking code on \`${args["bookmaker"] ?? "sportybet"}\` for: ${args["picks_text"] ?? ""}. First call \`mbc_resolve_picks\`, confirm any ambiguous games, and then call \`mbc_book_code\` with the plan_id.`,
            },
          },
        ],
      };
    }
    throw new Error(`Unknown prompt: ${name}`);
  }

  async handleMessage(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      return {
        jsonrpc: "2.0",
        id: msg?.id ?? null,
        error: { code: -32600, message: "Invalid JSON-RPC 2.0 request." },
      };
    }

    if (msg.id === undefined || msg.method.startsWith("notifications/")) {
      return null;
    }

    const params = (msg.params ?? {}) as Record<string, any>;

    if (msg.method === "initialize") {
      const requested = String(params["protocolVersion"] ?? DEFAULT_PROTOCOL);
      const negotiated = SUPPORTED_PROTOCOLS.has(requested)
        ? requested
        : DEFAULT_PROTOCOL;
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: negotiated,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: {
            name: SERVER_NAME,
            version: VERSION,
          },
        },
      };
    }

    if (msg.method === "ping") {
      return { jsonrpc: "2.0", id: msg.id, result: {} };
    }

    if (msg.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: MCP_TOOLS },
      };
    }

    if (msg.method === "resources/list") {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { resources: MCP_RESOURCES },
      };
    }

    if (msg.method === "prompts/list") {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { prompts: MCP_PROMPTS },
      };
    }

    if (msg.method === "tools/call") {
      const name = String(params["name"] ?? "");
      const args =
        typeof params["arguments"] === "object" && params["arguments"]
          ? (params["arguments"] as Record<string, any>)
          : {};
      const result = await this.callTool(name, args);
      return { jsonrpc: "2.0", id: msg.id, result };
    }

    if (msg.method === "resources/read") {
      try {
        const result = await this.readResource(String(params["uri"] ?? ""));
        return { jsonrpc: "2.0", id: msg.id, result };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id: msg.id,
          error: {
            code: -32001,
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }

    if (msg.method === "prompts/get") {
      try {
        const result = this.getPrompt(
          String(params["name"] ?? ""),
          (params["arguments"] as Record<string, string>) ?? {},
        );
        return { jsonrpc: "2.0", id: msg.id, result };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id: msg.id,
          error: {
            code: -32602,
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32601, message: `Method not found: '${msg.method}'.` },
    };
  }
}
