/**
 * The page.
 *
 * Two jobs: render the measurements that were made offline, and run the real
 * tokenizer on whatever someone types. The second is the reason the tokenizer
 * in `src/` was written by hand — it is a few kilobytes of pure JavaScript, so
 * the browser can do the same arithmetic the CLI does instead of being shown
 * a picture of it.
 */

import { Tokenizer } from './lib/tokenizer.js';

const $ = (id) => document.getElementById(id);

const results = await fetch('./results.json').then((r) => r.json());

const modelById = (id) => results.models.find((m) => m.id === id);
const languageByCode = (code) => results.languages.find((l) => l.code === code);
const cell = (model, language) => results.measurements.find((m) => m.model === model && m.language === language);

const TURKISH = 'tur_Latn';

/** A ratio, coloured by how much it hurts. Kept subtle: this is a table, not a heatmap. */
function heat(ratio) {
  const over = Math.max(0, Math.min(1, (ratio - 1) / 2));
  const alpha = (0.05 + over * 0.35).toFixed(2);
  return `background: color-mix(in oklab, var(--accent) ${Math.round(over * 100)}%, transparent ${Math.round(
    100 - over * 100,
  )}%); background-color: rgba(180, 85, 45, ${alpha});`;
}

function table(el, head, rows) {
  el.innerHTML =
    `<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows
      .map(
        (r) =>
          `<tr class="${r.className ?? ''}">${r.cells
            .map((c) => `<td${c.style ? ` style="${c.style}"` : ''}>${c.text}</td>`)
            .join('')}</tr>`,
      )
      .join('')}</tbody>`;
}

/* ---- the headline ---- */

const turkishRatios = results.models.map((m) => cell(m.id, TURKISH).ratio);
const best = Math.min(...turkishRatios);
const worst = Math.max(...turkishRatios);
const turkishWindow = cell('gpt-4o', TURKISH);
const englishWindow = cell('gpt-4o', 'eng_Latn');

$('headline').innerHTML = [
  [`×${best.toFixed(2)}–${worst.toFixed(2)}`, 'what Turkish costs against English, depending on the tokenizer'],
  [
    `${Math.round((1 - turkishWindow.sentencesPer100k / englishWindow.sentencesPer100k) * 100)}%`,
    'less Turkish than English fits in the same context window (GPT-4o)',
  ],
  [`${results.corpus.sentences.toLocaleString('en')}`, 'sentences, translated by hand into every language measured'],
]
  .map(([n, k]) => `<div class="stat"><span class="n">${n}</span><span class="k">${k}</span></div>`)
  .join('');

/* ---- Turkish, in detail ---- */

table(
  $('turkish'),
  ['tokenizer', 'vs English', 'chars / token', 'tokens / word', 'vocab', 'sentences per 100k'],
  [...results.models]
    .sort((a, b) => cell(a.id, TURKISH).ratio - cell(b.id, TURKISH).ratio)
    .map((m) => {
      const t = cell(m.id, TURKISH);
      return {
        cells: [
          { text: `${m.label}<br><span class="hint">${m.vendor}</span>` },
          { text: `×${t.ratio.toFixed(2)}`, style: heat(t.ratio) },
          { text: t.charsPerToken.toFixed(2) },
          { text: t.tokensPerWord.toFixed(2) },
          { text: (m.vocabSize / 1000).toFixed(0) + 'k' },
          { text: t.sentencesPer100k.toLocaleString('en') },
        ],
      };
    }),
);

/* ---- every language ---- */

const ordered = [...results.languages].sort((a, b) => {
  if (a.code === results.baseline) return -1;
  if (b.code === results.baseline) return 1;
  const mean = (l) => results.models.reduce((n, m) => n + cell(m.id, l.code).ratio, 0) / results.models.length;
  return mean(b) - mean(a);
});

table(
  $('matrix'),
  ['language', ...results.models.map((m) => m.label), 'mean'],
  ordered.map((l) => {
    const ratios = results.models.map((m) => cell(m.id, l.code).ratio);
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    return {
      className: l.code === TURKISH ? 'me' : l.code === results.baseline ? 'base' : '',
      cells: [
        { text: `${l.label} <span class="hint">${l.endonym}</span>` },
        ...ratios.map((r) => ({ text: r.toFixed(2), style: l.code === results.baseline ? '' : heat(r) })),
        { text: mean.toFixed(2) },
      ],
    };
  }),
);

/* ---- the calculator ---- */

$('model').innerHTML = results.models
  .map((m) => `<option value="${m.id}">${m.label}</option>`)
  .join('');

const SAMPLES = {
  'Turkish sentence': 'Evlerinizden çıkarken şemsiyenizi almayı unutmayın.',
  'Suffix stack': 'Çekoslovakyalılaştıramadıklarımızdan mısınız?',
  'Same in English': 'Do not forget to take your umbrella when you leave your houses.',
  'A system prompt': 'Sen yardımcı bir asistansın. Kullanıcıya kısa ve net cevap ver.',
};

$('samples').innerHTML = Object.keys(SAMPLES)
  .map((name) => `<button data-sample="${name}">${name}</button>`)
  .join('');

$('samples').addEventListener('click', (event) => {
  const name = event.target.dataset?.sample;
  if (name) $('text').value = SAMPLES[name];
});

/** Tokenizers are megabytes each; one is fetched when it is first asked for. */
const loaded = new Map();

async function tokenizerFor(id) {
  if (loaded.has(id)) return loaded.get(id);

  const spec = modelById(id);
  const url = `https://huggingface.co/${spec.repo}/resolve/${spec.revision}/tokenizer.json`;
  const file = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`could not fetch the tokenizer (HTTP ${r.status})`);
    return r.json();
  });

  const tokenizer = Tokenizer.fromJSON(file);
  loaded.set(id, tokenizer);
  return tokenizer;
}

async function count() {
  const text = $('text').value;
  const button = $('count');
  const status = $('status');

  button.disabled = true;
  const rows = [];

  try {
    for (const spec of results.models) {
      status.textContent = loaded.has(spec.id) ? `counting ${spec.label}…` : `fetching ${spec.label}…`;
      const tokenizer = await tokenizerFor(spec.id);
      rows.push({ spec, tokens: tokenizer.count(text) });
    }
    status.textContent = '';
  } catch (e) {
    status.textContent = e.message;
  } finally {
    button.disabled = false;
  }

  if (rows.length === 0) return;

  const chars = [...text].length;
  const cheapest = Math.min(...rows.map((r) => r.tokens));

  table(
    $('counts'),
    ['tokenizer', 'tokens', 'chars / token', 'vs cheapest'],
    rows
      .sort((a, b) => b.tokens - a.tokens)
      .map((r) => ({
        cells: [
          { text: r.spec.label },
          { text: r.tokens.toLocaleString('en') },
          { text: r.tokens > 0 ? (chars / r.tokens).toFixed(2) : '—' },
          {
            text: cheapest > 0 ? `×${(r.tokens / cheapest).toFixed(2)}` : '—',
            style: heat(cheapest > 0 ? r.tokens / cheapest : 1),
          },
        ],
      })),
  );
}

$('count').addEventListener('click', count);

/* ---- method ---- */

$('method').innerHTML = `
  ${results.corpus.sentences.toLocaleString('en')} sentences from ${results.corpus.name}, translated into every
  language by professional translators and aligned line for line, so line 41 is the same sentence everywhere.
  Each is run through the model's own <code>tokenizer.json</code>, pinned to a commit. ${results.note}
  Tokens per word is shown because the literature uses it, but it flatters Turkish for a reason that has nothing
  to do with cost: <code>evlerinizden</code> is one word where English spends three. The ratio is the honest number.
  Measured ${results.generated}.
`;
