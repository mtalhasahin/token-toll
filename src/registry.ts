/**
 * Which tokenizers are measured, and exactly which copies of them.
 *
 * Every entry is pinned to a commit, not to `main`. A tokenizer file is
 * usually stable for the life of a model, but "usually" is not good enough for
 * a number someone will quote: if the file moves, this should stop matching
 * its own recorded results rather than quietly produce different ones.
 *
 * Some entries point at a mirror rather than the model's own repository. The
 * reason is always the same — the original is behind a licence click-through,
 * and a measurement nobody can reproduce without an account is not much of a
 * measurement. The mirrors carry the identical file; `npm run verify` checks
 * that against the reference implementation.
 */

export type ModelSpec = {
  /** The short name used in output and on the site. */
  id: string;
  label: string;
  vendor: string;
  /** The Hugging Face repository the `tokenizer.json` comes from. */
  repo: string;
  /** Pinned commit. */
  revision: string;
  /** Why this repo and not another, when that needs saying. */
  note?: string;
};

export const MODELS: readonly ModelSpec[] = [
  {
    id: 'gpt-4o',
    label: 'GPT-4o / o200k',
    vendor: 'OpenAI',
    repo: 'Xenova/gpt-4o',
    revision: '7956d98f2a83b2751a98ea7136fdf7fe6cf54e69',
    note: 'the o200k_base table, as a tokenizer.json',
  },
  {
    id: 'llama-3.1',
    label: 'Llama 3.1',
    vendor: 'Meta',
    repo: 'Xenova/Meta-Llama-3.1-Tokenizer',
    revision: 'd49ea33e96b3fcf8738bb79ff9d85da81742fa82',
    note: "mirror; Meta's own repository is gated",
  },
  {
    id: 'qwen-2.5',
    label: 'Qwen 2.5',
    vendor: 'Alibaba',
    repo: 'Qwen/Qwen2.5-7B',
    revision: 'd149729398750b98c0af14eb82c78cfe92750796',
  },
  {
    id: 'gemma-2',
    label: 'Gemma 2',
    vendor: 'Google',
    repo: 'Xenova/gemma-2-tokenizer',
    revision: '9c050f9ba3b2403c5c41a04dcbc9041b9383b5ab',
    note: "mirror; Google's own repository is gated",
  },
  {
    id: 'mistral-v3',
    label: 'Mistral v3',
    vendor: 'Mistral',
    repo: 'Xenova/mistral-tokenizer-v3',
    revision: 'b251f946a5b6b16c36963ea8848611bce67dfbf1',
    note: "mirror; Mistral's own repository is gated",
  },
  {
    id: 'deepseek-v3',
    label: 'DeepSeek V3',
    vendor: 'DeepSeek',
    repo: 'deepseek-ai/DeepSeek-V3',
    revision: 'e815299b0bcbac849fa540c768ef21845365c9eb',
  },
];

export const modelById = (id: string): ModelSpec | undefined => MODELS.find((m) => m.id === id);

/**
 * Claude and Gemini are not here.
 *
 * Neither publishes a tokenizer; both offer an endpoint that counts. Adding
 * them would mean an API key, and the point of this measurement is that
 * anyone can run it with nothing but a network connection. They are worth
 * adding behind a flag later, and the shape of `Tokenizer` is what a flag
 * like that would have to implement.
 */
export const ABSENT = ['claude', 'gemini'] as const;
