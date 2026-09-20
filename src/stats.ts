/**
 * The few statistics this needs.  [PURE]
 *
 * The median rather than the mean, nearly everywhere. A corpus has sentences
 * of two words and sentences of sixty, and a mean ratio lets the long ones
 * decide the answer; the median says what a typical sentence does, which is
 * the thing someone writing a prompt wants to know. Both are reported where
 * they disagree usefully.
 */

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/** The value at a quantile, interpolating between neighbours. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  const lowValue = sorted[low] as number;
  if (low === high) return lowValue;
  return lowValue + ((sorted[high] as number) - lowValue) * (at - low);
}

/** Rounds for display without pretending to precision the input never had. */
export const round = (value: number, places = 2): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};
