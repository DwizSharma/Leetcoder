import clipboardy from "clipboardy";
import {copyHelper, getElementBySelector, getElementByXPath, selectAllHelper, sleep} from "../utils/utils.js";
import {
  SCRAPER_SUBMITTED_CODE_DIV_XPATH,
  SCRAPER_SUBMITTED_CODE_LANGUAGE_XPATH,
  SCRAPER_SUBMITTED_CODE_NAME_XPATH,
} from "../utils/constants.js";
import Logger from "../utils/Logger.js";
import {getBrowserDetails} from "../managers/BrowserManager.js";
import FileManager from "../managers/FileManager.js";

class LeetcoderScraper {
  static async #scrapeAndSaveCodeFromSubmissionId(id, account, stopController) {
    if (stopController?.isStopRequested()) return;
    const {browser} = await getBrowserDetails(account);
    const page = await browser.newPage();

    try {
      await page.goto(`https://leetcode.com/submissions/detail/${id}/`, {
        waitUntil: "networkidle2",
      });

      const statusDiv = await getElementByXPath(page, "//*[@id='result_state']", 3, 0);
      const textContent = await statusDiv[0].evaluate((el) => el.textContent);
      if (textContent !== 'Accepted') return;

      // Get name from the link in the name href
      const nameDiv = await getElementByXPath(page, SCRAPER_SUBMITTED_CODE_NAME_XPATH, 3, 0);
      const hrefHandle = await nameDiv[0].getProperty("href");
      const href = await hrefHandle.jsonValue();
      const arr = await href.split("/");
      const nameDivValue = arr[arr.length - 2];

      // Get the language from the submission page
      const languageDiv = await getElementByXPath(page, SCRAPER_SUBMITTED_CODE_LANGUAGE_XPATH, 3, 0);
      const languageDivValue = await languageDiv[0].evaluate((el) => el.textContent);

      // Get Code from the code  div
      const codeDiv = await getElementByXPath(page, SCRAPER_SUBMITTED_CODE_DIV_XPATH, 3, 0);
      await codeDiv[0].click();

      await selectAllHelper(page);
      await copyHelper(page);

      const copiedText = clipboardy.readSync();
      let fileContent = {problemName: nameDivValue, language: languageDivValue, code: copiedText};
      await FileManager.saveScrapedSolution(fileContent, account);
    } catch (err) {
      Logger.error('Something went wrong!', err);
    } finally {
      await page.close();
    }
  }

  static async #scrapeSubmissionIdsFromPageId(id, account, stopController) {
    if (stopController?.isStopRequested()) return [];
    const {page} = await getBrowserDetails(account);
    await page.goto(`https://leetcode.com/submissions/#/${id}`, {
      waitUntil: 'networkidle2',
    });

    let rows = [];
    try {
      rows = await getElementBySelector(page, '.text-success', 10, 0);
    } catch (_) {
    }

    return await Promise.all(rows.map(async row => {
      const href = await row.evaluate(el => el.getAttribute('href'));
      return href.split('/').slice(-2, -1)[0];
    }));
  }

  static async #scrapeCodeFromAllSubmissions(account, stopController) {
    for (let page_no = 1; page_no <= 1000; page_no++) {
      if (stopController?.isStopRequested()) break;
      try {
        const submission_ids = await this.#scrapeSubmissionIdsFromPageId(page_no, account, stopController);
        Logger.success(`Submission ids fetched from page number ${page_no}`, submission_ids);

        const promises = [];
        for (let idx = 0; idx < submission_ids.length; idx++) {
          if (stopController?.isStopRequested()) break;
          promises.push(this.#scrapeAndSaveCodeFromSubmissionId(submission_ids[idx], account, stopController));
        }
        await Promise.all(promises);
        promises.length = 0;
      } catch (err) {
        Logger.error('Something went wrong, Most Likely Invalid page id', err);
        return;
      }
    }
  }

  static async scrapeAcceptedSolutions(account, stopController) {
    Logger.error('<<<< Starting Leetcoder Scrapper >>>>');
    await this.#scrapeCodeFromAllSubmissions(account, stopController);
    Logger.error('<<<< Exiting Leetcoder Scrapper >>>>');
  }

  /**
   * This is only for testing and scraping global solutions not relevant to the users.
   */
  static async scrapeAcceptedSolutionsGlobally(account, stopController) {
    Logger.error('<<<< Starting Leetcoder Scrapper >>>>');
    const {browser} = await getBrowserDetails(account);
    try {
      let id_no = 1010011580
      while (id_no > 0) {
        if (stopController?.isStopRequested()) break;
        const promises = [];
        for (let idx = 0; idx < 30; idx++) {
          if (stopController?.isStopRequested()) break;
          promises.push(this.#scrapeAndSaveCodeFromSubmissionId(id_no, account, stopController));
          id_no++;
        }
        await Promise.all(promises);
        await sleep(3)
        Logger.warn('LAST FETCHED IS ', id_no);
        promises.length = 0;
      }
    } catch (e) {
      Logger.error(e);
    }
    Logger.error('<<<< Exiting Leetcoder Scrapper >>>>');
  }
}

export default LeetcoderScraper;
