import type { RandomSource } from "../src/types";

export function fixedRandom(value = 0): RandomSource {
  return () => value;
}
