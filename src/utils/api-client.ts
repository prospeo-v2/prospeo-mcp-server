import { logger } from "./logger.js";
import type { ProspeoConfig } from "../config/index.js";
import type { ProspeoAPIResponse } from "../types.js";

export class ProspeoAPIClient {
  private readonly config: ProspeoConfig;

  constructor(config: ProspeoConfig) {
    this.config = config;
  }

  /**
   * POST a JSON body to the given Prospeo API path.
   *
   * @param path  - API path, e.g. "/enrich-person"
   * @param body  - Request body object, serialised to JSON
   * @returns Parsed JSON response from Prospeo
   */
  async post<T extends ProspeoAPIResponse>(path: string, body: unknown): Promise<T> {
    const url = `${this.config.apiBaseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    logger.debug(`POST ${url}`, { body });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KEY": this.config.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = (await response.json()) as T;

      logger.debug(`POST ${url} → ${response.status}`, { error: data.error, error_code: data.error_code });

      return data;
    } catch (err) {
      logger.error(`POST ${url} failed`, { error: String(err) });
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * GET the given Prospeo API path (used only for /account-information).
   *
   * @param path - API path, e.g. "/account-information"
   * @returns Parsed JSON response from Prospeo
   */
  async get<T extends ProspeoAPIResponse>(path: string): Promise<T> {
    const url = `${this.config.apiBaseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    logger.debug(`GET ${url}`);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-KEY": this.config.apiKey,
        },
        signal: controller.signal,
      });

      const data = (await response.json()) as T;

      logger.debug(`GET ${url} → ${response.status}`, { error: data.error });

      return data;
    } catch (err) {
      logger.error(`GET ${url} failed`, { error: String(err) });
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
