/**
 * Async concurrency semaphore to throttle concurrent heavy CLI spawns.
 * Default max concurrency is 4.
 */
export class ProcessSemaphore {
  private activeCount = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrency = 4) {}

  async acquire(): Promise<() => void> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.activeCount--;
          this.dispatchNext();
        }
      };
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.activeCount++;
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.activeCount--;
            this.dispatchNext();
          }
        });
      });
    });
  }

  private dispatchNext() {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  get active(): number {
    return this.activeCount;
  }

  get waiting(): number {
    return this.queue.length;
  }
}

export const globalProcessSemaphore = new ProcessSemaphore(4);
