export class RateLimiter {
  private ipCache: Map<string, { count: number; expiresAt: number }> = new Map();
  
  constructor(private limit: number, private windowMs: number) {}

  check(identifier: string): boolean {
    const now = Date.now();
    const record = this.ipCache.get(identifier);

    if (record) {
      if (now > record.expiresAt) {
        // Reset if expired
        this.ipCache.set(identifier, { count: 1, expiresAt: now + this.windowMs });
        return true;
      }
      if (record.count >= this.limit) {
        return false;
      }
      record.count++;
      return true;
    }

    this.ipCache.set(identifier, { count: 1, expiresAt: now + this.windowMs });
    return true;
  }
}

// 5 attempts per minute
export const loginRateLimiter = new RateLimiter(5, 60 * 1000);
