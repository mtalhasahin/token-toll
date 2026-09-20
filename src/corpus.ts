/**
 * The sentences, and why these ones.
 *
 * Comparing what a language costs needs text that says the same thing in each
 * language, and almost nothing does. Web-scraped "parallel" corpora are
 * aligned by machine and disagree about content; Wikipedia articles about the
 * same subject are written independently and differ in length by a factor of
 * three. Either would produce a ratio that measured the corpus rather than the
 * tokenizer.
 *
 * FLORES-200 is the exception: 2,009 sentences from Wikinews and Wikivoyage,
 * translated into 204 languages by professional translators and aligned line
 * by line. Line 41 of the Turkish file is the same sentence as line 41 of the
 * English one, which is exactly the comparison this needs.
 *
 * It is released by Meta under CC BY-SA 4.0 and downloaded on first use.
 * Nothing is vendored: the sentences are someone else's work, and only the
 * counts derived from them are published here.
 */

import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { cacheDir } from './load.ts';
import { untar } from './tar.ts';

const ARCHIVE = 'https://dl.fbaipublicfiles.com/nllb/flores200_dataset.tar.gz';

/** The languages measured, and what to call them. English is the baseline. */
export type Language = { code: string; label: string; endonym: string; family: string };

export const LANGUAGES: readonly Language[] = [
  { code: 'eng_Latn', label: 'English', endonym: 'English', family: 'Germanic' },
  { code: 'tur_Latn', label: 'Turkish', endonym: 'Türkçe', family: 'Turkic (agglutinative)' },
  { code: 'fin_Latn', label: 'Finnish', endonym: 'suomi', family: 'Uralic (agglutinative)' },
  { code: 'hun_Latn', label: 'Hungarian', endonym: 'magyar', family: 'Uralic (agglutinative)' },
  { code: 'kor_Hang', label: 'Korean', endonym: '한국어', family: 'Koreanic (agglutinative)' },
  { code: 'deu_Latn', label: 'German', endonym: 'Deutsch', family: 'Germanic' },
  { code: 'fra_Latn', label: 'French', endonym: 'français', family: 'Romance' },
  { code: 'spa_Latn', label: 'Spanish', endonym: 'español', family: 'Romance' },
  { code: 'arb_Arab', label: 'Arabic', endonym: 'العربية', family: 'Semitic' },
  { code: 'rus_Cyrl', label: 'Russian', endonym: 'русский', family: 'Slavic' },
  { code: 'zho_Hans', label: 'Chinese', endonym: '中文', family: 'Sinitic' },
  { code: 'jpn_Jpan', label: 'Japanese', endonym: '日本語', family: 'Japonic' },
  { code: 'hin_Deva', label: 'Hindi', endonym: 'हिन्दी', family: 'Indo-Aryan' },
  { code: 'swh_Latn', label: 'Swahili', endonym: 'Kiswahili', family: 'Bantu (agglutinative)' },
];

/** The language every ratio is measured against. */
export const BASELINE = 'eng_Latn';

export const languageByCode = (code: string): Language | undefined => LANGUAGES.find((l) => l.code === code);

/** The two halves of the dataset. Both are used; together they are 2,009 lines. */
const SPLITS = ['dev', 'devtest'] as const;

/** Sentences for one language, in the order that makes them parallel. */
export type Sentences = { code: string; lines: string[] };

/** Where the archive is kept once fetched. */
const archivePath = (): string => join(cacheDir(), 'flores200_dataset.tar.gz');

async function archive(onProgress?: (note: string) => void): Promise<Uint8Array> {
  const path = archivePath();
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    onProgress?.('downloading FLORES-200 (25 MB, once)…');
  }

  const response = await fetch(ARCHIVE);
  if (!response.ok) throw new Error(`FLORES-200: HTTP ${response.status} from ${ARCHIVE}`);
  const bytes = new Uint8Array(await response.arrayBuffer());

  await mkdir(cacheDir(), { recursive: true });
  await writeFile(path, bytes);
  return bytes;
}

/**
 * The parallel corpus, one entry per language.
 *
 * Lines are trimmed and their order is preserved, because the order is what
 * makes them parallel. A language whose files are missing from the archive is
 * left out rather than filled with blanks.
 */
export async function loadCorpus(
  codes: readonly string[] = LANGUAGES.map((l) => l.code),
  onProgress?: (note: string) => void,
): Promise<Sentences[]> {
  const wanted = new Set<string>();
  for (const code of codes) for (const split of SPLITS) wanted.add(`${code}.${split}`);

  const files = untar(gunzipSync(await archive(onProgress)), (name) => {
    const base = name.split('/').pop() ?? '';
    return wanted.has(base);
  });

  const decoder = new TextDecoder();
  const byCode = new Map<string, Map<string, string[]>>();

  for (const file of files) {
    const base = file.name.split('/').pop() ?? '';
    const cut = base.lastIndexOf('.');
    const code = base.slice(0, cut);
    const split = base.slice(cut + 1);

    const lines = decoder
      .decode(file.data)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const splits = byCode.get(code) ?? new Map<string, string[]>();
    splits.set(split, lines);
    byCode.set(code, splits);
  }

  return codes
    .filter((code) => byCode.has(code))
    .map((code) => {
      const splits = byCode.get(code) as Map<string, string[]>;
      return { code, lines: SPLITS.flatMap((split) => splits.get(split) ?? []) };
    });
}

/**
 * Keeps only the lines every language has.
 *
 * A ratio between two languages is only meaningful over the same sentences,
 * and one short file would otherwise silently compare line 900 of Turkish
 * with line 900 of nothing.
 */
export function aligned(corpus: readonly Sentences[]): Sentences[] {
  const shortest = Math.min(...corpus.map((c) => c.lines.length));
  return corpus.map((c) => ({ code: c.code, lines: c.lines.slice(0, shortest) }));
}
