// Scores machines in a worker thread, so a machine that somehow still exhausts
// memory or time takes down only the worker (see scoreInWorker in solutions.js).
import { parentPort, workerData } from 'node:worker_threads';
import { ALL_LEVELS } from './game/levels.js';
import { scoreMachine } from './game/score.js';

const BY_ID = new Map(ALL_LEVELS.map((l) => [l.id, l]));

if (workerData?.level) {
  parentPort.postMessage(await scoreMachine(BY_ID.get(workerData.level), workerData.cells));
} else {
  parentPort.on('message', async ({ level, cells }) => {
    parentPort.postMessage(await scoreMachine(BY_ID.get(level), cells));
  });
}
