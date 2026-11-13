// The bonus deck: floors outside the 56-card campaign, a second deck of 52.
// Each opens once its `unlockAfter` floors are solved (one id or a list;
// campaign floors or other bonus floors), and has its own card: A..K of
// spades, then hearts, clubs and diamonds, in this list's order, which is
// easiest first (the Diff column of docs/campaign.md, then par croupiers),
// not the order they open in, except that a floor always comes after the
// bonus floors it needs. Some are floors cut from the campaign to make room
// (their ids are unchanged, since saves are keyed by id); the others are
// extras.
//
// Each floor opens after the campaign or bonus floor whose idea or story it
// takes further, as early as its palette allows; the floors that need every
// croupier and special card open in lines from Déjà Vu. docs/campaign.md
// ("The bonus deck: Opening") lists the lines. Some floors take something
// away: Off Suit, Night Off, Skeleton Crew and No Kings a croupier (or two),
// Ceasefire the War; One Deck, One War and Dumbwaiter bolt a shoe or
// croupier to the floor (fixed cells). Crossed Wires and Uneven Tables seat
// three players with labelled desks, Follow Suit four; Mirror Image,
// Showdown, Twice Shy, Pot Luck, Twenty-One Card Trick and the casino-number
// floors seat two. Perfect Pair and Counterfeit deal from two decks
// (`decks: 2`).
import {
  hexRange, hexRect, makeTests, makeMixedTests, dealtTests, floorOf, source, desk, E, SE, SW, W, NW, NE,
  hv, high, one, paletteThrough, finishChapter,
} from './shared.js';
import {
  RANKS, rankOf, suitOf, rankValue, highValue, largestSet, rankCounts, fullDeck, shuffled, isFlush, rng,
} from '../cards.js';

const B1 = [source([-3, 0], E), desk([1, 0])];
const B2 = [source([-3, 0], E), desk([0, 0])];
const B3 = [source([-2, 0], E), desk([2, 0])];
const B4 = [source([-3, 0], E), desk([-1, 0])];
const B5 = [source([-3, 0], E), desk([0, 0])];
const B6 = [source([-3, 0], E), desk([1, 0])];
const B7 = [source([-3, 0], E), desk([-2, 2])];
const B8 = [source([-3, 0], E), desk([-2, 2])];
const B9 = [source([-4, 0], E), desk([-2, 1])];
const B10 = [source([-4, 0], E), desk([-3, 2])];
const B11 = [source([-5, 0], E), desk([-4, 2])];
// Two seated players: hand i of a test is player A's for even i, B's for odd.
const seated = (at, out, seat) => ({ ...source(at, out), seat });
const B12 = [seated([-5, 0], E, 0), seated([-5, 1], NE, 1), desk([-4, 2])];
const B13 = [seated([-6, -4], E, 0), seated([-6, -3], NE, 1), desk([-7, -1])];
const H1 = [source([-3, 0], E), desk([-3, 2])];
const H2 = [source([-2, 1], E), desk([-2, 3])];
// Three seated players down the left of a 6 x 9 floor, a row apart, and
// three labelled desks (X, Y, Z from the top) down the right.
const H4 = [source([-4, 0], E), desk([1, 2])];
const H5 = [seated([-6, 4], E, 0), seated([-5, 3], SE, 1), desk([-4, 7])];
const H6 = [seated([5, -1], W, 0), seated([4, 1], W, 1), desk([-2, 0])];
const H7 = [...H6.slice(0, 2), desk([-4, 4])];
const H8 = [seated([2, -2], SW, 0), seated([2, -1], SE, 1), desk([1, 4])];
// Red Flush's player and desk (its floor is two rings smaller).
const H9 = [source([-2, 0], E), desk([2, 0])];
// Two Pair's player and desk, on the same floor.
const H10 = [source([-3, -1], E), desk([3, -2])];
// Missing Card's player and desk.
const H11 = [source([-3, 0], E), desk([-1, 2])];
// Running Count's player and desk.
const H12 = [source([-1, 0], E), desk([3, 2])];
// Round the Clock's player and desk.
const H13 = [source([-1, 0], E), desk([4, -3])];
const labelled = (at, n) => ({ ...desk(at), desk: n });
const H3 = [
  seated([-2, -2], E, 0), seated([-3, 0], E, 1), seated([-4, 2], E, 2),
  labelled([3, -2], 0), labelled([2, 0], 1), labelled([1, 2], 2),
];

const ALL = ['high', 'top'];
const last = (before) => before[before.length - 1];
// The cards of the most common rank(s), and the rest.
function splitSet(h) {
  const counts = rankCounts(h);
  const max = Math.max(...counts.values());
  return [h.filter((c) => counts.get(rankOf(c)) === max), h.filter((c) => counts.get(rankOf(c)) !== max)];
}
// The rank gaps between two cards, with the ace played low and high.
const gaps = ([a, b]) => new Set([Math.abs(rankValue(a) - rankValue(b)), Math.abs(highValue(a) - highValue(b))]);
// Pay the first hand holding a 2, then the first after it holding a 3, and
// so on up to the ace, then a 2 again.
function countingUp(h, before) {
  let want = 1;
  for (const b of before) if (b.some((c) => rankOf(c) === RANKS[want])) want = (want + 1) % 13;
  return h.some((c) => rankOf(c) === RANKS[want]);
}
// One Up: the next card up in the same suit (the king's is the ace).
const oneUp = (c) => RANKS[(RANKS.indexOf(rankOf(c)) + 1) % 13] + suitOf(c);
// Two players' hands, as [player A's, player B's] for each deal.
const deals = (inputs) => Array.from({ length: Math.floor(inputs.length / 2) }, (_, i) => [inputs[2 * i], inputs[2 * i + 1]]);
const same = (a, b) => [...a].sort().join() === [...b].sort().join();
// Showdown: the higher hand of a deal, comparing the highest cards, then
// the middle ones, then the lowest (aces high); 0 on a tie.
const ranked = (h) => h.map(hv).sort((x, y) => y - x);
function showdown(a, b) {
  const x = ranked(a), y = ranked(b);
  const i = x.findIndex((v, j) => v !== y[j]);
  return i < 0 ? 0 : x[i] > y[i] ? 1 : -1;
}
// Mirror Image tests: each player deals from their own deck; player B's
// hand is often player A's cards reordered, or one card off.
function mirrorDeals(rand, nTests, nDeals) {
  const tests = [];
  for (let t = 0; t < nTests; t++) {
    const d1 = shuffled(fullDeck(), rand), d2 = shuffled(fullDeck(), rand);
    const test = [];
    for (let i = 0; i < nDeals; i++) {
      const a = d1.splice(0, 5);
      const x = rand();
      let b;
      if (x < 0.45) b = shuffled(a, rand);
      else if (x < 0.7) {
        // one card swapped for another of the same rank or the same suit
        b = shuffled(a, rand);
        const k = Math.floor(rand() * 5), c = b[k];
        const alts = fullDeck().filter((y) => !a.includes(y) && (rankOf(y) === rankOf(c) || suitOf(y) === suitOf(c)));
        b[k] = alts[Math.floor(rand() * alts.length)];
      } else b = d2.splice(0, 5);
      test.push(a, b);
    }
    tests.push(test);
  }
  return tests;
}
// Crossed Wires: each player's hands go to the desk diametrically opposite
// (player A's, the top seat, to desk Z, the bottom desk). A missing hand
// (a player with fewer hands) is null.
const crossed = (inputs) => inputs.flatMap((h, i) => (h ? [{ desk: 2 - (i % 3), hand: h }] : []));
// Three players with different numbers of hands (0 to 6 each), 1 to 3
// cards each, from one deck: the deals in turn, null where a player has
// run out.
function unevenDeals(rand, nTests) {
  const tests = [];
  for (let t = 0; t < nTests; t++) {
    const counts = shuffled([0, 1, 2, 3, 4, 5, 6], rand).slice(0, 3);
    const deck = shuffled(fullDeck(), rand);
    const test = [];
    for (let i = 0; i < 3 * Math.max(...counts); i++) {
      test.push(Math.floor(i / 3) < counts[i % 3] ? deck.splice(0, 1 + Math.floor(rand() * 3)) : null);
    }
    tests.push(test);
  }
  return tests;
}
// Fixed tests for Uneven Tables: each player's hands as a list, interleaved.
const seats3 = (...players) => Array.from({ length: 3 * Math.max(...players.map((p) => p.length)) },
  (_, i) => players[i % 3][Math.floor(i / 3)] ?? null);

// Twice Shy: every hand, less the cards played more than once tonight (by
// either player; a hand left with no cards pays nothing).
function onceOnly(inputs) {
  const n = new Map();
  for (const c of inputs.flat()) n.set(c, (n.get(c) ?? 0) + 1);
  return inputs.map((h) => h.filter((c) => n.get(c) === 1)).filter((h) => h.length);
}
// Two players, each with a deck of their own: `nDeals` five-card hands each.
function twoDeckDeals(rand, nTests, nDeals) {
  const tests = [];
  for (let t = 0; t < nTests; t++) {
    const a = shuffled(fullDeck(), rand), b = shuffled(fullDeck(), rand);
    tests.push(Array.from({ length: 2 * nDeals }, (_, i) => (i % 2 ? b : a).splice(0, 5)));
  }
  return tests;
}

// Casino numbers: base thirteen with no zero; the digits are the cards ace
// (one) to king (thirteen), so thirteen is K, fourteen A A, twenty-six A K,
// twenty-seven 2 A. Paid in spades, the leading digit on top.
const SPADE = (v) => `${RANKS[v - 1]}S`;
export function casino(n) {
  const digits = [];
  for (let v = n; v > 0; v = Math.floor((v - 1) / 13)) digits.unshift(SPADE(((v - 1) % 13) + 1));
  return digits;
}
// A two-card hand as a casino number, its leading digit on top.
const twoDigits = ([a, b]) => 13 * rankValue(a) + rankValue(b);
// Two players' two-digit casino numbers (a club on top for the leading
// digit, a spade for the units), `nDeals` deals a test.
function twoDigitDeals(rand, nTests, nDeals) {
  const card = (suit) => `${RANKS[Math.floor(rand() * 13)]}${suit}`;
  return Array.from({ length: nTests }, () => Array.from({ length: 2 * nDeals }, () => [card('C'), card('S')]));
}
// Two players' one-card hands of spades A..K, `nDeals` deals a test.
function digitDeals(rand, nTests, nDeals) {
  return Array.from({ length: nTests }, () => Array.from({ length: 2 * nDeals }, () => [SPADE(1 + Math.floor(rand() * 13))]));
}

// Three-card hands dealt from a deck without kings, `per` hands a test.
function kinglessDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => {
    const deck = shuffled(fullDeck().filter((c) => rankOf(c) !== 'K'), rand);
    return Array.from({ length: per }, (_, i) => deck.slice(3 * i, 3 * i + 3));
  });
}

// Four-card hands rich in pairs, each test dealt from one deck: mostly two
// pair, often one pair, sometimes trips, quads or nothing (a shape that the
// deck can no longer make falls back to the next one).
function pairedDeals(rand, nTests, per) {
  const SHAPES = [[2, 2], [2, 2], [2, 2], [2, 1, 1], [2, 1, 1], [3, 1], [4], [1, 1, 1, 1]];
  return Array.from({ length: nTests }, () => {
    const deck = shuffled(fullDeck(), rand);
    return Array.from({ length: per }, () => {
      const first = Math.floor(rand() * SHAPES.length);
      for (const shape of [...SHAPES.slice(first), [1, 1, 1, 1]]) {
        const hand = [];
        for (const n of shape) {
          const ranks = RANKS.filter((r) => !hand.some((c) => rankOf(c) === r) && deck.filter((c) => rankOf(c) === r).length >= n);
          if (!ranks.length) break;
          const r = ranks[Math.floor(rand() * ranks.length)];
          hand.push(...deck.filter((c) => rankOf(c) === r).slice(0, n));
        }
        if (hand.length < 4) continue;
        for (const c of hand) deck.splice(deck.indexOf(c), 1);
        return shuffled(hand, rand);
      }
      throw new Error('pairedDeals: deck ran out');
    });
  });
}

// The Rest of the Deck: every card of the deck nobody played, one at a time.
const unplayed = (inputs) => {
  const played = new Set(inputs.flat());
  return fullDeck().filter((c) => !played.has(c)).map((c) => [c]);
};

// Every time the fourth unpaid card of a rank is played, those four.
function quadsOf(inputs) {
  const piles = {}, out = [];
  for (const [c] of inputs) {
    const pile = (piles[rankOf(c)] ??= []);
    pile.push(c);
    if (pile.length === 4) out.push(pile.splice(0));
  }
  return out;
}

// Ceasefire, Three in a Row, Odds and Evens.
import { isStraight } from '../cards.js';
// Ceasefire: single spades, a card paid when it beats the card before it
// (aces low). Each test is one suit of spades, shuffled (sometimes only part
// of it).
const C1 = [source([-3, 0], E), desk([0, 2])];
function spadeDeals(rand, nTests) {
  return Array.from({ length: nTests }, () => {
    const suit = shuffled(RANKS.map((r) => `${r}S`), rand);
    return suit.slice(0, rand() < 0.5 ? 13 : 8 + Math.floor(rand() * 5)).map((c) => [c]);
  });
}
// Three in a Row: the card and the two before it are three consecutive
// ranks, in any order (ace high or low, no K-A-2). The tests deal single
// cards from one deck, each usually a rank or two from the card before
// (either way, and round from the king to the ace, so K A 2 turns up too),
// so that runs of three are common.
const C2 = [source([-3, 0], E), desk([-1, 2])];
const threeInARow = (h, before) => before.length >= 2 && isStraight([h[0], ...before.slice(-2).map((b) => b[0])]);
function nearDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => {
    const deck = shuffled(fullDeck(), rand);
    const out = [];
    let r = Math.floor(rand() * 13);
    for (let i = 0; i < per; i++) {
      if (i) r = rand() < 0.75 ? (r + [-2, -1, 1, 2][Math.floor(rand() * 4)] + 13) % 13 : Math.floor(rand() * 13);
      const k = deck.findIndex((c) => rankOf(c) === RANKS[r]);
      const [card] = deck.splice(Math.max(k, 0), 1);
      r = RANKS.indexOf(rankOf(card));
      out.push([card]);
    }
    return out;
  });
}
// Odds and Evens: five-card hands with an even number of red cards (none
// counts). The player sits in the middle of the floor.
const C3 = [source([0, -1], E), desk([1, 1])];
const redCount = (h) => h.filter((c) => suitOf(c) === 'H' || suitOf(c) === 'D').length;

// Twenty-One Card Trick: player A's 21 cards as one hand, with player B's
// card (one of A's) 11th from the top and the other 20 as they come.
function trick(inputs) {
  return deals(inputs).map(([a, [b]]) => {
    const rest = a.filter((c) => c !== b);
    return [...rest.slice(0, 10), b, ...rest.slice(10)];
  });
}
// A fixed deal: A's hand, and B's card, the one in place i of it (0: top).
const pick = (hand, i) => [hand, hand.split(' ')[i]];
// `nDeals` deals a test, each from a fresh deck: 21 cards for A, and one of
// them, in any place, for B.
function trickDeals(rand, nTests, nDeals) {
  return Array.from({ length: nTests }, () => Array.from({ length: nDeals }, () => {
    const a = shuffled(fullDeck(), rand).slice(0, 21);
    return [a, [a[Math.floor(rand() * 21)]]];
  }).flat());
}
// Players A and B both hand their cards to the same hex.
const TRICK21 = [seated([-5, 0], E, 0), seated([-5, 1], NE, 1), desk([-2, 3])];

// Rank and File: a hand in rank order, lowest on top, aces low; cards of
// the same rank spade, diamond, club, heart (as in a new deck).
const RF = [source([-3, 1], E), desk([-3, 3])];
const SUIT_ORDER = ['S', 'D', 'C', 'H'];
const inRankOrder = (h) => [...h].sort((a, b) => rankValue(a) - rankValue(b) ||
  SUIT_ORDER.indexOf(suitOf(a)) - SUIT_ORDER.indexOf(suitOf(b)));
// Five-card hands rich in repeated ranks, each test dealt from one deck:
// pairs, two pair, trips, full houses and quads as well as five ranks; some
// already in order, some in reverse order (a shape the deck can no longer
// make falls back to the next one, and in the end to any five cards).
function rankDeals(rand, nTests, per) {
  const SHAPES = [[1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [2, 1, 1, 1], [2, 1, 1, 1], [2, 2, 1], [2, 2, 1],
    [3, 1, 1], [3, 2], [4, 1]];
  return Array.from({ length: nTests }, () => {
    const deck = shuffled(fullDeck(), rand);
    return Array.from({ length: per }, () => {
      const first = Math.floor(rand() * SHAPES.length);
      let hand = null;
      for (const shape of SHAPES.slice(first)) {
        const pick = [];
        for (const n of shape) {
          const ranks = RANKS.filter((r) => !pick.some((c) => rankOf(c) === r) &&
            deck.filter((c) => rankOf(c) === r && !pick.includes(c)).length >= n);
          if (!ranks.length) break;
          const r = ranks[Math.floor(rand() * ranks.length)];
          pick.push(...shuffled(deck.filter((c) => rankOf(c) === r), rand).slice(0, n));
        }
        if (pick.length === 5) { hand = pick; break; }
      }
      hand ??= deck.slice(0, 5);
      for (const c of hand) deck.splice(deck.indexOf(c), 1);
      const order = rand();
      return order < 0.15 ? inRankOrder(hand) : order < 0.3 ? inRankOrder(hand).reverse() : shuffled(hand, rand);
    });
  });
}

// One Deck, One War, Dumbwaiter: floors with shoes and croupiers bolted to
// the floor (fixed cells the player can't move or change).
//
// One Deck: Seven Heaven with no shoes but one, bolted down, dealing one
// deck once in new deck order.
const ONE_DECK = [
  source([-4, 0], E), desk([0, 0]),
  { at: [1, -3], kind: 'shoe', out: SW, deck: fullDeck(), once: true },
];
// Five-card hands with 0 to 4 sevens, each hand dealt on its own (the house
// plays from a multi-deck shoe); sometimes three or four of another rank.
function sevensDeals(rand, nTests, per = 10) {
  const pick = (from, n) => shuffled(from, rand).slice(0, n);
  const sevens = fullDeck().filter((c) => rankOf(c) === '7');
  return Array.from({ length: nTests }, () => Array.from({ length: per }, () => {
    if (rand() < 0.12) {
      const r = RANKS.filter((k) => k !== '7')[Math.floor(rand() * 12)];
      const set = pick(fullDeck().filter((c) => rankOf(c) === r), 3 + Math.floor(rand() * 2));
      return shuffled([...set, ...pick(fullDeck().filter((c) => rankOf(c) !== r), 5 - set.length)], rand);
    }
    const k = [0, 1, 2, 2, 3, 3, 3, 4][Math.floor(rand() * 8)];
    return shuffled([...pick(sevens, k), ...pick(fullDeck().filter((c) => rankOf(c) !== '7'), 5 - k)], rand);
  }));
}
// One War: Inside Bet with no War croupiers but one, bolted down, its
// dealer's side and all four ports fixed.
const ONE_WAR = [
  source([-2, -1], E), desk([2, 0]),
  { at: [0, 0], kind: 'croupier', fn: 'war', rule: 'high', dealer: W, out: { win: NE, lose: SE, dwin: SW, dlose: E } },
];
// Dumbwaiter: two rooms with no hexes in common and none side by side (the
// player's on the left, screen columns up to -1; the desk's on the right,
// from 2), joined only by a bolted Hand(1) between them, which hands cards
// on one at a time into the desk's room.
const DUMBWAITER = [
  source([-4, 0], E), desk([4, 0]),
  { at: [0, 0], kind: 'croupier', fn: 'hand', n: 1, out: { out: E } },
];
const DUMBWAITER_FLOOR = [...hexRect(-2, 2, -9, -1), ...hexRect(-2, 2, 2, 9)];

// Checkerboard, Natural, Snap and Crazy Eights.
const CB = [source([-3, 0], E), desk([1, 0])];
const NT = [source([-4, 0], E), desk([-1, 1])];
const SN = [source([-3, 0], E), desk([2, -1])];
const CE = [source([-2, 0], E), desk([2, 1])];
// A card drawn from a full deck, its rank one of `ranks` (a string).
const drawCard = (rand, ranks = RANKS.join('')) => ranks[Math.floor(rand() * ranks.length)] + 'SDCH'[Math.floor(rand() * 4)];
// Checkerboard: the red cards and the black cards in turn, a red card on
// top, each colour in the order it was dealt.
const red = (c) => suitOf(c) === 'H' || suitOf(c) === 'D';
function checkerboard(h) {
  const reds = h.filter(red), blacks = h.filter((c) => !red(c));
  return reds.flatMap((c, i) => [c, blacks[i]]);
}
// Six-card hands of three red and three black cards in any order, `per`
// hands a test from one deck.
function colourDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => {
    const deck = shuffled(fullDeck(), rand);
    const reds = deck.filter(red), blacks = deck.filter((c) => !red(c));
    return Array.from({ length: per }, (_, i) => shuffled([...reds.slice(3 * i, 3 * i + 3), ...blacks.slice(3 * i, 3 * i + 3)], rand));
  });
}
// Natural: an ace with a 10, jack, queen or king.
const TENS = 'TJQK';
const natural = (h) => h.some((c) => rankOf(c) === 'A') && h.some((c) => TENS.includes(rankOf(c)));
// Two-card hands, each drawn from a full deck: about a third of them
// blackjacks, the rest mostly near misses.
const NATURAL_SHAPES = [['A', TENS], ['A', TENS], ['A', TENS], ['A', '23456789'], ['A', '9'], ['A', 'A'],
  [TENS, TENS], [TENS, '6789'], [RANKS.join(''), RANKS.join('')]];
function blackjackDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => Array.from({ length: per }, () => {
    const shape = NATURAL_SHAPES[Math.floor(rand() * NATURAL_SHAPES.length)];
    let h;
    do h = shuffled(shape.map((ranks) => drawCard(rand, ranks)), rand); while (h[0] === h[1]);
    return h;
  }));
}
// Snap: single cards, each drawn from a full deck, often of the rank of the
// card before (and the first card often a 7).
function snapDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => {
    const cards = [rand() < 0.3 ? drawCard(rand, '7') : drawCard(rand)];
    while (cards.length < per) {
      const before = cards[cards.length - 1];
      let c;
      do c = rand() < 0.4 ? drawCard(rand, rankOf(before)) : drawCard(rand); while (c === before);
      cards.push(c);
    }
    return cards.map((c) => [c]);
  });
}
// Crazy Eights: a card pays if nothing has been paid yet, if it is an 8,
// or if it matches the last card paid in rank or suit.
const eightPays = (c, top) => !top || rankOf(c) === '8' || rankOf(c) === rankOf(top) || suitOf(c) === suitOf(top);
function crazyEights(h, before) {
  let top = null;
  for (const [c] of before) if (eightPays(c, top)) top = c;
  return eightPays(h[0], top);
}
// Single cards, each drawn from a full deck, with more 8s than a deck has.
function eightsDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => Array.from({ length: per }, () => [drawCard(rand, rand() < 0.12 ? '8' : RANKS.join(''))]));
}

// Every Twenty-One and Hit Me.
// Every Twenty-One: the card takes the night's running total, counted as in
// blackjack (ace 1, picture cards 10), to or past the next multiple of 21.
const pointsOf = (c) => Math.min(10, rankValue(c));
function everyTwentyOne(h, before) {
  const s = before.reduce((a, [c]) => a + pointsOf(c), 0);
  return Math.floor((s + pointsOf(h[0])) / 21) > Math.floor(s / 21);
}
const E21 = [source([-1, 0], E), desk([-1, -2])];
// Hit Me: a hand's total with every ace counted as 1 and picture cards as 10.
const blackjack = (h) => h.reduce((a, c) => a + Math.min(10, rankValue(c)), 0);
const HIT = [source([-3, -1], E), desk([-5, 4])];
// Hit Me tests: hands of 2 to 5 cards, each test from one deck, most of
// them with totals (aces 1) close to 21 either way.
function nearTwentyOne(rand, nTests, per) {
  const SIZES = [2, 3, 3, 3, 4, 4, 4, 5, 5];
  const val = (c) => Math.min(10, rankValue(c));
  // n cards of `deck` with total t, or null (cards taken in deck order).
  const find = (deck, n, t, from = 0) => {
    if (n === 0) return t === 0 ? [] : null;
    if (t < n || t > 10 * n) return null;
    for (let i = from; i <= deck.length - n; i++) {
      const rest = find(deck, n - 1, t - val(deck[i]), i + 1);
      if (rest) return [deck[i], ...rest];
    }
    return null;
  };
  return Array.from({ length: nTests }, () => {
    const deck = shuffled(fullDeck(), rand);
    const test = [];
    while (test.length < per && deck.length >= 5) {
      const n = SIZES[Math.floor(rand() * SIZES.length)];
      const t = rand() < 0.85 ? 18 + Math.floor(rand() * 7) : 2 + Math.floor(rand() * 40);
      const hand = find(deck, n, t) ?? deck.slice(0, n);
      for (const c of hand) deck.splice(deck.indexOf(c), 1);
      test.push(shuffled(hand, rand));
    }
    return test;
  });
}

// Perfect Pair and Counterfeit: the house deals from a two-deck shoe
// (`decks: 2`), so a card can turn up twice.
const twoDecks = () => [...fullDeck(), ...fullDeck()];
// Perfect Pair: two identical cards (same rank and suit) in one hand.
const perfectPair = (h) => new Set(h).size < h.length;
// Perfect Pair tests: `per` five-card hands from one shuffled two-deck shoe.
// The first card of a hand often draws its twin, or another card of its
// rank, from what is left of the shoe (so the hands stay honest: no card
// is dealt more often than the shoe holds it).
function twinDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => {
    const shoe = shuffled(twoDecks(), rand);
    return Array.from({ length: per }, () => {
      const hand = [shoe.shift()];
      const take = (pred) => { const j = shoe.findIndex(pred); if (j >= 0) hand.push(...shoe.splice(j, 1)); };
      const x = rand();
      if (x < 0.4) take((c) => c === hand[0]);
      else if (x < 0.7) take((c) => rankOf(c) === rankOf(hand[0]) && c !== hand[0]);
      while (hand.length < 5) hand.push(shoe.shift());
      return shuffled(hand, rand);
    });
  });
}
const PERFECT = [source([-3, 1], E), desk([-1, 2])];
// Counterfeit: a card identical to one already played tonight.
const counterfeit = ([c], before) => before.some(([b]) => b === c);
// Counterfeit tests: the first `per` cards of a shuffled two-deck shoe.
const shoeDeals = (rand, nTests, per) => Array.from({ length: nTests }, () => shuffled(twoDecks(), rand).slice(0, per).map((c) => [c]));
const COUNTERFEIT = [source([-2, 1], E), desk([2, 1])];

// Missing Card, Running Count and Round the Clock.
//
// Missing Card: each test is one hand, a deck less one card; the card
// missing, as a one-card hand.
const missingCards = (inputs) => inputs.flatMap((h) => fullDeck().filter((c) => !h.includes(c)).map((c) => [c]));
// A deck less `card`, as a hand: in new deck order, reversed, or shuffled
// with a seed.
function lessOne(card, order = 'new') {
  let deck = fullDeck().filter((c) => c !== card);
  if (order === 'reversed') deck.reverse();
  else if (typeof order === 'number') deck = shuffled(deck, rng(order));
  return deck.join(' ');
}
function lessOneDeals(rand, nTests) {
  return Array.from({ length: nTests }, () => {
    const deck = shuffled(fullDeck(), rand);
    deck.splice(Math.floor(rand() * 52), 1);
    return [deck];
  });
}

// Running Count: 2 to 6 count one up, 10 to ace one down (aces high), 7 to
// 9 nothing; a card pays when the count, with it, is above zero.
const hiLo = (c) => (highValue(c) <= 6 ? 1 : highValue(c) >= 10 ? -1 : 0);
const runningCount = (h, before) => [...before, h].reduce((n, [c]) => n + hiLo(c), 0) > 0;

// Round the Clock: as soon as every rank has been played since the last
// payout, the first card of each rank in that time, as one hand.
function roundTheClock(inputs) {
  const out = [];
  let firsts = new Map();
  for (const [c] of inputs) {
    if (!firsts.has(rankOf(c))) firsts.set(rankOf(c), c);
    if (firsts.size === 13) { out.push([...firsts.values()]); firsts = new Map(); }
  }
  return out;
}
// Single cards from one deck, `per` a test, three in four of them of a rank
// not yet seen since the last time round the clock (while there is one).
function clockDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => {
    const deck = shuffled(fullDeck(), rand), test = [];
    let seen = new Set();
    while (test.length < per) {
      const fresh = deck.filter((c) => !seen.has(rankOf(c)));
      const pool = fresh.length && (rand() < 0.75 || fresh.length === deck.length) ? fresh : deck;
      const c = pool[Math.floor(rand() * pool.length)];
      deck.splice(deck.indexOf(c), 1);
      test.push([c]);
      seen.add(rankOf(c));
      if (seen.size === 13) seen = new Set();
    }
    return test;
  });
}

// Pot Luck: two seated players play War, one card each per deal (aces
// high). The higher card wins both, and the pot if there is one, as one
// hand at the winner's desk (A's at X, B's at Y). On a tie (the same rank)
// both cards go into the pot, which carries on growing until a deal has a
// winner; a pot left at the end is never paid.
const POT_LUCK = [seated([-3, 0], E, 0), seated([-3, 1], E, 1), labelled([0, -2], 0), labelled([2, 0], 1)];
function potLuck(inputs) {
  const out = [];
  let pot = [];
  for (const [[a], [b]] of deals(inputs)) {
    if (rankOf(a) === rankOf(b)) { pot.push(a, b); continue; }
    out.push({ desk: hv(a) > hv(b) ? 0 : 1, hand: [a, b, ...pot] });
    pot = [];
  }
  return out;
}
// Pot Luck tests: `per` deals from one deck, player B's card often of the
// same rank as player A's, so ties come singly and in runs.
function potDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => {
    const deck = shuffled(fullDeck(), rand);
    const test = [];
    for (let i = 0; i < per; i++) {
      const a = deck.shift();
      const k = rand() < 0.35 ? deck.findIndex((c) => rankOf(c) === rankOf(a)) : -1;
      const [b] = deck.splice(Math.max(0, k), 1);
      test.push([a], [b]);
    }
    return test;
  });
}

// Follow Suit: four seated players, one card each per trick, player A
// leading every trick. The trick's four cards are paid as one hand at the
// desk of its winner (A's at X, B's at Y, C's at Z, D's at W): the highest
// card of the suit A led, aces high; cards of other suits never win.
const FOLLOW_SUIT = [
  seated([-6, -1], E, 0), seated([-6, 0], NE, 1), seated([-7, 1], E, 2), seated([-7, 2], NE, 3),
  labelled([-6, 7], 0), labelled([-5, 7], 1), labelled([-4, 7], 2), labelled([-3, 7], 3),
];
const inTricks = (inputs) => Array.from({ length: Math.floor(inputs.length / 4) }, (_, i) => inputs.slice(4 * i, 4 * i + 4).map(([c]) => c));
function followSuit(inputs) {
  return inTricks(inputs).map((t) => {
    let w = 0;
    t.forEach((c, i) => { if (suitOf(c) === suitOf(t[0]) && hv(c) > hv(t[w])) w = i; });
    return { desk: w, hand: t };
  });
}
// Follow Suit tests: 13 tricks from one deck, each player after A following
// suit about half the time (while the suit lasts).
function followSuitDeals(rand, nTests) {
  return Array.from({ length: nTests }, () => {
    const deck = shuffled(fullDeck(), rand);
    const test = [];
    for (let i = 0; i < 13; i++) {
      const lead = deck.shift();
      test.push([lead]);
      for (let s = 1; s < 4; s++) {
        const k = rand() < 0.5 ? deck.findIndex((c) => suitOf(c) === suitOf(lead)) : -1;
        test.push(deck.splice(Math.max(0, k), 1));
      }
    }
    return test;
  });
}

// Cut to the Ace.
// A hand cut so that the A♠ is on top: the cards above it moved, in order,
// under the rest.
const ctaCut = (h) => { const i = h.indexOf('AS'); return [...h.slice(i), ...h.slice(0, i)]; };
// Hands of 8 to 20 cards, each dealt on its own from a deck (the house plays
// from a multi-deck shoe), with the A♠ in any place.
function ctaDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => Array.from({ length: per }, () => {
    const n = 8 + Math.floor(rand() * 13);
    const hand = shuffled(fullDeck().filter((c) => c !== 'AS'), rand).slice(0, n - 1);
    hand.splice(Math.floor(rand() * n), 0, 'AS');
    return hand;
  }));
}
const CTA = [source([-3, 0], E), desk([1, 0])];

// Punto Banco.
// Baccarat points: aces 1, 2 to 9 their face value, 10s and picture cards
// nothing; a hand is worth the units digit of its total.
const bacValue = (c) => (rankValue(c) >= 10 ? 0 : rankValue(c));
const bacPoints = (h) => h.reduce((a, c) => a + bacValue(c), 0) % 10;
// Two-card hands, each test from one deck: about half of them naturals, the
// rest mostly worth 7 or nothing (the second card chosen from what is left
// of the deck to make the total wanted, when it can).
function bacDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => {
    const deck = shuffled(fullDeck(), rand);
    return Array.from({ length: per }, () => {
      const a = deck.shift();
      const x = rand();
      const want = x < 0.5 ? [8, 9] : x < 0.7 ? [7] : x < 0.8 ? [0] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const j = deck.findIndex((b) => want.includes(bacPoints([a, b])));
      const b = j >= 0 ? deck.splice(j, 1)[0] : deck.shift();
      return rand() < 0.5 ? [a, b] : [b, a];
    });
  });
}
const BAC = [source([-3, -1], E), desk([-3, 1])];

// First Sighting: a two-card hand's ranks, ignoring suits and order (7-8
// and 8-7 are one combination; a pair is a combination of its own).
const combo = (h) => h.map(rankOf).sort().join('');
const firstSighting = (h, before) => !before.some((b) => combo(b) === combo(h));
// Two-card hands from a multi-deck shoe, rich in repeats: each hand either
// plays an earlier hand's ranks again (either way round, fresh suits), or
// two ranks from a handful (so new hands often share a rank with old ones,
// and pairs turn up).
// (FS: the floor's player and desk.)
const FS = [source([-5, 2], E), desk([-4, 1])];
function sightingDeals(rand, nTests, per) {
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const SUITS = ['S', 'D', 'C', 'H'];
  return Array.from({ length: nTests }, () => {
    const ranks = shuffled(RANKS, rand).slice(0, 6);
    const hands = [];
    for (let i = 0; i < per; i++) {
      const [a, b] = hands.length && rand() < 0.4 ? pick(hands).map(rankOf) : [pick(ranks), pick(ranks)];
      const [s, t] = shuffled(SUITS, rand);
      hands.push(shuffled([a + s, b + t], rand));
    }
    return hands;
  });
}

export const LEVELS = [
  {
    id: 'split-pot',
    card: 'AS',
    unlockAfter: 'top-pair',
    title: 'Split Pot',
    difficulty: 2,
    story: [
      'The rival casino has started splitting its pots, and the Owner will not be outdone. Any five-card hand with a pair or better is paid out in two parts: first its biggest set, then everything else, each part as a hand of its own.',
      'Two pair is one set of four cards; in a full house the set is the three of a kind and the pair goes with the rest. Hands without a pair pay nothing.',
    ],
    brief: 'Five-card hands. For every hand with a pair or better, pay out its largest set and the rest of the hand as two separate hands.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -7, 3), B2),
    fixed: B2,
    croupiers: paletteThrough('set'),
    expected: (inputs) => inputs.filter((h) => largestSet(h) >= 2).flatMap(splitSet),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['KS KD 2C 3H 4S', '2S 5D 2C 9H 2H', 'AS AD KC KH 2S', 'QS QD QC 9H 9S', '7S 7D 7C 7H KS',
        'AS KD QC JH 9S', '2H 4H 6H 8H TH', '3S 3D 4C 4H 4S']],
      nRandom: 4, seed: 162,
    }),
  },
  {
    id: 'small-change',
    card: '2S',
    unlockAfter: 'beat-the-dealer',
    title: 'Small Change',
    difficulty: 2,
    story: [
      'Sal Vellani has a rule about kings: a king is too much money to leave on the table. Tonight, for every king played, the house hands over the ace of spades from its own cards, and keeps the king.',
      'Queens, aces and everything else are just cards, and pay nothing.',
    ],
    brief: 'Single cards. For every king played, pay out the ace of spades (a house card). Nothing else is paid.',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -7, 4), B1),
    fixed: B1,
    croupiers: paletteThrough('war'),
    expected: (inputs) => inputs.filter(([c]) => rankOf(c) === 'K').map(() => ['AS']),
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [one('KS QS AS KD 2C KH JD AH KC'), one('KH KD KC KS'), one('QS AD JC 2H')],
      nRandom: 4, seed: 161,
    }),
  },
  {
    id: 'checkerboard',
    card: '3S',
    unlockAfter: 'bottom-dealer',
    title: 'Checkerboard',
    difficulty: 3,
    story: [
      'The Vellanis like red and the Kesslers like black, and tonight, by some accident of the seating plan, they are at one table. Each six-card hand holds three red cards and three black, and the Owner\'s note says the desk will pay every hand as a checkerboard: red, black, red, black, red, black, a red card on top.',
      'Neither family will have its own cards rearranged: the red cards must stay in the order they were dealt, and so must the black. The cashier checks the order of every card. Top-card War is still the law.',
    ],
    brief: 'Six-card hands, three red and three black. Pay out every hand with its colours alternating, a red card on top, the red cards in the order they were dealt and the black cards likewise (card order checked). (Top-card War only.)',
    handSize: 6,
    floor: floorOf(hexRect(-2, 2, -7, 3), CB),
    fixed: CB,
    croupiers: paletteThrough('inshuffle'),
    warRules: ['top'],
    expected: (inputs) => inputs.map(checkerboard),
    ordered: true,
    tests: dealtTests({
      deal: (rand, n) => colourDeals(rand, n, 8),
      fixed: [
        // already a checkerboard, black on top, each colour together
        ['AH AS 2D 2C 3H 3S', 'AS AH 2C 2D 3S 3H', 'KH QD JH KS QC JS', 'KS QC JS KH QD JH', 'TH 9S 8C 7D 6S 5H',
          '2C 4D 6S 8H TC QD', 'AD 2S 3S 4D 5H 6C', 'KC QH JS TD 9C 8H'],
        // hands back to back
        ['7H 7S 7D 7C 8H 8S', '8S 9S TS 9H 8D 7H', 'QD KC AH 2S 3C 4D', '5S 5H 6S 6H 7S 7H'],
      ],
      nRandom: 4, seed: 201,
    }),
  },
  {
    id: 'two-apart',
    card: '4S',
    unlockAfter: 'deja-vu',
    title: 'Two Apart',
    difficulty: 3,
    story: [
      'The doormen are back on their break, and they have a new game for it. A two-card hand wins if its cards are exactly two ranks apart: a 5 with a 7, a 10 with a queen.',
      'The ace plays high or low, so an ace with a 3 wins, and so does a queen with an ace. A king with a 2 is not two apart, however you count it.',
    ],
    brief: 'Two-card hands. Pay out every hand whose cards are exactly two ranks apart (ace high or low).',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -7, 5), B7),
    fixed: B7,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h) => gaps(h).has(2),
    tests: makeTests({
      handSize: 2, handsPerTest: 20,
      fixed: [
        ['AS 3D', '3C AH', 'QS AD', 'AC QH', 'KS 2D', '5S 7D', '7C 5H', '5D 6S', '9S 9D', '2S 5D',
          'TS QD', 'KD JC', '2C 4H', 'AH 2H', 'KH AS', '8S TS'],
        // two apart back to back, then not
        ['3S 5D', '6C 4H', 'JS 9D', 'KC JH', 'AD 3C', '3H 4S', 'KS AC', '7D 7C', '2D 6H', '8C JD'],
      ],
      nRandom: 4, seed: 171,
    }),
  },
  {
    id: 'snap',
    card: '5S',
    unlockAfter: 'next-in-line',
    title: 'Snap',
    difficulty: 3,
    story: [
      'The Marchetti twins have found a game they can both play at once, and play it loudly. Single cards: a card wins if it has the same rank as the card played just before it, whatever the suits. A 6 after a 6 wins, and a third 6 wins too.',
      'The first card of the night has no card before it, so it is compared with a 7, as in the mayor\'s new column: a 7 to start the night wins. The rival\'s old owner says he has never seen the twins agree on anything so quickly.',
    ],
    brief: 'Single cards. Pay out every card of the same rank as the card before it (the first card is compared with a 7).',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -7, 5), SN),
    fixed: SN,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    pays: (h, before) => rankOf(h[0]) === rankOf(before.length ? last(before)[0] : '7C'),
    tests: dealtTests({
      deal: (rand, n) => snapDeals(rand, n, 24),
      fixed: [
        one('7S 7D 2C 2H 2S KD QD QC 5H 6H 6C AS AD 3S 4S 4S'),
        // snaps back to back, then none
        one('9C 9H 9S 9D 9C JH JD JS 3C 3D 5S 8D TC 2H KS 4D'),
        one('7H'), one('6D'),
      ],
      nRandom: 4, seed: 203,
    }),
  },
  {
    id: 'three-apart',
    card: '6S',
    unlockAfter: 'two-apart',
    title: 'Three Apart',
    difficulty: 3,
    story: [
      'The doormen have told the cloakroom, and the cloakroom plays it one better: a two-card hand wins if its cards are exactly three ranks apart, a 4 with a 7 or a 10 with a king.',
      'The ace still plays high or low: an ace with a 4 wins, and so does a jack with an ace.',
    ],
    brief: 'Two-card hands. Pay out every hand whose cards are exactly three ranks apart (ace high or low).',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -7, 5), B8),
    fixed: B8,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h) => gaps(h).has(3),
    tests: makeTests({
      handSize: 2, handsPerTest: 20,
      fixed: [
        ['AS 4D', '4C AH', 'JS AD', 'AC JH', 'KS 3D', '2S 5D', '9C 6H', '7S 9D', '7S TD', 'TC KD',
          '6S 7H', '8D 8C', 'AD 3S', 'QS AC', '2H 6C', '5H 8S'],
        // three apart back to back, then not
        ['3S 6D', '9C 6H', 'QS 9D', 'KC TH', 'AD 4C', '3H 5S', 'KS AC', '7D 7C', '2D 7H', '8C 9D'],
      ],
      nRandom: 4, seed: 172,
    }),
  },
  {
    id: 'natural',
    card: '7S',
    unlockAfter: 'ace-in-the-hole',
    title: 'Natural',
    difficulty: 4,
    story: [
      'Sal Vellani has been to a casino out of town and come back talking about nothing but blackjack. The Owner will not have a game at the tables that counts to twenty-one, but agrees to pay the one hand Sal cares about: a two-card hand that is an ace with a 10, a jack, a queen or a king.',
      'Two aces are a pair of aces, not a natural, and pay nothing. Sal says the casino out of town also gave him free drinks, and he has not decided which he misses more.',
    ],
    brief: 'Two-card hands. Pay out every blackjack: an ace with a 10, J, Q or K (two aces don\'t count).',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -9, 5), NT),
    fixed: NT,
    croupiers: paletteThrough('war'),
    pays: natural,
    tests: dealtTests({
      deal: (rand, n) => blackjackDeals(rand, n, 20),
      fixed: [
        ['AS TD', 'JC AH', 'AD QS', 'KH AC', 'AS AD', 'AH 9C', '2D AS', 'KS QD', 'TC TH', 'KD 9S', 'AC 5H', '7S 8D',
          'JH JS', 'QC AD'],
        // winners back to back, then losers that fail in different ways
        ['TS AS', 'AH TH', 'AC KC', 'QD AD', 'JS AH', 'AH AC', 'KD QH', 'AS 9D', '3C 4H', 'AD 2S', 'JD TC'],
      ],
      nRandom: 4, seed: 202,
    }),
  },
  {
    id: 'off-suit',
    card: '8S',
    unlockAfter: 'red-flush',
    title: 'Off Suit',
    difficulty: 4,
    story: [
      'The croupier who splits hands by suit has gone to a cousin\'s wedding, and Sal Vellani\'s uncle has come back for his red flushes: three-card hands, and the house pays any hand that is all hearts or all diamonds.',
      'The uncle says he would have gone to the wedding himself, if anyone had thought to invite him.',
    ],
    brief: 'Three-card hands. Pay out every flush in hearts or diamonds, with no Suits croupier.',
    handSize: 3,
    floor: floorOf(hexRange(4), H9),
    fixed: H9,
    croupiers: paletteThrough('flush').filter((c) => c !== 'suits'),
    pays: (h) => isFlush(h) && ['H', 'D'].includes(suitOf(h[0])),
    tests: makeTests({
      handSize: 3, handsPerTest: 10,
      fixed: [
        ['2H 7H KH', '3D 9D QD', '4S 8S JS', '5C TC AC', 'AH 2D 3H', 'KD QD JH', '6H 6D 6S', 'AD KD 2D', '9S 9H 4C', 'TH JH QH'],
        // two of a red suit and one other, either way round
        ['2H 3H 4S', '5D 6D 7C', 'KS QH JH', '8C 9D TD', 'AH 5D 9H', 'JD 2H QD'],
      ],
      nRandom: 4, seed: 188,
    }),
  },
  {
    id: 'crossed-wires',
    card: '9S',
    unlockAfter: 'beat-the-dealer',
    title: 'Crossed Wires',
    difficulty: 4,
    story: [
      'The Owner has had the floor rewired: three card tables down one wall, three cash desks down the other, and a note under the tray. Every player is to be paid at the desk diametrically opposite their seat, so that the money is seen to cross the room.',
      'Player A, at the top, is paid at desk Z, at the bottom; player B, in the middle, at desk Y; player C, at the bottom, at desk X. The Marchetti twins have brought a cousin, and all three are already arguing about the view.',
    ],
    brief: 'Three players, hands of 1 to 3 cards. Pay out every hand at the desk diametrically opposite its player: A\'s at Z, B\'s at Y, C\'s at X.',
    handSize: [1, 3],
    floor: floorOf(hexRect(-4, 4, -6, 5), H3),
    fixed: H3,
    croupiers: paletteThrough('war'),
    expected: crossed,
    tests: makeMixedTests({
      minSize: 1, maxSize: 3, handsPerTest: 15,
      fixed: [
        ['AS', '2S', '3S', 'AH 2H', 'KH QH', 'JH TH', '4D 5D 6D', '7C', '8C 9C'],
        // the same hand from every player
        ['KS QS', 'KS QS', 'KS QS', '2D', '2D', '2D'],
        ['7H 8H 9H', 'JS', '5C 4C'],
      ],
      nRandom: 4, seed: 180,
    }),
  },
  {
    id: 'every-other',
    card: 'TS',
    unlockAfter: 'ace-count',
    title: 'Every Other',
    difficulty: 5,
    story: [
      'Commissioner Pryce has taken his regulation home and framed it. With War played any way you like again, the string quartet has a game for the bar: a five-card hand wins if its highest card is its first or its third card. The first violin says those are the beats that matter.',
      'If the highest rank turns up twice, one of them in either place is enough. The second violin says this is no better than last time.',
    ],
    brief: 'Five-card hands. Pay out every hand whose highest card is its 1st or 3rd card (ties count).',
    handSize: 5,
    floor: floorOf(hexRange(2), B3),
    fixed: B3,
    croupiers: paletteThrough('deal'),
    warRules: ['high', 'top'],
    pays: (h) => Math.max(hv(h[0]), hv(h[2])) >= high(h),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['AS 2D 3C 4H 5S', '2S AD 3C 4H 5S', '2S 3D AC 4H 5S', '2S 3D 4C AH 5S', '2S 3D 4C 5H AS',
          'KS 2D 3C KH 4S', '2S KD 3C 4H KS', '2S 3D KC 4H KH', 'QS KD 2C 3H 4S', 'KS 2D 3C AH 4S'],
        // winners back to back, then losers back to back
        ['AS 2D 3C 4H 5S', '2S 3D AC 4H 5S', 'KS QD 2C 3H 4S', '7S 2D 7C 3H 4S', '9S TD JC 2H 3S',
          '2S AD 3C 4H 5S', '2S 3D 4C KH 5S', '2S 3D 4C 5H QS', 'JS QD 2C 3H 4S', '4S 5D 3C 6H 2S'],
      ],
      nRandom: 4, seed: 146,
    }),
  },
  {
    id: 'bookends',
    card: 'JS',
    unlockAfter: 'burn-card',
    title: 'Bookends',
    difficulty: 5,
    story: [
      'The doormen\'s game has outlived the doormen\'s break. Two-card hands again, but now each hand is played against the one before it: a hand wins if its top card beats the bottom card of the previous hand.',
      'Aces are high and a tie loses, as ever. The first hand of the night has nothing to lean on and never wins. The Kesslers\' bottom dealer says he has always known the bottom card was the important one.',
    ],
    brief: 'Two-card hands. Pay out every hand whose top card beats the bottom card of the hand before it.',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -7, 3), B5, [[-2, -1]]),
    fixed: B5,
    croupiers: paletteThrough('burn'),
    warRules: ALL,
    pays: (h, before) => before.length > 0 && hv(h[0]) > hv(last(before)[1]),
    tests: makeTests({
      handSize: 2, handsPerTest: 20,
      fixed: [
        ['KS 2D', '3C KH', 'AS 2H', '2D AC', 'AH 7S', '7D 9C', '9H 9S', 'TD 4C', '5S QD', '4H 3S', 'KD KC', 'AD 2S'],
        // the top card, not the higher card, must beat the bottom card before
        ['2S AD', 'AS 2D', '3C KH', 'KS 3D', 'QH QC', 'JS 5H', '6D JD', '5C 4D', '4S TH'],
      ],
      nRandom: 4, seed: 146,
    }),
  
  },
  {
    id: 'one-deck',
    card: 'QS',
    unlockAfter: 'seven-heaven',
    title: 'One Deck',
    difficulty: 5,
    story: [
      'The Owner\'s three sevens are back, and so is the note: a five-card hand with three or more sevens wins. But the auditors have the card room tonight, and the house has one deck for the floor.',
      'Its shoe is bolted to the floor and deals that deck once, in new deck order. There are no other shoes. The note adds that the house is still not superstitious.',
    ],
    brief: 'Five-card hands. Pay out every hand with three or four 7s. No shoes: the only one is bolted down and deals one deck once, in new deck order (A♠ to K♠, A♦ to K♦, K♣ to A♣, K♥ to A♥).',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -7, 2), ONE_DECK),
    fixed: ONE_DECK,
    croupiers: paletteThrough('hand').filter((c) => c !== 'shoe'),
    warRules: ALL,
    pays: (h) => h.filter((c) => rankOf(c) === '7').length >= 3,
    tests: dealtTests({
      deal: (rand, n) => sevensDeals(rand, n),
      fixed: [
        ['7S 7D 7C 2H 3S', '7S 7D 2C 3H 4S', '7S 7D 7C 7H 2S', 'KS KD KC 2H 3S', '2S 7D 3C 7H 7S',
          '8S 8D 8C 8H 7S', '6S 6D 7C 8H 8S', '7H 7C 2D 2S 2C', 'AS 7H 7D KC 7C', '7D 6D 5D 4D 3D'],
        // winners back to back, then losers back to back
        ['7S 7D 7C AH KS', '7H 7S 7D 2C 3C', '7C 7H 7S 7D QD', '2S 7D 7H 7C 9S', '7S 7D 4C 5H 6S',
          'QS QD QC QH 7S', '3S 3D 3C 7H 7C', 'AS KS QS JS TS', '7S 2D 3C 4H 5S'],
        // a winner after a run of losers
        ['2S 3D 4C 5H 6S', '7S 8D 9C TH JS', 'KS KD 7C 7H AS', '9S 9D 9C 2H 2S', '7H 7D 7S 2C 3C'],
        // four of a kind of every rank, and three of every rank but 7 (so a
        // machine testing with only two 7s and other cards is caught,
        // whichever other cards it uses)
        ['AS AD AC AH 2S', '2S 2D 2C 2H 3S', '3S 3D 3C 3H 4S', '4S 4D 4C 4H 7S', '5S 5D 5C 5H 6S',
          '6S 6D 6C 6H 5S', '7S 7D 7C 7H 8S', '8S 8D 8C 8H 9S', '9S 9D 9C 9H 7D', 'TS TD TC TH JS',
          'JS JD JC JH QS', 'QS QD QC QH KS', 'KS KD KC KH AS'],
        ['AS AD AC 2H 3S', '2S 2D 2C 7H 3S', '3S 3D 3C 4H 5S', '4S 4D 4C 7H 7S', '5S 5D 5C 6H 8S',
          '6S 6D 6C 5H 9S', '8S 8D 8C 9H TS', '9S 9D 9C 7H JS', 'TS TD TC JH QS', 'JS JD JC QH KS',
          'QS QD QC KH AS', 'KS KD KC AH 7D', '7S 7D 7C 2H 3H'],
      ],
      nRandom: 4, seed: 201,
    }),
  },
  {
    id: 'cut-to-the-ace',
    card: 'KS',
    unlockAfter: 'burn-card',
    title: 'Cut to the Ace',
    difficulty: 5,
    story: [
      'Old Thursday has a new trick for the regulars, and the house is to finish it for him. A player shuffles a long hand, eight to twenty cards with the ace of spades somewhere among them, and the desk pays it back cut to the ace: the cards above the ace of spades lifted off, in the order they lie, and put under the rest.',
      'Nothing else moves, and the cashier checks every card. A hand with the ace already on top is paid as it is. Old Thursday calls it a force; the Owner, who seals every note with that ace, calls it good manners.',
    ],
    brief: 'Hands of 8 to 20 cards, each with the A♠ in it. Pay out every hand cut to the A♠: the cards above it moved, in order, under the rest, so the A♠ is on top and the cards keep their order round the hand (card order checked). A hand with the A♠ on top is paid as it is.',
    handSize: [8, 20],
    floor: floorOf(hexRect(-4, 2, -7, 4), CTA),
    fixed: CTA,
    croupiers: paletteThrough('burn'),
    warRules: ALL,
    expected: (inputs) => inputs.map(ctaCut),
    ordered: true,
    tests: dealtTests({
      deal: (rand, n) => ctaDeals(rand, n, 8),
      fixed: [
        // the A♠ on top, at the bottom, under other aces and other spades
        ['AS 2S 3S 4S 5S 6S 7S 8S', '2S 3S 4S 5S 6S 7S 8S AS', 'AH AD AC KS QS JS TS AS 9S', 'KS AS AH AD AC 2S 3S 4S 5S',
          'AD KH QC JS TD 9H 8C 7S 6D 5H 4C 3S 2D AH KC QS JD TH AS 9C'],
        // long and short back to back; hands paid at once back to back; the same hand twice
        ['2D 3D 4D 5D 6D 7D 8D 9D TD JD QD KD AD 2C 3C 4C 5C 6C 7C AS', 'AS KH QH JH TH 9H 8H 7H', 'AS 2H 3H 4H 5H 6H 7H 8H',
          'AS 2D 3D 4D 5D 6D 7D 8D 9D TD JD QD KD AD 2C 3C 4C 5C 6C 7C', 'KH AS QH JH TH 9H 8H 7H', '9C 8C 7C 6C 5C 4C 3C AS',
          '9C 8C 7C 6C 5C 4C 3C AS', 'AH 2H 3H 4H 5H 6H 7H AS'],
        ['QS JS TS 9S 8S 7S 6S 5S 4S 3S 2S KS AS AH'],
      ],
      nRandom: 4, seed: 205,
    }),
  },
  {
    id: 'uneven-tables',
    card: 'AH',
    unlockAfter: ['crossed-wires', 'deja-vu'],
    title: 'Uneven Tables',
    difficulty: 5,
    story: [
      'The wiring stays, and so does the rule: every player is paid at the desk diametrically opposite their seat. But the cousins have stopped playing in step. Tonight each of the three plays as many hands as they like, from none at all to six.',
      'Each player still plays their own hands in their own order. The cousin at table B says he is only here for the view.',
    ],
    brief: 'Three players, hands of 1 to 3 cards, each playing a different number of hands (perhaps none). Pay out every hand at the desk diametrically opposite its player: A\'s at Z, B\'s at Y, C\'s at X.',
    handSize: [1, 3],
    floor: floorOf(hexRect(-4, 4, -6, 5), H3),
    fixed: H3,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: crossed,
    tests: dealtTests({
      deal: unevenDeals,
      fixed: [
        seats3(['AS', '2S 3S', '4S 5S 6S', '7S'], ['AH 2H'], ['KD', 'QD JD', 'TD', '9D 8D', '7D', '6D 5D 4D']),
        // a player with no hands, then one with all of them
        seats3([], ['KS QS', 'JS', 'TS 9S'], ['AC']),
        seats3(['2C 3C', '4C', '5C 6C 7C', '8C', '9C', 'TC'], [], []),
      ],
      nRandom: 4, seed: 181,
    }),
  },
  {
    id: 'four-of-a-kind',
    card: '2H',
    unlockAfter: 'deja-vu',
    title: 'Four of a Kind',
    difficulty: 6,
    story: [
      'The city has learned your game, and asks for one more: single cards all night, and every time the fourth card of a rank turns up, the house pays out all four of them together, as one four of a kind, however long ago the first was played.',
      'Then that rank starts again from nothing. Cards still waiting for their fourth at closing time stay with the house.',
    ],
    brief: 'Single cards. Every time four cards of one rank have been played (since that rank last paid), pay out those four as one hand.',
    handSize: 1,
    floor: floorOf(hexRect(-3, 2, -7, 4), B6, [[-1, 1]]),
    fixed: B6,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: quadsOf,
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [
        one('7S 7D 2C 7H 2S KD 7C 2H AS 2D KH'),
        one('AS 2S 3S 4S 5S 6S 7S 8S 9S TS JS QS KS AD 2D 3D 4D 5D 6D 7D 8D 9D TD JD QD KD ' +
          'AC 2C 3C 4C 5C 6C 7C 8C 9C TC JC QC KC AH 2H 3H 4H 5H 6H 7H 8H 9H TH JH QH KH'),
        one('QH QS QD QC QH QS QD QC QH'),
        one('5C 9D 5H'),
      ],
      nRandom: 4, seed: 166,
    }),
  },
  {
    id: 'missing-card',
    card: '3H',
    unlockAfter: 'four-of-a-kind',
    title: 'Missing Card',
    difficulty: 4,
    story: [
      'The Kesslers\' bottom dealer has a new game. He breaks the seal on a fresh deck, palms one card and slides the other fifty-one across the table in a single stack, in whatever order he likes.',
      'The house pays out its own copy of the palmed card, alone, and nothing else. The Kesslers have not yet worked out what he does with the cards he palms.',
    ],
    brief: 'Each test is one hand of 51 cards: a deck with one card missing. Pay out the missing card (a house card) as a one-card hand.',
    handSize: 51,
    floor: floorOf(hexRect(-2, 3, -7, 4), H11),
    fixed: H11,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: missingCards,
    tests: dealtTests({
      deal: lessOneDeals,
      fixed: [
        // the aces and kings of every suit, and a deck in order either way
        ['AS', 'KS', 'AH', 'KH', 'AD', 'KD', 'AC', 'KC'].map((c, i) => [lessOne(c, 300 + i)]),
        [[lessOne('7D')], [lessOne('2C', 'reversed')], [lessOne('QH')], [lessOne('KH', 'reversed')]],
      ].flat(),
      nRandom: 6, seed: 191,
    }),
  },
  {
    id: 'counting-up',
    card: '4H',
    unlockAfter: 'deja-vu',
    title: 'Counting Up',
    difficulty: 6,
    story: [
      'Old Thursday is counting his way through the deck tonight. He pays the first five-card hand that holds a 2, then the first hand after that which holds a 3, then a 4, and so on up through the king to the ace.',
      'After the ace he starts again at 2. A hand only ever counts for the rank he is waiting for, however many others it holds.',
    ],
    brief: 'Five-card hands. Pay out the first hand holding a 2, then the next hand holding a 3, and so on up to the ace, then 2 again.',
    handSize: 5,
    floor: floorOf(hexRect(-3, 3, -9, 5), B9),
    fixed: B9,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: countingUp,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        // one rank per hand, all the way round and on to 2 again
        ['2S 9D 9C 9H 9S', '3S TD TC TH TS', '4S 4D JC JH JS', '5S QD QC QH QS', '6S KD KC KH KS',
          '7S 8D 8C 8H 8S', '8S 9D 9C 9H 9S', '9S 2D 2C 2H 2S', 'TS 3D 3C 3H 3S', 'JS 4D 4C 4H 4S',
          'QS 5D 5C 5H 5S', 'KS 6D 6C 6H 6S', 'AS 7D 7C 7H 7S', '3D 4D 5D 6D 7D', '2D 3H 4H 5H 6H'],
        // the next rank is often in the hand just paid; several in one hand count once
        ['2S 3S 4S 5S 6S', '3D 4D 5D 6D 7D', 'KS KD KC KH QS', '4C 5C 6C 7C 8C', '2H 3H 4H 5H 6H',
          '5D 6D 7D 8D 9D', 'AS AD AC AH 2S', '6S 6D 7S 7D 8S'],
        ['3S 4S 5S 6S 7S', '9S 9D 9C 9H TS', '2S 2D 2C 2H 3D', '2S 2D 4C 4H 5D', '3C 3H 4S 5S 6S'],
      ],
      nRandom: 4, seed: 173,
    }),
  },
  {
    id: 'ceasefire',
    card: '5H',
    unlockAfter: 'next-in-line',
    title: 'Ceasefire',
    difficulty: 6,
    story: [
      'Commissioner Pryce has declared a week of peace on the city\'s card tables, and he means it: no War anywhere on the floor until next Tuesday. The War croupier has been given the week off on full pay, and has gone fishing.',
      'To keep things calm, every table is dealt spades and nothing else: one suit of them (or part of one), shuffled, a card at a time. A card wins if it is higher than the card played just before it. The ace is low, and the first card of the night follows nothing and never wins.',
    ],
    brief: 'Single cards, all spades; no War croupier. Pay out every card higher than the card before it (aces low). The first card never pays.',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -7, 5), C1),
    fixed: C1,
    croupiers: paletteThrough('hand').filter((c) => c !== 'war'),
    pays: (h, before) => before.length > 0 && rankValue(h[0]) > rankValue(last(before)[0]),
    tests: dealtTests({
      deal: spadeDeals,
      fixed: [
        // all winners after the first, then no winners at all
        one('AS 2S 3S 4S 5S 6S 7S 8S 9S TS JS QS KS'), one('KS QS JS TS 9S 8S 7S 6S 5S 4S 3S 2S AS'),
        // winners alternating with losers, from the top and from the middle
        one('KS AS QS 2S JS 3S TS 4S 9S 5S 8S 6S 7S'), one('7S 8S 6S 9S 5S TS 4S JS 3S QS 2S KS AS'),
        // runs of each
        one('2S 5S 9S 3S 4S 6S AS KS QS 7S 8S TS JS'), one('AS'), one('QS KS'),
      ],
      nRandom: 4, seed: 201,
    }),
  },
  {
    id: 'three-in-a-row',
    card: '6H',
    unlockAfter: ['next-in-line', 'deja-vu'],
    title: 'Three in a Row',
    difficulty: 6,
    story: [
      'The mayor\'s napkin has filled its column for neighbours, so he has started one for three in a row. A card wins if it and the two cards played just before it are three consecutive ranks, in any order: 6, 8, 7 counts just as much as 6, 7, 8.',
      'The ace plays high or low, so Q K A and A 2 3 both count, but nothing wraps round from the king to the 2, and a pair spoils the lot. The first two cards of the night never win. The mayor has underlined that part twice.',
    ],
    brief: 'Single cards. Pay out every card that makes three consecutive ranks, in any order, with the two cards before it (ace high or low; K A 2 doesn\'t count). The first two cards never pay.',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -7, 5), C2),
    fixed: C2,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: threeInARow,
    tests: dealtTests({
      deal: (rand, n) => nearDeals(rand, n, 26),
      fixed: [
        // ace low and high, no wrapping, any order, pairs
        one('AS 2D 3C QS KD AC KH AD 2C 5S 4D 6C 5H 5D 6S 7H 8H 9H TH 9S 8D 2H 4S 3H JC QC KC'),
        // runs back to back, then none back to back
        one('2S 3D 4C 5H 6S 7D 8C 9H TS JD QC KH AS AD 5D 9C 2H 6S TD 3C 7H JS 4D 8C QH'),
        // winners alternating with losers, then a pair in the middle
        one('4S 5D 6C 8H 7S 5C 6H 8D 7C 5S 6D 8S 7H 9C 9D TH JS'),
        one('7S 8D'), one('7S 8D 9C'), one('9S 7D 7C 8H'),
      ],
      nRandom: 4, seed: 202,
    }),
  },
  {
    id: 'rising',
    card: '7H',
    unlockAfter: ['every-other', 'deja-vu'],
    title: 'Rising',
    difficulty: 6,
    story: [
      'The string quartet has given up on beats and taken up scales. Hands of any size from one card to six win if they climb: every card at least as high as the card above it, aces high.',
      'A card may repeat the rank above it, so 3 7 7 J climbs. A single card climbs on its own, the second violin points out, and nobody argues.',
    ],
    brief: 'Hands of 1 to 6 cards. Pay out every hand whose cards never go down from top to bottom (aces high; equal ranks are fine).',
    handSize: [1, 6],
    floor: floorOf(hexRect(-3, 3, -9, 9), B10),
    fixed: B10,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h) => h.every((c, i) => i === 0 || hv(c) >= hv(h[i - 1])),
    tests: makeMixedTests({
      minSize: 1, maxSize: 6, handsPerTest: 12,
      fixed: [
        ['2S 5D 5C KH AS', 'AS 2D', 'KS AD', '7H', '3S 4D 5C 6H 7S 8D', '8D 7S 6H 5C 4D 3S', 'QS QD QC',
          '2S 3D 4C 6H 5S', 'AS', '9S 9D 8C', 'JS QD', 'TD 2H'],
        // climbing hands back to back, then not, with a long one in each
        ['2S 3S 4S 5S 6S 7S', '5D 9D', 'AC', '3H 3S 3D 3C 4H', 'KS AS', '6D 6C',
          '7S 6S 5S 4S 3S 2S', '9D 5D', '2C AC 3C', 'AH KH', '4S 3S 4D 5D', 'JD TD JC'],
      ],
      nRandom: 4, seed: 174,
    }),
  },
  {
    id: 'odds-and-evens',
    card: '8H',
    unlockAfter: 'deja-vu',
    title: 'Odds and Evens',
    difficulty: 6,
    story: [
      'Dmitri has been counting red cards. Odd numbers make him uneasy, so tonight a five-card hand wins if it holds an even number of hearts and diamonds between them: two, four, or none at all, since nought, as Dmitri will tell anyone who stands still long enough, is as even as a number gets.',
      'One, three or five red cards pay nothing. The spades and clubs are only there to make up the numbers.',
    ],
    brief: 'Five-card hands. Pay out every hand holding an even number of red cards (hearts and diamonds): none, two or four.',
    handSize: 5,
    floor: floorOf(hexRect(-4, 2, -3, 9), C3),
    fixed: C3,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h) => redCount(h) % 2 === 0,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        // every count of red cards, 0 to 5
        ['2S 3S 4S 5C 6C', 'AH KD QS JS TS', 'AH KD QH JS TS', 'AH KD QH JD TS', 'AH KD QH JD TH',
          'AS KS QH JC TC', '9H 9D 9S 9C 2H', '7H 2S 7D 3C 8S', 'KH QH JH TH AS', 'AD 2C 3C 4S 5S'],
        // even hands back to back, then odd hands back to back
        ['2S 3S 4S 5C 6C', 'AH KD QS JS TS', 'AH KD QH JD TS', '7H 2S 7D 3C 8S', 'KC QC JS TS 9S',
          'AH KD QH JS TS', 'AD 2C 3C 4S 5S', 'AH KD QH JD TH', '9H 9D 9S 9C 2H', '6D 6S 6C 8S 8C'],
        // alternating
        ['AH KD QS JS TS', 'AD 2C 3C 4S 5S', '2S 3S 4S 5C 6C', 'AH KD QH JD TH', 'KH QH JH TH AS',
          '9H 9D 9S 9C 2H', '7H 2S 7D 3C 8S', 'AS KS QH JC TC', 'KC QC JS TS 9S', '2H 3D 4H 5D 6H'],
      ],
      nRandom: 4, seed: 203,
    }),
  },
  {
    id: 'after-a-pair',
    card: '9H',
    unlockAfter: 'small-pairs',
    title: 'After a Pair',
    difficulty: 6,
    story: [
      'Dmitri has a theory about streaks. A pair, he says, warms the table, so the hand after any hand holding a pair or better should win, whatever it holds itself.',
      'Two pair, three of a kind and the rest all count as a pair or better. The first hand of the night follows nothing and never wins. Dmitri has a spreadsheet for this as well.',
    ],
    brief: 'Five-card hands. Pay out every hand that comes straight after a hand holding a pair or better.',
    handSize: 5,
    floor: floorOf(hexRect(-3, 3, -7, 5), B4),
    fixed: B4,
    croupiers: paletteThrough('deal'),
    warRules: ALL,
    pays: (h, before) => before.length > 0 && largestSet(last(before)) >= 2,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['2S 2D 5C 9H KS', 'AS KD QC JH 9S', '3S 3D 3C 7H JS', 'KS KD QS QD 2H', '2H 4H 6H 8H TH',
          '4S 5D 6C 7H 8S', '9S 9D 4C 4H 9C', 'AH 3S 5D 7C JD', '6S 6D 6C 6H 2S', 'TS JD QC KH AS'],
        // pairs back to back, then no pairs back to back
        ['2S 2D 5C 9H KS', '3S 3D 6C TH QS', '4S 4D 7C JH KD', '5S 5D 8C QH AS', '6S 6D 9C KH AD',
          'AH KD QC JH 9S', '2H 4D 6C 8S TD', '3H 5D 7C 9S JD', '4H 6D 8C TS QD', '5H 7D 9C JS KD'],
        // alternating
        ['AH KD QC JH 9S', '2S 2D 5C 9H KS', '2H 4D 6C 8S TD', '3S 3D 6C TH QS', '3H 5D 7C 9S JD',
          '4S 4D 7C JH KD', '4H 6D 8C TS QD', '5S 5D 8C QH AS', '5H 7D 9C JS KD', '6S 6D 9C KH AD'],
      ],
      nRandom: 4, seed: 145,
    }),
  },
  {
    id: 'two-by-two',
    card: 'TH',
    unlockAfter: 'two-pair',
    title: 'Two by Two',
    difficulty: 6,
    story: [
      'The rival casino\'s last big night ran until dawn, and its orchestra\'s brass section came over for breakfast. There are four of them, they say, so they would like four-card hands, and they would like Two Pair.',
      'A four-card hand wins if it holds exactly two pairs. Three of a kind and four of a kind are too much of a good thing and pay nothing, and a single pair is not enough.',
    ],
    brief: 'Four-card hands. Pay out every hand with exactly two pair (not three of a kind or four of a kind).',
    handSize: 4,
    floor: floorOf(hexRect(-3, 2, -9, 7), H10),
    fixed: H10,
    croupiers: paletteThrough('deal'),
    warRules: ALL,
    pays: (h) => [...rankCounts(h).values()].every((n) => n === 2),
    tests: dealtTests({
      deal: (rand, n) => pairedDeals(rand, n, 10),
      fixed: [
        ['KS KD 5C 5H', 'KS 5D KC 5H', 'KS 5D 5C KH', 'KS KD 2C 5H', 'KS KD KC 5H', 'KS KD KC KH',
          'AS KD QC JH', '2S 2D 3C 3H', '5S KD KC 5H', 'AS AD 2C 3H', '9S 9D 9C 2H', 'TS JD TC JH'],
        // winners back to back, then losers that decide late
        ['KS KD 5C 5H', 'AS 3D AC 3H', '7S 8D 8C 7H', '2S QD QC 2H', '4S 6D 6C 4H', 'JS 9D 9C JH',
          'KS KD 2C 3H', '2S 9D 3C 9H', 'AS QD JC JH', '5S 6D 8C 8H', 'TS TD 2C 3H', '4S 4D 7C 9H'],
        // winners alternating with hands that fail fast, then runs of each
        ['KS KD 5C 5H', 'KS KD KC 5H', 'AS 3D AC 3H', '9S 9D 9C 2H', '7S 8D 8C 7H', 'QS QD QC QH',
          '2S QD QC 2H', '4S 4D 4C 6H', '6S 6D 3C 3H', 'JS 2D JC 2H', '8S 3D 3C 8H', 'AS KD QC JH',
          '2S 3D 4C 5H', '9S 9D 9C 9H', '3S 4D 5C 3H', 'KS QD JC TH'],
      ],
      nRandom: 4, seed: 191,
    }),
  },
  {
    id: 'rest-of-the-deck',
    card: 'JH',
    unlockAfter: 'missing-card',
    title: 'The Rest of the Deck',
    difficulty: 6,
    story: [
      'Commissioner Pryce is auditing the house deck. Tonight one deck is played, in hands of one to five cards, and at closing time the house must hand him every card that was not played, one card at a time, so that he can count them.',
      'The cards played are the guests\' business and leave the floor as usual. The Commissioner counts slowly, and he has brought his own pencil.',
    ],
    brief: 'Hands of 1 to 5 cards, from one deck. After the last hand, pay out every card of the deck that was not played, as one-card hands (house cards).',
    handSize: [1, 5],
    floor: floorOf(hexRect(-2, 3, -9, 5), H4),
    fixed: H4,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: unplayed,
    tests: makeMixedTests({
      minSize: 1, maxSize: 5, handsPerTest: 6,
      fixed: [
        ['AS'],
        // every spade and every heart played; no diamonds or clubs
        ['AS 2S 3S 4S 5S', '6S 7S 8S 9S TS', 'JS QS KS', 'AH 2H 3H 4H 5H', '6H 7H 8H 9H TH', 'JH QH KH'],
        // pairs of every rank, and the last card of each suit
        ['AD AC', '2D 2C', 'KS', 'KH 3D 3C', '4D 4C 5D 5C', 'AS'],
      ],
      nRandom: 4, seed: 183,
    }),
  },
  {
    id: 'crazy-eights',
    card: 'QH',
    unlockAfter: 'high-roller',
    title: 'Crazy Eights',
    difficulty: 6,
    story: [
      'The rival\'s old owner has taught the staff his favourite game, and the mayor has heard about it. Single cards: a card wins if it matches the last card the house paid out, in rank or in suit. An 8 always wins. The first card of the night always wins, since there is nothing to match yet.',
      'A card that doesn\'t match pays nothing and changes nothing: the next card still has to match the last card paid. After an 8 is paid, the next card must be another 8 or of that 8\'s suit. Nobody gets to call a new suit, the Owner\'s note says, whatever they do across the street.',
    ],
    brief: 'Single cards. Pay out the first card, every 8, and every card that matches the last card paid in rank or suit (a card that isn\'t paid changes nothing).',
    handSize: 1,
    floor: floorOf(hexRect(-3, 3, -7, 7), CE),
    fixed: CE,
    croupiers: paletteThrough('deal'),
    warRules: ALL,
    pays: crazyEights,
    tests: dealtTests({
      deal: (rand, n) => eightsDeals(rand, n, 24),
      fixed: [
        // matches by suit and by rank; a miss changes nothing; an 8 on anything
        one('5H 9H 9C 2D 9S KC 3H KH 8D 4D 4S JS 8C 2C 7D QC QH'),
        // after an 8: its suit or another 8; misses back to back
        one('KS 8D 3S 7C JH 8H 2C 9S TD 6H 6S 8S AS AD 8C QC'),
        // payouts back to back, then misses back to back
        one('2S 3S 4S 4H 5H 6H 6D 6C 7C 8C 9H TD JS QD KH AD 2H 3C'),
        one('8H'),
      ],
      nRandom: 4, seed: 204,
    }),
  },
  {
    id: 'perfect-pair',
    card: 'KH',
    unlockAfter: 'missing-card',
    title: 'Perfect Pair',
    difficulty: 6,
    story: [
      'The house has started dealing from a shoe of two decks shuffled together, and Sal Vellani was the first to notice what that means: a hand can hold the same card twice. He calls it a perfect pair, and the Owner has agreed to pay for it.',
      'A perfect pair is two cards of the same rank and the same suit, two queens of hearts, say. A queen of hearts with a queen of diamonds is only an ordinary pair and pays nothing, however red it looks.',
    ],
    brief: 'Five-card hands from a two-deck shoe. Pay out every hand holding two identical cards (the same rank and the same suit). Cards of the same rank in different suits don\'t count.',
    handSize: 5,
    decks: 2,
    floor: floorOf(hexRect(-3, 3, -5, 6), PERFECT),
    fixed: PERFECT,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: perfectPair,
    tests: dealtTests({
      deal: (rand, n) => twinDeals(rand, n, 16),
      fixed: [
        ['KS KS 2D 3C 4H', 'KS KH 2D 3C 4H', 'KS KC 2D 3C 4H', '7S 7S 9H 9H KD', '7S 9S 7S 9S KS', '7S 7S 7H 2D 3C',
          '7S 7H 7D 7C 2S', '2S 4S 6S 8S TS', '2D 6D 2D 8D TD', 'QH 5C 8D JS QH', '7S 7H 7D 7C 7S', 'AS 2S 3S 4S 5S',
          'AH AD AC AS 2H', 'JC JC JD JD 3H', '4D 4H 4D 4H 9S'],
        // perfect pairs back to back, then ordinary pairs and worse back to back
        ['3C 3C 8S 9D TH', 'AS KD AS QC JH', '2H 5S 6D 5S 7C', '9D 9D 9S 9S 9H', 'KH QH JH TH KH', '4C 8D 4S 8D 2H',
          '3C 3D 8S 9D TH', 'AS KD AH QC JH', '2H 5S 6D 5C 7C', '9D 9C 9S 9H 2D', 'KH QH JH TH 9H', '4C 8D 4S 8H 2H'],
        // perfect pairs alternating with hands of one suit, then runs of each
        ['6S 6S 2D 3C 4H', 'AS 3S 5S 7S 9S', 'TD 2C TD 3H 4S', '2H 4H 6H 8H TH', '8C JS 8C KD AH', 'AD 2D 3D 4D 5D',
          'QS QS QD 2C 3H', '5C 6C 7C 8C 9C', '7H 8S 9D TC 7H', 'JD 2D 2C JH JS', 'KS KH KD KC 2S', '3S 4S 5S 6S 7S',
          'AC AC AH AH AD', '9S 2H 9S 3D 9H', '6D 7D 6D 7D 8D', 'TS TC JH JD QS'],
      ],
      nRandom: 4, seed: 192,
    }),
  },
  {
    id: 'pot-luck',
    card: 'AC',
    unlockAfter: ['crossed-wires', 'hot-streak'],
    title: 'Pot Luck',
    difficulty: 6,
    story: [
      'The Marchetti twins have found a game they can play against each other, one card each per deal. The higher card wins the deal, and its player is paid both cards, as one hand, at their own desk: player A at desk X, player B at desk Y. Aces are high.',
      'When the two cards are the same rank, whatever their suits, nobody wins them: both go into the pot, and the pot goes to the winner of the next deal that has a winner, paid with that deal\'s two cards as one hand. A pot still on the table at the end of the night stays with the house. The twins have been arguing about whose idea this was since the first deal.',
    ],
    brief: 'Two players, one card each per deal. The higher card (aces high) wins: pay both cards, and the pot if there is one, as one hand at the winner\'s desk (A\'s at X, B\'s at Y). On a tie (the same rank) both cards go into the pot instead; a pot left at the end of the night is not paid.',
    handSize: 1,
    floor: floorOf(hexRect(-4, 2, -6, 7), POT_LUCK),
    fixed: POT_LUCK,
    croupiers: paletteThrough('deal'),
    warRules: ALL,
    expected: potLuck,
    tests: dealtTests({
      deal: (rand, n) => potDeals(rand, n, 12),
      fixed: [
        // aces high, a tie, a pot won, ties back to back, a pot left at the end
        one('AS KS 2D 3D 7C 7H 9S 4D QH QD 5C 5S JH TC KD AH 8S 8D'),
        // ties to start the night; then winners back to back, and ties between
        one('3S 3H 6D 6C 2S 2H AH KD 9D 9H 4C JS TS 2C 4H 4S 3D 5H 7D 7S 8C 6S'),
        // the same winner again and again, either side of a tie
        one('KC 2H QC 3C JD 4D JC JH TD 5D 2S AD 3H KH 4S QS 5C 5H 6C JS'),
      ],
      nRandom: 4, seed: 193,
    }),
  },
  {
    id: 'night-off',
    card: '2C',
    unlockAfter: 'off-suit',
    title: 'Night Off',
    difficulty: 6,
    story: [
      'The suits croupier is back from the wedding, and now the croupier who checks for flushes has the night off. Sal Vellani\'s uncle has come back for his red flushes anyway: three-card hands, and the house pays any hand that is all hearts or all diamonds.',
      'He has brought a slice of the wedding cake for the croupier who missed it, and is in no hurry.',
    ],
    brief: 'Three-card hands. Pay out every flush in hearts or diamonds, with no Flush croupier.',
    handSize: 3,
    floor: floorOf(hexRange(4), H9),
    fixed: H9,
    croupiers: paletteThrough('cut'),
    pays: (h) => isFlush(h) && ['H', 'D'].includes(suitOf(h[0])),
    tests: makeTests({
      handSize: 3, handsPerTest: 10,
      fixed: [
        ['2H 7H KH', '3D 9D QD', '4S 8S JS', '5C TC AC', 'AH 2D 3H', 'KD QD JH', '6H 6D 6S', 'AD KD 2D', '9S 9H 4C', 'TH JH QH'],
        // two of a red suit and one other, either way round
        ['2H 3H 4S', '5D 6D 7C', 'KS QH JH', '8C 9D TD', 'AH 5D 9H', 'JD 2H QD'],
      ],
      nRandom: 4, seed: 187,
    }),
  },
  {
    id: 'skeleton-crew',
    card: '3C',
    unlockAfter: ['calling-card', 'night-off'],
    title: 'Skeleton Crew',
    difficulty: 6,
    story: [
      'The croupiers who split hands by suit and check for flushes have both taken the night off, together, and the rest of the floor is covering for them. Sal Vellani\'s uncle has heard, and has come in with a simpler request: three-card hands, and the house pays any hand that is all hearts.',
      'He has brought a get-well card for the absent croupiers, and everyone on the floor has signed it, twice.',
    ],
    brief: 'Three-card hands. Pay out every flush in hearts, with neither a Flush nor a Suits croupier.',
    handSize: 3,
    floor: floorOf(hexRange(4), H9),
    fixed: H9,
    croupiers: paletteThrough('sort').filter((c) => c !== 'flush' && c !== 'suits'),
    warRules: ALL,
    pays: (h) => isFlush(h) && suitOf(h[0]) === 'H',
    tests: makeTests({
      handSize: 3, handsPerTest: 10,
      fixed: [
        ['2H 7H KH', '3D 9D QD', '4S 8S JS', '5C TC AC', 'AH 2D 3H', 'KD QD JH', '6H 6D 6S', 'AD KD 2D', '9S 9H 4C', 'TH JH QH'],
        // aces, and the ace of clubs, next to hearts
        ['AC KH QH', 'AS AD 7D', 'AH 2H 3H', 'KS KD KC', 'AD 5H 6H', 'AC 2C 3C', '9H TH AH', 'AS 4H 8H'],
      ],
      nRandom: 4, seed: 189,
    }),
  },
  {
    id: 'one-war',
    card: '4C',
    unlockAfter: ['inside-bet', 'one-deck'],
    title: 'One War',
    difficulty: 7,
    story: [
      'Sal Vellani\'s uncle is back to bet the middle of the deck: a five-card hand wins if its high card is a 9, 10, jack or queen. Nothing too small, nothing too grand.',
      'Only one War croupier came in tonight, and the auditors have bolted her table to the floor: her dealer\'s side and all four of her ports stay as they are. There are no other War croupiers. The uncle says he has always liked a croupier who stays put.',
    ],
    brief: 'Five-card hands. Pay out every hand whose high card is 9, 10, J or Q (aces high). No War croupiers: the only one is bolted down, ports and all.',
    handSize: 5,
    floor: floorOf(hexRect(-4, 2, -8, 5), ONE_WAR),
    fixed: ONE_WAR,
    croupiers: paletteThrough('hand').filter((c) => c !== 'war'),
    pays: (h) => high(h) >= 9 && high(h) <= 12,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['2S 3D 4C 5H 8S', '2S 3D 4C 5H 9S', '2S 3D 4C 5H TS', 'QS 3D 4C 5H 2S', '2S KD 4C 5H 8S',
          '2S 3D AC 5H 8S', 'QS QD QC 2H 3S', 'JS TD 9C 8H 7S', 'KS QD JC TH 9S', '9S 9D 9C 9H 2S'],
        // winners back to back, then losers of both kinds back to back
        ['9S 2D 3C 4H 5S', 'QD JC TH 9S 2C', 'TS TD 3C 4H 5D', 'JH 8S 7D 6C 5H', 'QH QC 8D 2S 3H',
          'KS 2D 3C 4H 5S', 'AD 9C TH JS QS', '8S 7D 6C 5H 4S', '2D 3D 4D 5D 6D', 'KH KD QS 2C 3C'],
        // winners alternating with hands too small and too grand
        ['9D 5S 4C 3H 2D', '8H 7S 6D 5C 4H', 'QC 2S 3D 4H 6C', 'AS KH 2D 3C 4S', 'TH 9H 8H 7H 6H',
          '8C 8D 8S 2H 3D', 'JD 4S 5C 6H 7D', 'KC 9S 8D 7C 6S', 'QS JS TS 9S 8S'],
      ],
      nRandom: 4, seed: 202,
    }),
  },
  {
    id: 'dumbwaiter',
    card: '5C',
    unlockAfter: ['one-war', 'deja-vu'],
    title: 'Dumbwaiter',
    difficulty: 6,
    story: [
      'The auditors have taken over the main floor. The card tables have moved upstairs and the cash desk downstairs, and the two rooms have nothing in common but the old dumbwaiter, which the auditors have bolted into the wall.',
      'It takes cards from any side and sends them down one card at a time, and it will not be adjusted. The Owner\'s note says every hand is still to be paid exactly as it was played, card for card, top card first.',
    ],
    brief: 'Hands of 1 to 5 cards. Pay out every hand as it was played (card order counts, top card first). The players and the desk are in two rooms joined only by a bolted Hand(1) that hands cards on one at a time, into the desk\'s room.',
    handSize: [1, 5],
    floor: floorOf(DUMBWAITER_FLOOR, DUMBWAITER),
    fixed: DUMBWAITER,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => inputs,
    ordered: true,
    tests: makeMixedTests({
      minSize: 1, maxSize: 5, handsPerTest: 8,
      fixed: [
        ['AS', '2D 3C', '4H 5S 6D', '7C 8H 9S TD', 'JC QH KS AD 2C'],
        // single cards back to back, then full hands back to back, then mixed
        ['KH', 'QD', 'JS', 'TC 9H 8D 7S 6C', '5H 4D 3S 2C AH', 'KC QS JD TH 9C', 'AC', '8S 7H', '6S'],
        ['5D 4C 3H 2S', 'AD KD', '9D', 'QC JH TS 9S 8C'],
      ],
      nRandom: 4, seed: 203,
    }),
  },
  {
    id: 'no-kings',
    card: '6C',
    unlockAfter: 'skeleton-crew',
    title: 'No Kings',
    difficulty: 7,
    story: [
      'The suits croupier and the flush croupier are off at a No Kings rally, and Sal Vellani\'s uncle is back for his red flushes, hearts and diamonds both: three-card hands, and the house pays any hand that is all hearts or all diamonds.',
      'In solidarity, the players have taken the kings out of their decks for the night. The uncle says it is the least he can do.',
    ],
    brief: 'Three-card hands, from decks with no kings. Pay out every flush in hearts or diamonds, with neither a Flush nor a Suits croupier.',
    handSize: 3,
    floor: floorOf(hexRange(4), H9),
    fixed: H9,
    croupiers: paletteThrough('sort').filter((c) => c !== 'flush' && c !== 'suits'),
    warRules: ALL,
    pays: (h) => isFlush(h) && ['H', 'D'].includes(suitOf(h[0])),
    tests: dealtTests({
      deal: (rand, n) => kinglessDeals(rand, n, 10),
      fixed: [
        ['2H 7H QH', '3D 9D QD', '4S 8S JS', '5C TC AC', 'AH 2D 3H', 'QD JD JH', '6H 6D 6S', 'AD QD 2D', '9S 9H 4C', 'TH JH QH'],
        // queens and aces at the edges of a suit; two of a red suit and one other
        ['AD 2D 3D', 'QH AH 2H', 'AS QS 5D', 'QC AC 4H', '2H 3H 4S', '5D 6D 7C', 'QS QH JH', '8C 9D TD', 'AH 5D 9H', 'JD 2H QD'],
      ],
      nRandom: 4, seed: 190,
    }),
  },
  {
    id: 'one-up',
    card: '7C',
    unlockAfter: 'counting-up',
    title: 'One Up',
    difficulty: 7,
    story: [
      'Old Thursday has one trick left, and he insists it is the best one. You show him a card, and he produces the next card up in the same suit: a 7 of clubs for a 6 of clubs, the ace for the king.',
      'The house pays out his card and keeps yours. Nobody has ever caught him doing it.',
    ],
    brief: 'Single cards. For every card, pay out the next card up in the same suit (a house card; after the king comes the ace).',
    handSize: 1,
    floor: floorOf(hexRect(-3, 5, -7, 9), H2),
    fixed: H2,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => inputs.map(([c]) => [oneUp(c)]),
    tests: makeTests({
      handSize: 1, handsPerTest: 6,
      fixed: [one('KS AS KH AH QD KD'), one('AD 2D KC AC QC JC'), one('7H'), one('2S 3S 4S 5S')],
      nRandom: 4, seed: 179,
    }),
  },
  {
    id: 'twenty-one-card-trick',
    card: '8C',
    unlockAfter: 'one-up',
    title: 'Twenty-One Card Trick',
    difficulty: 7,
    story: [
      'Old Thursday said One Up was his last trick. This one, he says, doesn\'t count: it is older than he is. Two players sit down for it, one deal at a time. The first plays him twenty-one cards; the second, the spectator, plays a single card from a deck of their own, a copy of one of those twenty-one: the card the spectator has chosen.',
      'Old Thursday hands the twenty-one back as one stack, and the chosen card is always the eleventh from the top, with ten cards above it and ten below. The house pays out the stack, with the chosen card in it once. Nobody has ever asked what order the other twenty are in.',
    ],
    brief: 'Two players, one deal at a time: player A plays 21 cards, player B one card, a copy of one of A\'s. Pay out one hand of 21 cards: A\'s cards, with the card B played 11th from the top (the chosen card once; the other 20 in any order).',
    handSize: [1, 21],
    floor: floorOf(hexRect(-5, 5, -10, 6), TRICK21),
    fixed: TRICK21,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: trick,
    ordered: [10],
    tests: dealtTests({
      deal: (rand, n) => trickDeals(rand, n, 4),
      fixed: [
        // the chosen card on top and at the bottom; two suits missing; the
        // only heart; all four of its rank; a hand in new deck order; a
        // whole suit
        [...pick('6D 7H 6C 2S TH KC 9D KH 8S 5H 6S JH 3C 2H KS 4C 8D 4D JS 9S QH', 0),
          ...pick('3S 6S 9H 5S 3H QH QS 2H AS KS KH AH 4S JS 9S 7H 7S 6H 2S TS 8S', 20),
          ...pick('8S 2S QC 8C 7C AS 7D TD 6S TC 5D 4S 3C AD 2C 7S QH 6C 3S AC 9S', 16),
          ...pick('4H KS 2C 8H JS 6C 2S 5D 8C 2D 6S AD 7C KH TC 7S 7H 7D QC TS 2H', 19),
          ...pick('AS 4S 9S JS QS KS AD 5D 6D 7D 8D TD KD QC JC 8C 7C 4C 2C AC 5H', 1),
          ...pick('6D 7H 6C 2S TH KC 9D KH 8S 5H 6S JH 3C 2H KS 4C 8D 4D JS 9S QH', 9),
          ...pick('7C JC TC 5H 4C 7S 8C AC 8S 5C KC 2C 4H 3C QC 9D 9C 2H AS 6C KD', 11)],
        // the same hand back to back, the chosen card a place lower each time
        [2, 3, 4, 5, 6, 7, 8, 10].flatMap((i) => pick('6D TS JC 3D 8H JH AS 2H KC AH QS 5C 6S 8S KD 5S KS 2D 8D 3H JS', i)),
        // hands of two suits alternating with hands of three or four
        [...pick('8D QC KC KD 9C 2D 4D 5D TD 8C 4C 6C QD 3D AC AD JC 7D 6D 3C 2C', 12),
          ...pick('AH QD QH 3C 2D TC 7H 8D QC 9H 5D 6C TS QS 9S 7D JH JC TD 5C 7S', 13),
          ...pick('AH 5H 3H 6S 4H TS KS 5S 6H 8H 9H 9S KH 3S QH 7S 4S AS JS 2H QS', 14),
          ...pick('2H 3D QH 8D 8C 4C 3C KD JD 2D 6H 9C 3H TD AD TC 9D JC KH TH QD', 15),
          ...pick('7D 9D 5H 4H KD 3D 6D AH 2H TD AD KH JD 5D 8D 7H 4D 3H 2D JH 6H', 17),
          ...pick('KD AS 4S 7C 9S 6D 5D QS 4H AC JS TD 7D 8C 3H QC KS AD 2C 5H 8D', 18)],
        pick('3S 6S 9H 5S 3H QH QS 2H AS KS KH AH 4S JS 9S 7H 7S 6H 2S TS 8S', 4),
      ],
      nRandom: 4, seed: 193,
    }),
  },
  {
    id: 'round-the-clock',
    card: '9C',
    unlockAfter: 'counting-up',
    title: 'Round the Clock',
    difficulty: 7,
    story: [
      'Old Thursday is going round the clock: tonight he wants to see every rank from the ace to the king. The cards come one at a time, and as soon as all thirteen ranks have turned up since his last payout, the house pays him a hand of thirteen: the first card of each rank in that time.',
      'A card of a rank he has already seen since then is never paid, not even later. At closing time a clock he has not finished pays nothing.',
    ],
    brief: 'Single cards. As soon as every rank has been played since the last payout, pay out one hand of 13 cards: the first card of each rank played since the last payout (later cards of those ranks are never paid; an unfinished round at the end pays nothing).',
    handSize: 1,
    floor: floorOf(hexRect(-3, 3, -4, 12), H13),
    fixed: H13,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: roundTheClock,
    tests: dealtTests({
      deal: (rand, n) => clockDeals(rand, n, 40),
      fixed: [
        // once round in order, then a few more
        one('AS 2S 3S 4S 5S 6S 7S 8S 9S TS JS QS KS AH 2H'),
        // repeats on the way round are never paid; the last rank completes it
        one('KD KC 7S 2H KS 7D AS 3C 4D 5H 2S 6C 8D 9H TS JC QD QH AH'),
        // two decks: twice round back to back, then repeats, then almost a third time
        one('5C 6C 7C 8C 9C TC JC QC KC AC 2C 3C 4C 4D 3D 2D AD KD QD JD TD 9D 8D 7D 6D 5D ' +
          '5D 5S 5H 6S 7S 8S 9S TS JS QS KS AS 2S 3S'),
        // never round: no 7s
        one('AS 2D 3C 4H 5S 6D 8C 9H TS JD QC KH AH AS KD 8S 2C'),
        // the night opens with a king and an ace, and the next round with a
        // queen, a king and an ace (runs through the king and the ace long
        // before every rank is in)
        one('KS AS 9D 2C 5H JD 3S 8C QH 6D TC 4H 7S QD KD AD 2S 3H 4C 5D 6C 7D 8S 9C TH JS'),
      ],
      nRandom: 4, seed: 202,
    }),
  },
  {
    id: 'running-count',
    card: 'TC',
    unlockAfter: ['ace-count', 'hot-streak'],
    title: 'Running Count',
    difficulty: 7,
    story: [
      'The Kesslers have given up counting aces and now count everything. Every 2, 3, 4, 5 or 6 played tonight is one for them, every 10, jack, queen, king or ace is one against, and 7s, 8s and 9s are nothing either way.',
      'They have talked the house into paying by their count: single cards, and a card is paid out if, counting every card played tonight up to and including it, more of them have been 2 to 6 than 10 to ace. Level is not enough.',
    ],
    brief: 'Single cards. Pay out a card if, of all the cards played tonight up to and including it, more have been 2 to 6 than 10 to ace (aces count high; 7, 8 and 9 count for neither).',
    handSize: 1,
    floor: floorOf(hexRect(-3, 3, -5, 9), H12),
    fixed: H12,
    croupiers: paletteThrough('deal'),
    warRules: ALL,
    pays: runningCount,
    tests: makeTests({
      handSize: 1, handsPerTest: 30,
      fixed: [
        // level is not enough; 7 to 9 change nothing; aces count high
        one('7S 8S 9S KS 2S 3S 7D AS 4S 8D TD 5H 9H'),
        // a run up, then back down past level, then up again
        one('2S 3S 4S 5S 6S KS QS JS TS AS 9S 8S 7S 2D KD 3D'),
        // starting behind, catching up one card at a time
        one('AS KS QS 2S 3S 7C 4S 9C 5S 6S JD 2H'),
        one('5C'), one('TC'),
      ],
      nRandom: 4, seed: 197,
    }),
  },
  {
    id: 'counterfeit',
    card: 'JC',
    unlockAfter: 'perfect-pair',
    title: 'Counterfeit',
    difficulty: 7,
    story: [
      'The Kessler crew have looked hard at the new two-deck shoe and decided that the second of any two identical cards must be a forgery. They want a reward every time one turns up, and the Owner, who likes to be seen taking forgery seriously, has agreed.',
      'Single cards all night. A card is a counterfeit if the very same card, rank and suit, has already been played tonight, however long ago; the first copy is genuine and pays nothing. Another card of the same rank in a different suit is no forgery.',
    ],
    brief: 'Single cards from a two-deck shoe. Pay out every card identical to one already played tonight (the same rank and the same suit): the second copy of a card pays, the first never does.',
    handSize: 1,
    decks: 2,
    floor: floorOf(hexRect(-3, 5, -4, 9), COUNTERFEIT),
    fixed: COUNTERFEIT,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: counterfeit,
    tests: dealtTests({
      deal: (rand, n) => shoeDeals(rand, n, 40),
      fixed: [
        one('7S 7D 7S 2C 7D KH 2C AS KH 7H 7C AS 2D'),
        one([...fullDeck(), ...fullDeck()].join(' ')),
        one('QH'),
        one('QH QS QD QC QH QS QD QC'),
        // each card twice in a row; a run of genuine cards; counterfeits back to back
        one('AS AS 2H 2H 3D 3D 4C 4C 5S 5H 5D 5C 6S 7H 8D 9C 6S 7H 8D 9C TS JS QS KS'),
      ],
      nRandom: 4, seed: 193,
    }),
  },
  {
    id: 'rank-and-file',
    card: 'QC',
    unlockAfter: 'change-of-heart',
    title: 'Rank and File',
    difficulty: 8,
    story: [
      'Dmitri has been asked to look over the house\'s paperwork, and he has views on it. Tonight every five-card hand is paid back, all five cards of it, but in order: the lowest rank on top, down to the highest at the bottom.',
      'Aces are low: an ace goes above a 2, and kings go to the bottom. Where two cards share a rank, the spade goes first, then the diamond, the club and the heart. Dmitri says a hand in order is a hand he can file.',
    ],
    brief: 'Five-card hands. Pay out every hand with its cards in rank order, lowest on top: A 2 3 ... 10 J Q K (aces low). Cards of the same rank go spade, diamond, club, heart. (Order counts.)',
    handSize: 5,
    floor: floorOf(hexRect(-1, 4, -6, 10), RF),
    fixed: RF,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    expected: (inputs) => inputs.map(inRankOrder),
    ordered: true,
    tests: dealtTests({
      deal: (rand, n) => rankDeals(rand, n, 8),
      fixed: [
        // every shape of hand; already in order, in reverse order; aces low;
        // a rank in every suit order
        ['KS QD 2C 3H 4S', 'AS 2D 3C 4H 5S', 'KH QC JD TS 9H', 'KD AH QS AC 2D', '9H 4C 9S 7D 4D',
          'JH JC JD JS 3D', '7S 7D 7C 7H 2S', '8C 8S 5H 8D 5S', 'QH TC QD TH QS', 'AH KS AD KH AS'],
        // the same shape back to back: four of a kind, two pair, five in a row
        // already in order, four of a kind
        ['6C 6H 6S 6D KC', 'TD TS TH TC AH', '3H 3C 2H 2C AD', '5D 5S 4D 4S 9C', 'AS 2S 3S 4S 5S',
          'AD 2C 3H 4S 5D', '2S 2D 2C 2H 3S', 'KS KD KC KH QH'],
        // hands in reverse order, alternating with hands already in order
        ['KH JC 9D 7S 5H', 'AC 3D 5S 7H 9C', 'QH QC QD QS JH', '4S 4D 4C 6S 6D', '9H 9C 8H 8C 7H',
          '2D 3C 4H 5S 6D', 'KC QC JC TC 9C', 'AS AD AC AH 2H'],
        // one hand alone
        ['JC 3S JS 3H 7D'],
      ],
      nRandom: 4, seed: 193,
    }),
  },
  {
    id: 'head-count',
    card: 'KC',
    unlockAfter: 'rest-of-the-deck',
    title: 'Head Count',
    difficulty: 8,
    story: [
      'Commissioner Pryce has a new regulation, and this one he wrote himself. A hand of one to six cards wins if its top card says how many cards it holds: an ace on a hand of one, a 4 on a hand of four.',
      'He calls it honest labelling. A king on top never wins, since nobody holds thirteen cards, and nor does an ace on anything but a single card.',
    ],
    brief: 'Hands of 1 to 6 cards. Pay out every hand whose top card\'s rank is the number of cards in it (ace = 1).',
    handSize: [1, 6],
    floor: floorOf(hexRect(-5, 4, -11, 9), B11),
    fixed: B11,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h) => rankValue(h[0]) === h.length,
    tests: makeMixedTests({
      minSize: 1, maxSize: 6, handsPerTest: 12,
      fixed: [
        ['AS', '2D 9C', '3H KS 4D', '4S 2D 7C 9H', '5D AS 2C 3H 4S', '6C 7D 8S 9H TC JD',
          '2S', 'AH 3S', '3C 4D', '5S 6D 7C 8H', '4H 2C 3D 5S 6H', 'KD QD JD TD 9D 8D'],
        // winners back to back, then losers of every size
        ['3S 9D 9C', '2H 7S', 'AD', '6S 2D 3C 4H 5S 7D', '4C 5D 6H 7S', '5H 8S 8D 8C 8H',
          'KS', '7D 8S', '2C 2D 2H', 'AH 2H 3H 4H', '3D 4D 5D 6D 7D', '5C 6C 7C 8C 9C TC'],
      ],
      nRandom: 4, seed: 175,
    }),
  },
  {
    id: 'mirror-image',
    card: 'AD',
    unlockAfter: ['crossed-wires', 'deja-vu'],
    title: 'Mirror Image',
    difficulty: 8,
    story: [
      'The Marchetti twins are back, at two tables again, and each has brought a deck of their own. They play five-card hands side by side, one each per deal, and the house pays both hands when the twins hold exactly the same five cards.',
      'The order the cards come in doesn\'t matter, but the suits do: a pair of sevens is not the same as a pair of sevens.',
    ],
    brief: 'Two players, five-card hands, one each per deal. When both hold the same five cards (in any order), pay out both hands.',
    handSize: 5,
    floor: floorOf(hexRect(-4, 4, -11, 13), B12),
    fixed: B12,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => deals(inputs).filter(([a, b]) => same(a, b)).flat(),
    tests: dealtTests({
      deal: (rand, n) => mirrorDeals(rand, n, 8),
      fixed: [
        ['AS 2S 3S 4S 5S', '5S 4S 3S 2S AS', 'KD QD JD TD 9D', 'KD QD JD TD 9C', '7S 7D 7C 7H 2S', '7S 7D 7C 7H 2D',
          '3C 8H JS 2D 6C', '6C 2D JS 8H 3C', '5H 9S KC 4D TH', '5H 9S KC 4D TH', 'AH KS 2C 3D 4H', 'AH KS 2C 3D 5H'],
        // matches back to back, then near misses back to back
        ['2C 4D 6H 8S TC', '8S TC 2C 6H 4D', 'JH QH KH AH 2H', '2H JH AH KH QH', '3S 5S 9D 9C QH', 'QH 9C 9D 5S 3S',
          'AD 3D 5D 7D 9D', 'AD 3D 5D 7D 9H', '4C 6C 8C TC QC', '4C 6C 8C TC KC', 'KS QS JS TS 9S', 'KS QS JS TS 8S'],
      ],
      nRandom: 4, seed: 176,
    }),
  },
  {
    id: 'casino-numbers',
    card: '2D',
    unlockAfter: ['crossed-wires', 'deja-vu'],
    title: 'Casino Numbers',
    difficulty: 8,
    story: [
      'The Owner has a new way of counting, and it has no zero in it: nobody at the Stacked Deck has ever been paid nothing. The digits are the cards, ace to king, so a jack is eleven and a king thirteen; fourteen is an ace and an ace, twenty-six an ace and a king, and twenty-seven a two and an ace.',
      'Tonight two players each play one spade, ace to king, per deal, and the house pays the total in casino numbers, in its own spades, the leading digit on top. Dmitri is converting his spreadsheet, and has asked for a bigger one.',
    ],
    brief: 'Two players, one spade each per deal, ace (1) to king (13). Pay the sum in casino numbers, house spades with the leading digit on top: 2 to 13 as one card (13 is the king), 14 to 26 as the ace on top of the card for the rest (14 is A♠ A♠, 26 is A♠ K♠).',
    handSize: 1,
    floor: floorOf(hexRect(-6, 2, -5, 12), H6),
    fixed: H6,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => deals(inputs).map(([[a], [b]]) => casino(rankValue(a) + rankValue(b))),
    ordered: true,
    tests: dealtTests({
      deal: (rand, n) => digitDeals(rand, n, 8),
      fixed: [
        // the smallest and largest sums, and either side of thirteen
        one('AS AS KS KS 5S 5S AS QS QS AS 6S 7S 7S 7S KS AS 9S 4S TS 4S 8S 6S'),
        one('4S 7S JS 2S 6S 8S QS 2S 9S 9S 3S TS KS 9S JS JS'),
        one('3S 4S'),
      ],
      nRandom: 4, seed: 184,
    }),
  },
  {
    id: 'every-twenty-one',
    card: '3D',
    unlockAfter: 'casino-numbers',
    title: 'Every Twenty-One',
    difficulty: 7,
    story: [
      'Word has got out that the Owner means to bring blackjack to the Stacked Deck, and Dmitri has started practising. Tonight the players hand over one card at a time, of any suit, and he keeps the night\'s running total the blackjack way: number cards count their face value, and jacks, queens and kings ten. An ace counts one; Dmitri says he will think about elevens when the tables open.',
      'Each time the total reaches or passes another twenty-one (twenty-one, forty-two, sixty-three and so on), the house pays out the card that took it there. Nothing is ever taken off the total: a king that takes it from nineteen to twenty-nine is paid, and the next card counts on from twenty-nine. Dmitri has a column for this.',
    ],
    brief: 'Single cards of any suit, counted as in blackjack: 2 to 10 their face value, J, Q and K 10, an ace 1. Keep the night\'s running total, and pay out each card that brings it to or past the next multiple of 21 (21, 42, 63, ...). The total is never reset.',
    handSize: 1,
    floor: floorOf(hexRect(-4, 3, -7, 7), E21),
    fixed: E21,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: everyTwentyOne,
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [
        // picture cards count ten: 21 exactly on the 3 (in casino numbers it
        // would be the 8), 42 exactly on an ace, a king across 63, and 126
        // exactly on an ace
        one('KS 8D 3C QC JH AS TD 9H KD QS 2C JD KH 9S QH 3D AD'),
        // a queen past 21, a king past 63 and another onto 105 exactly
        one('KS 8D QC JH AS 9D 9H KD TS 7S 6H 5C KC 9S AH 2C QS 5D AD 3H'),
        // small cards: the eleventh reaches 21 exactly
        one('AS AH AD AC 2S 2H 2D 2C 3S 3H 3D KD QH JD 4C'),
        // a whole deck: 340 is sixteen 21s and 4
        one('9C 4D KH 2S JC 7C AD 5S QD 3H TC 8S 6D KS 2H 9D 4C JS 7H AC 5H QS 3D TH 8D 6C ' +
          'KD 2C 9H 4S JH 7D AS 5C QH 3S TD 8C 6H KC 2D 9S 4H JD 7S AH 5D QC 3C TS 8H 6S'),
      ],
      nRandom: 4, seed: 193,
    }),
  },
  {
    id: 'hit-me',
    card: '4D',
    unlockAfter: 'every-twenty-one',
    title: 'Hit Me',
    difficulty: 8,
    story: [
      'Blackjack has arrived at the Stacked Deck, rewritten in the house style: there is no dealer to beat. Each player takes two to five cards, and the house pays out every hand that doesn\'t go over twenty-one.',
      'Number cards count their face value and jacks, queens and kings ten. An ace counts one or eleven, whichever the player likes, so a hand only goes over if it is over with every ace counted as one. Sal Vellani asked for five aces; the Owner pointed out that the house deck has four.',
    ],
    brief: 'Hands of 2 to 5 cards. Pay out every hand whose total is 21 or less: number cards count their face value, jacks, queens and kings 10, and an ace 1 or 11 as the player likes (so a hand goes over only if it is over 21 with every ace counted as 1).',
    handSize: [2, 5],
    floor: floorOf(hexRect(-4, 4, -8, 8), HIT),
    fixed: HIT,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h) => blackjack(h) <= 21,
    tests: dealtTests({
      deal: (rand, n) => nearTwentyOne(rand, n, 10),
      fixed: [
        // 21 against 22; aces; picture cards; two cards never go over
        ['AS KS QS', 'KH QH 2D', 'AH AD AC AS KC', 'KD 9C 2S', 'JS QD KC', 'TS JH', 'AS AH', '2S 3S 4S 5S 7S',
          '3D 4D 5D 6D 4H', 'QS 5H 6C', '9S 9H 4C', '7S 7H 7D', 'KS 5D 5C 2H', 'JD AC TC'],
        // winners back to back, long and short, then hands that go over, then both in turn
        ['2C 3C 4C 5C 6C', 'KC QC', 'AD 9D TD', '5S 6S 4S 6H', '8C 8D 5H', 'AC 2D 3H 4S 5H',
          'KS QS 2C', 'TD 9H 8S', 'JC 9C 3D', '6S 6D 6H 4D', '2H 7C KH 3S',
          '9D 8H 4H', 'QD JH 2S', '3C 3D 3H 3S 9C', 'TC 7H 5D', 'AS JS', '4C 8S TH'],
        ['KC QC AC'],
      ],
      nRandom: 4, seed: 194,
    }),
  },
  {
    id: 'punto-banco',
    card: '5D',
    unlockAfter: 'hit-me',
    title: 'Punto Banco',
    difficulty: 8,
    story: [
      'Blackjack has gone down so well that Sal Vellani has talked the Owner into a second game from out of town: baccarat, played the house way, with no banker and no third card. Each hand is two cards, and it is worth only the last digit of its total. An ace counts one, 2 to 9 their face value, and tens and picture cards nothing.',
      'So a 7 and an 8 make fifteen and are worth 5, two 9s are worth 8, and a king with a queen is worth nothing at all. The house pays every natural: a hand worth 8 or 9. Dmitri has been asked to keep the score and refuses to touch a game that throws its tens away; Sal has bought a tie for it.',
    ],
    brief: 'Two-card hands. A hand is worth the units digit of its total, an ace counting 1, 2 to 9 their face value, and 10, J, Q and K nothing (9 and 9 make 18, worth 8). Pay out every natural: a hand worth 8 or 9.',
    handSize: 2,
    floor: floorOf(hexRect(-5, 4, -8, 8), BAC),
    fixed: BAC,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h) => bacPoints(h) >= 8,
    tests: dealtTests({
      deal: (rand, n) => bacDeals(rand, n, 20),
      fixed: [
        // every way to make 8 or 9; tens and pictures; pairs; 7s, 0s and wraps that miss
        ['8S KD', 'QH 9C', '4S 4D', '9H 9S', 'AS 7D', '3C 6H', '5D 4C', '2H 6S', 'AC 8H', 'TS JD', '7C 7H', 'KS QC',
          'AD AH', '5S 5H', '9D TC', '6C 3S', '2C 7S', 'JH 8C', '3H 5C', '4H 3D', '8D 2D', '6D 2S', '9C 8D', 'KC AD'],
        // naturals back to back, then hands a point short, then both in turn
        ['9S 9C', '4D 4C', 'KH 8H', '7S AD', 'TD 9D', '3S 5H', '6C 2D', '5S 4H',
          'AS 6S', 'QS 7D', '3H 4S', '9D 8C', '5D 2C', 'JS TH', 'KS QD',
          '8C KC', '6H AH', '2S 7C', '7H 6D', 'JD 9C', '5C 5D', 'AC 8S', '4H 2H'],
        ['QC 8D'],
      ],
      nRandom: 4, seed: 206,
    }),
  },
  {
    id: 'split-the-difference',
    card: '6D',
    unlockAfter: 'casino-numbers',
    title: 'Split the Difference',
    difficulty: 8,
    story: [
      'The Kesslers\' bottom dealer and his cousin have argued for years about who owes whom, and have agreed to settle it at the table, in casino numbers. Each plays one spade per deal, ace to king, and the house pays the difference between them: the higher card less the lower, as one spade.',
      'When both play the same rank there is no difference to split, and the house pays nothing. Dmitri keeps the score; nobody else is allowed to.',
    ],
    brief: 'Two players, one spade each per deal, ace (1) to king (13). Pay the difference (the higher card less the lower) as one house spade, ace (1) to queen (12); pay nothing when both are the same rank.',
    handSize: 1,
    floor: floorOf(hexRect(-6, 2, -5, 12), H6),
    fixed: H6,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => deals(inputs).flatMap(([[a], [b]]) => {
      const d = Math.abs(rankValue(a) - rankValue(b));
      return d ? [casino(d)] : [];
    }),
    tests: dealtTests({
      deal: (rand, n) => digitDeals(rand, n, 8),
      fixed: [
        // the largest differences both ways round, every difference, and ties
        one('AS KS KS AS KS KS AS AS 2S KS 5S 7S 7S 5S QS 2S 3S JS 9S 4S TS 4S 8S 2S 6S 3S 4S 9S 2S 3S AS 2S'),
        one('6S 6S 3S 4S JS JS 9S 8S 2S QS 7S 7S 8S 9S 5S 9S 9S 2S 2S JS'),
        one('4S 9S'),
      ],
      nRandom: 4, seed: 192,
    }),
  },
  {
    id: 'last-in-first-out',
    card: '7D',
    unlockAfter: ['three-apart', 'rest-of-the-deck'],
    title: 'Last In, First Out',
    difficulty: 9,
    story: [
      'The cloakroom has a new attendant, and a new rule: tickets are for amateurs. Guests hand over hands of one to five cards on the way in, and at the end of the night the house pays every one of them back, the last hand handed in first, then the one before it, and so on back to the first.',
      'The cards of a hand may come back in any order, but the hands must come back in exactly that order. The attendant knows the night is over when the guests stop arriving.',
    ],
    brief: 'Hands of 1 to 5 cards. Pay out every hand, in the reverse of the order they were played: the last hand first.',
    handSize: [1, 5],
    floor: floorOf(hexRect(-3, 5, -9, 9), H1),
    fixed: H1,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => [...inputs].reverse(),
    inOrder: true,
    tests: makeMixedTests({
      minSize: 1, maxSize: 5, handsPerTest: 8,
      fixed: [
        ['AS', '2D 3C', '4H 5S 6D', '7C 8H 9S TD', 'JC QH KS AD 2C'],
        // the same cards twice, single cards back to back, and one hand alone
        ['KS QS', '3H', '3D', '9D 9C 9H 9S', 'KS QS', '5C 6C 7C 8C TC', 'AH', '2S 4S'],
        ['7D 8D 9D'],
      ],
      nRandom: 4, seed: 178,
    }),
  },
  {
    id: 'first-sighting',
    card: '8D',
    unlockAfter: 'four-of-a-kind',
    title: 'First Sighting',
    difficulty: 9,
    story: [
      'The mayor has taken up birdwatching, and brought the habit to the tables. Tonight he plays two-card hands from the big shoe, and the house pays a hand the first time its two ranks are seen together tonight. After that, that combination is old news.',
      'Suits don\'t count, and neither does the order: a 7 with an 8 is the same sighting as an 8 with a 7, whatever their suits. A pair is a combination of its own, so the first 7-7 of the night is paid, and so is the first 7-8. The mayor keeps the tally on a napkin, and has already ordered a second napkin.',
    ],
    brief: 'Two-card hands. Pay out every hand whose two ranks (suits and order don\'t matter; a pair counts as its own combination) haven\'t been played together in an earlier hand tonight.',
    handSize: 2,
    floor: floorOf(hexRect(-3, 6, -8, 7), FS),
    fixed: FS,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: firstSighting,
    tests: dealtTests({
      deal: (rand, n) => sightingDeals(rand, n, 12),
      // (Tests are kept to 14 hands or fewer: a machine's scan takes longer
      // as the night goes on, and after the last hand nothing is dealt or
      // paid for several scans, which must stay well inside STALL_ROUNDS.)
      fixed: [
        // each edge case: reversed, pairs, a shared rank, aces at both ends
        ['7S 8D', '8C 7H', '7D 7C', '7H 7S', '8S 8H', 'AS KD', 'KC AH', 'AD 2S', '2H AC', 'AH AD', 'KS QD', 'QC KH', 'QS QD'],
        ['JS QH', 'QC JD', '3S 4D', '4C 5H', '3H 5S', '5D 3C', '9S 9D', 'TS 9H', '9C TD', '2S 2D', '2C 2H', '6S 4D', '4H 6C'],
        // seven new hands back to back, then seven repeats back to back
        ['AS 2D', '3C 4H', '5S 6D', '7C 8H', '9S TD', 'JC QH', 'KS AD', '2H AC', '4D 3S', '6H 5C', '8D 7S', 'TS 9H',
          'QD JS', 'AH KC'],
        // new and repeated hands alternating, repeats straight after
        ['AS 2D', '2C AH', '3S 3D', '3H 3C', '4S 9D', '9C 4H', 'KS KD', 'KH KC', 'QS JD', 'JC QH', '5S 6D', '5H 6C',
          '2S 3D', 'AD 2H'],
        // a hand repeated long after, among hands sharing one of its ranks
        ['QS 7D', 'QH QC', '7S 7H', 'QD 8S', '6C 7C', 'KS QC', '7D AS', '2H QS', '7H 3C', 'QC 9D', '4S 7S', 'JH QD',
          'QD 7C', '7H 7D'],
        ['5C 5D'],
      ],
      nRandom: 4, seed: 190,
    }),
  },
  {
    id: 'times-tables',
    card: '9D',
    unlockAfter: 'casino-numbers',
    title: 'Times Tables',
    difficulty: 9,
    story: [
      'Dmitri has found the multiplication sheet. Tonight two players each play one spade per deal, ace to king, and the house pays the product in casino numbers, in its own spades, the leading digit on top: one card up to thirteen, two from fourteen (an ace and an ace) all the way to a hundred and sixty-nine (a queen and a king).',
      'The Owner asked why the house pays more for a king and a queen than for a king and an ace. Dmitri said it was a long story; the Owner said to keep it short.',
    ],
    brief: 'Two players, one spade each per deal, ace (1) to king (13). Pay the product in casino numbers, house spades with the leading digit on top: 1 to 13 as one card (13 is the king), 14 and up as two (14 is A♠ A♠, 26 is A♠ K♠, 169 is Q♠ K♠).',
    handSize: 1,
    floor: floorOf(hexRect(-5, 4, -10, 10), H8),
    fixed: H8,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => deals(inputs).map(([[a], [b]]) => casino(rankValue(a) * rankValue(b))),
    ordered: true,
    tests: dealtTests({
      deal: (rand, n) => digitDeals(rand, n, 8),
      fixed: [
        // the smallest and largest products, and either side of thirteen
        one('AS AS KS KS AS KS 2S 7S 7S 2S KS 2S 3S 9S QS JS 5S 8S KS QS 6S 2S 9S 9S'),
        one('4S 3S JS 2S 2S 6S TS 7S'),
      ],
      nRandom: 4, seed: 185,
    }),
  },
  {
    id: 'showdown',
    card: 'TD',
    unlockAfter: 'mirror-image',
    title: 'Showdown',
    difficulty: 9,
    story: [
      'Sal Vellani and Dmitri have agreed to settle things at the table, three cards each, one hand each per deal. The house pays the better hand: highest card against highest card, and if those match, middle against middle, then lowest against lowest.',
      'Aces are high. Suits don\'t count, and if all three ranks match the house pays neither of them, which both agree is the only fair result.',
    ],
    brief: 'Two players, three-card hands, one each per deal. Pay out the higher hand, comparing highest cards, then middle, then lowest (aces high); on a tie pay neither.',
    handSize: 3,
    floor: floorOf(hexRect(-7, 5, -19, 9), B13),
    fixed: B13,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => deals(inputs).flatMap(([a, b]) => {
      const w = showdown(a, b);
      return w > 0 ? [a] : w < 0 ? [b] : [];
    }),
    tests: makeTests({
      handSize: 3, handsPerTest: 16,
      fixed: [
        ['AS 2D 3C', 'KS QD JC', '2S 9D 5C', '9H 3S 4D', 'QS 7D 7C', '7H QD 8S', '4S 4D 2C', '4C 4H 3S',
          'JS 6D 2C', '2D JC 6S', 'TS 9D 8C', '8D TC 9S', '5S 5D 5C', 'KD 2H 3H', 'AD AC 2S', 'AH AS 3D'],
        // the first or second cards tie, back to back
        ['KS 9D 2C', '2S 9C KH', 'KD 9S 3C', '3D KC 9H', 'QS JD 5C', 'JS 5D QC', '8S 7D 6C', '8D 6S 7C',
          'AS 2D 2C', '2S AD 3C', '6S 6D 6C', '6H 6S 5D'],
      ],
      nRandom: 4, seed: 177,
    }),
  },
  {
    id: 'follow-suit',
    card: 'JD',
    unlockAfter: 'showdown',
    title: 'Follow Suit',
    difficulty: 9,
    story: [
      'Sal Vellani\'s uncle has brought the family\'s card game across the river. Four players, one card each per trick, and player A leads every trick. The trick goes to the highest card of the suit A led, aces high. A card of any other suit never wins it, however high it is: the uncle\'s ace of spades on a heart lead has cost him forty years of tricks, and he is still not ready to talk about it.',
      'Each player has a desk of their own: A at X, B at Y, C at Z and D at W. The house pays the trick\'s four cards, as one hand, at its winner\'s desk. A night is one deck, thirteen tricks at most.',
    ],
    brief: 'Four players, one card each per trick; A leads every trick. Pay the trick\'s four cards as one hand at the desk of its winner (A\'s at X, B\'s at Y, C\'s at Z, D\'s at W): the highest card of the suit A led, aces high. Cards of other suits never win.',
    handSize: 1,
    floor: floorOf(hexRect(-4, 7, -13, 8), FOLLOW_SUIT),
    fixed: FOLLOW_SUIT,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: followSuit,
    tests: dealtTests({
      deal: followSuitDeals,
      fixed: [
        // every seat wins; aces high; high cards of other suits lose
        one('2S KH AH AD 5H 9H 3H 7C 4D 6S 8D QD TC JC 2C 3D QS JS AS KS KC 4C 5C 6C 9D TD JD 2D 3S 2H 4S 5S 7H 8S 9S TS'),
        // the trick changes hands at every seat, then never; winners back to back and alternating
        one('2H 3H 4H 5H 6H 7H 8H 9H 5D 4D 3D 2D KS AS QS JS AC KC QC JC TH JH 8S 9C 6S 7D 8D 9D 2C 3S 4C 5S TS JD QD KD 6C 7C 3C KH'),
        // nobody follows suit
        one('AH KS KD KC 2H AS AD AC 3H QS QD QC'),
      ],
      nRandom: 4, seed: 194,
    }),
  },
  {
    id: 'twice-shy',
    card: 'QD',
    unlockAfter: 'mirror-image',
    title: 'Twice Shy',
    difficulty: 10,
    story: [
      'The Marchetti twins have each brought a deck of their own again, and the Owner is tired of paying twice for the same card. Tonight the twins play five-card hands side by side, one each per deal, and every hand is paid out, less any card that turns up more than once over the whole night.',
      'Both copies of such a card go to the house, whichever twin played them and however many deals apart. A hand that loses all five pays nothing. The twins call it double jeopardy; the Owner calls it bookkeeping.',
    ],
    brief: 'Two players, five-card hands, one each per deal, each from their own deck. Pay out every hand without the cards played more than once tonight (by either player, in any hand); a hand with nothing left pays nothing.',
    handSize: 5,
    floor: floorOf(hexRect(0, 8, -8, 11), H5),
    fixed: H5,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: onceOnly,
    tests: dealtTests({
      deal: (rand, n) => twoDeckDeals(rand, n, 4),
      fixed: [
        ['AS 2S 3S 4S 5S', '5S 4S 3S 2S AS', 'KD QD JD TD 9D', 'KD QH 7C 2D 9D', '7S 7D 7C 7H 8S', '3C 4H 5D 6S 2C'],
        // cards played again deals later
        ['2H 3H 4H 5H 6H', 'JS QS KS AC 2C', '7H 8H 9H TH JH', '9C TC JC QC KC', 'AD 2D 3D 4D 5D', '6H 2H AD 6D 7D',
          '6C 7C 8C 9S TS', 'JH 8D 5C 4C 3C'],
        // nothing in common: every hand is paid whole
        ['AS KH 2D QC 3S', 'JH 4D TC 5S 9H'],
      ],
      nRandom: 4, seed: 182,
    }),
  },
  {
    id: 'carry-the-one',
    card: 'KD',
    unlockAfter: 'times-tables',
    title: 'Carry the One',
    difficulty: 10,
    story: [
      'Dmitri\'s spreadsheet now has two columns, and so do the players: tonight each of them plays a two-digit casino number per deal, the leading digit a club on top of the units digit, a spade. That is fourteen (an ace and an ace) up to a hundred and eighty-two (a king and a king).',
      'The house pays the total in casino numbers, in its own spades, the leading digit on top. The biggest totals take three cards, which the Owner has decided to be proud of.',
    ],
    brief: 'Two players, two-card hands, one each per deal: a two-digit casino number, the leading digit a club on top of the units digit, a spade (A♣ A♠ is 14, K♣ K♠ is 182). Pay the sum in casino numbers, house spades with the leading digit on top: 28 is 2♠ 2♠, 182 is K♠ K♠, and from 183 (A♠ A♠ A♠) it takes three cards, up to 364 (2♠ A♠ K♠).',
    handSize: 2,
    floor: floorOf(hexRect(-6, 7, -12, 11), H7),
    fixed: H7,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => deals(inputs).map(([a, b]) => casino(twoDigits(a) + twoDigits(b))),
    ordered: true,
    tests: dealtTests({
      deal: (rand, n) => twoDigitDeals(rand, n, 6),
      fixed: [
        // the smallest and largest sums; a carry or not into each digit
        ['AC AS', 'AC AS', 'KC KS', 'KC KS', 'AC 6S', 'AC 7S', 'AC 7S', 'AC 7S', 'QC AS', 'AC AS', 'QC KS', 'AC AS',
          'KC AS', 'AC KS', '9C 9S', '9C 9S'],
        ['5C 7S', '6C 7S', '2C 3S', 'JC 4S', 'AC KS', 'KC AS'],
      ],
      nRandom: 4, seed: 186,
    }),
  },
];

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds totalled over the level's tests). test/levels.js
// checks these exactly; `node tools/write-solutions.js bonus --par` rewrites
// this table from the recipes in tools/level-specs/bonus.js.
// BEGIN PAR
const PAR = {
  'split-pot': { croupiers: 3, rounds: 56 },
  'small-change': { croupiers: 6, rounds: 130 },
  'checkerboard': { croupiers: 4, rounds: 79 },
  'two-apart': { croupiers: 5, rounds: 120 },
  'snap': { croupiers: 6, rounds: 150 },
  'three-apart': { croupiers: 7, rounds: 125 },
  'natural': { croupiers: 12, rounds: 134 },
  'off-suit': { croupiers: 13, rounds: 71 },
  'crossed-wires': { croupiers: 14, rounds: 68 },
  'every-other': { croupiers: 4, rounds: 90 },
  'bookends': { croupiers: 5, rounds: 134 },
  'one-deck': { croupiers: 10, rounds: 837 },
  'cut-to-the-ace': { croupiers: 11, rounds: 913 },
  'uneven-tables': { croupiers: 18, rounds: 94 },
  'four-of-a-kind': { croupiers: 6, rounds: 533 },
  'missing-card': { croupiers: 12, rounds: 1040 },
  'counting-up': { croupiers: 9, rounds: 290 },
  'ceasefire': { croupiers: 9, rounds: 212 },
  'three-in-a-row': { croupiers: 9, rounds: 222 },
  'rising': { croupiers: 12, rounds: 214 },
  'odds-and-evens': { croupiers: 12, rounds: 217 },
  'after-a-pair': { croupiers: 13, rounds: 171 },
  'two-by-two': { croupiers: 13, rounds: 114 },
  'rest-of-the-deck': { croupiers: 14, rounds: 1506 },
  'crazy-eights': { croupiers: 14, rounds: 1021 },
  'perfect-pair': { croupiers: 14, rounds: 922 },
  'pot-luck': { croupiers: 18, rounds: 747 },
  'night-off': { croupiers: 25, rounds: 398 },
  'skeleton-crew': { croupiers: 10, rounds: 69 },
  'one-war': { croupiers: 10, rounds: 368 },
  'dumbwaiter': { croupiers: 8, rounds: 327 },
  'no-kings': { croupiers: 13, rounds: 107 },
  'one-up': { croupiers: 16, rounds: 4076 },
  'twenty-one-card-trick': { croupiers: 14, rounds: 290 },
  'round-the-clock': { croupiers: 20, rounds: 3139 },
  'running-count': { croupiers: 22, rounds: 674 },
  'counterfeit': { croupiers: 25, rounds: 496 },
  'rank-and-file': { croupiers: 13, rounds: 5511 },
  'head-count': { croupiers: 19, rounds: 676 },
  'mirror-image': { croupiers: 25, rounds: 383 },
  'casino-numbers': { croupiers: 27, rounds: 1574 },
  'every-twenty-one': { croupiers: 20, rounds: 2240 },
  'hit-me': { croupiers: 27, rounds: 2077 },
  'punto-banco': { croupiers: 24, rounds: 2626 },
  'split-the-difference': { croupiers: 28, rounds: 1504 },
  'last-in-first-out': { croupiers: 20, rounds: 835 },
  'first-sighting': { croupiers: 29, rounds: 5951 },
  'times-tables': { croupiers: 34, rounds: 3720 },
  'showdown': { croupiers: 43, rounds: 296 },
  'follow-suit': { croupiers: 38, rounds: 867 },
  'twice-shy': { croupiers: 36, rounds: 1145 },
  'carry-the-one': { croupiers: 75, rounds: 2046 },
};
// END PAR
finishChapter(LEVELS, PAR);
