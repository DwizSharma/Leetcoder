import {spawn} from 'child_process';
import {promises as fs} from 'node:fs';
import Logger from '../utils/Logger.js';
import {resolveChromeExecutable} from '../data.js';

class LeetcoderLogin {
  static loginUser = async (account) => {
    if (!account?.username || !account?.paths?.profileDir) throw new Error('Select an account before logging in.');
    const chromeExecutable = resolveChromeExecutable();
    await fs.mkdir(account.paths.profileDir, {recursive: true});
    return new Promise((resolve, reject) => {
      Logger.success(`Opening Chrome for LeetCode account "${account.username}"...`);
      Logger.success('  1. Log in to LeetCode.');
      Logger.success('  2. Once logged in, close the Chrome window to continue.');

      const chrome = spawn(
        chromeExecutable,
        [
          `--user-data-dir=${account.paths.profileDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--start-maximized',
          'https://leetcode.com/accounts/login/',
        ],
        {stdio: 'ignore'}
      );

      chrome.on('error', (err) => {
        Logger.error(`Failed to launch Chrome at "${chromeExecutable}". Check GOOGLE_CHROME_EXECUTABLE_PATH in your .env.`, err);
        reject(err);
      });

      chrome.on('exit', (code, signal) => {
        if (code !== 0 || signal) {
          reject(new Error(`Chrome exited${signal ? ` from signal ${signal}` : ` with status ${code}`}.`));
          return;
        }
        Logger.success('Chrome closed. Login saved to your profile.');
        resolve();
      });
    });
  };
}

export default LeetcoderLogin;
