type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LEVEL_RANK: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  private minLevel: LogLevel;
  private isDev: boolean;

  constructor() {
    const raw = (process.env.LOG_LEVEL || "INFO").toUpperCase() as LogLevel;
    this.minLevel = LEVEL_RANK[raw] !== undefined ? raw : "INFO";
    this.isDev = this.minLevel === "DEBUG";
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= LEVEL_RANK[this.minLevel];
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    if (this.isDev) {
      // Human-readable dev format
      const prefix = `[Prospeo MCP] [${level}]`;
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
      process.stderr.write(`${prefix} ${message}${metaStr}\n`);
    } else {
      // Structured JSON for production
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        service: "prospeo-mcp",
        message,
        ...meta,
      };
      process.stderr.write(JSON.stringify(entry) + "\n");
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write("DEBUG", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write("INFO", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write("WARN", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write("ERROR", message, meta);
  }
}

export const logger = new Logger();
