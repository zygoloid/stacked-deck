// Scores one machine in a worker thread, so a machine that somehow still
// exhausts memory or time takes down only the worker (see scoreInWorker in
// solutions.js). workerData: { level, cells } (cells already validated).
import { parentPort, workerData } from 'node:worker_threads';
import { LEVELS, BONUS } from './game/levels.js';
import { scoreMachine } from './game/score.js';

const level = [...LEVELS, ...BONUS].find((l) => l.id === workerData.level);
parentPort.postMessage(await scoreMachine(level, workerData.cells));
