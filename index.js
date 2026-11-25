import Logger from './utils/Logger.js';
import AccountManager from './managers/AccountManager.js';
import {closeBrowser} from './managers/BrowserManager.js';
import LeetcoderAuthenticator from './leetcoder/LeetcoderAuthenticator.js';
import LeetcoderLogin from './leetcoder/LeetcoderLogin.js';
import LeetcoderScraper from './leetcoder/LeetcoderScraper.js';
import LeetcoderSolver from './leetcoder/LeetcoderSolver.js';
import StopController from './utils/StopController.js';

const usage = `Usage:
  npm start -- account add <leetcode-username>
  npm start -- account default <leetcode-username>
  npm start -- login [--account <leetcode-username>]
  npm start -- [--account <leetcode-username>] [--mode queue|daily|scrape]

With no arguments, Leetcoder runs the full solution queue for the default account.`;

const readOptions = (args) => {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag !== '--account' && flag !== '--mode') throw new Error(`Unknown option: ${flag}\n${usage}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.\n${usage}`);
    if (options[flag.slice(2)]) throw new Error(`Duplicate option: ${flag}`);
    options[flag.slice(2)] = value;
    index += 1;
  }
  return options;
};

const run = async () => {
  const args = process.argv.slice(2);
  if (args[0] === 'account') {
    const [, action, username, ...extra] = args;
    if (extra.length || !username || !['add', 'default'].includes(action)) throw new Error(usage);
    if (action === 'add') {
      await AccountManager.addAccount(username);
      Logger.success(`Added account "${username}"${(await AccountManager.resolveAccount()).username === username ? ' and selected it as default' : ''}.`);
    } else {
      await AccountManager.setDefaultAccount(username);
      Logger.success(`Default account is now "${username}".`);
    }
    return;
  }

  if (args[0] === 'login') {
    const {account: username} = readOptions(args.slice(1));
    const account = await AccountManager.resolveAccount(username);
    await LeetcoderLogin.loginUser(account);
    return;
  }

  const {account: username, mode = 'queue'} = readOptions(args);
  if (!['queue', 'daily', 'scrape'].includes(mode)) throw new Error(`Unknown mode "${mode}".\n${usage}`);
  const account = await AccountManager.resolveAccount(username);
  await LeetcoderAuthenticator.loginUser(account);

  const stopController = new StopController();
  stopController.start();
  try {
    if (mode === 'daily') {
      await LeetcoderSolver.solveDailyChallenge(account, stopController);
    } else if (mode === 'scrape') {
      await LeetcoderScraper.scrapeAcceptedSolutions(account, stopController);
    } else {
      await LeetcoderSolver.solve(account, stopController);
    }
  } finally {
    stopController.stop();
  }
};

try {
  await run();
} catch (error) {
  Logger.error(error.message || error);
  process.exitCode = 1;
} finally {
  await closeBrowser();
}
