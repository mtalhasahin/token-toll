/**
 * Assembles `docs/`, which is what GitHub Pages serves.
 *
 * The page is not a separate implementation. The tokenizer that runs in the
 * browser is the compiled `src/tokenizer.ts` — the same file the tests hold
 * to Hugging Face's own library — so a number someone gets by pasting text
 * into the page is the number the CLI would give them.
 *
 * That works only because those modules are pure: no `node:` imports, no
 * filesystem, nothing but strings and maps. This script checks that rather
 * than assuming it, because the day someone adds a convenient import is the
 * day the page silently stops loading.
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The modules the page needs, in dependency order. */
const LIB = ['regex.js', 'bpe.js', 'pieces.js', 'tokenizer.js'];

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');
const docs = join(root, 'docs');

await mkdir(join(docs, 'lib'), { recursive: true });

for (const name of LIB) {
  const source = join(dist, name);
  const code = await readFile(source, 'utf8');

  const nodeImport = code.match(/from ['"]node:[^'"]+['"]/);
  if (nodeImport) {
    throw new Error(`${name} imports ${nodeImport[0]} — it can no longer run in a browser`);
  }
  await writeFile(join(docs, 'lib', name), code, 'utf8');
}

// The page reads the measurements at load; they are the repository's own
// results file, copied rather than duplicated so there is one source of them.
await copyFile(join(root, 'results', 'results.json'), join(docs, 'results.json'));

process.stdout.write(`docs/ built: ${LIB.length} modules and the results\n`);
