// The floor: floors that have left the campaign (cut or replaced), kept so
// their ids, saves, solutions and scores carry on. They keep the card they
// had in the campaign (so the floor can hold two A♥s), and lie on the floor
// tab in no particular order. Each opens like a bonus floor, once its
// `unlockAfter` floors are solved (see docs/campaign.md, "The floor").
import { finishChapter } from './shared.js';

export const LEVELS = [];

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds totalled over the level's tests). test/levels.js checks these
// exactly; `node tools/write-solutions.js floor --par` rewrites this table
// from the recipes in tools/level-specs/floor.js.
// BEGIN PAR
const PAR = {
};
// END PAR
finishChapter(LEVELS, PAR);
