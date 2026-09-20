/**
 * Reading a tar archive.  [PURE]
 *
 * The corpus arrives as one `.tar.gz`, Node can gunzip but cannot untar, and
 * a dependency for the rest would be out of proportion: tar is a list of
 * 512-byte headers, each followed by its file, padded to the next 512. That
 * is the whole format, at least the part a 2022 dataset uses.
 *
 * Only what is needed is implemented — regular files, their names and their
 * bytes. Anything else in an archive is skipped rather than guessed at.
 */

const BLOCK = 512;

/** One file out of an archive. */
export type Entry = { name: string; data: Uint8Array };

const decoder = new TextDecoder();

/** A NUL-terminated field, as text. */
function field(block: Uint8Array, at: number, length: number): string {
  const raw = block.subarray(at, at + length);
  const end = raw.indexOf(0);
  return decoder.decode(end === -1 ? raw : raw.subarray(0, end)).trim();
}

/** Sizes are octal text, not numbers, and a size of `''` means zero. */
function octal(text: string): number {
  const value = parseInt(text, 8);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Every regular file in the archive, in order.
 *
 * `wanted` keeps the reader from holding a copy of an archive it only needs
 * eight files out of — FLORES is two hundred languages and this measures a
 * handful of them.
 */
export function untar(archive: Uint8Array, wanted?: (name: string) => boolean): Entry[] {
  const entries: Entry[] = [];

  for (let at = 0; at + BLOCK <= archive.length; ) {
    const header = archive.subarray(at, at + BLOCK);

    // Two blocks of zeroes end the archive; one is enough to stop reading.
    if (header.every((b) => b === 0)) break;

    const name = field(header, 0, 100);
    const size = octal(field(header, 124, 12));
    const type = field(header, 156, 1);
    const prefix = field(header, 345, 155);
    const full = prefix ? `${prefix}/${name}` : name;

    at += BLOCK;

    // '0' and '' are both a regular file; '5' is a directory, and the rest are
    // links and metadata this has no use for.
    if ((type === '0' || type === '') && (!wanted || wanted(full))) {
      entries.push({ name: full, data: archive.subarray(at, at + size) });
    }

    at += Math.ceil(size / BLOCK) * BLOCK;
  }

  return entries;
}
