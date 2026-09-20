/**
 * Rust regex patterns, as JavaScript can run them.  [PURE]
 *
 * A `tokenizer.json` carries its split patterns in the syntax of the Rust
 * `regex` crate, and JavaScript is close enough to run almost all of it
 * unchanged — `\p{L}`, `\p{N}`, lookahead and unicode ranges all behave the
 * same under the `u` flag. Almost.
 *
 * The exception is the inline modifier group, `(?i:'s|'t|'re)`, which every
 * GPT-style pattern uses for English contractions. V8 only learned it in
 * Node 23, and this has to run on 20. So it is rewritten rather than relied
 * on: each letter inside becomes a class of both cases, which is exactly what
 * the modifier meant and works everywhere.
 */

/** Letters in a pattern, as a class matching either case. `s` becomes `[sS]`. */
function eitherCase(source: string): string {
  return source.replace(/[A-Za-z]/g, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
}

/**
 * Rewrites every `(?i:…)` group into a case-insensitive equivalent.
 *
 * The scan is by hand rather than by regex because the group can contain
 * nested parentheses and escaped ones, and a regex that tried to find the
 * matching close paren would get both wrong.
 */
export function expandInlineFlags(pattern: string): string {
  const open = '(?i:';
  let out = '';
  let at = 0;

  for (;;) {
    const found = pattern.indexOf(open, at);
    if (found === -1) return out + pattern.slice(at);

    out += pattern.slice(at, found);

    let depth = 1;
    let i = found + open.length;
    const from = i;
    while (i < pattern.length && depth > 0) {
      const c = pattern[i];
      if (c === '\\') i++;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    out += `(?:${eitherCase(pattern.slice(from, i - 1))})`;
    at = i;
  }
}

/**
 * One of a tokenizer's patterns, ready to run.
 *
 * Always global and unicode: the callers want every match in a string, and
 * the patterns are written in terms of unicode properties.
 */
export function compile(pattern: string): RegExp {
  return new RegExp(expandInlineFlags(pattern), 'gu');
}

/**
 * Every match, and every gap between them, in order.
 *
 * This is what a `Split` pre-tokenizer needs: `keepMatches` decides whether
 * the pieces that matched are kept (they are, for every tokenizer in use) and
 * `keepGaps` whether the text between them survives. Empty pieces are never
 * returned, because a tokenizer has nothing to do with them.
 */
export function segments(text: string, re: RegExp, keepMatches: boolean, keepGaps: boolean): string[] {
  const out: string[] = [];
  let last = 0;
  re.lastIndex = 0;

  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (keepGaps && m.index > last) out.push(text.slice(last, m.index));
    if (keepMatches && m[0].length > 0) out.push(m[0]);
    last = m.index + m[0].length;
    // A pattern that can match nothing would otherwise spin here forever.
    if (m[0].length === 0) re.lastIndex++;
  }
  if (keepGaps && last < text.length) out.push(text.slice(last));
  return out;
}
