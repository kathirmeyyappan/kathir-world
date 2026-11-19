// A fetch begun once and shared by everything that wants its result, which can be read without
// waiting once it's here. One that fails is forgotten, so the next to want it tries again.
export interface Fetch<T> {
  promise: Promise<T>;
  done: boolean;
  value: T | undefined;
}

export function begin<K, T>(fetches: Map<K, Fetch<T>>, key: K, start: () => Promise<T>): Fetch<T> {
  let entry = fetches.get(key);
  if (!entry) {
    const begun: Fetch<T> = { promise: start(), done: false, value: undefined };
    begun.promise.then(
      (value) => Object.assign(begun, { done: true, value }),
      () => fetches.delete(key),
    );
    fetches.set(key, (entry = begun));
  }
  return entry;
}
