// The text form of Deal lists and shoe decks (src/ui/listtext.js): every
// list in the reference solutions (and in the levels' bolted-down cells)
// reads back from its text unchanged; the shorthand reads as documented;
// mistakes and limits are reported; and the editing helpers do what the
// editor's pad and tools expect.
import assert from 'node:assert';
import { readdirSync } from 'node:fs';
import { ALL_LEVELS } from '../src/ui/catalog.js';
import { MAX_DECK, MAX_DEAL_SIDES } from '../src/score.js';
import {
  readList, formatList, lexList, tokenAt, insertAt, removeRange, setCount, moveToken, ungroup, wrapGroup, tapEntry, NEW_DECK,
} from '../src/ui/listtext.js';

const ALL_SPECIALS = ['?', '??', '$', '$$'];
const read = (kind, text, specials = ALL_SPECIALS) => readList(kind, text, { specials });
const R = (v, n) => Array(n).fill(v);

// Round trips: every list we have, as the editor would show it.
let n = 0;
const roundTrip = (kind, list, where) => {
  const text = formatList(kind, list);
  const back = read(kind, text);
  assert.deepStrictEqual(back.list, list, `${where}: ${JSON.stringify(text)} reads back as the same ${kind} list (${back.error ?? ''})`);
  n++;
};
const lists = (cells, where) => {
  for (const c of cells) {
    if (c.kind === 'shoe') roundTrip('shoe', c.deck, `${where} shoe at ${c.at}`);
    if (c.fn === 'deal' && c.out?.to?.length) roundTrip('deal', c.out.to, `${where} deal at ${c.at}`);
  }
};
for (const file of readdirSync(new URL('../solutions/levels/', import.meta.url))) {
  lists((await import(`../solutions/levels/${file}`)).default.cells, file);
}
for (const lv of ALL_LEVELS) lists(lv.fixed, lv.id);
for (const list of [[], [0], [5, 5], [1, 3, 1, 1, 3, 1, 1, 3, 1, 1, 3, 1, 1, 3, 1, 1], R(5, 60)]) roundTrip('deal', list, 'sample');
for (const list of [['AS'], NEW_DECK, ['TH', 'TH'], ['$', '?', '??', '$$'], ['KS', 'QS', 'JS', 'TS'], [...NEW_DECK, ...NEW_DECK, 'AS']]) roundTrip('shoe', list, 'sample');

// The shortest form.
assert.strictEqual(formatList('deal', [1, ...R(5, 25), 2, ...R(5, 11), 1, ...R(5, 13)]), 'SE NEx25 SW NEx11 SE NEx13');
assert.strictEqual(formatList('deal', [1, 3, 1, 1, 3, 1, 1, 3, 1, 1, 3, 1, 1, 3, 1, 1]), '(SE W SE)x5 SE');
assert.strictEqual(formatList('shoe', [...R('KH', 12), 'TC']), 'KHx12 10C');
assert.strictEqual(formatList('shoe', NEW_DECK), 'deck');
assert.strictEqual(formatList('shoe', ['S', 'D', 'C', 'H'].flatMap((s) => 'A23456789TJQK'.split('').map((r) => r + s)).concat('?')), 'AS-KS\nAD-KD\nAC-KC\nAH-KH\n?');

// Reading the shorthand.
const deal = (t) => read('deal', t).list;
const shoe = (t) => read('shoe', t).list;
assert.deepStrictEqual(deal('ne x3, sw\n→ ↗'), [5, 5, 5, 2, 0, 5]);
assert.deepStrictEqual(deal('NEx2 E*2 W×2 (SE W)x2'), [5, 5, 0, 0, 3, 3, 1, 3, 1, 3]);
assert.deepStrictEqual(deal(''), []);
assert.deepStrictEqual(shoe('as 10h K♦ td'), ['AS', 'TH', 'KD', 'TD']);
assert.deepStrictEqual(shoe('2H-5H 5h-3h A-3S'), ['2H', '3H', '4H', '5H', '5H', '4H', '3H', 'AS', '2S', '3S']);
assert.deepStrictEqual(shoe('H').length, 13);
assert.deepStrictEqual(shoe('deck'), NEW_DECK);
assert.deepStrictEqual(shoe('$x2 ?? (AS KS)x2'), ['$', '$', '??', 'AS', 'KS', 'AS', 'KS']);

// Mistakes.
const err = (kind, t, specials) => read(kind, t, specials).error;
assert.match(err('deal', 'NE NEW'), /"NEW" isn't a side/);
assert.match(err('deal', 'NE x0'), /Counts go from 1/);
assert.match(err('deal', '(NE SE'), /never closed/);
assert.match(err('deal', 'NE)x2'), /no "\("/);
assert.match(err('deal', `NEx${MAX_DEAL_SIDES + 1}`), /at most 60 sides/);
assert.strictEqual(err('deal', `NEx${MAX_DEAL_SIDES}`), null);
assert.match(err('shoe', 'AS-KH'), /stays in one suit/);
assert.match(err('shoe', ''), /at least one card/);
assert.match(err('shoe', '(deck)x9x9'), /"x9" is not a card/);
assert.match(err('shoe', `(deck)x${Math.ceil(MAX_DECK / 52) + 1}`), /at most 1000 cards/);
assert.match(err('shoe', '((deck)x999)x999'), /at most 1000 cards/); // stops expanding at the limit
// Special cards: unknown where the floor has none (so the error doesn't give them away).
assert.match(err('shoe', '? AS', []), /"\?" is not a card \(try AS, 10H, KD\)/);
assert.match(err('shoe', '$$ AS', ['?', '??']), /isn't allowed on this floor \(allowed here: \? \?\?\)/);
assert.strictEqual(err('shoe', '? ?? AS', ['?', '??']), null);
// Every token knows its own mistake (the field underlines each one).
assert.deepStrictEqual(read('deal', 'NE QQ SW (').toks.map((t) => !!t.err), [false, true, false, true]);

// Editing.
const lex = (t) => lexList('deal', t);
assert.strictEqual(tokenAt(lex('NE SW'), 2), 0);
assert.strictEqual(tokenAt(lex('NE SW'), 3), 1);
assert.strictEqual(tokenAt(lex('NE  SW'), 3), -1);
assert.deepStrictEqual(insertAt('NE SW', 2, 'E'), { text: 'NE E SW', caret: 4 });
assert.deepStrictEqual(insertAt('(NE)', 1, 'E'), { text: '(E NE)', caret: 2 });
assert.deepStrictEqual(removeRange('NE E SW', 3, 4), { text: 'NE SW', caret: 3 });
assert.deepStrictEqual(removeRange('NE\nE SW', 3, 4), { text: 'NE\nSW', caret: 3 });
assert.deepStrictEqual(setCount('NE SWx3', lex('NE SWx3')[1], 1), { text: 'NE SW', caret: 5 });
assert.deepStrictEqual(setCount('NE SW', lex('NE SW')[0], 4), { text: 'NEx4 SW', caret: 4 });
assert.strictEqual(moveToken('NE SW E', lex('NE SW E')[0], 7).text, 'SW E NE');
assert.strictEqual(moveToken('NE SW E', lex('NE SW E')[2], 0).text, 'E NE SW');
assert.strictEqual(moveToken('NE SW E', lex('NE SW E')[1], 2), null);
assert.strictEqual(ungroup('E (NE SW)x3 W', lex('E (NE SW)x3 W'), 1).text, 'E NE SW W');
assert.strictEqual(ungroup('E (NE SW)x3 W', lex('E (NE SW)x3 W'), 4).text, 'E NE SW W');
assert.strictEqual(wrapGroup('E NE SW W', lex('E NE SW W'), 3, 6).text, 'E (NE SW)x2 W');
assert.strictEqual(wrapGroup('E NE SW W', lex('E NE SW W'), 3, 3).text, 'E (NE)x2 SW W');
assert.deepStrictEqual(tapEntry('deal', 'E NE', 4, 'NE'), { text: 'E NEx2', caret: 6 });
assert.deepStrictEqual(tapEntry('deal', 'E NEx2', 6, 'NE'), { text: 'E NEx3', caret: 6 });
assert.deepStrictEqual(tapEntry('deal', 'E NE', 4, 'SW'), { text: 'E NE SW', caret: 7 });
assert.deepStrictEqual(tapEntry('deal', 'E NE', 2, 'SW'), { text: 'E SW NE', caret: 4 });
assert.deepStrictEqual(tapEntry('deal', '', 0, 'W'), { text: 'W', caret: 1 });
assert.deepStrictEqual(tapEntry('shoe', 'AS kh', 5, 'KH'), { text: 'AS khx2', caret: 7 });
assert.deepStrictEqual(tapEntry('shoe', 'AS 10H', 6, 'TH'), { text: 'AS 10Hx2', caret: 8 });

console.log(`listtext: ${n} lists read back from their text; shorthand, mistakes and edits as expected`);
