import puppeteer from 'puppeteer';
import {promises as fs} from 'node:fs';
import {resolveChromeExecutable} from '../data.js';


class BrowserManager {
  static browser = null;
  static page = null;
  static accountUsername = null;

  static async init(account) {
    if (!account?.username || !account?.paths?.profileDir) throw new Error('An account must be selected before Chrome can start.');
    if (!BrowserManager.browser) {
      await fs.mkdir(account.paths.profileDir, {recursive: true});
      BrowserManager.browser = await puppeteer.launch({
        headless: false,
        executablePath: resolveChromeExecutable(),
        userDataDir: account.paths.profileDir,
        defaultViewport: null,
        args: ['--start-maximized'],
      });

      [BrowserManager.page] = await BrowserManager.browser.pages();
      BrowserManager.accountUsername = account.username;
    } else if (BrowserManager.accountUsername !== account.username) {
      throw new Error(`Chrome is already open for "${BrowserManager.accountUsername}". Close it before switching accounts.`);
    }
  }

  static async getBrowserDetails(account) {
    if (!BrowserManager.browser || !BrowserManager.page) {
      await BrowserManager.init(account);
    } else if (BrowserManager.accountUsername !== account?.username) {
      throw new Error('The active Chrome session does not match the selected account.');
    }
    return { page: BrowserManager.page, browser: BrowserManager.browser };
  }

  static async closeBrowser() {
    if (BrowserManager.browser) {
      await BrowserManager.browser.close();
      BrowserManager.browser = null;
      BrowserManager.page = null;
      BrowserManager.accountUsername = null;
    }
  }
}

export const getBrowserDetails = async (account) => {
  return await BrowserManager.getBrowserDetails(account);
};

export const closeBrowser = async () => {
  return await BrowserManager.closeBrowser();
};
