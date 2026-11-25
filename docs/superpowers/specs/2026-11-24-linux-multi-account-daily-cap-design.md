# Linux multi-account and daily-cap design

## Intent

Adapt Leetcoder for the user's Linux desktop and make it a presentable personal coding project. The bot should work with multiple LeetCode accounts, preserve separate browser sessions and progress for each account, run through the complete local solution queue without per-problem prompts, stop when asked, and accept at most two new accepted solutions per selected account per local calendar day.

## Goals

- Run on Linux with the installed Chrome executable, with an environment override for other paths.
- Let the user add accounts by LeetCode username and choose a default account. Authentication remains a manual browser sign-in; no passwords are stored.
- Keep each account's Chrome profile, solved list, and accepted-per-day count in separate local directories.
- Enforce a hard limit of two accepted problems per account per local date in every mode that submits solutions.
- Process every solution JSON in the repository's `problems/` directory in a stable order, resuming automatically after each account's daily quota resets.
- Let the user request a graceful stop from the terminal. Stop before starting another problem or submission; allow an already-started submission to finish and record its verdict.
- Document setup, account management, quota behavior, stop behavior, and known browser/site limitations for portfolio use.

## Non-goals

- Generate solutions. The existing `problems/*.json` files remain the source of code to submit.
- Store LeetCode passwords or automate CAPTCHA challenges.
- Synchronize profiles, progress, or credentials to a server.
- Generate new solutions for problems that do not have a local solution JSON. The existing project supplies the code to submit.

## Approaches

1. **Separate local Chrome profile per account (recommended and selected):** use a small account registry and place each persistent Chrome profile and progress data below that account's local data directory. This fits Puppeteer's existing `userDataDir` model and prevents one account's cookies or progress from being mixed with another's.
2. **Switch accounts in one Chrome profile:** simpler storage, but login state and progress can be confused when changing accounts. Not selected because the user requested account IDs and separate progress.
3. **Replace Puppeteer with a hosted service or browser extension:** larger rewrite and would require additional credential/session handling. Not selected; it adds risk and complexity without helping this local desktop use case.

## Design

- Provide account-management commands to add a saved LeetCode username, configure a default account, and launch a one-time manual login. Normal `npm start` uses the default account and immediately starts the full queue; `--account <username>` overrides the account for one run. Once an account is configured and logged in, a queue run uses no per-problem prompts. Account identifiers are validated as safe path components; they are labels/usernames only, never credentials.
- Store an account registry as JSON at `UserData/accounts.json`. Each account's LeetCode username is normalized to lowercase as its immutable ID and directory key; case variants are treated as the same account and duplicate IDs are rejected. The default account can be changed with an account-management command. No account removal/rename flow is added in this iteration.
- Account add/default/login commands run during setup; steady-state queue runs use the saved default and accept no per-problem input. Selecting an account scopes the browser profile and all user data to `UserData/accounts/<account-id>/`. First-time login launches that account's Chrome profile and asks the user to sign in manually.
- Before processing the queue, verify the authenticated LeetCode username matches the selected account ID. If the page does not expose a verifiable match, stop before submitting anything.
- Linux Chrome is auto-discovered from common executable names, with `GOOGLE_CHROME_EXECUTABLE_PATH` retained as an explicit override for compatibility.
- A shared solver quota module reads and writes the selected account's local-date bot-submission accepted count and accepted slugs. It checks the cap before starting work, skips a slug already accepted that day, and increments only after an `Accepted` verdict is confirmed. Rejected, failed, already-solved, and premium problems do not consume the quota. The cap is fixed at two.
- For each queue pass, a non-accepted verdict is logged and skipped so the unattended run can continue; it remains eligible for retry the next time the bot starts. Premium/unavailable problems are logged and skipped without being recorded as solved, so they remain eligible on a later run. Problems already marked solved on the LeetCode account are cached as solved locally and skipped without counting toward the bot's quota. At the end of one full queue pass, the process exits and reports failures rather than looping forever.
- When an account reaches its cap, the running process waits until the next local calendar date and resumes the remaining queue automatically. If the user stops or the process exits, queue progress is recovered from the account's solved list the next time it starts.
- While solving, `q` requests a graceful stop. The solver checks this request before navigating to the next problem and immediately before entering a submission flow. If a submission has already started, it waits for the verdict and persists it before exiting. Ctrl+C uses the same graceful path.
- The stop boundary is immediately before invoking LeetCode's submit button. A stop received before that point prevents the submission; a stop received after the click waits for the verdict and records it.
- The queue includes every JSON solution file under `problems/`, sorted by filename for predictable order. This is all 2,517 problems present in the cloned project, not a promise to cover problems absent from its local corpus. The README will describe how to exclude a file by moving it out of that directory.
- The README will describe that initial LeetCode authentication is local/manual, no login credentials are stored, per-account storage locations, the daily quota, unattended queue behavior, and the stop control. It will not claim that automation is endorsed by LeetCode or guarantee account outcomes.

## Constraints and risks

- The repository is currently Windows-oriented, but the desktop has Linux, Node.js v24, and `/usr/bin/google-chrome`. Yarn is not installed; dependency installation is not part of the design approval.
- The checked-out corpus currently contains 2,517 solution JSON files. At two accepted submissions per account per day, a complete pass takes at least 1,259 calendar days, excluding failures, premium problems, and already-solved items.
- Puppeteer relies on LeetCode's changing page structure. UI changes or site verification can still interrupt an automation run; the bot must stop safely and report the issue rather than attempt to bypass verification. An unrecognized selector timeout or verdict after a submission stops the run rather than continuing blindly.
- Daily limits are enforced locally and can be reset by editing/removing local data. The project is a personal desktop utility, not a tamper-proof quota service.
- A stop request cannot recall a submission already sent to LeetCode. Its result is recorded when available.
- The newly cloned Desktop copy has no prior `UserData` directory, so this change starts with a clean account registry and does not migrate an older browser profile or progress file.

## Open implementation choices

- If a CAPTCHA, login expiry, or other interactive verification appears, stop and clearly report that manual attention is required; do not bypass the challenge. This is the unavoidable exception to unattended per-problem execution.
- Use Node's local timezone for the per-account calendar-day boundary.
- Retain `GOOGLE_CHROME_EXECUTABLE_PATH` as the supported override name to avoid breaking existing setup instructions.
