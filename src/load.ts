/**
 * Getting a tokenizer file, once.
 *
 * These files are large — seventeen megabytes for Gemma — so they are fetched
 * from Hugging Face on first use and kept in a cache directory afterwards.
 * Nothing is vendored into the repository: the files are someone else's, they
 * are pinned by commit in `registry.ts`, and a cache is the honest way to hold
 * a copy of them.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { MODELS, type ModelSpec } from './registry.ts';
import { Tokenizer, type TokenizerFile } from './tokenizer.ts';

/** Where the files live. `TOKEN_TOLL_CACHE` moves it, for CI. */
export function cacheDir(): string {
  return process.env['TOKEN_TOLL_CACHE'] ?? join(homedir(), '.cache', 'token-toll');
}

const urlFor = (spec: ModelSpec): string =>
  `https://huggingface.co/${spec.repo}/resolve/${spec.revision}/tokenizer.json`;

/**
 * The file for one model, from the cache or from the network.
 *
 * The download lands on a temporary name and is renamed once it is whole, so
 * an interrupted run leaves no half a tokenizer behind to be read as real the
 * next time.
 */
export async function fetchTokenizerFile(spec: ModelSpec): Promise<TokenizerFile> {
  const dir = cacheDir();
  const path = join(dir, `${spec.id}.${spec.revision.slice(0, 8)}.json`);

  try {
    return JSON.parse(await readFile(path, 'utf8')) as TokenizerFile;
  } catch {
    // Not cached yet, or cached badly; either way, fetch it.
  }

  const response = await fetch(urlFor(spec));
  if (!response.ok) {
    throw new Error(`${spec.id}: HTTP ${response.status} fetching ${urlFor(spec)}`);
  }
  const text = await response.text();
  const parsed = JSON.parse(text) as TokenizerFile;
  if (!parsed.model?.vocab) throw new Error(`${spec.id}: that file has no vocabulary in it`);

  await mkdir(dir, { recursive: true });
  const temporary = `${path}.${process.pid}.part`;
  await writeFile(temporary, text, 'utf8');
  await rename(temporary, path);

  return parsed;
}

/** A ready tokenizer for one model. */
export async function load(spec: ModelSpec): Promise<Tokenizer> {
  return Tokenizer.fromJSON(await fetchTokenizerFile(spec));
}

/**
 * Every model in the registry, or the ones named.
 *
 * One at a time rather than all at once: these are big downloads and big
 * objects, and a progress line the caller can print is worth more here than
 * shaving a few seconds off a run that happens once.
 */
export async function loadAll(
  ids?: readonly string[],
  onLoad?: (spec: ModelSpec) => void,
): Promise<{ spec: ModelSpec; tokenizer: Tokenizer }[]> {
  const wanted = ids?.length ? MODELS.filter((m) => ids.includes(m.id)) : MODELS;
  const out: { spec: ModelSpec; tokenizer: Tokenizer }[] = [];

  for (const spec of wanted) {
    out.push({ spec, tokenizer: await load(spec) });
    onLoad?.(spec);
  }
  return out;
}
