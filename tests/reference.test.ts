/**
 * Held to the reference implementation, token for token.
 *
 * Everything this project claims rests on the counts being the real ones, so
 * the tokenizer in `src/` is run beside Hugging Face's own library on the same
 * strings and the ids must match exactly — not the totals, the ids, in order.
 *
 * `@huggingface/transformers` is a development dependency only. It is the
 * thing being checked against; shipping it would defeat the point of having
 * written the tokenizer at all.
 */

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import { AutoTokenizer, type PreTrainedTokenizer } from '@huggingface/transformers';

import { load } from '../src/load.ts';
import { MODELS } from '../src/registry.ts';
import type { Tokenizer } from '../src/tokenizer.ts';

/** Strings chosen for the places a tokenizer is most likely to be wrong. */
const SAMPLES: Record<string, string> = {
  english: 'The quick brown fox jumps over the lazy dog.',
  turkish: 'Evlerinizden çıkarken şemsiyenizi almayı unutmayın.',
  'turkish-suffixes': 'Çekoslovakyalılaştıramadıklarımızdan mısınız?',
  'turkish-casing': 'İstanbul ve Iğdır arasında IŞIK ışık ığdır',
  diacritics: 'şğüçöıİĞÜÇÖŞ',
  german: 'Die Donaudampfschifffahrtsgesellschaft fährt über München.',
  finnish: 'Lentokonesuihkuturbiinimoottoriapumekaanikko istuu järvellä.',
  korean: '안녕하세요, 오늘 날씨가 좋네요.',
  arabic: 'الطقس اليوم جميل جدا في المدينة.',
  japanese: '今日はいい天気ですね。散歩に行きましょう。',
  numbers: 'Fiyat 1.234.567,89 TL, tarih 2026-09-20, oran %12.5',
  code: 'const total = items.filter((x) => x.ok).reduce((a, b) => a + b, 0);',
  whitespace: 'satır bir\n\n  satır iki\ttab\n   üç boşluk',
  emoji: 'Merhaba 👋🏽 dünya 🇹🇷 ateş 🔥',
  mixed: 'Bu bir prompt: "Sen yardımcı bir asistansın." — max_tokens=512',
  empty: '',
  space: ' ',
  long: 'Türkiye Cumhuriyeti Anayasası uyarınca, kanunların anayasaya uygunluğunun denetimi Anayasa Mahkemesi tarafından yapılır ve bu denetim sonucunda verilen kararlar kesindir.',
};

describe('matches the reference tokenizer', () => {
  for (const spec of MODELS) {
    describe(spec.id, () => {
      let mine: Tokenizer;
      let theirs: PreTrainedTokenizer;

      before(async () => {
        mine = await load(spec);
        theirs = await AutoTokenizer.from_pretrained(spec.repo, { revision: spec.revision });
      });

      for (const [name, text] of Object.entries(SAMPLES)) {
        test(name, () => {
          const expected = theirs.encode(text, { add_special_tokens: false });
          assert.deepEqual(mine.encode(text), expected, `\n  text: ${JSON.stringify(text)}`);
        });
      }
    });
  }
});
