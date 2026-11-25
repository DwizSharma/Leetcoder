# Leetcoder Linux Accounts and Daily Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Leetcoder to the user's Linux desktop, add isolated LeetCode account profiles, and run the entire local solution queue unattended with a two-accepted-submissions-per-account-per-day cap and a graceful stop control.

**Architecture:** A JSON account registry selects a username-scoped data directory and persistent Chrome profile. The CLI defaults to a full queue run with no per-problem prompts; a shared quota manager pauses at the daily cap, while a stop controller interrupts at safe boundaries. The existing local JSON corpus remains the source of submitted code.

**Tech Stack:** Node.js ES modules, Puppeteer, local JSON state, system Chrome.

**Spec:** `docs/superpowers/specs/2026-11-24-linux-multi-account-daily-cap-design.md`

## Global Constraints

- The accepted-submission cap is fixed at two per selected account per local calendar date.
- The queue processes every `.json` solution file in `problems/`, in stable filename order.
- Account browser profiles and progress are stored locally under `UserData/accounts/<username>/`; passwords are never stored.
- Linux Chrome is auto-discovered; `GOOGLE_CHROME_EXECUTABLE_PATH` remains an override.
- Login is manual on first use; CAPTCHA and other interactive verification are never bypassed.
- `q` and Ctrl+C request a graceful stop; a submission already sent is allowed to finish and be recorded.
- When the daily quota is reached, keep the process alive, wait for the next local date, and resume the queue.
- The project contains 2,517 solution JSON files; it only submits code present in those files.

## Review Focus

- **Unsafe account ID/path input and casing aliases:** ensure invalid usernames cannot escape `UserData/accounts/` and casing variants share one account/quota; manually inspect validation, normalization, and path construction in Task 1.
- **Wrong authenticated account:** ensure the runner stops before submission when the page identity does not match the selected username; inspect the guard in Task 2.
- **Quota boundary and duplicate accepted slug:** ensure the same account cannot exceed two accepted bot submissions for a local date, including across restarts; inspect the persisted record and solver call sites in Task 3.
- **Stop arriving around the submit click:** ensure stop before the click prevents submission and stop after it waits for the verdict; inspect checks immediately around the click in Task 3.
- **Unknown verdict, CAPTCHA, and site UI changes:** ensure these do not increment quota or trigger challenge bypass, and that the queue reports/skips the affected item; inspect error paths in Task 3.

---

### Task 1: Account registry, paths, and noninteractive CLI

**Files:**
- Create: `managers/AccountManager.js`
- Modify: `data.js`
- Modify: `index.js`
- Modify: `.gitignore` only if needed to keep runtime account data ignored

**Interfaces:**
- `AccountManager.addAccount(username: string): Promise<AccountRecord>` validates `[A-Za-z0-9_-]+`, normalizes usernames to lowercase, rejects case-insensitive duplicates, persists the registry, and sets the first account as default.
- `AccountManager.setDefaultAccount(username: string): Promise<void>` rejects unknown usernames and updates `UserData/accounts.json`.
- `AccountManager.resolveAccount(usernameOverride?: string): Promise<AccountRecord>` returns the override or saved default, and errors with setup instructions if none exists.
- `getAccountPaths(username: string): AccountPaths` returns `profileDir`, `dataDir`, `solvedProblemsPath`, `dailyQuotaPath`, and `scrapedSolutionsDir` below `UserData/accounts/<username>/`.
- CLI commands: `npm start -- account add <username>`, `npm start -- account default <username>`, `npm start -- login [--account <username>]`, and `npm start -- [--account <username>] [--mode queue|daily]`. The no-argument command runs the queue using the default account.

- [ ] Implement the `UserData/accounts.json` schema `{ "defaultAccount": string|null, "accounts": [{ "username": string }] }` and atomic-enough JSON read/write helpers in `AccountManager.js`.
- [ ] Implement safe account ID validation and exact account path mapping in `data.js`.
- [ ] Replace the startup mode prompt in `index.js` with the CLI commands above; route account add/default without launching Chrome, and pass the resolved account record into login, auth, scraper, and solver flows.
- [ ] Review account ID edge cases: empty value, duplicate, path separators, `..`, unknown default, and absent registry; confirm each fails before Chrome launch or writes outside `UserData/`.

### Task 2: Linux Chrome, per-account login, and account identity check

**Files:**
- Modify: `data.js`
- Modify: `managers/BrowserManager.js`
- Modify: `leetcoder/LeetcoderLogin.js`
- Modify: `leetcoder/LeetcoderAuthenticator.js`
- Modify: `utils/utils.js`

**Interfaces:**
- `BrowserManager.init(account: AccountRecord)` and `getBrowserDetails(account: AccountRecord)` use `account.paths.profileDir`.
- `LeetcoderLogin.loginUser(account: AccountRecord): Promise<void>` opens system Chrome with the selected profile at LeetCode's login page; the user signs in manually and closes the window.
- `LeetcoderAuthenticator.loginUser(account: AccountRecord): Promise<void>` confirms the session and verifies the visible username matches `account.username`; mismatch or unverifiable identity aborts before solving.
- `resolveChromeExecutable(): string` returns the configured `GOOGLE_CHROME_EXECUTABLE_PATH` or the first installed common Linux Chrome/Chromium executable, and errors with setup guidance if none exists.

- [ ] Add Linux Chrome executable discovery while preserving the environment override; use the resolved executable in both Puppeteer and the login launcher.
- [ ] Use separate persistent Chrome `userDataDir` folders for every account and create them before launch.
- [ ] Pass `account` through all browser-dependent call sites so no mode accidentally uses a different account's profile.
- [ ] Update keyboard selection/copy/paste helpers to use Meta only on macOS and Control on Linux/Windows.
- [ ] Make authentication fail closed when the logged-in username is different or cannot be verified; do not add CAPTCHA solving or credential storage.
- [ ] Review path isolation and login failure behavior, including missing Chrome and an already-locked profile.

### Task 3: Per-account quota, full queue, resume, and graceful stop

**Files:**
- Create: `managers/DailyQuotaManager.js`
- Create: `utils/StopController.js`
- Modify: `managers/FileManager.js`
- Modify: `leetcoder/LeetcoderSolver.js`
- Modify: `index.js`
- Modify: `utils/constants.js`

**Interfaces:**
- `DailyQuotaManager.getAcceptedCount(account): Promise<number>` reads `{ "date": "YYYY-MM-DD", "accepted": [problemSlug, ...] }` and treats an older date as zero.
- `DailyQuotaManager.getAcceptedSlugs(account): Promise<Set<string>>` exposes the current day's accepted slugs so queue and daily modes skip already accepted work.
- `DailyQuotaManager.recordAccepted(account, problemSlug): Promise<number>` adds a slug once for the current local date and returns the resulting count.
- `DailyQuotaManager.waitUntilNextLocalDay(account, stopController): Promise<boolean>` waits to the next local date or returns early if stop was requested.
- `StopController.start(): void`, `requestStop(): void`, `isStopRequested(): boolean`, and `stop(): void` handle terminal `q` and Ctrl+C without exiting mid-submission.
- `FileManager.getAllProblemsNames(): Promise<string[]>` returns only `.json` basenames in sorted order; account-scoped solved-list methods accept `account`.
- `LeetcoderSolver.solve(account, stopController): Promise<SolveSummary>` runs all local JSON problems once in sorted order, pausing after two accepted bot submissions per local date and resuming after date rollover.

- [ ] Add account-scoped daily quota persistence with duplicate slug protection and local-date rollover.
- [ ] Add a stop controller which listens for `q` and Ctrl+C, supports stopping while waiting for midnight, and restores terminal input mode during cleanup.
- [ ] Make `FileManager` sort and filter JSON files and place all solved/scraped state under the selected account.
- [ ] Refactor the solver to return explicit statuses (`accepted`, `already-solved`, `premium`, `failed`, `stopped`) and record accepted quota only after a confirmed `Accepted` verdict; skip a slug already in the current-day quota log in all solver modes.
- [ ] Apply the same accepted quota manager to queue and daily-challenge submission paths; do not count manually accepted problems or already-solved problems against the bot's quota.
- [ ] Add stop checks before navigation and immediately before the submit click; after a click, wait for its verdict and persist the result before stopping.
- [ ] At the quota, wait until local midnight and continue the same queue; after one full pass, exit with accepted/skipped/failed totals instead of retrying forever.
- [ ] Review state transitions for two accepted problems, restarts across midnight, repeat slugs, failed verdicts, premium pages, and stop signals before/after submission.

### Task 4: Desktop setup and portfolio documentation

**Files:**
- Modify: `README.md`
- Modify: `package.json` metadata only if it improves npm usage without changing dependencies

**Interfaces:**
- README documents Linux prerequisites, `npm install`, account commands, first-time manual login, default queue startup, `--account`, daily cap behavior, stop control, local storage layout, and limitations.
- Portfolio summary describes the account isolation, quota persistence, graceful shutdown, and Puppeteer/Linux support without promising that the site UI is stable or that every submission will be accepted.

- [ ] Replace the Windows-only setup instructions with Linux Mint/Chrome instructions and retain the executable override path.
- [ ] Document the exact add-account, set-default, manual-login, default-run, and alternate-account commands.
- [ ] Explain that the process sleeps at the per-account cap and resumes next local day; explain that `q` or Ctrl+C stops it safely.
- [ ] State that all local solution JSONs are queued (2,517 at this checkout), solutions are not generated, and CAPTCHA/login expiry requires manual action.
- [ ] Review README commands against the CLI interface produced by Tasks 1–3 and inspect `git diff` for unintended account data or dependency files.

## Execution Notes

- Do not run the automated queue during implementation; it submits to a real LeetCode account and is not needed to edit the project.
- No test suite is requested by the user. Keep validation to source review and documented setup checks; do not add or run tests unless the user asks.
- Do not commit or push changes unless the user asks.
