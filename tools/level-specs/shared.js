// Helpers for the reference-solution recipes in tools/level-specs/<chapter>.js.
// Each recipe is either { cells } (written by hand) or { nodes, links } for
// the router (see tools/level-build.js and src/layout.js).
export const E = 0, SE = 1, SW = 2, W = 3, NW = 4, NE = 5;

export const c = (at, fn, extra = {}) => ({ at, kind: 'croupier', fn, ...extra });
export const pass = (at, out) => c(at, 'pass', { out: { out } });
export const war = (at, extra = {}) => c(at, 'war', { rule: 'high', ...extra });
export const twar = (at, extra = {}) => c(at, 'war', { rule: 'top', ...extra });
export const shoe = (at, card, extra = {}) => ({ at, kind: 'shoe', deck: [].concat(card), ...extra });
