/**
 * Configuration module — validates required environment variables at startup.
 * Fails fast with a clear message if PROSPEO_API_KEY is missing.
 */

export interface ProspeoConfig {
  apiKey: string;
  /** Base URL for the Prospeo public API (no trailing slash) */
  apiBaseUrl: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Log level: DEBUG | INFO | WARN | ERROR */
  logLevel: string;
}

/**
 * Load and validate config from environment variables.
 * Throws if required variables are missing.
 */
export function loadConfig(): ProspeoConfig {
  const apiKey = process.env.PROSPEO_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "[Prospeo MCP] Missing required environment variable: PROSPEO_API_KEY\n" +
        "Set it with: claude mcp add prospeo --env PROSPEO_API_KEY=<your_key> -- npx -y @prospeo/mcp-server\n" +
        "Get your API key at: https://app.prospeo.io/api-management"
    );
  }

  return {
    apiKey: apiKey.trim(),
    apiBaseUrl: (process.env.PROSPEO_API_BASE_URL || "https://api.prospeo.io").replace(/\/$/, ""),
    timeoutMs: parseInt(process.env.PROSPEO_TIMEOUT || "30000", 10),
    logLevel: (process.env.LOG_LEVEL || "INFO").toUpperCase(),
  };
}
