/** At most this many agent runs are active at the same time
 * (`review-large-changes-in-batches` design, Decision 7). */
export const MAX_PARALLEL_RUNS = 3;

/** The one limit of active agent runs for one review
 * (`run-judge-with-review-agents` design, Decision 2). Every pool job takes a
 * slot and gives it back. A free slot goes to the waiting job with the lowest
 * `priority`, and among equal priorities to the one that asked first. The slots
 * are given out in a microtask, so a worker that gives back a slot and asks
 * again in the same tick wins against a waiter of a higher priority number. */
export class RunLimit {
  private active = 0;
  private seq = 0;
  private readonly waiting: { priority: number; seq: number; resolve: () => void }[] = [];

  constructor(private readonly max: number) {}

  acquire(priority: number): Promise<void> {
    return new Promise((resolve) => {
      this.waiting.push({ priority, seq: this.seq++, resolve });
      this.schedule();
    });
  }

  release(): void {
    this.active -= 1;
    this.schedule();
  }

  private schedule(): void {
    queueMicrotask(() => {
      while (this.active < this.max && this.waiting.length > 0) {
        let best = 0;
        this.waiting.forEach((w, i) => {
          const b = this.waiting[best]!;
          if (w.priority < b.priority || (w.priority === b.priority && w.seq < b.seq)) best = i;
        });
        const [next] = this.waiting.splice(best, 1);
        this.active += 1;
        next!.resolve();
      }
    });
  }
}

/** Runs `count` jobs in order. Every job takes a slot of the review's one
 * limit (`limit`) before it starts and gives it back when it ends or throws,
 * so all pools of a review together run at most `MAX_PARALLEL_RUNS` jobs. No
 * new job starts when `stopped()` is true, also for a worker that waited for
 * its slot. */
export async function runPool(
  limit: RunLimit,
  priority: number,
  count: number,
  job: (index: number) => Promise<void>,
  stopped: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (!stopped() && next < count) {
      await limit.acquire(priority);
      try {
        if (stopped() || next >= count) return;
        const index = next;
        next += 1;
        await job(index);
      } finally {
        limit.release();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_RUNS, count) }, worker));
}

/** The priority of the review agent runs. The judge and verifier runs wait
 * behind them. */
export const REVIEW_PRIORITY = 0;
export const STEP_PRIORITY = 1;
