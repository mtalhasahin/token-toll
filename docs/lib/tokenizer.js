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
import { buildRanks, merge, symbols } from "./bpe.js";
import { normalize, pretokenize } from "./pieces.js";
export class Tokenizer {
    vocab;
    ranks;
    normalizer;
    pre;
    ignoreMerges;
    byteFallback;
    byteLevel;
    unk;
    added;
    /** Pieces repeat constantly across a corpus; each is merged once. */
    cache = new Map();
    constructor(file) {
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
        this.added = new Map([...(file.added_tokens ?? [])]
            .sort((a, b) => b.content.length - a.content.length)
            .map((token) => [token.content, token.id]));
    }
    static fromJSON(file) {
        return new Tokenizer(file);
    }
    /** The ids the text becomes, without any template around it. */
    encode(text) {
        const ids = [];
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
    count(text) {
        return this.encode(text).length;
    }
    /** How many entries the merge table has, which is what `vocab size` means. */
    get vocabSize() {
        return this.vocab.size;
    }
    encodePiece(piece) {
        const held = this.cache.get(piece);
        if (held)
            return held;
        let ids;
        // Llama's table is built so that a piece already in the vocabulary must
        // never be merged into something else; `ignore_merges` says so.
        const whole = this.ignoreMerges ? this.vocab.get(piece) : undefined;
        if (whole !== undefined) {
            ids = [whole];
        }
        else {
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
    idsFor(symbol) {
        const id = this.vocab.get(symbol);
        if (id !== undefined)
            return [id];
        if (this.byteFallback) {
            const ids = [];
            for (const byte of new TextEncoder().encode(symbol)) {
                const fallback = this.vocab.get(`<0x${byte.toString(16).toUpperCase().padStart(2, '0')}>`);
                if (fallback !== undefined)
                    ids.push(fallback);
                else if (this.unk !== undefined)
                    ids.push(this.unk);
            }
            if (ids.length > 0)
                return ids;
        }
        return this.unk === undefined ? [] : [this.unk];
    }
    /**
     * Cuts out any added token that appears literally in the text.
     *
     * `<|endoftext|>` in a pasted string is one token, not a dozen — and someone
     * measuring a prompt template will paste exactly that.
     */
    splitAdded(text) {
        if (this.added.size === 0)
            return [text];
        let spans = [text];
        for (const [content, id] of this.added) {
            if (!text.includes(content))
                continue;
            spans = spans.flatMap((span) => {
                if (typeof span === 'number')
                    return [span];
                const parts = span.split(content);
                const out = [];
                parts.forEach((part, i) => {
                    if (i > 0)
                        out.push(id);
                    if (part.length > 0)
                        out.push(part);
                });
                return out;
            });
        }
        return spans;
    }
}
/** Whether a stage, or anything inside it, is of the given type. */
function describes(stage, type) {
    if (!stage)
        return false;
    if (stage.type === type)
        return true;
    const inner = (stage['pretokenizers'] ?? stage['normalizers'] ?? []);
    return inner.some((s) => describes(s, type));
}
//# sourceMappingURL=tokenizer.js.map