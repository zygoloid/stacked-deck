// The campaign: 56 floors, one per playing card. Four suit chapters of 13
// floors (A..K) and a finale of four special-card floors ('?', '??', '$',
// '$$'). Each chapter's levels live in their own module in src/levels/
// (with that chapter's PAR table); this module puts them together. See
// docs/campaign.md for the plan and docs/architecture.md for the format.
//
// Level fields beyond the documented format:
//   card: 'AH'..'KH' etc., or '?', '??', '$', '$$' (the floor's card)
//   chapter: 1-5
//   warRules: ['high'] | ['top'] | ['high', 'top'] (default ['high'])
//   specialCards: special cards the player may put in shoes (default [])
//
// BONUS (src/levels/bonus.js) is the bonus deck: floors outside the campaign,
// each with `unlockAfter: '<campaign id>'` and its own `card` in the bonus
// deck (A..K of spades of a second deck, in BONUS order; see
// docs/campaign.md). Bonus floors have no `chapter`.
import { LEVELS as HEARTS } from './levels/hearts.js';
import { LEVELS as DIAMONDS } from './levels/diamonds.js';
import { LEVELS as CLUBS } from './levels/clubs.js';
import { LEVELS as SPADES } from './levels/spades.js';
import { LEVELS as FINALE } from './levels/finale.js';
import { LEVELS as BONUS_LEVELS } from './levels/bonus.js';

export {
  hexRange, hexRing, hexRect, makeTests, without, floorOf, paletteThrough,
} from './levels/shared.js';

export const CHAPTERS = {
  1: 'Opening Night',
  2: 'Stacking the Deck',
  3: 'House Rules',
  4: 'The House Always Wins',
  5: 'The Envelope',
};

// Chapter number -> module name in src/levels/ (and tools/level-specs/,
// test/mutants/), and the suit its floors are numbered in (null: the finale).
export const CHAPTER_FILES = { 1: 'hearts', 2: 'diamonds', 3: 'clubs', 4: 'spades', 5: 'finale' };
export const CHAPTER_SUITS = { 1: 'H', 2: 'D', 3: 'C', 4: 'S', 5: null };
export const FINALE_CARDS = ['?', '??', '$', '$$'];
// The bonus deck's module name (src/levels/, tools/level-specs/, test/mutants/)
// and its cards: A..K of spades, in BONUS order.
export const BONUS_FILE = 'bonus';
export const BONUS_SUIT = 'S';

export const LEVELS = [...HEARTS, ...DIAMONDS, ...CLUBS, ...SPADES, ...FINALE];
export const BONUS = BONUS_LEVELS;
