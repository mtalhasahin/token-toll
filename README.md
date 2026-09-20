# Token Toll

**What your language costs you in tokens.**

The same sentence is not the same price in every language. A model is billed by the token, its context
window is measured in tokens, and how many tokens a sentence becomes depends on whether the merge
table that cuts it up ever saw much of your language. Nobody shows you that number, so here it is:
2,009 sentences, translated by professional translators into fourteen languages, counted in six real
tokenizers.

```bash
npx token-toll "Evlerinizden çıkarken şemsiyenizi almayı unutmayın."
```

```
51 characters · 5 words

  tokenizer           tokens  chars/token  vs best

  Mistral v3              27         1.89    ×1.69
  DeepSeek V3             22         2.32    ×1.38
  Qwen 2.5                18         2.83    ×1.13
  GPT-4o / o200k          17         3.00    ×1.06
  Llama 3.1               16         3.19    ×1.00
  Gemma 2                 16         3.19    ×1.00

Mistral v3 charges 69% more than Gemma 2 for this exact text.
Same words, same meaning — the difference is which merge table saw the language during training.
```

**[The tables and a live calculator →](https://mtalhasahin.github.io/token-toll)**

---

## What the numbers say

**Turkish costs ×1.40 to ×2.21 as much as English**, depending on which tokenizer you send it to.

| tokenizer | vocab | Turkish vs English | chars/token |
| --- | --- | --- | --- |
| Gemma 2 | 256k | **×1.40** | 3.58 |
| Llama 3.1 | 128k | **×1.40** | 3.57 |
| GPT-4o / o200k | 200k | **×1.43** | 3.54 |
| Qwen 2.5 | 152k | **×1.62** | 3.03 |
| DeepSeek V3 | 128k | **×2.03** | 2.47 |
| Mistral v3 | 33k | **×2.21** | 2.05 |

Three things fall out of that table, and none of them is the thing people repeat.

**It is not three times.** The figure that circulates — Turkish costs three times what English does —
holds for no tokenizer measured here. On the three most widely used it is around 1.4, which is a real
tax and a much smaller one than the folklore. Writing your prompts in English to save money is worth
about 30% on a modern tokenizer, before you count what you lose by not writing in your own language.

**Which tokenizer you pick matters more than which language you write in.** Turkish on Gemma 2 (×1.40)
is cheaper than German on Mistral v3 (×1.58) — and German is a language nobody thinks of as expensive.
The spread across tokenizers for one language is wider than the spread across most languages for one
tokenizer.

**Vocabulary size is not the lever it looks like.** Llama 3.1 and DeepSeek V3 both have 128k-token
vocabularies, and they differ by 45% on Turkish. A bigger vocabulary gives a tokenizer room to learn
your language; it does not make it do so. What was in the training mix decides that.

### Every language

Against English at 1.00, averaged across the six tokenizers, with the range.

| language | mean | range |
| --- | --- | --- |
| Hindi | ×2.96 | 1.57–4.57 |
| Hungarian | ×1.94 | 1.66–2.12 |
| Arabic | ×1.88 | 1.38–3.48 |
| Finnish | ×1.84 | 1.56–2.01 |
| Swahili | ×1.81 | 1.48–1.94 |
| Korean | ×1.72 | 1.47–2.46 |
| **Turkish** | **×1.68** | **1.40–2.21** |
| Russian | ×1.61 | 1.39–1.87 |
| Japanese | ×1.55 | 1.18–2.15 |
| French | ×1.50 | 1.35–1.59 |
| German | ×1.46 | 1.25–1.58 |
| Spanish | ×1.45 | 1.26–1.58 |
| Chinese | ×1.20 | 0.95–1.62 |
| English | ×1.00 | — |

Turkish comes out *cheaper* than Finnish and Hungarian, which build words the same way it does. Being
agglutinative is not the whole story either: being in the training data is.

### What it costs you in context

A 100k-token window holds **3,833 English sentences or 2,690 Turkish ones** on GPT-4o. Same window,
30% less of your document. For anything that fills its context — a long chat, a codebase, a stack of
retrieved passages — that is the part that bites before the bill does.

---

## Using it

```bash
npx token-toll "your text here"     # weigh a string in every tokenizer
npx token-toll --file prompt.txt    # or a file
cat prompt.txt | npx token-toll     # or a pipe

npx token-toll --corpus                              # measure whole languages
npx token-toll --corpus --languages turkish,finnish  # just these
npx token-toll --models gpt-4o,gemma-2 "metin"       # just these tokenizers
```

Tokenizer files are downloaded once and cached. `--corpus` also fetches a 25 MB sentence corpus.
**Nothing needs an API key.**

As a library, when you want the count and not the table:

```js
import { load, modelById } from 'token-toll';

const tokenizer = await load(modelById('gpt-4o'));
tokenizer.count('Evlerinizden çıkarken şemsiyenizi almayı unutmayın.'); // 17
```

## How it is measured

**The sentences.** Comparing what a language costs needs text that says the same thing in each
language, and almost nothing does: machine-aligned corpora disagree about content, and independently
written articles differ in length by a factor of three. Either would measure the corpus rather than
the tokenizer. [FLORES-200](https://github.com/facebookresearch/flores/tree/main/flores200) is the
exception — 2,009 sentences carried into 204 languages by professional translators and aligned line
for line, so line 41 is the same sentence everywhere. CC BY-SA 4.0, fetched on first use; only the
counts derived from it are published here.

**The tokenizers.** Not approximated. Each model's own `tokenizer.json` is read and run — the
normalizer, the pre-tokenizer and the merge table — so the count is the one that model would be
charged. Every file is pinned to a commit, not to `main`, so a figure quoted from here stays
reproducible. The tests hold this implementation to Hugging Face's own library: 108 comparisons across
six tokenizers, ids in order, on Turkish suffix stacks, CJK, emoji, code and whitespace.

**Special tokens are excluded.** A real request wraps text in a template — `<bos>`, chat markers, a
system prompt — and that wrapper is identical in every language. Counting it would add a constant to
both sides and quietly shrink every ratio. What is measured here is the text.

**Tokens per word is shown but does not lead.** The literature uses it, so it is in the output, but it
flatters Turkish for a reason that has nothing to do with cost: `evlerinizden` is one word where
English spends three. The ratio over matched sentences is the honest number.

**Claude and Gemini are absent.** Neither publishes a tokenizer; both offer an endpoint that counts.
Adding them would mean an API key, and anyone should be able to reproduce this with nothing but a
network connection.

Run it yourself — the whole measurement takes about half a minute once the files are cached:

```bash
git clone https://github.com/mtalhasahin/token-toll && cd token-toll
npm install && npm run measure
```

## Prior work

The idea that tokenizers are not fair across languages is well established —
[Petrov et al.](https://arxiv.org/abs/2305.15425) measured it across 99 languages in 2023, and
[the African Language Tax](https://arxiv.org/abs/2606.24460) put the same argument in cost terms.
What was missing was a Turkish figure, from current tokenizers, that anyone can run and check rather
than cite. That is what this is.

---

MIT © [mtalhasahin](https://github.com/mtalhasahin)
