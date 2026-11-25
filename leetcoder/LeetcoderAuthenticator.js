import {sleep} from '../utils/utils.js';
import Logger from '../utils/Logger.js';
import {getBrowserDetails} from '../managers/BrowserManager.js';

class LeetcoderAuthenticator {
  static async loginUser(account) {
    const {page} = await getBrowserDetails(account);
    await page.goto('https://leetcode.com/', {waitUntil: 'domcontentloaded'});
    await sleep(2);

    const profile = await page.evaluate(() => {
      const avatar = document.querySelector('#navbar_user_avatar');
      const avatarLink = avatar?.closest('a') || avatar?.querySelector('a');
      const headerLink = [...document.querySelectorAll('header a[href], nav a[href]')]
        .find((link) => /\/(?:u|profile)\/[^/?#]+/i.test(link.getAttribute('href') || ''));
      return {
        href: avatarLink?.getAttribute('href') || avatar?.getAttribute('href') || headerLink?.getAttribute('href') || '',
        username: avatar?.getAttribute('data-username') || '',
      };
    });
    const match = profile.href.match(/\/(?:u|profile)\/([^/?#]+)/i);
    const authenticatedUsername = match?.[1] || profile.username;
    if (!authenticatedUsername) {
      throw new Error(`Could not verify the signed-in LeetCode username for "${account.username}". Sign in with that account and confirm the profile link is visible; no submissions were made.`);
    }
    if (authenticatedUsername.toLowerCase() !== account.username.toLowerCase()) {
      throw new Error(`Selected account is "${account.username}" but Chrome is signed in as "${authenticatedUsername}". No submissions were made.`);
    }

    Logger.success(`Signed in as the selected LeetCode account "${account.username}".`);
  }
}

export default LeetcoderAuthenticator;
