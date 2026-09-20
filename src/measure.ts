/**
 * What a language costs, in one tokenizer.  [PURE]
 *
 * The headline number is a ratio against English over the same sentences, and
 * it is computed two ways because they answer different questions. The
 * **total** ratio — all Turkish tokens over all English tokens — is what a
 * document costs. The **median** ratio — the middle of the per-sentence
 * ratios — is what a typical sentence costs, and it is the one that survives
 * a corpus with a few very long lines in it.
 *
 * Tokens per word is reported too, because the literature uses it, with a
 * warning attached: a Turkish word carries suffixes an English sentence spends
 * separate words on, so `evlerinizden` against `from your houses` is one word
 * against three. Fertility flatters Turkish for a reason that has nothing to
 * do with cost. The ratio does not, which is why it leads.
 */

import { median, round } from './stats.ts';

/** Anything that can count tokens — the real tokenizer, or a stub in a test. */
export type Counter = { count: (text: string) => number };

/** One language measured in one tokenizer. */
export type Measurement = {
  model: string;
  language: string;
  sentences: number;
  tokens: number;
  chars: number;
  words: number;
  /** Total tokens ÷ the baseline's total tokens. 1 for the baseline itself. */
  ratio: number;
  /** The middle of the per-sentence ratios. */
  ratioMedian: number;
  /** How much text one token holds. Higher is better for the reader. */
  charsPerToken: number;
  /** The literature's fertility measure. Read the caveat above. */
  tokensPerWord: number;
  /** Sentences that fit in a 100k-token window. */
  sentencesPer100k: number;
};

/** Words, for fertility. Whitespace-separated, which is all that is defensible. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
}

/** Counts every sentence once. Exported so a caller can cache or reuse them. */
export function countAll(counter: Counter, lines: readonly string[]): number[] {
  return lines.map((line) => counter.count(line));
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/**
 * One cell of the table.
 *
 * `baseline` is the token count of the same sentences in English, line for
 * line. Pass the language's own counts as the baseline and the ratios come
 * out at 1, which is what the baseline row should say.
 */
export function measure(
  model: string,
  language: string,
  lines: readonly string[],
  counts: readonly number[],
  baseline: readonly number[],
): Measurement {
  const tokens = sum(counts);
  const chars = sum(lines.map((l) => [...l].length));
  const words = sum(lines.map(wordCount));
  const baselineTokens = sum(baseline);

  // A line the baseline scored zero on would make its ratio infinite; there
  // are no empty lines in the corpus, and a guard is cheaper than trusting it.
  const perSentence = counts
    .map((count, i) => {
      const against = baseline[i] ?? 0;
      return against > 0 ? count / against : NaN;
    })
    .filter((r) => Number.isFinite(r));

  return {
    model,
    language,
    sentences: counts.length,
    tokens,
    chars,
    words,
    ratio: baselineTokens > 0 ? round(tokens / baselineTokens, 3) : 0,
    ratioMedian: round(median(perSentence), 3),
    charsPerToken: tokens > 0 ? round(chars / tokens, 2) : 0,
    tokensPerWord: words > 0 ? round(tokens / words, 2) : 0,
    sentencesPer100k: tokens > 0 ? Math.round(100_000 / (tokens / counts.length)) : 0,
  };
}

/**
 * What the ratio means for a bill.
 *
 * Kept separate from `measure` because it needs a price, and prices belong to
 * whoever is paying them: they differ by provider, they change, and an open
 * model has as many prices as it has hosts. The caller supplies dollars per
 * million tokens and gets the extra cost of writing the same thing in this
 * language rather than English.
 */
export function extraCost(m: Measurement, dollarsPerMillionTokens: number, tokensPerMonth: number): number {
  const englishEquivalent = tokensPerMonth / (m.ratio || 1);
  return round(((tokensPerMonth - englishEquivalent) / 1_000_000) * dollarsPerMillionTokens, 2);
}
