/**
 * Runs the whole measurement and writes `results/results.json`.
 *
 * Every number the README and the site show comes from one run of this file.
 * It takes a few minutes, it needs nothing but a network connection the first
 * time, and it is the only thing that has to be trusted: a reader who doubts
 * a figure can run it and get the same one, because the corpus is fixed and
 * every tokenizer is pinned to a commit.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { aligned, BASELINE, LANGUAGES, loadCorpus } from '../src/corpus.ts';
import { load } from '../src/load.ts';
import { countAll, measure, type Measurement } from '../src/measure.ts';
import { MODELS } from '../src/registry.ts';

const note = (text: string): void => {
  process.stderr.write(`${text}\n`);
};

const started = Date.now();

note('corpus…');
const corpus = aligned(await loadCorpus(LANGUAGES.map((l) => l.code), note));
const baselineLines = corpus.find((c) => c.code === BASELINE);
if (!baselineLines) throw new Error('the baseline language is missing from the corpus');

note(`${corpus.length} languages × ${baselineLines.lines.length} sentences`);

const measurements: Measurement[] = [];
const models: Record<string, unknown>[] = [];

for (const spec of MODELS) {
  const at = Date.now();
  const tokenizer = await load(spec);

  const baseline = countAll(tokenizer, baselineLines.lines);

  for (const language of corpus) {
    const counts = language.code === BASELINE ? baseline : countAll(tokenizer, language.lines);
    measurements.push(measure(spec.id, language.code, language.lines, counts, baseline));
  }

  models.push({
    id: spec.id,
    label: spec.label,
    vendor: spec.vendor,
    repo: spec.repo,
    revision: spec.revision,
    vocabSize: tokenizer.vocabSize,
    ...(spec.note ? { note: spec.note } : {}),
  });

  const turkish = measurements.find((m) => m.model === spec.id && m.language === 'tur_Latn');
  note(`  ${spec.label.padEnd(16)} Turkish ×${turkish?.ratio}  (${Math.round((Date.now() - at) / 1000)}s)`);
}

const results = {
  generated: new Date().toISOString().slice(0, 10),
  corpus: {
    name: 'FLORES-200',
    sentences: baselineLines.lines.length,
    splits: ['dev', 'devtest'],
    license: 'CC BY-SA 4.0',
    source: 'https://github.com/facebookresearch/flores/tree/main/flores200',
  },
  baseline: BASELINE,
  note: 'Counts exclude special tokens: the same template wraps every language and would shrink every ratio.',
  languages: LANGUAGES,
  models,
  measurements,
};

const dir = join(import.meta.dirname, '..', 'results');
await mkdir(dir, { recursive: true });
await writeFile(join(dir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');

note(`\nwrote results/results.json in ${Math.round((Date.now() - started) / 1000)}s`);
