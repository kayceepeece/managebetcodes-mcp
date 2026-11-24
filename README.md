# `@managebetcodes/mcp`

[![Manage Bet Codes MCP connector](https://glama.ai/mcp/connectors/app.managebetcodes.api/manage-bet-codes/badges/score.svg)](https://glama.ai/mcp/connectors/app.managebetcodes.api/manage-bet-codes)

Official Model Context Protocol (MCP) server for the [Manage Bet Codes Public API v1](https://managebetcodes.app/docs), published and maintained by Manage Bet Codes (https://managebetcodes.app). This repository is the official source of the npm package `@managebetcodes/mcp` and of the Official MCP Registry entry `app.managebetcodes/managebetcodes-mcp`.

Zero runtime dependencies. Works with Claude Desktop, Cursor, Windsurf, Zed, OpenCode, and any MCP host over `stdio`, or connect directly to the remote Streamable HTTP endpoint at `https://api.managebetcodes.app/v1/mcp`.

## Get an API key

Paid actions need an API key. Catalogs and usage cost 0 credits. Event search, event markets, and pick resolution spend work units against the daily cap: one per query, one per market call, and one per pick. Free accounts carry no search charge.

1. Create a free account at https://managebetcodes.app (no card needed).
2. Open the API dashboard at https://managebetcodes.app/dashboard/api and create a key. Keys start with `mbc_live_`.
3. Every free account includes **5 API action credits for life**, so you can test paid actions before buying anything.

Credit costs per action: view slip 1, slip image 2, convert 2 per target bookmaker, split 2 plus 1 per extra code created, merge per code (see `mbc_merge_codes` below), book 2 per code created, start tracking 1. Failed actions cost 0 credits; charges for targets that fail are refunded automatically.

More credits: buy a credit pack (1,000 credits for ₦1,199, 5,000 for ₦4,999, 15,000 for ₦12,999, packs never expire) or a plan (Developer ₦4,999 for 5,000 credits, Scale ₦9,999 for 12,000 credits, Business ₦19,999 for 30,000 credits) from the billing page after signing in. International users can also subscribe through RapidAPI: https://rapidapi.com/peacekcejenobi/api/manage-bet-codes-api

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

If your MCP host supports remote HTTP servers, no local package is required. The remote endpoint authenticates with the `X-API-Key` header (there is no Bearer token):

```json
{
  "mcpServers": {
    "managebetcodes": {
      "url": "https://api.managebetcodes.app/v1/mcp",
      "headers": {
        "X-API-Key": "mbc_live_your_key"
      }
    }
  }
}
```

The endpoint answers `initialize` and `tools/list` without a key. Tool calls that spend credits need the header above.

## Supported bookmakers and regions

45 bookmakers. Bookmaker keys are the values you pass as `bookmaker`, `from_bookmaker`, and target parameters.

Nigeria and international (these 29 are also the default conversion targets):

| Key | Bookmaker |
|---|---|
| `onexbet` | 1xBet (Nigeria) |
| `onexbet_global` | 1xBet Global |
| `afropari_ng` | Afropari (Nigeria) |
| `afropari_global` | Afropari Global |
| `bet9ja` | Bet9ja |
| `22bet` | 22Bet |
| `betjam` | BetJam |
| `betking` | BetKing |
| `betway` | Betway |
| `betwinner` | Betwinner |
| `1xbit` | 1xBit |
| `dbbet` | DBbet |
| `fastpari` | Fastpari |
| `football.com` | Football.com |
| `goldpari` | Goldpari |
| `helabet` | Helabet |
| `linebet` | Linebet |
| `luckypari` | Luckypari |
| `megapari` | Megapari |
| `melbet` | Melbet |
| `msport` | MSport |
| `paripesa` | Paripesa |
| `paripulse` | Paripulse |
| `planbet` | Planbet |
| `sportybet` | SportyBet (Nigeria) |
| `888starz` | 888starz |
| `winwinbet` | WinwinBet |
| `xparibet` | Xparibet |
| `fansport` | FanSport |

Regional variants (full view, split, merge, and conversion support):

| Key | Bookmaker |
|---|---|
| `onexbet_gh` | 1xBet Ghana |
| `onexbet_ke` | 1xBet Kenya |
| `onexbet_tz` | 1xBet Tanzania |
| `onexbet_zm` | 1xBet Zambia |
| `sportybet_gh` | SportyBet Ghana |
| `sportybet_ke` | SportyBet Kenya |
| `sportybet_za` | SportyBet South Africa |
| `sportybet_tz` | SportyBet Tanzania |
| `betway_gh` | Betway Ghana |
| `betway_tz` | Betway Tanzania |
| `betway_zm` | Betway Zambia |
| `betway_mw` | Betway Malawi |
| `betway_mz` | Betway Mozambique |
| `betway_bw` | Betway Botswana |
| `msport_gh` | MSport Ghana |

Source-only bookmaker (you can view its codes and convert FROM it; you cannot convert TO it or book on it):

| Key | Bookmaker |
|---|---|
| `stake` | Stake |

Notes:

- Live tracking works only on SportyBet (Nigeria and regional variants), Football.com, and Betway (Nigeria and regional variants).
- Aliases are accepted in place of keys (for example `1xng` for `onexbet`). Call `mbc_list_bookmakers` for the live list of keys, aliases, and capability flags.

## Included Tools (16)

Required parameters are marked with `*`.

- `mbc_list_bookmakers`: List all 45 bookmakers, canonical keys, aliases, and capability flags (0 credits). Parameters: none.
- `mbc_list_markets`: List canonical markets and valid outcomes (0 credits). Names only; a bookmaker may list only some of them. Parameters: none.
- `mbc_get_usage`: Check plan, `charge_order`, API credits, regular daily credits, and rate limits (0 credits). Parameters: none.
- `mbc_view_slip`: Inspect a slip's games, markets, odds, scores, and kickoff times (1 credit after success). Parameters: `code*` (string), `bookmaker*` (string).
- `mbc_view_slip_image`: Render a branded PNG slip image as MCP `ImageContent` (2 credits after success). Parameters: `code*`, `bookmaker*`.
- `mbc_convert_code`: Convert 1 code to 1 to 6 target bookmakers (2 credits per successful target; failed targets refunded). Parameters: `code*`, `from_bookmaker*`, `to_bookmakers*` (array of bookmaker keys).
- `mbc_convert_to_all`: Convert 1 code to all 29 default target bookmakers at once, or to a custom subset (2 credits per successful target). Parameters: `code*`, `from_bookmaker*`, `targets` (array, optional), `include_card` (boolean, optional).
- `mbc_bulk_convert`: Bulk convert 2 to 4 source codes across selected or all bookmakers (2 credits per successful pair). Parameters: `codes*` (array), `targets` (array, optional), `include_card` (boolean, optional).
- `mbc_split_code`: Split 1 code into 2 to 20 codes on the same bookmaker (2 credits plus 1 per extra created code). Parameters: `code*`, `bookmaker*`, `method` (`equal`, `by_batches`, `target_odds`, or `custom`), `order` (`mixed` or `by_start_time`), `count` (integer, for `equal` and `by_batches`), `target_odds` (number, for `target_odds`), `counts` (array of integers, for `custom`).
- `mbc_merge_codes`: Merge 2 to 30 `(bookmaker, code)` pairs into 1 deduplicated code. Pricing: 2 credits cover the first code (one already on the target bookmaker if any); each other code adds 1 credit if it is on the target bookmaker or 2 if it is from a different bookmaker; refunded if no code is created. Parameters: `pairs*` (array of `{bookmaker, code}` objects), `target` (bookmaker key, optional).
- `mbc_search_events`: Batch search up to 20 team or fixture queries with markets (1 work unit per query against the daily cap; costs 0 credits). Parameters: `bookmaker*`, `queries*` (array of strings, for example `"Arsenal vs Chelsea"`), `sport` (optional), `include_markets` (boolean, optional), `market_filter` (array, optional).
- `mbc_get_event_markets`: List market names, then fetch one or more markets or a filtered view with live odds (1 work unit per call against the daily cap; costs 0 credits). Parameters: `bookmaker*`, `event_id*`, `view` (`canonical` or `all`), `market` (name or substring), `q` (substring), `names_only` (boolean). A bare `view=all` is rejected; call `names_only=true` first. Repeat `market=` to read several names in one call; the response lists the missing names in `not_found`.
- `mbc_resolve_picks`: Validate 1 to 50 games into a 10-minute `plan_id` (1 work unit per pick against the daily cap; costs 0 credits). Parameters: `bookmaker*`, `picks*` (array of game objects; each pick carries `event_id` plus either `key` from `mbc_get_event_markets` or a canonical `market` and `outcome`, and optional line or odds), `strict` (boolean, optional), `accept_odds_change` (boolean, optional).
- `mbc_book_code`: Mint a verified booking code on 1 to 6 targets from a `plan_id` or direct `picks` (2 credits per code created). Parameters: `plan_id` (from `mbc_resolve_picks`) or `picks`, plus `bookmaker` (the brand that minted a key, needed for cross-family fan-out; include team names when the target event_id differs) or `to` (targets), `strict` and `accept_odds_change` (optional).
- `mbc_manage_tracking`: Start (1 credit), inspect, list, or stop live match tracking on SportyBet, Football.com, and Betway. Parameters: `action*` (`start`, `get`, `list`, or `stop`), `code` and `bookmaker` (for `start`), `track_id` (for `get` and `stop`), `mode` (`ticket` or `game`, for `start`), `label`, `webhook_url`, `status` (optional).
- `mbc_manage_jobs_and_history`: Create, poll, or cancel async jobs (bulk jobs need a Developer, Scale, or Business plan), or query conversion and book history (reads cost 0 credits). Parameters: `action*`, `job_payload` (object, for job creation), `job_id`, `row_id`, `limit`, `offset`, `status`, `bookmaker`, `target` (optional filters).

### Examples

View a SportyBet slip:

```json
{ "bookmaker": "sportybet", "code": "QFXM60" }
```

Convert that code to Bet9ja:

```json
{ "code": "QFXM60", "from_bookmaker": "sportybet", "to_bookmakers": ["bet9ja"] }
```

Split it into two codes on SportyBet:

```json
{ "code": "QFXM60", "bookmaker": "sportybet", "method": "equal", "count": 2 }
```

Merge two codes onto SportyBet:

```json
{
  "pairs": [
    { "bookmaker": "sportybet", "code": "QFXM60" },
    { "bookmaker": "bet9ja", "code": "ABC123" }
  ],
  "target": "sportybet"
}
```

Book games in two steps: call `mbc_resolve_picks` with the games, then pass the returned `plan_id` to `mbc_book_code`:

```json
{ "plan_id": "<plan_id from mbc_resolve_picks>", "to": ["bet9ja"] }
```

## Documentation

- API documentation: https://managebetcodes.app/docs
- MCP guide and JSON-RPC reference: https://managebetcodes.app/docs/sdk/mcp
- MCP landing page: https://managebetcodes.app/mcp
- OpenAPI spec: https://api.managebetcodes.app/v1/openapi.json

## Legal, age, and responsible use

- **18+ only.** Betting is restricted to adults. Do not use this server if you are under the legal betting age in your jurisdiction.
- **Jurisdiction.** Betting laws differ by country and region, and online betting is restricted or prohibited in some places. You are responsible for complying with the laws that apply to you. The supported bookmakers operate mainly in Nigeria, Ghana, Kenya, Tanzania, Zambia, South Africa, Malawi, Mozambique, and Botswana.
- **Utility only.** Manage Bet Codes is a software utility. It does not accept bets, hold stakes or customer funds, or pay winnings. It reads booking codes, converts them between bookmakers, and creates new codes; any bet is placed by you, on the bookmaker's own platform, under that bookmaker's terms.
- **No guarantee.** Odds, markets, and availability change. A converted or booked code can differ from the original slip, and nothing in this server is betting advice or a promise of profit.
- Terms of Use: https://managebetcodes.app/terms
- Responsible Betting: https://managebetcodes.app/responsible-betting

## License

MIT. See `LICENSE` in this repository. The hosted API service itself is a commercial service governed by the Terms of Use above.
