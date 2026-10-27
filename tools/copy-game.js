// Copies the game code the Cloud Functions need (engine, cards, levels and
// src/score.js: everything in src/ except the UI) into functions/game/.
// Firebase uploads only functions/, so this runs before every deploy
// (firebase.json predeploy) and before the emulator tests.
import { cpSync, rmSync } from 'node:fs';

const src = new URL('../src/', import.meta.url);
const dest = new URL('../functions/game/', import.meta.url);
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true, filter: (path) => !/[\\/]src[\\/]ui([\\/]|$)/.test(path) });
console.log('copied game code to functions/game/');
