import {promises as fs} from 'node:fs';

export const MAX_ACCEPTED_PER_DAY = 2;

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

class DailyQuotaManager {
  static async #readState(account) {
    if (!account?.paths?.dailyQuotaPath) throw new Error('A selected account is required for quota tracking.');
    const today = localDateKey();
    try {
      const state = JSON.parse(await fs.readFile(account.paths.dailyQuotaPath, 'utf8'));
      if (!Array.isArray(state.accepted) || state.accepted.some((slug) => typeof slug !== 'string')) {
        throw new Error(`Daily quota file for "${account.username}" has an invalid format.`);
      }
      return state.date === today ? state : {date: today, accepted: []};
    } catch (error) {
      if (error.code === 'ENOENT') return {date: today, accepted: []};
      throw error;
    }
  }

  static async getAcceptedCount(account) {
    const state = await this.#readState(account);
    return state.accepted.length;
  }

  static async getAcceptedSlugs(account) {
    const state = await this.#readState(account);
    return new Set(state.accepted);
  }

  static async recordAccepted(account, problemSlug) {
    const state = await this.#readState(account);
    if (!state.accepted.includes(problemSlug)) state.accepted.push(problemSlug);
    await fs.mkdir(account.paths.dataDir, {recursive: true});
    const temporaryPath = `${account.paths.dailyQuotaPath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {mode: 0o600});
    await fs.rename(temporaryPath, account.paths.dailyQuotaPath);
    return state.accepted.length;
  }

  static async waitUntilNextLocalDay(account, stopController) {
    const currentDate = localDateKey();
    while (!stopController.isStopRequested() && localDateKey() === currentDate) {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
      await stopController.waitForStopOrTimeout(Math.max(1000, nextMidnight - now.getTime()));
    }
    return !stopController.isStopRequested();
  }
}

export default DailyQuotaManager;
