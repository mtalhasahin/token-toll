/**
 * A tokenizer, loaded from the same `tokenizer.json` the model ships with.
 *
 * Not an approximation and not a wrapper: the normalizer, the pre-tokenizer
 * and the merge table are read out of the file and run, so the count is the
 * count the model's own tokenizer would produce. The tests hold it to exactly
 * that, sentence by sentence, against the reference implementation.
 *
 * Special tokens are deliberately left out. A real request wraps the text in
 * a template — `<bos>`, chat turn markers, a system prompt — and those are the
 * same for every language, so counting them would add a constant to both sides
 * of a comparison and quietly shrink the ratio this exists to measure. What is
 * counted here is the text.
 */

import { buildRanks, merge, symbols, type Ranks } from './bpe.ts';
import { normalize, pretokenize, type Stage } from './pieces.ts';

/** The parts of a `tokenizer.json` this needs. Everything else is ignored. */
export type TokenizerFile = {
  normalizer?: Stage;
  pre_tokenizer?: Stage;
  added_tokens?: { id: number; content: string; special?: boolean }[];
  model: {
    type?: string;
    vocab: Record<string, number>;
    merges: (string | string[])[];
    ignore_merges?: boolean;
    byte_fallback?: boolean;
    unk_token?: string | null;
  };
};

export class Tokenizer {
  private readonly vocab: Map<string, number>;
  private readonly ranks: Ranks;
  private readonly normalizer: Stage;
  private readonly pre: Stage;
  private readonly ignoreMerges: boolean;
  private readonly byteFallback: boolean;
  private readonly byteLevel: boolean;
  private readonly unk: number | undefined;
  private readonly added: Map<string, number>;
  /** Pieces repeat constantly across a corpus; each is merged once. */
  private readonly cache = new Map<string, number[]>();

  private constructor(file: TokenizerFile) {
    if (file.model.type !== undefined && file.model.type !== 'BPE') {
      throw new Error(`only BPE tokenizers are supported, this one is ${file.model.type}`);
    }

    this.vocab = new Map(Object.entries(file.model.vocab));
    this.ranks = buildRanks(file.model.merges);
    this.normalizer = file.normalizer;
    this.pre = file.pre_tokenizer;
    this.ignoreMerges = file.model.ignore_merges === true;
    this.byteFallback = file.model.byte_fallback === true;
    this.byteLevel = describes(file.pre_tokenizer, 'ByteLevel');

    const unk = file.model.unk_token;
    this.unk = typeof unk === 'string' ? this.vocab.get(unk) : undefined;

    // Longest first, because added tokens overlap: Gemma has both `\n` and
    // `\n\n`, and matching the short one first would split the long one in
    // two and charge twice for it.
    this.added = new Map(
      [...(file.added_tokens ?? [])]
        .sort((a, b) => b.content.length - a.content.length)
        .map((token) => [token.content, token.id] as const),
    );
  }

  static fromJSON(file: TokenizerFile): Tokenizer {
    return new Tokenizer(file);
  }

  /** The ids the text becomes, without any template around it. */
  encode(text: string): number[] {
    const ids: number[] = [];
    for (const span of this.splitAdded(text)) {
      if (typeof span === 'number') {
        ids.push(span);
        continue;
      }
      for (const piece of pretokenize(normalize(span, this.normalizer), this.pre)) {
        ids.push(...this.encodePiece(piece));
      }
    }
    return ids;
  }

  /** What the text costs. */
  count(text: string): number {
    return this.encode(text).length;
  }

  /** How many entries the merge table has, which is what `vocab size` means. */
  get vocabSize(): number {
    return this.vocab.size;
  }

  private encodePiece(piece: string): number[] {
    const held = this.cache.get(piece);
    if (held) return held;

    let ids: number[];

    // Llama's table is built so that a piece already in the vocabulary must
    // never be merged into something else; `ignore_merges` says so.
    const whole = this.ignoreMerges ? this.vocab.get(piece) : undefined;
    if (whole !== undefined) {
      ids = [whole];
    } else {
      ids = [];
      for (const symbol of merge(symbols(piece, this.byteLevel), this.ranks)) {
        ids.push(...this.idsFor(symbol));
      }
    }

    this.cache.set(piece, ids);
    return ids;
  }

  /**
   * One merged symbol, as ids.
   *
   * A symbol the vocabulary does not have is not an error: a SentencePiece
   * model falls back to one token per byte, which is how it can still write a
   * character it has never seen — expensively, at four tokens for one emoji.
   */
  private idsFor(symbol: string): number[] {
    const id = this.vocab.get(symbol);
    if (id !== undefined) return [id];

    if (this.byteFallback) {
      const ids: number[] = [];
      for (const byte of new TextEncoder().encode(symbol)) {
        const fallback = this.vocab.get(`<0x${byte.toString(16).toUpperCase().padStart(2, '0')}>`);
        if (fallback !== undefined) ids.push(fallback);
        else if (this.unk !== undefined) ids.push(this.unk);
      }
      if (ids.length > 0) return ids;
    }
    return this.unk === undefined ? [] : [this.unk];
  }

  /**
   * Cuts out any added token that appears literally in the text.
   *
   * `<|endoftext|>` in a pasted string is one token, not a dozen — and someone
   * measuring a prompt template will paste exactly that.
   */
  private splitAdded(text: string): (string | number)[] {
    if (this.added.size === 0) return [text];

    let spans: (string | number)[] = [text];
    for (const [content, id] of this.added) {
      if (!text.includes(content)) continue;
      spans = spans.flatMap((span) => {
        if (typeof span === 'number') return [span];
        const parts = span.split(content);
        const out: (string | number)[] = [];
        parts.forEach((part, i) => {
          if (i > 0) out.push(id);
          if (part.length > 0) out.push(part);
        });
        return out;
      });
    }
    return spans;
  }
}

/** Whether a stage, or anything inside it, is of the given type. */
function describes(stage: Stage, type: string): boolean {
  if (!stage) return false;
  if (stage.type === type) return true;
  const inner = (stage['pretokenizers'] ?? stage['normalizers'] ?? []) as Stage[];
  return inner.some((s) => describes(s, type));
}
