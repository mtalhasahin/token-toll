/**
 * Everything that happens to text before BPE sees it.  [PURE]
 *
 * A tokenizer file describes two stages in front of the merge table: a
 * normalizer that rewrites the string, and a pre-tokenizer that cuts it into
 * pieces which are then merged independently. Both are declarative, and both
 * are why the same sentence costs different amounts in different models — the
 * pattern that decides where a word may be split is the whole game for a
 * language that builds words by suffixing them.
 *
 * Only the stages the tokenizers in `registry.ts` actually use are
 * implemented, and anything unrecognised throws rather than being skipped: a
 * silently ignored normalizer would produce numbers that look right and are
 * not.
 */

import { compile, segments } from './regex.ts';

/** A node from `tokenizer.json`; its shape depends on its `type`. */
export type Stage = { type?: string; [key: string]: unknown } | null | undefined;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** `{"String": " "}` or `{"Regex": "\\s+"}` — the two ways a pattern is given. */
function patternOf(raw: unknown): { literal?: string; regex?: string } {
  const p = (raw ?? {}) as Record<string, unknown>;
  const literal = str(p['String']);
  const regex = str(p['Regex']);
  return { ...(literal !== undefined ? { literal } : {}), ...(regex !== undefined ? { regex } : {}) };
}

/**
 * Applies the normalizer chain.
 *
 * Gemma's is a single `Replace` that turns every space into `▁`, which is how
 * a SentencePiece model marks word starts. Qwen's is `NFC`. Most have none.
 */
export function normalize(text: string, stage: Stage): string {
  if (!stage) return text;

  switch (stage.type) {
    case 'Sequence': {
      const inner = (stage['normalizers'] ?? []) as Stage[];
      return inner.reduce(normalize, text);
    }
    case 'NFC':
    case 'NFD':
    case 'NFKC':
    case 'NFKD':
      return text.normalize(stage.type);
    case 'Replace': {
      const { literal, regex } = patternOf(stage['pattern']);
      const content = str(stage['content']) ?? '';
      if (literal !== undefined) return text.split(literal).join(content);
      if (regex !== undefined) return text.replace(compile(regex), content);
      return text;
    }
    case 'Prepend':
      return (str(stage['prepend']) ?? '') + text;
    case 'Lowercase':
      return text.toLowerCase();
    case 'Strip':
      return text.trim();
    default:
      throw new Error(`unsupported normalizer: ${stage.type}`);
  }
}

/** GPT-2's byte to character table: every byte gets a printable stand-in. */
function byteEncoder(): string[] {
  const table: string[] = new Array(256);
  const printable: number[] = [];
  for (let b = 33; b <= 126; b++) printable.push(b);
  for (let b = 161; b <= 172; b++) printable.push(b);
  for (let b = 174; b <= 255; b++) printable.push(b);

  const direct = new Set(printable);
  let spare = 0;
  for (let b = 0; b < 256; b++) {
    table[b] = direct.has(b) ? String.fromCharCode(b) : String.fromCharCode(256 + spare++);
  }
  return table;
}

const BYTES = byteEncoder();

/**
 * A piece of text as its bytes, each byte standing in as one character.
 *
 * This is what lets a byte-level BPE merge anything at all: after this every
 * string is made of 256 known characters, so a Turkish `ğ` and an emoji are
 * both just sequences the merge table may or may not have learned.
 */
export function toByteLevel(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (const b of bytes) out += BYTES[b];
  return out;
}

/** The pieces a pre-tokenizer cuts a string into. */
export function pretokenize(text: string, stage: Stage): string[] {
  if (!stage) return text.length > 0 ? [text] : [];

  switch (stage.type) {
    case 'Sequence': {
      const inner = (stage['pretokenizers'] ?? []) as Stage[];
      return inner.reduce<string[]>((pieces, next) => pieces.flatMap((p) => pretokenize(p, next)), [text]);
    }

    case 'Split': {
      const { regex, literal } = patternOf(stage['pattern']);
      const behavior = str(stage['behavior']) ?? 'Isolated';
      const invert = stage['invert'] === true;

      // `invert` flips which side of the pattern is a piece. Every tokenizer
      // here uses one of two combinations, and both mean the same thing in the
      // end: the pattern describes the pieces, not the separators.
      const keepMatches = invert ? true : behavior !== 'Removed';
      const keepGaps = invert ? false : true;

      if (literal !== undefined) {
        return text.split(literal).filter((p) => p.length > 0);
      }
      if (regex === undefined) return [text];
      return segments(text, compile(regex), keepMatches, keepGaps);
    }

    case 'ByteLevel': {
      // In a sequence this is the byte mapping, not a splitter: every
      // tokenizer here sets `use_regex: false` because a `Split` in front of
      // it has already done the cutting.
      if (stage['use_regex'] === true) {
        throw new Error('ByteLevel with its own regex is not supported; none of the tokenizers use it');
      }
      const prefixed = stage['add_prefix_space'] === true && !text.startsWith(' ') ? ` ${text}` : text;
      return [toByteLevel(prefixed)];
    }

    case 'Metaspace': {
      // Nothing is not a word: an empty string gets no word-start mark, or it
      // would cost a token for having said nothing.
      if (text.length === 0) return [];

      const replacement = str(stage['replacement']) ?? '▁';
      const scheme = str(stage['prepend_scheme']) ?? 'always';
      const prepended = scheme === 'never' ? text : replacement + text;
      const marked = prepended.split(' ').join(replacement);
      if (stage['split'] === true) {
        return marked.split(new RegExp(`(?=${replacement})`, 'u')).filter((p) => p.length > 0);
      }
      return marked.length > 0 ? [marked] : [];
    }

    case 'Whitespace':
      return segments(text, compile('\\w+|[^\\w\\s]+'), true, false);

    case 'WhitespaceSplit':
      return text.split(/\s+/u).filter((p) => p.length > 0);

    default:
      throw new Error(`unsupported pre-tokenizer: ${stage.type}`);
  }
}
