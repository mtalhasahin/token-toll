/**
 * The command.
 *
 * Two things to ask it. What does *this text* cost, in every tokenizer — the
 * question someone arrives with, answered from a string or from stdin. And
 * what does *a language* cost, which needs the corpus and a few minutes.
 */

import { readFile } from 'node:fs/promises';

import { aligned, BASELINE, LANGUAGES, loadCorpus } from './corpus.ts';
import { loadAll } from './load.ts';
import { countAll, measure, wordCount, type Measurement } from './measure.ts';
import { MODELS } from './registry.ts';
import { corpusReport, textReport, type Weighed } from './report.ts';

const VERSION = '0.1.0';

const HELP = `token-toll ${VERSION}

  What your language costs you in tokens.

  token-toll "your text here"      weigh a string in every tokenizer
  token-toll --file prompt.txt     weigh a file
  cat prompt.txt | token-toll      weigh stdin
  token-toll --corpus              measure whole languages against English

  --models <a,b>     only these tokenizers (${MODELS.map((m) => m.id).join(', ')})
  --languages <a,b>  with --corpus: only these, as FLORES codes or names
  --json             machine-readable output
  --version, --help

  Tokenizer files are downloaded once and cached; --corpus also fetches a
  25 MB sentence corpus. Nothing needs an API key.
`;

type Options = {
  text?: string;
  file?: string;
  corpus: boolean;
  json: boolean;
  models?: string[];
  languages?: string[];
};

const list = (raw: string): string[] => raw.split(',').map((s) => s.trim()).filter(Boolean);

export function parseArgs(argv: readonly string[]): Options | { help: true } | { version: true } | { error: string } {
  const options: Options = { corpus: false, json: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const next = argv[i + 1];

    switch (arg) {
      case '--help':
      case '-h':
        return { help: true };
      case '--version':
      case '-v':
        return { version: true };
      case '--corpus':
        options.corpus = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--file':
        if (!next) return { error: '--file needs a path' };
        options.file = next;
        i++;
        break;
      case '--models':
        if (!next) return { error: '--models needs a list' };
        options.models = list(next);
        i++;
        break;
      case '--languages':
        if (!next) return { error: '--languages needs a list' };
        options.languages = list(next);
        i++;
        break;
      default:
        if (arg.startsWith('-')) return { error: `unknown option: ${arg}` };
        options.text = options.text === undefined ? arg : `${options.text} ${arg}`;
    }
  }
  return options;
}

const out = (lines: readonly string[]): void => {
  process.stdout.write(`${lines.join('\n')}\n`);
};
const note = (text: string): void => {
  if (process.stderr.isTTY) process.stderr.write(`${text}\n`);
};

/** Whatever the user meant by "the text": an argument, a file, or a pipe. */
async function inputText(options: Options): Promise<string | undefined> {
  if (options.file) return readFile(options.file, 'utf8');
  if (options.text !== undefined) return options.text;
  if (process.stdin.isTTY) return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const piped = Buffer.concat(chunks).toString('utf8');
  return piped.length > 0 ? piped : undefined;
}

/** Language names as well as FLORES codes, because nobody remembers `tur_Latn`. */
function resolveLanguages(wanted?: readonly string[]): string[] {
  if (!wanted?.length) return LANGUAGES.map((l) => l.code);

  const codes = new Set<string>([BASELINE]);
  for (const name of wanted) {
    const found = LANGUAGES.find(
      (l) => l.code === name || l.label.toLowerCase() === name.toLowerCase() || l.code.startsWith(`${name}_`),
    );
    if (found) codes.add(found.code);
  }
  return LANGUAGES.filter((l) => codes.has(l.code)).map((l) => l.code);
}

export async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ('help' in parsed) {
    process.stdout.write(HELP);
    return 0;
  }
  if ('version' in parsed) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if ('error' in parsed) {
    process.stderr.write(`${parsed.error}\n\ntoken-toll --help\n`);
    return 2;
  }
  const options = parsed;

  const unknown = options.models?.filter((id) => !MODELS.some((m) => m.id === id)) ?? [];
  if (unknown.length > 0) {
    process.stderr.write(`no such tokenizer: ${unknown.join(', ')}\n`);
    return 2;
  }

  note('loading tokenizers (cached after the first run)…');
  const loaded = await loadAll(options.models, (spec) => note(`  ${spec.label}`));

  if (options.corpus) {
    const codes = resolveLanguages(options.languages);
    note('corpus…');
    const corpus = aligned(await loadCorpus(codes, note));
    const baseline = corpus.find((c) => c.code === BASELINE);
    if (!baseline) {
      process.stderr.write('the baseline language is missing from the corpus\n');
      return 1;
    }

    const measurements: Measurement[] = [];
    for (const { spec, tokenizer } of loaded) {
      const baselineCounts = countAll(tokenizer, baseline.lines);
      for (const language of corpus) {
        const counts = language.code === BASELINE ? baselineCounts : countAll(tokenizer, language.lines);
        measurements.push(measure(spec.id, language.code, language.lines, counts, baselineCounts));
      }
      note(`  measured ${spec.label}`);
    }

    note('');
    out(
      options.json
        ? [JSON.stringify({ baseline: BASELINE, measurements }, null, 2)]
        : corpusReport(measurements, loaded.map((l) => l.spec), codes),
    );
    return 0;
  }

  const text = await inputText(options);
  if (text === undefined) {
    process.stdout.write(HELP);
    return 0;
  }

  const weighed: Weighed[] = loaded.map(({ spec, tokenizer }) => ({
    model: spec.id,
    label: spec.label,
    tokens: tokenizer.count(text),
    chars: [...text].length,
  }));

  note('');
  out(
    options.json
      ? [JSON.stringify({ chars: [...text].length, words: wordCount(text), models: weighed }, null, 2)]
      : textReport(weighed, [...text].length, wordCount(text)),
  );
  return 0;
}
