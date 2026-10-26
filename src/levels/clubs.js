// Chapter 3 (clubs): House Rules. Copies of a hand (duplicate), sets,
// Commissioner Pryce's top-card regulation (4♣ to 9♣) with the riffles and
// the deal it calls for, the first floors that pay something other than the
// hands dealt (Upside Down, Ace Count), and finally verdict cards: a copy decides, a
// released card carries the verdict, the original is paid at a gate.
// See docs/campaign.md for the plan.
import {
  hexRange, hexRect, makeTests, floorOf, source, desk, E,
  hv, high, spadesOf, paletteThrough, finishChapter,
} from './shared.js';
import { rankOf, rankCounts } from '../cards.js';

const F1 = [source([-2, 0], E), desk([2, 0])];
const F2 = [source([-3, 0], E), desk([1, 0])];
const F3 = [source([-3, 0], E), desk([2, 0])];
const F4 = [source([-2, 0], E), desk([2, 0])];
const F5 = [source([-3, 0], E), desk([2, 0])];
const F6 = [source([-3, 0], E), desk([1, 0])];
const F7 = [source([-3, 0], E), desk([1, 0])];
const F8 = [source([-1, 0], E), desk([-2, -1])];
const F9 = [source([-3, 0], E), desk([3, 0])];
const F10 = [source([-3, 0], E), desk([1, -2])];
const F11 = [source([-2, -1], E), desk([3, -2])];
const F12 = [source([-4, -1], E), desk([3, -2])];
const F13 = [source([-3, -1], E), desk([3, -2])];

// Rank counts as a sorted shape, e.g. '1,2,2' for two pair.
const shape = (h) => [...rankCounts(h).values()].sort().join();
const paired = (h) => { const n = rankCounts(h); return h.filter((c) => n.get(rankOf(c)) >= 2); };

export const LEVELS = [
  {
    id: 'upper-hand',
    chapter: 3,
    card: 'AC',
    title: 'Upper Hand',
    story: [
      'The rival casino two blocks away opened last night with a brass band and free shrimp, and half the regulars went to have a look. The note under the cash tray says only: "Be generous."',
      'Tonight\'s house game: a five-card hand wins if its highest card is one of its top two cards. If the highest rank turns up twice, one of them in the top two is enough. A new croupier makes perfect copies of a hand.',
    ],
    brief: 'Five-card hands. Pay out every hand whose highest card is one of its top two cards (ties count).',
    handSize: 5,
    floor: floorOf(hexRange(2), F1),
    fixed: F1,
    croupiers: paletteThrough('duplicate'),
    pays: (h) => Math.max(hv(h[0]), hv(h[1])) >= high(h),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['AS 2D 3C 4H 5S', '2D AS 3C 4H 5S', '2D 3C AS 4H 5S', '2D 3C 4H 5S AS', 'KS 2D KH 3C 4H',
          '2D 3C KH KS 4H', 'KS 2D AC 3H 4S', '9S 9D 9C 2H 3S', '7S 7D 2C 3H 4S', 'TS 2D 3C 4H JS'],
        // winners back to back, then losers back to back
        ['AS KS 2D 3D 4D', 'KH AH 2C 3C 4C', 'QS 2H 3H 4H 5H', '2S QD 3S 4S 5S', 'JC 9C 8C 7C 6C',
          '2C 3C JD 4H 5H', '3S 4D 5C AD 2H', '6S 7S 8S 9S TS', '2H 3H 4H 5H KC', '4C 5D 6H 7S 8C'],
      ],
      nRandom: 4, seed: 140,
    }),
  },
  {
    id: 'high-spade',
    chapter: 3,
    card: '2C',
    title: 'High Spade',
    story: [
      'It is the Owner\'s birthday, apparently, though nobody knows which one. The Owner\'s calling card is the ace of spades, so tonight any hand whose best card is a spade wins.',
      'If the best rank is shared, a spade holding it is enough. The regulars who went to look at the shrimp are drifting back.',
    ],
    brief: 'Five-card hands. Pay out every hand where no card outranks its best spade.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -7, 3), F2),
    fixed: F2,
    croupiers: paletteThrough('duplicate'),
    pays: (h) => spadesOf(h).length > 0 && high(spadesOf(h)) >= high(h),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['AS 2H 3D 4C 5H', 'KH KS 2D 3C 4D', 'KH QS 2D 3C 4D', '2H 3H 4D 5C 6C', '2S 2H 2D 2C 3H',
          '2S 3H 4D 5C 6S', 'AH AS KS QS JS', 'AD KS QS JS TS', '7S 3H 4D 5C 6D', '9H 8D 7C 6H 5S'],
        // winners back to back, then losers (with and without spades)
        ['AS 2H 3D 4C 5H', 'KS 2D 3C 4H 5D', '9S 9H 2D 3C 4C', '6S 2S 3H 4D 5C', 'QS JS TS 9S 8S',
          'AH KS 2D 3C 4D', '2H 3H 4D 5C 6C', 'JD TS 2C 3H 4S', '9H 8D 7C 6H 5D', 'KC QS JS TS 9S'],
      ],
      nRandom: 4, seed: 141,
    }),
  },
  {
    id: 'top-pair',
    chapter: 3,
    card: '3C',
    title: 'Top Pair',
    story: [
      'The rival has started paying pairs. The Owner\'s answer is Top Pair: a hand wins if it holds a pair or better and its highest card is part of its biggest set.',
      'Two pair counts both pairs as the set; a full house counts only the three of a kind. A new croupier pulls out exactly that set: every card of the most common rank, or ranks, one way, and the rest the other.',
    ],
    brief: 'Five-card hands. Pay out every hand with a pair or better whose highest card is part of its largest set.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -7, 5), F3),
    fixed: F3,
    croupiers: paletteThrough('set'),
    pays: (h) => {
      const counts = rankCounts(h);
      const max = Math.max(...counts.values());
      return max >= 2 && high(h.filter((c) => counts.get(rankOf(c)) === max)) === high(h);
    },
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['KS KD 2C 3H 4S', '2S 2D KC 3H 4S', 'AS AD KC KH 2S', 'KS KD AC 2H 2S', 'QS QD 9C 9H KS',
          '9S 9D 9C KH KS', 'KS KD KC 9H 9S', '5S 5D 5C 5H KS', 'AS KD QC JH 9S', 'AS AD AC 4H 2D'],
        // winners back to back, then losers that need the set to decide
        ['AS AD 2C 3H 4S', 'KS 2D KC 3H 4S', 'QS QD 2C 2H 3S', 'JS 2D 3C 4H JD', 'TS TD TC 2H 3S',
          '2S 2D AC 3H 4S', '3S 3D 3C KH 2S', 'JS JD QC QH AS', '5S 5D 5C 5H 6S', '4S 4D 2C 2H 9S'],
      ],
      nRandom: 4, seed: 142,
    }),
  },
  {
    id: 'new-rules',
    chapter: 3,
    card: '4C',
    title: 'New Rules',
    story: [
      'The city Gaming Commission has visited. Commissioner Pryce left with a fruit basket, an envelope, and a new regulation: until further notice, War is played by the top card only.',
      'Your War croupiers can still play, but they look only at the first card of each hand.',
    ],
    brief: 'Five-card hands. Pay out every hand whose top card beats a 10. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRange(2), F4),
    fixed: F4,
    croupiers: paletteThrough('set'),
    warRules: ['top'],
    pays: (h) => hv(h[0]) > 10,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['TS AS AD AC AH', 'JS 2S 3S 4S 5S', 'AH 2H 3H 4H 5H', '9D KD KC KH KS', 'QC 2C 3C 4C 5C', 'TD JD QD KD AD']],
      nRandom: 4, seed: 117,
    }),
  },
  {
    id: 'bottom-dealer',
    chapter: 3,
    card: '5C',
    title: 'Bottom Dealer',
    story: [
      'The Kessler crew have brought their own dealer, who deals from the bottom of the deck and sees nothing wrong with it. Rather than argue, the Owner pays the bottom card: a four-card hand wins if its bottom card beats a 10.',
      'Two new croupiers riffle a hand: they split it in half and interleave the halves perfectly. The out-shuffle keeps the top card on top; the in-shuffle does not. Top-card War is still the law.',
    ],
    brief: 'Four-card hands. Pay out every hand whose bottom card beats a 10. (Top-card War only.)',
    handSize: 4,
    floor: floorOf(hexRect(-2, 2, -7, 5), F5),
    fixed: F5,
    croupiers: paletteThrough('inshuffle'),
    warRules: ['top'],
    pays: (h) => hv(h[3]) > 10,
    tests: makeTests({
      handSize: 4, handsPerTest: 13,
      fixed: [['2S 3S 4S JS', '2H 3H 4H AH', 'KD KC KH 9D', '2C 3C AC 4C', 'AD KD QD TD', 'TS 2D 3C QH', 'QS 2D 3C 4H',
        '2S KD 3C 4H', 'AS 2S 3S 4S', 'JC 2D 3H TS', '5S 6S 7S KS', '9C 8C 7C 6C', 'KH QH JH AS']],
      nRandom: 4, seed: 143,
    }),
  },
  {
    id: 'upside-down',
    chapter: 3,
    card: '6C',
    title: 'Upside Down',
    story: [
      'The bottom dealer has a cousin, who also deals from the bottom, but only on Sundays. Today is Sunday. He would like every hand handed to him upside down, so that the card he deals first is the one that came last.',
      'The Owner likes a family business. Tonight the chip desk pays every five-card hand, but upside down: bottom card on top, top card at the bottom. The cashier checks the order of every card.',
    ],
    brief: 'Five-card hands. Pay out every hand upside down: its cards in reverse order, the bottom card on top. (Order counts.)',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -7, 5), F6),
    fixed: F6,
    croupiers: paletteThrough('inshuffle'),
    warRules: ['top'],
    expected: (inputs) => inputs.map((h) => [...h].reverse()),
    ordered: true,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S 3D 4C 5H 6S', 'AS KD QC JH TS', '7S 7D 7C 7H 2S', 'AH 2H 3H 4H 5H', 'KS 2D KC 3H KD',
        '9S 8D 7C 6H 5S', 'JS 2D 3C 4H JD', 'QS QD 2C 3H 4S']],
      nRandom: 4, seed: 144,
    }),
  },
  {
    id: 'second-fiddle',
    chapter: 3,
    card: '7C',
    title: 'Second Fiddle',
    story: [
      'The string quartet is back, and the second violin has a grievance. To keep the peace, tonight\'s house game is his: a five-card hand wins if its top card beats the card just below it.',
      'Aces high, and a tie goes to the house, as always. The first violin thinks the whole thing is very funny.',
    ],
    brief: 'Five-card hands. Pay out every hand whose top card beats its second card. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -7, 5), F7),
    fixed: F7,
    croupiers: paletteThrough('inshuffle'),
    warRules: ['top'],
    pays: (h) => hv(h[0]) > hv(h[1]),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['KS 2D 3C 4H 5S', '2S KD 3C 4H 5S', '7S 7D 2C 3H 4S', 'AS KD 2C 3H 4S', 'KS AD 2C 3H 4S',
          '3S 2D AC KH QS', '5S 4D 6C 7H 8S', '9S TD 2C 3H 4S', '2S 3D 4C 5H AS', 'AH 2H 3H 4H 5H'],
        // winners back to back, then losers, then alternating
        ['AS 2D 3C 4H 5S', 'KS QD 2C 3H 4S', '9S 8D AC KH QS', '3S 2D 4C 5H 6S', '2S 3D 4C 5H 6S',
          'QS KD AC 2H 3S', '5S 5D 2C 3H 4S', 'JS 2D 3C 4H 5S', '2H JH 3C 4C 5C', 'TS 9D 8C 7H 6S'],
      ],
      nRandom: 4, seed: 145,
    }),
  },
  {
    id: 'knockout',
    chapter: 3,
    card: '8C',
    title: 'Knockout',
    story: [
      'The Kesslers are still sure the house is hiding aces. Under the regulation an ace in the middle of a hand is invisible, so the Owner pays any hand with an ace in it, wherever it hides.',
      'A new croupier deals a hand out one card at a time, round the table, to whichever sides you list.',
    ],
    brief: 'Five-card hands. Pay out every hand containing an ace. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -6, 5), F8),
    fixed: F8,
    croupiers: paletteThrough('deal'),
    warRules: ['top'],
    pays: (h) => h.some((c) => rankOf(c) === 'A'),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['2S 3S AS 4S 5S', 'KS KD KC KH QS', 'KH QH JH TH AH', '2C AH AD AC AS', '2D 3D 4D 5D 7C',
          'QD JD TD 9D 8D', '3C 4C 5C 6C AD', 'AC 2H 3H 4H 5H', '2S 3S 4S 5S AS', '2H AH 3D 4D 5D'],
        // aces back to back, then none
        ['AS 2D 3C 4H 5S', '2S AD 3C 4H 5S', '2S 3D AC 4H 5S', '2S 3D 4C AH 5S', '2S 3D 4C 5H AS',
          'KS 2D 3C 4H 5S', '2S KD 3C 4H 5S', '2S 3D KC 4H 5S', '2S 3D 4C KH 5S', '2S 3D 4C 5H KS'],
      ],
      nRandom: 4, seed: 119,
    }),
  },
  {
    id: 'low-ball',
    chapter: 3,
    card: '9C',
    title: 'Low Ball',
    story: [
      'Commissioner Pryce plays a quiet game every Tuesday, and he prefers it when he wins. His game: a hand wins only if every one of its cards beats a 5. Aces are high.',
      'Nobody has told him that the house always wins. Tonight somebody will.',
    ],
    brief: 'Five-card hands. Pay out every hand in which every card beats a 5. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRect(-3, 3, -8, 7), F9),
    fixed: F9,
    croupiers: paletteThrough('deal'),
    warRules: ['top'],
    pays: (h) => h.every((c) => hv(c) > 5),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['6S 7S 8S 9S TS', '5S 6D 7D 8D 9D', '6H 7H 8H 9H 5C', 'AS KS QS JS TS', 'AD 2D KD QD JD',
          '6C 6D 6H 6S AH', 'KC QC JC TC 4C', 'JH 3H QH KH AC', '9C 8C 7C 6C 5D', 'AH 7D 8C 9H TH'],
        // winners back to back, then hands that fail late, then early
        ['6S 7S 8S 9S TS', 'AS KS QS JS TS', '7D 8D 9D TD JD', 'QH KH AH 6H 7H', '9C TC JC QC KC',
          '6D 7D 8D 9D 2C', '7H 8H 9H 2D TH', 'KS QS 3D JS TS', '9S 4H 8S 7S 6S', '5C 6C 7C 8C 9C'],
      ],
      nRandom: 4, seed: 120,
    }),
  },
  {
    id: 'ace-count',
    chapter: 3,
    card: 'TC',
    title: 'Ace Count',
    story: [
      'Commissioner Pryce lost his own game on Tuesday. On Wednesday his regulation was withdrawn "pending review", and nobody expects the review. War croupiers may play by the high card or by the top card again, whichever you ask for.',
      'The Kesslers have stopped asking whether the house hides aces and started counting them. So tonight the house pays by the ace: a three-card hand is paid out once for every ace in it. Two aces, two payouts of the same hand; no aces, nothing.',
    ],
    brief: 'Three-card hands. Pay out every hand once for each ace it holds (a hand with two aces is paid out twice).',
    handSize: 3,
    floor: floorOf(hexRect(-3, 2, -8, 6), F10),
    fixed: F10,
    croupiers: paletteThrough('deal'),
    warRules: ['high', 'top'],
    expected: (inputs) => inputs.flatMap((h) => h.filter((c) => rankOf(c) === 'A').map(() => h)),
    tests: makeTests({
      handSize: 3, handsPerTest: 17,
      fixed: [
        ['AS 2D 3C', '2D AS 3C', '2D 3C AS', 'AS AD 5C', '5C AS AD', 'AH 5C AD', 'AS AD AC', 'KS QD JC',
          'KH AH 2S', '9S 9D 9C'],
        // aces back to back, then none, then alternating
        ['AS AD AC', 'AH 2S 3S', 'AC AD 4S', '5S AS 6D', '7S 8D AH', 'KS QD JC', '2S 3D 4C', '9H TH JH',
          'AS 2D AC', '6S 7D 8C', '3H AH 4H', 'QS KD 5C'],
      ],
      nRandom: 4, seed: 146,
    }),
  },
  {
    id: 'bottom-pair',
    chapter: 3,
    card: 'JC',
    title: 'Bottom Pair',
    story: [
      'The bottom dealer has been practising. Now he wants a five-card hand paid if its bottom two cards are a pair: two cards of the same rank, one on top of the other at the very bottom.',
      'A third card of that rank elsewhere in the hand is no trouble. The Owner\'s note says the house can afford to be fair, as long as it is exactly fair.',
    ],
    brief: 'Five-card hands. Pay out every hand whose bottom two cards are of the same rank.',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -7, 7), F11),
    fixed: F11,
    croupiers: paletteThrough('deal'),
    warRules: ['high', 'top'],
    pays: (h) => rankOf(h[3]) === rankOf(h[4]),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['2S 3D 4C KH KS', 'KS KD 2C 3H 4S', '2S KD 3C 4H KS', 'AS 2D 3C 5H 5S', '5S 5D 5C 2H 3S',
          '2S 3D 5C 5H 5S', '2S 3D 4C 4H 5S', '9S 9D 2C 7H 7S', '2S AD AC AH AS', 'QS JD TC 9H 8S'],
        // winners back to back, then losers back to back
        ['2S 3D 4C KH KS', 'AS 2D 3C 5H 5D', '9S 8D 7C 6H 6S', 'JS QD KC AH AD', '2H 2D 3C 3H 3S',
          '2S 3D 4C 5H 6S', 'KS KD 2C 3H 4S', '7S 8D 7C 9H 8S', 'QS JD QC TH 9S', 'AS 4D 4C 4H 5S'],
        // alternating, then runs of each
        ['2S 3D 4C KH KS', '2S 3D 4C 5H 6S', 'AS 2D 3C 5H 5D', 'KS KD 2C 3H 4S', '9S 8D 7C 6H 6S',
          '7S 8D 7C 9H 8S', 'JS QD KC AH AD', 'QS JD QC TH 9S', '2H 2D 3C 3H 3S', 'AS 4D 4C 4H 5S'],
      ],
      nRandom: 4, seed: 147,
    }),
  },
  {
    id: 'small-pairs',
    chapter: 3,
    card: 'QC',
    title: 'Small Pairs',
    story: [
      'Old Thursday is back from the rival casino, which he says had no soul and very small shrimp. He plays Small Pairs: a five-card hand wins if its biggest set is a pair, one pair or two, and every paired card is a 6 or lower.',
      'Aces are high, so a pair of aces is not small. Three of a kind is not a pair, and neither is a full house.',
    ],
    brief: 'Five-card hands. Pay out every hand whose largest set is a pair (one pair or two pair) with every paired card 6 or lower (aces high).',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -10, 7), F12),
    fixed: F12,
    croupiers: paletteThrough('deal'),
    warRules: ['high', 'top'],
    pays: (h) => { const p = paired(h); return Math.max(...rankCounts(h).values()) === 2 && high(p) <= 6; },
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['2S 2D 9C KH AS', '6S 6D 9C KH AS', '7S 7D 2C 3H 4S', '2S 2D 6C 6H KS', '2S 2D 7C 7H 3S',
          'AS AD 2C 3H 4S', '3S 3D 3C 4H 5S', '3S 3D 3C 4H 4S', '2S 3D 4C 5H 6S', '4S 4D 4C 4H 2S'],
        // winners back to back, then losers that decide late
        ['2S 2D 9C KH AS', '3S 3D 4C 4H KS', '6S 6D 9C KH AS', '5S 5D 2C 3H 4S', '4S 9D 4C JH QS',
          '7S 7D 2C 3H 4S', '2S 2D AC AH 3S', 'KS KD 2C 3H 4S', '6S 6D 8C 8H 2S', 'TS JD JC 2H 3S'],
        // winners alternating with hands that fail fast, then runs of each
        ['2S 2D 9C KH AS', '2S 3D 4C 5H 6S', '3S 3D 4C 4H KS', '3S 3D 3C 4H 4S', '6S 6D 9C KH AS',
          '7S 7D 2C 3H 4S', 'KS KD 2C 3H 4S', '5S 5D 2C 3H 4S', '4S 9D 4C JH QS', '9S 8D 7C 6H 5S'],
      ],
      nRandom: 4, seed: 148,
    }),
  },
  {
    id: 'two-pair',
    chapter: 3,
    card: 'KC',
    title: 'Two Pair',
    story: [
      'The rival casino is throwing one last big night: fireworks, an orchestra, and a rumour about free cars. The Owner\'s answer is Two Pair, and the whole floor is open for it.',
      'A five-card hand wins if it holds exactly two pairs. Three of a kind, a full house and four of a kind are all too much of a good thing, and pay nothing.',
    ],
    brief: 'Five-card hands. Pay out every hand with exactly two pair (not three of a kind, a full house or four of a kind).',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -9, 7), F13),
    fixed: F13,
    croupiers: paletteThrough('deal'),
    warRules: ['high', 'top'],
    pays: (h) => shape(h) === '1,2,2',
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['KS KD 5C 5H 2S', 'KS 5D KC 5H 2S', 'KS 5D 5C KH 2S', '2S KS 5D 5C KH', 'KS KD 2C 3H 4S',
          'KS KD KC 5H 5S', 'KS KD KC KH 5S', 'KS KD KC 2H 5S', 'AS KD QC JH 9S', '2S 2D 3C 3H 4S'],
        // winners back to back, then losers that decide late
        ['KS KD 5C 5H 2S', 'AS 3D AC 3H 9S', '7S 8D 8C 9H 7H', '2S QD JC JH QS', '4S 6D 6C 4H AS',
          'KS KD 2C 3H 4S', '2S 9D 3C 9H 4S', 'AS QD JC JH 9S', '5S 6D 7C 8H 8S', 'TS TD 2C 3H 4S'],
        // winners alternating with hands that fail fast, then runs of each
        ['KS KD 5C 5H 2S', 'KS KD KC 5H 5S', 'AS 3D AC 3H 9S', '9S 9D 9C 2H 3S', '7S 8D 8C 9H 7H',
          'KS KD 2C 3H 4S', 'QS QD QC QH 2S', '2S 9D 3C 9H 4S', '4S 4D 4C 6H 6S', 'AS KD QC JH 9S'],
      ],
      nRandom: 4, seed: 149,
    }),
  },
];

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds totalled over the level's tests). test/levels.js
// checks these exactly; `node tools/write-solutions.js clubs --par` rewrites
// this table from the recipes in tools/level-specs/clubs.js.
// BEGIN PAR
const PAR = {
  'upper-hand': { croupiers: 4, rounds: 90 },
  'high-spade': { croupiers: 6, rounds: 101 },
  'top-pair': { croupiers: 5, rounds: 73 },
  'new-rules': { croupiers: 4, rounds: 53 },
  'bottom-dealer': { croupiers: 5, rounds: 77 },
  'upside-down': { croupiers: 3, rounds: 63 },
  'second-fiddle': { croupiers: 4, rounds: 98 },
  'knockout': { croupiers: 17, rounds: 220 },
  'low-ball': { croupiers: 14, rounds: 103 },
  'ace-count': { croupiers: 13, rounds: 112 },
  'bottom-pair': { croupiers: 11, rounds: 94 },
  'small-pairs': { croupiers: 14, rounds: 91 },
  'two-pair': { croupiers: 13, rounds: 104 },
};
// END PAR
finishChapter(LEVELS, PAR);
