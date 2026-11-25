# Leetcoder Desktop

Leetcoder Desktop is a local Node.js and Puppeteer project that runs saved coding solutions against LeetCode from a Linux desktop. It keeps a separate Chrome session and progress record for each configured LeetCode username, enforces a two-accepted-submission daily cap per account, and can pause safely when requested.

The repository currently includes 2,517 solution files. The runner processes every `problems/*.json` file in filename order. It submits the code already stored in each file; it does not generate solutions for missing entries.

## Features

- Multiple local account profiles, selected by LeetCode username.
- Persistent Chrome profile and solved-problem history kept separately for each account.
- At most two new accepted bot submissions per account per local calendar day.
- Automatic wait until the next local day when the quota is reached, then resume the queue.
- `q` or Ctrl+C requests a graceful stop. A submission already sent is allowed to finish and its verdict is recorded.
- Manual sign-in in a normal Chrome window; the application does not store account passwords.

## Requirements

- Linux desktop with Google Chrome or Chromium installed.
- Node.js and npm.
- A LeetCode account you are authorized to use.

Chrome is detected from common Linux executable names. To select another Chrome binary, set `GOOGLE_CHROME_EXECUTABLE_PATH` in a `.env` file in the project root:

```text
GOOGLE_CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome
```

## Install

From the project directory:

```bash
npm install
```

## Configure accounts

Add each LeetCode username you want to use. The first account becomes the default automatically:

```bash
npm start -- account add your_leetcode_username
```

Usernames are normalized to lowercase for local account IDs, so casing variants map to the same profile and quota.

Add another account and set it as the default when you want to switch:

```bash
npm start -- account add another_username
npm start -- account default another_username
```

Each account must sign in once using its own Chrome profile. This opens a regular Chrome window; sign in manually, then close the window:

```bash
npm start -- login --account your_leetcode_username
```

The bot checks that the signed-in username matches the selected account and stops before submitting if it cannot verify the match.

## Run

Run the full local solution queue for the default account:

```bash
npm start
```

Choose an account for one run without changing the default:

```bash
npm start -- --account another_username
```

Optional modes:

```bash
npm start -- --mode daily --account your_leetcode_username
npm start -- --mode scrape --account your_leetcode_username
```

The queue runs without per-problem prompts. When two new solutions are accepted for that account in the current local day, the process waits until local midnight and continues. If the queue finishes before the cap is reached, it exits. Already-solved problems are skipped; failed submissions are reported and can be retried the next time the program runs.

Press **q** or **Ctrl+C** in the terminal to stop. If a submission has already been sent, the bot waits for its verdict before exiting. If a login expires or the site asks for human verification, the bot stops; it does not try to bypass the challenge.

## Local data

All account data is stored under the ignored `UserData/` directory:

| Data | Location |
| --- | --- |
| Account registry and default account | `UserData/accounts.json` |
| Persistent Chrome session | `UserData/accounts/<username>/ProfileData/` |
| Solved-problem history | `UserData/accounts/<username>/LeetcoderData/SolvedProblems.json` |
| Daily accepted-submission count | `UserData/accounts/<username>/LeetcoderData/DailyQuota.json` |
| Scraped accepted solutions | `UserData/accounts/<username>/LeetcoderData/ScrapedSolutions/` |

The daily limit counts distinct problems accepted by this bot; manual submissions are not included. The quota is local application state, not a server-enforced limit. Account usernames are fixed after adding in this version; there is no remove or rename command.

## Project structure

- `managers/AccountManager.js` — local account registry and account selection.
- `managers/DailyQuotaManager.js` — per-account accepted count and next-day wait.
- `managers/BrowserManager.js` — Puppeteer browser lifecycle and account-specific Chrome profiles.
- `leetcoder/LeetcoderSolver.js` — ordered queue, submissions, verdict handling, and graceful stop checks.
- `problems/` — local problem slugs, language identifiers, and saved solution code.

## Limitations

LeetCode's page structure can change, and some saved solutions may no longer be accepted. Problems requiring a premium subscription, a CAPTCHA, an expired sign-in, or other interactive verification need manual attention. The current two-per-day cap is enforced locally and can be changed by editing local state.

This project is based on [Leetcoder by Chanpreet Singh](https://github.com/chanpreet3000/Leetcoder) and remains under the included MIT license. Use it only in ways allowed by LeetCode's current terms and rules.
