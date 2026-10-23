// All reference-solution recipes, by level id. The recipes live per chapter
// in tools/level-specs/<chapter>.js (see src/levels.js CHAPTER_FILES), so the
// chapters can be worked on independently; the bonus deck's are in
// tools/level-specs/bonus.js.
import { SPECS as HEARTS } from './level-specs/hearts.js';
import { SPECS as DIAMONDS } from './level-specs/diamonds.js';
import { SPECS as CLUBS } from './level-specs/clubs.js';
import { SPECS as SPADES } from './level-specs/spades.js';
import { SPECS as FINALE } from './level-specs/finale.js';
import { SPECS as BONUS } from './level-specs/bonus.js';

export const CHAPTER_SPECS = { 1: HEARTS, 2: DIAMONDS, 3: CLUBS, 4: SPADES, 5: FINALE };
export const BONUS_SPECS = BONUS;
export const SPECS = { ...HEARTS, ...DIAMONDS, ...CLUBS, ...SPADES, ...FINALE, ...BONUS };
