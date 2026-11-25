import dotenv from 'dotenv';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

dotenv.config();

export const GOOGLE_CHROME_EXECUTABLE_PATH = process.env.GOOGLE_CHROME_EXECUTABLE_PATH;
export const USER_DATA_ROOT = path.resolve('UserData');
export const ACCOUNTS_FILE_PATH = path.join(USER_DATA_ROOT, 'accounts.json');

export const validateAccountId = (username) => {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_-]+$/.test(username)) {
    throw new Error('Account username must contain only letters, numbers, underscores, or hyphens.');
  }
  return username.toLowerCase();
};

export const getAccountPaths = (username) => {
  const accountId = validateAccountId(username);
  const accountDir = path.join(USER_DATA_ROOT, 'accounts', accountId);
  const dataDir = path.join(accountDir, 'LeetcoderData');

  return {
    profileDir: path.join(accountDir, 'ProfileData'),
    dataDir,
    solvedProblemsPath: path.join(dataDir, 'SolvedProblems.json'),
    dailyQuotaPath: path.join(dataDir, 'DailyQuota.json'),
    scrapedSolutionsDir: path.join(dataDir, 'ScrapedSolutions'),
  };
};

export const resolveChromeExecutable = () => {
  if (GOOGLE_CHROME_EXECUTABLE_PATH) {
    if (!existsSync(GOOGLE_CHROME_EXECUTABLE_PATH)) {
      throw new Error(`Chrome executable not found at GOOGLE_CHROME_EXECUTABLE_PATH: ${GOOGLE_CHROME_EXECUTABLE_PATH}`);
    }
    return GOOGLE_CHROME_EXECUTABLE_PATH;
  }

  const candidates = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && existsSync(candidate)) return candidate;
    const result = spawnSync('which', [candidate], {encoding: 'utf8'});
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error('Chrome/Chromium was not found. Install Chrome or set GOOGLE_CHROME_EXECUTABLE_PATH in .env.');
};
