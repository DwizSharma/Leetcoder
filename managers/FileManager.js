import {promises as fs} from 'node:fs';
import path from 'node:path';
import Logger from '../utils/Logger.js';

const requireAccount = (account) => {
  if (!account?.username || !account?.paths?.dataDir) throw new Error('A selected account is required for local data access.');
};

class FileManager {
  static async getAllProblemsNames() {
    const files = await fs.readdir('./problems');
    return files.filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5)).sort();
  }

  static async getProblemDetails(problemName) {
    const file = await fs.readFile(path.join('./problems', `${problemName}.json`), 'utf-8');
    const data = JSON.parse(file);
    if (typeof data.code !== 'string' || typeof data.language !== 'string') {
      throw new Error(`Problem file "${problemName}.json" must contain string code and language fields.`);
    }
    return {language: data.language, code: data.code};
  }

  static async #ensureSolvedProblemSetFile(account) {
    requireAccount(account);
    await fs.mkdir(account.paths.dataDir, {recursive: true});
    try {
      await fs.access(account.paths.solvedProblemsPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.writeFile(account.paths.solvedProblemsPath, '[]\n', {mode: 0o600});
    }
  }

  static async getSolvedProblemSet(account) {
    await this.#ensureSolvedProblemSetFile(account);
    const data = await fs.readFile(account.paths.solvedProblemsPath, 'utf8');
    const solved = JSON.parse(data);
    if (!Array.isArray(solved) || solved.some((problem) => typeof problem !== 'string')) {
      throw new Error(`Solved-problem file for "${account.username}" has an invalid format.`);
    }
    return new Set(solved);
  }

  static async setSolvedProblemSet(problemName, account) {
    const problemSet = await this.getSolvedProblemSet(account);
    problemSet.add(problemName);
    const temporaryPath = `${account.paths.solvedProblemsPath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(Array.from(problemSet))}\n`, {mode: 0o600});
    await fs.rename(temporaryPath, account.paths.solvedProblemsPath);
    Logger.success(`[CACHED]\t\t\t:${problemName} for ${account.username}`);
  }

  static async saveScrapedSolution(fileContent, account) {
    requireAccount(account);
    const name = fileContent.problemName;
    await fs.mkdir(account.paths.scrapedSolutionsDir, {recursive: true});
    const filePath = path.join(account.paths.scrapedSolutionsDir, `${name}.json`);

    try {
      await fs.access(filePath);
      Logger.warn(`[ALREADY_SCRAPPED]\t\t:${name}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.writeFile(filePath, JSON.stringify(fileContent, null, 4), {mode: 0o600});
      Logger.success(`[SAVED]\t\t\t:${name}`);
    }
  }
}

export default FileManager;
