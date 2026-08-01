export type InvalidationCategory = 'alerts' | 'monitoring' | 'dashboard' | 'selectedAlert';

export class InvalidationCoalescer {
  private readonly timers = new Map<InvalidationCategory, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly flush: (category: InvalidationCategory) => void,
    private readonly windowMilliseconds = 150,
  ) {}

  schedule(categories: readonly InvalidationCategory[]): void {
    for (const category of new Set(categories)) {
      if (this.timers.has(category)) continue;
      const timer = setTimeout(() => {
        this.timers.delete(category);
        this.flush(category);
      }, this.windowMilliseconds);
      this.timers.set(category, timer);
    }
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
