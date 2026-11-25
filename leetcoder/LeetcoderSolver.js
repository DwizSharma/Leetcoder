import {getElementByXPath, pasteHelper, selectAllHelper, sleep} from '../utils/utils.js';
import {
  IS_QUESTION_PREMIUM,
  IS_SOLUTION_ACCEPTED_DIV_XPATH,
  LANGUAGE_DISPLAY_MAP,
  QUESTIONS_CODE_DIV_XPATH,
  QUESTIONS_LANGUAGE_BTN_XPATH,
  QUESTIONS_LANGUAGE_DIV_XPATH,
  QUESTIONS_SUBMIT_ACCEPTED_XPATH,
  QUESTIONS_SUBMIT_DIV_XPATH,
} from '../utils/constants.js';
import clipboardy from 'clipboardy';
import Logger from '../utils/Logger.js';
import FileManager from '../managers/FileManager.js';
import DailyQuotaManager, {MAX_ACCEPTED_PER_DAY} from '../managers/DailyQuotaManager.js';
import {getBrowserDetails} from '../managers/BrowserManager.js';

const emptySummary = () => ({accepted: 0, alreadySolved: 0, premium: 0, failed: [], stopped: false});

class LeetcoderSolver {
  static async #verificationIsShowing(page) {
    try {
      const url = page.url().toLowerCase();
      if (url.includes('/accounts/login')) return true;
      const text = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '');
      return /checking your browser|verify you are human|attention required|cloudflare|captcha challenge|just a moment|security verification/i.test(text);
    } catch (_) {
      return false;
    }
  }

  static async #solveProblemWithName(problemName, account, stopController) {
    if (stopController.isStopRequested()) return 'stopped';
    Logger.warn(`[NAVIGATING]\t\t\t:${problemName}`);
    let submissionStarted = false;
    let page;
    try {
      const acceptedToday = await DailyQuotaManager.getAcceptedSlugs(account);
      if (acceptedToday.has(problemName)) {
        Logger.success(`[ACCEPTED_TODAY]\t\t:${problemName}; skipping duplicate submission.`);
        await FileManager.setSolvedProblemSet(problemName, account);
        return 'already-solved';
      }

      ({page} = await getBrowserDetails(account));
      await page.goto(`https://leetcode.com/problems/${problemName}`, {waitUntil: 'domcontentloaded'});
      await sleep(2);

      if (await this.#verificationIsShowing(page)) {
        Logger.error(`[MANUAL_ATTENTION_REQUIRED]\t:${problemName}. Login or verification is required; stopping without bypassing it.`);
        stopController.requestStop();
        return 'stopped';
      }
      if (stopController.isStopRequested()) return 'stopped';

      try {
        const solvedElement = await getElementByXPath(page, QUESTIONS_SUBMIT_ACCEPTED_XPATH, 4, 0);
        const solvedText = await solvedElement[0].evaluate((element) => element.textContent || '');
        if (solvedText.includes('Solved')) {
          Logger.success(`[ALREADY_SOLVED]\t\t:${problemName}`);
          await FileManager.setSolvedProblemSet(problemName, account);
          return 'already-solved';
        }
      } catch (_) {
      }

      try {
        const premiumElement = await getElementByXPath(page, IS_QUESTION_PREMIUM, 1, 0);
        const premiumText = await premiumElement[0].evaluate((element) => element.textContent || '');
        if (premiumText.includes('Subscribe')) {
          Logger.warn(`[PREMIUM_QUESTION]\t\t:${problemName}; skipped.`);
          return 'premium';
        }
      } catch (_) {
      }

      const {code, language} = await FileManager.getProblemDetails(problemName);
      const targetLabel = LANGUAGE_DISPLAY_MAP[language];
      if (!targetLabel) throw new Error(`Unsupported language "${language}" for ${problemName}.`);
      if (stopController.isStopRequested()) return 'stopped';

      clipboardy.writeSync(code);
      Logger.warn(`[SWITCHING_LANGUAGE]\t:${language}`);
      const languageButton = await getElementByXPath(page, QUESTIONS_LANGUAGE_BTN_XPATH, 5, 0);
      await languageButton[0].click();
      const languageOptions = await getElementByXPath(page, QUESTIONS_LANGUAGE_DIV_XPATH, 5, 0);
      let languageSelected = false;
      for (const option of languageOptions) {
        const text = await option.evaluate((element) => element.textContent || '');
        if (text.trim() === targetLabel) {
          await option.click();
          languageSelected = true;
          break;
        }
      }
      if (!languageSelected) throw new Error(`Language "${targetLabel}" was not found for ${problemName}.`);

      await sleep(1);
      const codeEditor = await getElementByXPath(page, QUESTIONS_CODE_DIV_XPATH, 5, 0);
      await codeEditor[0].click();
      await selectAllHelper(page);
      await page.keyboard.press('Backspace');
      await pasteHelper(page);

      if (stopController.isStopRequested()) return 'stopped';
      if (await this.#verificationIsShowing(page)) {
        Logger.error(`[MANUAL_ATTENTION_REQUIRED]\t:${problemName}. Verification appeared before submission; stopping.`);
        stopController.requestStop();
        return 'stopped';
      }
      Logger.warn(`[SUBMITTING]\t\t\t:${problemName}`);
      const submitButton = await getElementByXPath(page, QUESTIONS_SUBMIT_DIV_XPATH, 5, 0);
      if (stopController.isStopRequested()) return 'stopped';
      await submitButton[0].click();
      submissionStarted = true;

      Logger.warn(`[AWAITING_VERDICT]\t:${problemName}`);
      const verdictElement = await getElementByXPath(page, IS_SOLUTION_ACCEPTED_DIV_XPATH, 15, 0);
      const verdict = (await verdictElement[0].evaluate((element) => element.textContent || '')).trim();
      if (verdict === 'Accepted') {
        let count;
        try {
          count = await DailyQuotaManager.recordAccepted(account, problemName);
        } catch (error) {
          Logger.error(`[QUOTA_SAVE_FAILED]\t:${problemName}. The submission was Accepted, but quota state could not be saved; stopping to prevent more submissions.`, error);
          stopController.requestStop();
          return 'stopped';
        }
        try {
          await FileManager.setSolvedProblemSet(problemName, account);
        } catch (error) {
          Logger.error(`[PROGRESS_SAVE_FAILED]\t:${problemName}. The accepted slug is in the quota log; it will be skipped for today.`, error);
        }
        Logger.success(`[ACCEPTED]\t\t\t:${problemName} (${count}/${MAX_ACCEPTED_PER_DAY} today for ${account.username})`);
        return 'accepted';
      }
      const knownRejection = ['Wrong Answer', 'Time Limit Exceeded', 'Runtime Error', 'Compile Error', 'Memory Limit Exceeded', 'Output Limit Exceeded', 'Presentation Error', 'Internal Error'];
      if (!knownRejection.includes(verdict)) {
        Logger.error(`[VERDICT_UNCERTAIN]\t:${problemName}: "${verdict || 'empty'}". Stopping to avoid exceeding the daily limit.`);
        stopController.requestStop();
        return 'stopped';
      }
      Logger.error(`[NOT_ACCEPTED]\t\t:${problemName}: ${verdict || 'unknown verdict'}`);
      return 'failed';
    } catch (error) {
      Logger.error(`[FAILED]\t\t:${problemName}`, error);
      if (submissionStarted) {
        Logger.error('Submission result is uncertain; stopping before another problem.');
        stopController.requestStop();
        return 'stopped';
      }
      if (page && await this.#verificationIsShowing(page)) {
        Logger.error(`[MANUAL_ATTENTION_REQUIRED]\t:${problemName}. Login or verification appeared during page interaction; stopping without bypassing it.`);
        stopController.requestStop();
        return 'stopped';
      }
      if (page && error.name === 'TimeoutError') {
        Logger.error(`[PAGE_STRUCTURE_CHANGED]\t:${problemName}. A required LeetCode page element did not appear; stopping this run.`);
        stopController.requestStop();
        return 'stopped';
      }
      return 'failed';
    }
  }

  static async #waitForQuotaOrStop(account, stopController) {
    Logger.warn(`[DAILY_LIMIT]\t\t:${account.username} reached ${MAX_ACCEPTED_PER_DAY} accepted problems; waiting for the next local day.`);
    return await DailyQuotaManager.waitUntilNextLocalDay(account, stopController);
  }

  static async solve(account, stopController) {
    Logger.error('<<<< Starting Leetcoder Solver >>>>');
    const summary = emptySummary();
    const problemNames = await FileManager.getAllProblemsNames();
    Logger.success(`[QUEUED]\t\t\t:${problemNames.length} local solution files`);

    for (const problemName of problemNames) {
      if (stopController.isStopRequested()) break;
      let acceptedCount = await DailyQuotaManager.getAcceptedCount(account);
      if (acceptedCount >= MAX_ACCEPTED_PER_DAY) {
        const resumed = await this.#waitForQuotaOrStop(account, stopController);
        if (!resumed) break;
        acceptedCount = await DailyQuotaManager.getAcceptedCount(account);
        if (acceptedCount >= MAX_ACCEPTED_PER_DAY) continue;
      }

      const locallySolved = await FileManager.getSolvedProblemSet(account);
      if (locallySolved.has(problemName)) {
        summary.alreadySolved += 1;
        continue;
      }
      if ((await DailyQuotaManager.getAcceptedSlugs(account)).has(problemName)) {
        summary.alreadySolved += 1;
        continue;
      }

      const result = await this.#solveProblemWithName(problemName, account, stopController);
      if (result === 'accepted') summary.accepted += 1;
      else if (result === 'already-solved') summary.alreadySolved += 1;
      else if (result === 'premium') summary.premium += 1;
      else if (result === 'failed') summary.failed.push(problemName);
      else if (result === 'stopped') break;
    }

    summary.stopped = stopController.isStopRequested();
    Logger.success(`Queue finished for ${account.username}: ${summary.accepted} accepted this run, ${summary.alreadySolved} already solved, ${summary.premium} premium skipped, ${summary.failed.length} failed.${summary.stopped ? ' Stopped.' : ''}`);
    Logger.error('<<<< Exiting Leetcoder Solver >>>>');
    return summary;
  }

  static async solveDailyChallenge(account, stopController) {
    if (stopController.isStopRequested()) return emptySummary();
    while (await DailyQuotaManager.getAcceptedCount(account) >= MAX_ACCEPTED_PER_DAY) {
      if (!await this.#waitForQuotaOrStop(account, stopController)) return {...emptySummary(), stopped: true};
    }

    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query: `query questionOfToday { activeDailyCodingChallengeQuestion { question { titleSlug } } }`}),
    });
    if (!response.ok) throw new Error(`Daily challenge request failed with HTTP ${response.status}.`);
    const result = await response.json();
    const problemName = result.data?.activeDailyCodingChallengeQuestion?.question?.titleSlug;
    if (!problemName) throw new Error('LeetCode did not return a daily challenge.');

    const summary = emptySummary();
    const solved = await FileManager.getSolvedProblemSet(account);
    if (solved.has(problemName)) summary.alreadySolved = 1;
    else {
      const status = await this.#solveProblemWithName(problemName, account, stopController);
      if (status === 'accepted') summary.accepted = 1;
      else if (status === 'already-solved') summary.alreadySolved = 1;
      else if (status === 'premium') summary.premium = 1;
      else if (status === 'failed') summary.failed.push(problemName);
      else summary.stopped = true;
    }
    return summary;
  }
}

export default LeetcoderSolver;
