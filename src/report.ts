/**
 * The tables, as lines of text.  [PURE]
 *
 * Two of them. One weighs a piece of text someone pasted, across every
 * tokenizer — that is the question a person arrives with. The other is the
 * corpus table, where the ratio lives.
 */

import { languageByCode } from './corpus.ts';
import type { Measurement } from './measure.ts';
import { round } from './stats.ts';

/** One tokenizer's verdict on one piece of text. */
export type Weighed = { model: string; label: string; tokens: number; chars: number };

const NAME = 18;

/**
 * What a piece of text costs, per tokenizer.
 *
 * Sorted heaviest first, and the cheapest is the comparison: the spread
 * between the best and worst tokenizer for the same Turkish paragraph is
 * larger than the spread between Turkish and English on a good one, which is
 * the finding people are most surprised by.
 */
export function textReport(weighed: readonly Weighed[], chars: number, words: number): string[] {
  const sorted = [...weighed].sort((a, b) => b.tokens - a.tokens);
  const cheapest = sorted.at(-1);

  const lines = [
    `${chars} characters · ${words} word${words === 1 ? '' : 's'}`,
    '',
    `  ${'tokenizer'.padEnd(NAME)} ${'tokens'.padStart(7)} ${'chars/token'.padStart(12)} ${'vs best'.padStart(8)}`,
    '',
  ];

  for (const w of sorted) {
    const against = cheapest && cheapest.tokens > 0 ? `×${(w.tokens / cheapest.tokens).toFixed(2)}` : '—';
    lines.push(
      `  ${w.label.padEnd(NAME).slice(0, NAME)}` +
        ` ${String(w.tokens).padStart(7)}` +
        ` ${(w.tokens > 0 ? round(chars / w.tokens, 2) : 0).toFixed(2).padStart(12)}` +
        ` ${against.padStart(8)}`,
    );
  }

  if (cheapest && sorted[0] && sorted[0].tokens > cheapest.tokens) {
    const worst = sorted[0];
    const spread = Math.round((worst.tokens / cheapest.tokens - 1) * 100);
    lines.push(
      '',
      `${worst.label} charges ${spread}% more than ${cheapest.label} for this exact text.`,
      'Same words, same meaning — the difference is which merge table saw the language during training.',
    );
  }

  return lines;
}

/**
 * The corpus table: what each language costs against English.
 *
 * Languages down the side, tokenizers across, because the question is almost
 * always "what does my language cost" and only sometimes "which tokenizer
 * should I pick".
 */
export function corpusReport(
  measurements: readonly Measurement[],
  models: readonly { id: string; label: string }[],
  languages: readonly string[],
): string[] {
  const cell = (model: string, language: string): Measurement | undefined =>
    measurements.find((m) => m.model === model && m.language === language);

  const head = `  ${'language'.padEnd(14)}${models.map((m) => m.id.padStart(13)).join('')}${'mean'.padStart(9)}`;
  const lines = [head, ''];

  for (const code of languages) {
    const language = languageByCode(code);
    const ratios = models.map((m) => cell(m.id, code)?.ratio ?? 0);
    const mean = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;

    lines.push(
      `  ${(language?.label ?? code).padEnd(14)}` +
        ratios.map((r) => r.toFixed(2).padStart(13)).join('') +
        mean.toFixed(2).padStart(9),
    );
  }

  lines.push('', 'Tokens for the same 2,009 sentences, against English at 1.00.');
  return lines;
}
