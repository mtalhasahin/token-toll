#!/usr/bin/env node
/**
 * The entry point, and nothing else.
 *
 * `cli.ts` holds the parsing and the run so both can be tested without a
 * process; this is the part that cannot be.
 */

import { main } from './cli.ts';

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    process.exit(1);
  },
);
