export interface KeyedMutex {
  runExclusive<T>(key: string, task: () => Promise<T>): Promise<T>;
}

export const createKeyedMutex = (): KeyedMutex => {
  const tails = new Map<string, Promise<unknown>>();

  const runExclusive = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    const settled = previous.then(
      () => undefined,
      () => undefined,
    );
    const current = settled.then(task);
    tails.set(key, current);

    try {
      return await current;
    } finally {
      if (tails.get(key) === current) {
        tails.delete(key);
      }
    }
  };

  return { runExclusive };
};
