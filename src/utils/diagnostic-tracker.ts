/**
 * Diagnostic tracking utility for command history and rate limits.
 *
 * Design Decision: In-memory circular buffer
 * Rationale: Simplicity and performance over persistence. Diagnostic data is ephemeral
 * and only useful for recent troubleshooting. No external dependencies required.
 *
 * Trade-offs:
 * - Memory: Limited to 1000 commands (~100KB) vs. unbounded growth
 * - Persistence: Lost on restart vs. SQLite/file-based storage
 * - Performance: O(1) writes vs. disk I/O overhead
 *
 * Future Enhancement: Optional file-based persistence for production deployments
 */

/**
 * Command execution record for tracking successes and failures.
 */
export interface CommandRecord {
  timestamp: Date;
  deviceId: string;
  deviceName?: string;
  capability: string;
  command: string;
  success: boolean;
  error?: string;
  duration?: number;
}

/**
 * Rate limit hit record for tracking 429 errors.
 */
export interface RateLimitHit {
  timestamp: Date;
  endpoint: string;
}

/**
 * Token expiration status information.
 */
export interface TokenStatus {
  createdAt: Date;
  expiresAt: Date;
  remainingMs: number;
  remainingFormatted: string;
  expiringSoon: boolean;
}

/**
 * Rate limit status summary.
 */
export interface RateLimitStatus {
  hitCount: number;
  lastHit: Date | null;
  byEndpoint: Record<string, number>;
  estimatedRemaining: string;
}

/**
 * Diagnostic tracking class for monitoring command executions and rate limits.
 *
 * Singleton pattern for global access across the application.
 *
 * Performance:
 * - recordCommand: O(1) amortized (circular buffer)
 * - getFailedCommands: O(n) where n = history size (max 1000)
 * - getRateLimitStatus: O(m) where m = rate limit hits (typically < 100)
 */
export class DiagnosticTracker {
  private commandHistory: CommandRecord[] = [];
  private rateLimitHits: RateLimitHit[] = [];
  private tokenCreatedAt: Date = new Date();
  private readonly maxHistorySize = 1000;
  private readonly historyRetentionMs = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Record a command execution (success or failure).
   *
   * Automatically maintains circular buffer of last 1000 commands.
   * Cleans entries older than 24 hours.
   *
   * @param record Command execution details
   */
  recordCommand(record: CommandRecord): void {
    this.commandHistory.push(record);

    // Keep only last maxHistorySize items (circular buffer)
    if (this.commandHistory.length > this.maxHistorySize) {
      this.commandHistory = this.commandHistory.slice(-this.maxHistorySize);
    }

    // Clean old entries periodically
    this.cleanOldEntries();
  }

  /**
   * Get failed commands from history.
   *
   * @param limit Maximum number of failed commands to return (default: 50)
   * @returns Array of failed command records in reverse chronological order
   */
  getFailedCommands(limit: number = 50): CommandRecord[] {
    return this.commandHistory
      .filter((cmd) => !cmd.success)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get all commands (success and failure) from history.
   *
   * @param limit Maximum number of commands to return (default: 100)
   * @returns Array of command records in reverse chronological order
   */
  getAllCommands(limit: number = 100): CommandRecord[] {
    return this.commandHistory.slice(-limit).reverse();
  }

  /**
   * Get command success rate statistics.
   *
   * @returns Success rate percentage and counts
   */
  getCommandStats() {
    const totalCommands = this.commandHistory.length;
    const failedCommands = this.commandHistory.filter((cmd) => !cmd.success).length;
    const successRate =
      totalCommands > 0 ? ((totalCommands - failedCommands) / totalCommands) * 100 : 0;

    return {
      totalCommands,
      successfulCommands: totalCommands - failedCommands,
      failedCommands,
      successRate: `${successRate.toFixed(2)}%`,
    };
  }

  /**
   * Record a rate limit hit (429 error).
   *
   * @param endpoint API endpoint that returned 429 error
   */
  recordRateLimitHit(endpoint: string): void {
    this.rateLimitHits.push({
      timestamp: new Date(),
      endpoint,
    });

    // Clean old entries
    this.cleanOldEntries();
  }

  /**
   * Get rate limit status for last 24 hours.
   *
   * @returns Rate limit hit statistics
   */
  getRateLimitStatus(): RateLimitStatus {
    const now = Date.now();
    const last24h = this.rateLimitHits.filter(
      (hit) => now - hit.timestamp.getTime() < this.historyRetentionMs
    );

    // Group by endpoint
    const byEndpoint: Record<string, number> = {};
    last24h.forEach((hit) => {
      byEndpoint[hit.endpoint] = (byEndpoint[hit.endpoint] || 0) + 1;
    });

    return {
      hitCount: last24h.length,
      lastHit: last24h[last24h.length - 1]?.timestamp || null,
      byEndpoint,
      estimatedRemaining: 'Unknown', // SmartThings doesn't publish rate limits
    };
  }

  /**
   * Set token creation time for expiration tracking.
   *
   * SmartThings PATs expire after 24 hours. Call this when creating a new PAT
   * or at application startup if PAT creation time is known.
   *
   * @param date Token creation timestamp
   */
  setTokenCreatedAt(date: Date): void {
    this.tokenCreatedAt = date;
  }

  /**
   * Get milliseconds until token expires (24 hours from creation).
   *
   * @returns Milliseconds remaining (0 if expired)
   */
  getTokenTimeRemaining(): number {
    const expiresAt = new Date(this.tokenCreatedAt);
    expiresAt.setHours(expiresAt.getHours() + 24);
    return Math.max(0, expiresAt.getTime() - Date.now());
  }

  /**
   * Check if token is expiring soon (< 1 hour remaining).
   *
   * @returns true if token expires within 1 hour
   */
  isTokenExpiringSoon(): boolean {
    return this.getTokenTimeRemaining() < 60 * 60 * 1000;
  }

  /**
   * Get detailed token expiration info.
   *
   * @returns Token status with expiration details
   */
  getTokenStatus(): TokenStatus {
    const remaining = this.getTokenTimeRemaining();
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

    return {
      createdAt: this.tokenCreatedAt,
      expiresAt: new Date(this.tokenCreatedAt.getTime() + 24 * 60 * 60 * 1000),
      remainingMs: remaining,
      remainingFormatted: `${hours}h ${minutes}m`,
      expiringSoon: this.isTokenExpiringSoon(),
    };
  }

  /**
   * Clean entries older than retention period (24 hours).
   *
   * Called automatically during recordCommand and recordRateLimitHit.
   */
  private cleanOldEntries(): void {
    const now = Date.now();

    this.commandHistory = this.commandHistory.filter(
      (cmd) => now - cmd.timestamp.getTime() < this.historyRetentionMs
    );

    this.rateLimitHits = this.rateLimitHits.filter(
      (hit) => now - hit.timestamp.getTime() < this.historyRetentionMs
    );
  }

  /**
   * Get comprehensive diagnostic summary.
   *
   * @returns Summary of all tracked diagnostics
   */
  getSummary() {
    return {
      commands: this.getCommandStats(),
      rateLimits: this.getRateLimitStatus(),
      token: this.getTokenStatus(),
    };
  }

  /**
   * Clear all diagnostic history.
   *
   * Useful for testing or resetting state.
   */
  clear(): void {
    this.commandHistory = [];
    this.rateLimitHits = [];
  }
}

/**
 * Singleton instance of diagnostic tracker.
 *
 * Usage:
 * ```typescript
 * import { diagnosticTracker } from './diagnostic-tracker';
 *
 * // Record command execution
 * diagnosticTracker.recordCommand({
 *   timestamp: new Date(),
 *   deviceId: 'abc-123',
 *   capability: 'switch',
 *   command: 'on',
 *   success: true,
 *   duration: 250,
 * });
 *
 * // Get failed commands
 * const failures = diagnosticTracker.getFailedCommands(10);
 * ```
 */
export const diagnosticTracker = new DiagnosticTracker();
