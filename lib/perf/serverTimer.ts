/**
 * Safe, zero-dependency server timing utility.
 * Appends standard 'Server-Timing' headers to responses and logs metrics when PERF_LOG=1.
 * NEVER prints credentials, personal identifiers, tokens, or query strings.
 */

export interface MetricEntry {
  name: string;
  dur: number; // in milliseconds
  desc?: string;
}

export class ServerTimer {
  private startTime: number;
  private metrics: MetricEntry[] = [];
  private routeName: string;
  private method: string;
  private isColdStart: boolean;

  private static globalColdStartRecorded = false;

  constructor(routeName: string, method: string = "GET") {
    this.startTime = performance.now();
    this.routeName = routeName;
    this.method = method;
    this.isColdStart = !ServerTimer.globalColdStartRecorded;
    ServerTimer.globalColdStartRecorded = true;
  }

  /**
   * Measure an asynchronous operation (e.g. database query, session check).
   */
  async measure<T>(name: string, fn: () => Promise<T>, desc?: string): Promise<T> {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      const duration = Math.round((performance.now() - t0) * 100) / 100;
      this.metrics.push({ name, dur: duration, desc });
    }
  }

  /**
   * Record a synchronous timing span.
   */
  record(name: string, durationMs: number, desc?: string): void {
    this.metrics.push({ name, dur: Math.round(durationMs * 100) / 100, desc });
  }

  /**
   * Generates standard 'Server-Timing' header string.
   */
  getHeaderValue(): string {
    const totalMs = Math.round((performance.now() - this.startTime) * 100) / 100;
    const allMetrics = [
      ...this.metrics,
      { name: "total", dur: totalMs, desc: "Total Execution Time" },
      { name: "cold", dur: this.isColdStart ? 1 : 0, desc: this.isColdStart ? "Cold Start" : "Warm" },
    ];

    return allMetrics
      .map((m) => `${m.name};dur=${m.dur}${m.desc ? `;desc="${m.desc}"` : ""}`)
      .join(", ");
  }

  /**
   * Logs summary to console if process.env.PERF_LOG === "1".
   */
  logSummary(statusCode: number = 200, role?: string): void {
    if (process.env.PERF_LOG !== "1" && process.env.NODE_ENV !== "development") return;

    const totalMs = Math.round((performance.now() - this.startTime) * 100) / 100;
    const metricSummary = this.metrics
      .map((m) => `${m.name}=${m.dur}ms`)
      .join(" | ");

    console.log(
      `[PERF] ${this.method} ${this.routeName} [status: ${statusCode}] [role: ${role || "ANON"}] [cold: ${
        this.isColdStart ? "YES" : "NO"
      }] [total: ${totalMs}ms] ${metricSummary ? `--> ${metricSummary}` : ""}`
    );
  }
}

