export interface CheckpointStore<TValue> {
  get(key: string): Promise<TValue | undefined>;
  set(key: string, value: TValue): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export class InMemoryCheckpointStore<TValue>
  implements CheckpointStore<TValue> {
  private store = new Map<string, TValue>();

  async get(key: string): Promise<TValue | undefined> {
    return this.store.get(key);
  }

  async set(key: string, value: TValue): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = [...this.store.keys()].sort();
    if (!prefix) {
      return keys;
    }

    return keys.filter((key) => key.startsWith(prefix));
  }
}

export function buildCheckpointKey(runId: string, shardId: string): string {
  return `ckpt:v1:${runId}:${shardId}`;
}
