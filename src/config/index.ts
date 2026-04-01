/**
 * Configuration module — validates required environment variables at startup.
 * Fails fast with a clear message if PROSPEO_API_KEY is missing.
 */

/** Server-level config (no per-user API key) — shared by all sessions in HTTP mode. */
export interface ServerConfig {
  /** Base URL for the Prospeo public API (no trailing slash) */
  apiBaseUrl: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Log level: DEBUG | INFO | WARN | ERROR */
  logLevel: string;
}

/** Full config including user API key — used by the API client. */
export interface ProspeoConfig extends ServerConfig {
  apiKey: string;
}

/**
 * Load server-level config from environment variables (everything except API key).
 */
export function loadServerConfig(): ServerConfig {
  return {
    apiBaseUrl: (process.env.PROSPEO_API_BASE_URL || "https://api.prospeo.io").replace(/\/$/, ""),
    timeoutMs: parseInt(process.env.PROSPEO_TIMEOUT || "30000", 10),
    logLevel: (process.env.LOG_LEVEL || "INFO").toUpperCase(),
  };
}

/**
 * Load and validate full config from environment variables (stdio mode).
 * Throws if required variables are missing.
 */
export function loadConfig(): ProspeoConfig {
  const apiKey = process.env.PROSPEO_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "[Prospeo MCP] Missing required environment variable: PROSPEO_API_KEY\n" +
        "Set it via your MCP client's config, e.g.: PROSPEO_API_KEY=<your_key> npx -y @prospeo/prospeo-mcp-server\n" +
        "Get your API key at: https://app.prospeo.io/api"
    );
  }

  return {
    apiKey: apiKey.trim(),
    ...loadServerConfig(),
  };
}
