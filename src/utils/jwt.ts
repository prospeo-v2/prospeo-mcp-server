/**
 * JWT validation module for OAuth 2.0 Bearer token authentication.
 *
 * Uses the `jose` library to verify RS256 JWTs against the authorization
 * server's JWKS endpoint. The JWKS public keys are fetched once and cached
 * in-memory; they auto-refresh when an unknown key ID is encountered or
 * after the cache cooldown period.
 *
 * JWKS initialization is lazy — the keyset is only created when the first
 * Bearer token is validated, not at module import time. This allows the
 * HTTP server to start with X-KEY-only auth even if JWKS_URL is not set.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS_URL = process.env.JWKS_URL || "";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "https://mcp.prospeo.io";
const JWT_ISSUER = process.env.JWT_ISSUER || "https://prod.prospeo.io";

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!_jwks) {
    if (!JWKS_URL) {
      throw new Error(
        "[Prospeo MCP] Missing required environment variable: JWKS_URL (needed for Bearer JWT validation)"
      );
    }
    _jwks = createRemoteJWKSet(new URL(JWKS_URL));
  }
  return _jwks;
}

/**
 * Validate a Bearer JWT token.
 *
 * Verifies the token signature against the JWKS public keys and checks the
 * `aud` (audience), `iss` (issuer), and `exp` (expiration) claims.
 * Only RS256 algorithm is accepted.
 *
 * @param token - The raw JWT string (without "Bearer " prefix)
 * @throws If the token is invalid, expired, or JWKS_URL is not configured
 */
export async function validateBearerToken(token: string): Promise<void> {
  await jwtVerify(token, getJWKS(), {
    audience: JWT_AUDIENCE,
    issuer: JWT_ISSUER,
    algorithms: ["RS256"],
  });
}
