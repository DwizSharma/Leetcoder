import {promises as fs} from 'node:fs';
import {ACCOUNTS_FILE_PATH, getAccountPaths, USER_DATA_ROOT, validateAccountId} from '../data.js';

const emptyRegistry = () => ({defaultAccount: null, accounts: []});

class AccountManager {
  static async #readRegistry() {
    try {
      const contents = await fs.readFile(ACCOUNTS_FILE_PATH, 'utf8');
      const registry = JSON.parse(contents);
      if (!Array.isArray(registry.accounts) || !(registry.defaultAccount === null || typeof registry.defaultAccount === 'string')) {
        throw new Error('Account registry has an invalid format.');
      }
      const accounts = registry.accounts.map((account) => ({username: validateAccountId(account?.username)}));
      if (new Set(accounts.map((account) => account.username)).size !== accounts.length) {
        throw new Error('Account registry contains duplicate usernames (case-insensitive).');
      }
      return {
        defaultAccount: registry.defaultAccount ? validateAccountId(registry.defaultAccount) : null,
        accounts,
      };
    } catch (error) {
      if (error.code === 'ENOENT') return emptyRegistry();
      throw error;
    }
  }

  static async #writeRegistry(registry) {
    await fs.mkdir(USER_DATA_ROOT, {recursive: true});
    const temporaryPath = `${ACCOUNTS_FILE_PATH}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, {mode: 0o600});
    await fs.rename(temporaryPath, ACCOUNTS_FILE_PATH);
  }

  static async addAccount(username) {
    username = validateAccountId(username);
    const registry = await this.#readRegistry();
    if (registry.accounts.some((account) => account.username === username)) {
      throw new Error(`LeetCode account "${username}" is already configured.`);
    }

    registry.accounts.push({username});
    if (!registry.defaultAccount) registry.defaultAccount = username;
    await this.#writeRegistry(registry);
    return {username, paths: getAccountPaths(username)};
  }

  static async setDefaultAccount(username) {
    username = validateAccountId(username);
    const registry = await this.#readRegistry();
    if (!registry.accounts.some((account) => account.username === username)) {
      throw new Error(`LeetCode account "${username}" is not configured. Add it first.`);
    }
    registry.defaultAccount = username;
    await this.#writeRegistry(registry);
  }

  static async resolveAccount(usernameOverride) {
    const registry = await this.#readRegistry();
    const requestedUsername = usernameOverride || registry.defaultAccount;
    if (!requestedUsername) {
      throw new Error('No default LeetCode account is configured. Run: npm start -- account add <username>');
    }
    const username = validateAccountId(requestedUsername);
    if (!registry.accounts.some((account) => account.username === username)) {
      throw new Error(`LeetCode account "${username}" is not configured. Run: npm start -- account add ${username}`);
    }
    return {username, paths: getAccountPaths(username)};
  }
}

export default AccountManager;
