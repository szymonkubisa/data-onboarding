import { MemorySaver, type Checkpoint, type CheckpointMetadata } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";

/**
 * In-memory checkpointer with a cap on threads, so a long-lived instance cannot grow
 * without bound. Oldest threads are evicted first.
 *
 * Production path: replace with PostgresSaver from @langchain/langgraph-checkpoint-postgres
 * and drop client-driven rehydration (see docs/adr/0002).
 */
export class BoundedMemorySaver extends MemorySaver {
  private readonly order: string[] = [];

  constructor(private readonly maxThreads = 200) {
    super();
  }

  override async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata) {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (threadId && !this.order.includes(threadId)) {
      this.order.push(threadId);
      while (this.order.length > this.maxThreads) {
        const oldest = this.order.shift();
        if (oldest) await this.deleteThread(oldest);
      }
    }
    return super.put(config, checkpoint, metadata);
  }

  override async deleteThread(threadId: string) {
    const index = this.order.indexOf(threadId);
    if (index >= 0) this.order.splice(index, 1);
    return super.deleteThread(threadId);
  }

  threadCount(): number {
    return this.order.length;
  }
}
