// Every floor the UI knows about: the 56-card campaign (LEVELS) and the bonus
// deck (BONUS, extra floors outside the campaign; see docs/architecture.md).
// levels.js may not export BONUS yet, so it is read defensively.
//
// Test hook: with `?testlevels` in the page URL, the fixture floors in
// test/ui-levels.js are appended to the bonus deck (and the floor). tools/ui-smoke.js uses it
// to exercise `expected` / `ordered` floors and bonus unlocking whatever the
// real content is. Nothing else loads that file.
import * as L from '../levels.js';

const testMode = typeof location !== 'undefined' && /[?&]testlevels\b/.test(location.search);
const fixtures = testMode ? await import('../../test/ui-levels.js') : {};
const extra = fixtures.BONUS ?? [], extraFloor = fixtures.FLOOR ?? [];

export const CAMPAIGN = L.LEVELS;
export const BONUS = [...(Array.isArray(L.BONUS) ? L.BONUS : []), ...extra];
// The floor: floors that left the campaign (src/levels/floor.js).
export const FLOOR = [...(Array.isArray(L.FLOOR) ? L.FLOOR : []), ...extraFloor];
export const ALL_LEVELS = [...CAMPAIGN, ...BONUS, ...FLOOR];

export const findLevel = (id) => ALL_LEVELS.find((l) => l.id === id) ?? null;
export const isBonus = (level) => BONUS.includes(level);
export const onFloor = (level) => FLOOR.includes(level);
export const campaignIndex = (level) => CAMPAIGN.indexOf(level);
