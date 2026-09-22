/** Deterministic pseudo-random numbers (mulberry32) for seed data and the GAPS simulator. */

export interface Rng {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean; // p in [0, 1]
  shuffle<T>(items: readonly T[]): T[];
  weighted<T>(items: readonly (readonly [T, number])[]): T;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
    shuffle: (items) => {
      const arr = [...items];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    weighted: (items) => {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of items) {
        r -= w;
        if (r < 0) return v;
      }
      return items[items.length - 1][0];
    },
  };
  return rng;
}
