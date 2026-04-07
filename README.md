# Prospeo MCP Server

Official [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for [Prospeo](https://prospeo.io) — giving AI tools native access to B2B lead search and enrichment.

Works with any MCP-compatible client: **Claude**, **Cursor**, **Windsurf**, **Claude Code**, and more.

## Features

- **Enrich Person** — Find professional email and mobile phone from a name, LinkedIn URL, or email
- **Enrich Company** — Get full company profile: headcount, industry, revenue, tech stack, funding, social links
- **Search People** — Query Prospeo's professional database with filters (job title, seniority, location, company size, etc.)
- **Search Companies** — Query Prospeo's company database with filters (industry, headcount, technology, revenue, etc.)
- **Account Info** — Check credits remaining, plan, and renewal date (free, no credits consumed)

## Quick Start

### Option 1: Hosted Server (Recommended)

Connect directly to Prospeo's hosted MCP server — no installation needed.

**Server URL:**
```
https://mcp.prospeo.io
```

Authentication is handled via OAuth or by passing your API key in the `X-KEY` header. Supported by Claude.ai, Claude Desktop, and other remote MCP clients.

### Option 2: Local via npx

Run the server locally in stdio mode. Requires [Node.js](https://nodejs.org) 18+.

#### Claude Code

```bash
claude mcp add prospeo --env PROSPEO_API_KEY=your_api_key -- npx -y @prospeo/prospeo-mcp-server
```

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prospeo": {
      "command": "npx",
      "args": ["-y", "@prospeo/prospeo-mcp-server"],
      "env": {
        "PROSPEO_API_KEY": "your_api_key"
      }
    }
  }
}
```

#### Cursor / Windsurf

Add to your MCP settings (refer to your client's documentation):

```json
{
  "prospeo": {
    "command": "npx",
    "args": ["-y", "@prospeo/prospeo-mcp-server"],
    "env": {
      "PROSPEO_API_KEY": "your_api_key"
    }
  }
}
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PROSPEO_API_KEY` | Yes (stdio mode) | — | Your Prospeo API key. Get one at [app.prospeo.io/api](https://app.prospeo.io/api) |
| `LOG_LEVEL` | No | `INFO` | Logging level: `DEBUG`, `INFO`, `WARN`, `ERROR` |

## Tools

### enrich_person

Find the professional email address and/or mobile phone number for a person.

**Required input** (at least one):
- `linkedin_url` — Person's LinkedIn profile URL
- `email` — Known email address
- `first_name` + `last_name` + `company_name` or `company_website`

### enrich_company

Get a full company profile including headcount, industry, revenue, tech stack, funding, and social links.

**Required input** (at least one):
- `company_website` (recommended, most accurate)
- `company_name`
- `company_linkedin_url`

### search_person

Search Prospeo's professional database using typed filters. Returns up to 25 results per page. Costs 1 credit per page of results.

**Filters include:** `person_job_title`, `person_seniority`, `person_location_search`, `company_industry`, `company_headcount_range`, `company_technology`, and more.

### search_company

Search Prospeo's company database using typed filters. Returns up to 25 results per page. Costs 1 credit per page of results.

**Filters include:** `company_industry`, `company_headcount_range`, `company_location_search`, `company_technology`, `company_revenue`, `company_funding`, and more.

### get_account_info

Check your Prospeo account status — credits remaining, plan name, renewal date, and team size. Free endpoint, no credits consumed.

## Examples

### Example 1: Find someone's email from LinkedIn

**Prompt:**
> Find the professional email for the person at linkedin.com/in/johndoe

**What happens:** The server calls `enrich_person` with the LinkedIn URL and returns the person's verified professional email, current job title, company, and phone number if available.

### Example 2: Research a company before outreach

**Prompt:**
> Give me a full profile of stripe.com — headcount, funding, tech stack, everything

**What happens:** The server calls `enrich_company` with the domain and returns the company's industry, employee count, revenue range, technologies used, funding rounds, social links, and headquarters location.

### Example 3: Build a lead list with filters

**Prompt:**
> Find VP-level people in SaaS companies with 50-200 employees in the US

**What happens:** The server calls `search_person` with seniority, industry, headcount, and location filters. Returns up to 25 matching professionals per page with name, title, company, email, and LinkedIn URL.

### Example 4: Find companies using a specific technology

**Prompt:**
> Search for companies that use Salesforce and have more than 500 employees

**What happens:** The server calls `search_company` with technology and headcount filters. Returns matching companies with domain, industry, size, location, and tech stack details.

### Example 5: Check remaining credits

**Prompt:**
> How many Prospeo credits do I have left?

**What happens:** The server calls `get_account_info` and returns your current plan, credits remaining, renewal date, and team size — without consuming any credits.

## Authentication

### Hosted server (mcp.prospeo.io)

The hosted server supports two authentication methods:

1. **OAuth 2.0** — Used by Claude.ai and Claude Desktop. The OAuth consent flow is handled automatically when connecting through the MCP directory.
2. **API Key header** — Pass your API key in the `X-KEY` header for direct programmatic access.

### Local server (stdio mode)

Pass your API key via the `PROSPEO_API_KEY` environment variable. The server validates the key on startup and exits with a clear error if it's missing.

## Privacy Policy

See our privacy policy: [https://prospeo.io/privacy-policy](https://prospeo.io/privacy-policy)

## Support

- Email: [support@prospeo.io](mailto:support@prospeo.io)
- Helpdesk: [https://help.prospeo.io](https://help.prospeo.io)
- MCP Documentation: [https://prospeo.io/mcp-docs](https://prospeo.io/mcp-docs)
- REST API Documentation: [https://prospeo.io/api-docs](https://prospeo.io/api-docs)
- Issues: [https://github.com/prospeo-v2/prospeo-mcp-server/issues](https://github.com/prospeo-v2/prospeo-mcp-server/issues)

## License

MIT
