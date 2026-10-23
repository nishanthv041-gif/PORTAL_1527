export class RateLimiter {
  private cache: Map<string, { count: number; expiresAt: number }> = new Map();
  private lastCleanup = Date.now();
  private readonly maxEntries: number;

  constructor(
    private limit: number, 
    private windowMs: number,
    maxEntries: number = 10000
  ) {
    this.maxEntries = maxEntries;
  }

  check(identifier: string): boolean {
    const now = Date.now();

    // Auto-prune expired records every 60 seconds or when map exceeds maxEntries
    if (now - this.lastCleanup > 60000 || this.cache.size > this.maxEntries) {
      this.prune(now);
    }

    const record = this.cache.get(identifier);

    if (record) {
      if (now > record.expiresAt) {
        // Window expired, reset bucket
        this.cache.set(identifier, { count: 1, expiresAt: now + this.windowMs });
        return true;
      }
      if (record.count >= this.limit) {
        return false;
      }
      record.count++;
      return true;
    }

    // New entry
    this.cache.set(identifier, { count: 1, expiresAt: now + this.windowMs });
    return true;
  }

  // Remaining count for headers / inspection
  remaining(identifier: string): number {
    const record = this.cache.get(identifier);
    if (!record || Date.now() > record.expiresAt) return this.limit;
    return Math.max(0, this.limit - record.count);
  }

  private prune(now: number): void {
    this.lastCleanup = now;
    for (const [key, val] of this.cache.entries()) {
      if (now > val.expiresAt) {
        this.cache.delete(key);
      }
    }
    // Hard ceiling safety
    if (this.cache.size > this.maxEntries) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, Math.floor(this.maxEntries / 4));
      for (const k of keysToDelete) {
        this.cache.delete(k);
      }
    }
  }
}

// 1. Account-level brute-force protection: max 10 failed/rapid attempts per email per minute
export const emailLoginRateLimiter = new RateLimiter(10, 60 * 1000);

// 2. IP-level DDoS protection: max 120 attempts per minute per IP (safe for school campus NAT / proxies)
export const ipLoginRateLimiter = new RateLimiter(120, 60 * 1000);

// Backward-compatible alias combining IP & email protection
export const loginRateLimiter = {
  check(identifier: string): boolean {
    return ipLoginRateLimiter.check(identifier);
  },
  checkPair(ip: string, email: string): boolean {
    const isIpOk = ipLoginRateLimiter.check(ip);
    const isEmailOk = email ? emailLoginRateLimiter.check(email.toLowerCase().trim()) : true;
    return isIpOk && isEmailOk;
  }
};

// General API rate limiter: 300 requests per minute per IP
export const apiRateLimiter = new RateLimiter(300, 60 * 1000);
