# Contributing to Leetcoder

Thanks for taking the time to contribute! Here's how to get started.

## Reporting bugs

Open an issue and include:
- Your OS and Node.js version (`node -v`)
- The exact command you ran
- The full terminal output (redact your username if needed)
- Whether it's a first run or a regression

## Suggesting improvements

Open a Discussion (not an issue) under the **Ideas** category. Describe the problem you're solving, not just the solution. That way we can discuss trade-offs before you spend time writing code.

## Sending a pull request

1. Fork the repo and create a branch from `master`.
2. Keep your change focused — one concern per PR.
3. Test manually: run `npm start -- account add <username>` through at least the login step to confirm nothing is broken.
4. Use conventional commit messages (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`).
5. Open the PR against `master` and describe what changed and why.

## Adding a new problem file

Each file in `problems/` must be valid JSON with exactly these fields:

```json
{
  "language": "<leetcode-language-slug>",
  "code": "<your solution as a string>"
}
```

Supported language slugs are listed in `utils/constants.js` under `LANGUAGE_DISPLAY_MAP`. The filename must match the LeetCode problem slug (e.g. `two-sum.json`).

## Code style

- ES modules (`import`/`export`), no CommonJS.
- No external runtime dependencies beyond what's already in `package.json` unless there's a strong reason.
- Keep async error handling explicit — avoid silent swallows.

## License

By contributing you agree that your changes will be released under the existing [MIT License](LICENSE).
