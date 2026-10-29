/**
 * Sliding-window counters to limit LNURLp link creation abuse.
 * In-memory only (same lifetime as SessionService).
 */

interface WindowCounter {
  timestamps: number[];
}

export class CreateLinkGuard {
  private readonly byIp = new Map<string, WindowCounter>();
  private readonly byEvent = new Map<string, WindowCounter>();

  constructor(
    private readonly windowMs: number,
    private readonly maxPerIp: number,
    private readonly maxPerEvent: number
  ) {}

  /** Returns null if allowed, or an error message if capped. */
  check(ip: string, eventId: string): string | null {
    const now = Date.now();
    if (this.count(this.byIp, ip, now) >= this.maxPerIp) {
      return 'Too many Lightning links created from this IP; try again later';
    }
    if (this.count(this.byEvent, eventId, now) >= this.maxPerEvent) {
      return 'Too many Lightning links for this event; try again later';
    }
    return null;
  }

  record(ip: string, eventId: string): void {
    const now = Date.now();
    this.push(this.byIp, ip, now);
    this.push(this.byEvent, eventId, now);
  }

  private count(
    map: Map<string, WindowCounter>,
    key: string,
    now: number
  ): number {
    const entry = map.get(key);
    if (!entry) return 0;
    entry.timestamps = entry.timestamps.filter(t => now - t < this.windowMs);
    if (entry.timestamps.length === 0) map.delete(key);
    return entry.timestamps.length;
  }

  private push(
    map: Map<string, WindowCounter>,
    key: string,
    now: number
  ): void {
    let entry = map.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      map.set(key, entry);
    }
    entry.timestamps = entry.timestamps.filter(t => now - t < this.windowMs);
    entry.timestamps.push(now);
  }
}
