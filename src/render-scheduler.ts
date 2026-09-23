type Job = {
  priority: number;
  signal: AbortSignal;
  start: () => void;
  cancel: () => void;
};
export class RenderScheduler {
  private active = 0;
  private queue: Job[] = [];
  constructor(private readonly limit = 2) {}
  get stats() {
    return {
      active: this.active,
      queued: this.queue.length,
      limit: this.limit,
    };
  }
  run<T>(
    work: () => Promise<T>,
    signal: AbortSignal,
    priority = 0,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const job: Job = {
        priority,
        signal,
        cancel: () => {
          this.queue = this.queue.filter((item) => item !== job);
          signal.removeEventListener("abort", job.cancel);
          reject(new DOMException("Rendering cancelled", "AbortError"));
        },
        start: () => {
          signal.removeEventListener("abort", job.cancel);
          this.active++;
          void Promise.resolve()
            .then(work)
            .then(resolve, reject)
            .finally(() => {
              this.active--;
              this.drain();
            });
        },
      };
      if (signal.aborted) {
        job.cancel();
        return;
      }
      signal.addEventListener("abort", job.cancel, { once: true });
      this.queue.push(job);
      this.drain();
    });
  }
  private drain() {
    this.queue.sort((a, b) => a.priority - b.priority);
    while (this.active < this.limit && this.queue.length) {
      const job = this.queue.shift()!;
      if (job.signal.aborted) job.cancel();
      else job.start();
    }
  }
}
export const renderScheduler = new RenderScheduler(2);
export const MAX_PAGE_PIXELS = 4_194_304;
export function canvasScale(
  width: number,
  height: number,
  deviceScale: number,
) {
  return Math.min(
    deviceScale || 1,
    2,
    Math.sqrt(MAX_PAGE_PIXELS / Math.max(1, width * height)),
    8192 / Math.max(1, width, height),
  );
}
