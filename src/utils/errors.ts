/**
 * Structured error handling for the Prospeo MCP server.
 *
 * Maps Prospeo API error codes to human-readable messages,
 * categories, and severity levels so AI agents get actionable feedback.
 */

import type { ErrorCategory, ErrorSeverity, ProspeoError } from "../types.js";

// ---------------------------------------------------------------------------
// Error code → friendly message map
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_CREDITS: "Your Prospeo account has insufficient credits. Please upgrade your plan or wait for the next billing cycle.",
  INVALID_DATAPOINTS: "The data provided is invalid or insufficient to perform enrichment. Provide at least one identifying field (linkedin_url, email, or full_name + company).",
  INVALID_REQUEST: "The request is malformed. Check that all required fields are present and correctly formatted.",
  INVALID_FILTERS: "One or more search filters are invalid. Check the filter names and values.",
  RATE_LIMIT_EXCEEDED: "API rate limit exceeded. Please wait before making more requests.",
  INTERNAL_ERROR: "Prospeo encountered an internal error. Please try again.",
  INVALID_API_KEY: "Invalid API key. Check your PROSPEO_API_KEY environment variable.",
  ACCOUNT_RESTRICTED: "Your account is currently restricted. Please contact support@prospeo.io.",
};

// ---------------------------------------------------------------------------
// Error code → category + severity
// ---------------------------------------------------------------------------

interface ErrorMeta {
  category: ErrorCategory;
  severity: ErrorSeverity;
}

const ERROR_META: Record<string, ErrorMeta> = {
  INSUFFICIENT_CREDITS: { category: "api_client_error", severity: "high" },
  INVALID_DATAPOINTS: { category: "validation", severity: "low" },
  INVALID_REQUEST: { category: "validation", severity: "low" },
  INVALID_FILTERS: { category: "validation", severity: "low" },
  RATE_LIMIT_EXCEEDED: { category: "rate_limit", severity: "medium" },
  INTERNAL_ERROR: { category: "api_server_error", severity: "high" },
  INVALID_API_KEY: { category: "configuration", severity: "critical" },
  ACCOUNT_RESTRICTED: { category: "api_client_error", severity: "critical" },
};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Build a ProspeoError from an API error_code string.
 * Falls back to sensible defaults for unknown codes.
 */
export function buildApiError(errorCode: string, filterError?: string): ProspeoError {
  const meta = ERROR_META[errorCode] ?? { category: "unknown" as ErrorCategory, severity: "medium" as ErrorSeverity };
  const baseMessage = ERROR_MESSAGES[errorCode] ?? `API error: ${errorCode}`;
  const message = filterError ? `${baseMessage} Detail: ${filterError}` : baseMessage;

  return { message, code: errorCode, ...meta };
}

/**
 * Build a ProspeoError from an unexpected JS exception (network timeout, parse failure, etc.)
 */
export function buildUnexpectedError(err: unknown): ProspeoError {
  const message = err instanceof Error ? err.message : String(err);

  // Classify common network errors
  if (message.includes("fetch") || message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT")) {
    return {
      message: `Network error contacting Prospeo API: ${message}`,
      code: "NETWORK_ERROR",
      category: "api_server_error",
      severity: "high",
    };
  }

  if (message.includes("timeout") || message.includes("AbortError")) {
    return {
      message: "Request to Prospeo API timed out. Please try again.",
      code: "TIMEOUT",
      category: "api_server_error",
      severity: "medium",
    };
  }

  return {
    message: `Unexpected error: ${message}`,
    code: "UNKNOWN",
    category: "unknown",
    severity: "medium",
  };
}

/**
 * Format a ToolResult error into an MCP-compatible text response.
 * Returns a plain string that AI agents can read and act on.
 */
export function formatErrorText(error: ProspeoError): string {
  return JSON.stringify({ success: false, error }, null, 2);
}
