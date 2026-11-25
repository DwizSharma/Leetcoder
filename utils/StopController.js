import {EventEmitter} from 'node:events';
import readline from 'node:readline';
import {LEETCODER_STOP_KEY} from './constants.js';

class StopController extends EventEmitter {
  constructor() {
    super();
  }
  #stopRequested = false;
  #keypressHandler;
  #signalHandler;
  #rawModeEnabled = false;

  start() {
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      this.#keypressHandler = (_character, key) => {
        if (key?.name === LEETCODER_STOP_KEY || (key?.ctrl && key.name === 'c')) this.requestStop();
      };
      process.stdin.setEncoding('utf8');
      process.stdin.setRawMode(true);
      this.#rawModeEnabled = true;
      process.stdin.on('keypress', this.#keypressHandler);
      process.stdin.resume();
    }

    this.#signalHandler = () => this.requestStop();
    process.on('SIGINT', this.#signalHandler);
    process.stdout.write('Press q or Ctrl+C to stop after the current safe step.\n');
  }

  requestStop() {
    if (this.#stopRequested) return;
    this.#stopRequested = true;
    process.stdout.write('\nStop requested; no new problem or submission will be started.\n');
    this.emit('stop');
  }

  isStopRequested() {
    return this.#stopRequested;
  }

  waitForStopOrTimeout(milliseconds) {
    if (this.#stopRequested) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.off('stop', finish);
        resolve();
      };
      const timer = setTimeout(finish, milliseconds);
      this.once('stop', finish);
    });
  }

  stop() {
    if (this.#keypressHandler) process.stdin.off('keypress', this.#keypressHandler);
    if (this.#signalHandler) process.off('SIGINT', this.#signalHandler);
    if (this.#rawModeEnabled) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      this.#rawModeEnabled = false;
    }
  }
}

export default StopController;
