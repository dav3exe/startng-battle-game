// Small deterministic helpers so the model and scene look the same on every load.
export function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export function seeded(seed: number): () => number {
  let i = seed;
  return () => {
    i += 1;
    return hash(i);
  };
}
