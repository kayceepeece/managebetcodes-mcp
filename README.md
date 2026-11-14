# `@managebetcodes/mcp`

Official Model Context Protocol (MCP) server for the [Manage Bet Codes Public API v1](https://managebetcodes.app/docs).

Zero runtime dependencies. Works with Claude Desktop, Cursor, Windsurf, Zed, OpenCode, and any MCP host over `stdio`, or connect directly to the remote Streamable HTTP endpoint at `https://api.managebetcodes.app/v1/mcp`.

## Quick Setup (`stdio`)

Create an API key (`mbc_live_...`) on the [API dashboard](https://managebetcodes.app/dashboard/api) and add this to your MCP configuration (`claude_desktop_config.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "managebetcodes": {
      "command": "npx",
      "args": ["-y", "@managebetcodes/mcp"],
      "env": {
        "MBC_API_KEY": "mbc_live_your_key"
      }
    }
  }
}
```

## Remote Streamable HTTP Setup

If your MCP host supports remote HTTP servers, no local package is required:

```json
{
  "mcpServers": {
    "managebetcodes": {
      "url": "https://api.managebetcodes.app/v1/mcp",
      "headers": {
        "Authorization": "Bearer mbc_live_your_key"
      }
    }
  }
}
```

## Included Tools (16)

- `mbc_list_bookmakers` — List all 29 bookmakers, canonical keys, aliases, and capability flags (0 credits).
- `mbc_list_markets` — List canonical markets and valid outcomes (0 credits).
- `mbc_get_usage` — Check plan, `charge_order`, API credits, regular daily credits, and rate limits (0 credits).
- `mbc_view_slip` — Inspect a slip's games, markets, odds, scores, and kickoff times (1 credit after success).
- `mbc_view_slip_image` — Render a branded PNG slip image as MCP `ImageContent` (2 credits after success).
- `mbc_convert_code` — Convert 1 code to 1–6 target bookmakers (2 credits per successful target).
- `mbc_convert_to_all` — Convert 1 code to all 27 supported target bookmakers at once (2 credits per successful target).
- `mbc_bulk_convert` — Bulk convert 2–4 source codes across selected or all bookmakers (2 credits per successful pair).
- `mbc_split_code` — Split 1 code into 2–20 codes on the same bookmaker using `equal`, `by_batches`, `target_odds`, or `custom` with `mixed` or `by_start_time` order (2 credits + 1 per extra created code).
- `mbc_merge_codes` — Merge 2–30 `(bookmaker, code)` pairs into 1 deduplicated code (2 credits + 1 per extra code).
- `mbc_search_events` — Batch search up to 20 team/fixture queries with markets (0 credits).
- `mbc_get_event_markets` — List all canonical markets and live odds for an `event_id` (0 credits).
- `mbc_resolve_picks` — Validate 1–50 games into a 10-minute `plan_id` (0 credits).
- `mbc_book_code` — Mint a verified booking code on 1–6 targets from a `plan_id` or direct `picks` (2 credits per code).
- `mbc_manage_tracking` — Start (1 credit), inspect, list, or stop live match tracking on SportyBet, Football.com, and Betway.
- `mbc_manage_jobs_and_history` — Create/poll/cancel async jobs or query conversion and book history.
