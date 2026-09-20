/**
 * The library.
 *
 * The tokenizers are the reusable part: anything that needs to know what a
 * string costs in a real model's merge table can load one of these and ask,
 * without a machine-learning runtime and without an API key.
 */

export { Tokenizer, type TokenizerFile } from './tokenizer.ts';
export { load, loadAll, fetchTokenizerFile, cacheDir } from './load.ts';
export { MODELS, modelById, type ModelSpec } from './registry.ts';
export { LANGUAGES, BASELINE, loadCorpus, aligned, languageByCode, type Language, type Sentences } from './corpus.ts';
export { measure, countAll, extraCost, wordCount, type Measurement, type Counter } from './measure.ts';
export { corpusReport, textReport, type Weighed } from './report.ts';
export { mean, median, quantile, round } from './stats.ts';
export { untar, type Entry } from './tar.ts';
