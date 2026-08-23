# Security & Dependency Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the security-signal gap in `fx-monitor`: fix the 11 currently-known npm vulnerabilities, add dependency-vulnerability gates to CI for both the frontend and the pipeline, turn on Dependabot and CodeQL, and add a `SECURITY.md`.

**Architecture:** No new tools beyond what GitHub provides for free — `npm audit`/`pip-audit` as new steps in the existing `.github/workflows/ci.yml` jobs, `.github/dependabot.yml` for automated dependency PRs, and a separate `.github/workflows/codeql.yml` for static analysis (CodeQL's action has its own init/analyze structure that doesn't fit the existing job shape).

**Tech Stack:** `npm audit` (built into npm, no new dependency), `pip-audit` (new Python devDependency), GitHub Dependabot, GitHub CodeQL (`github/codeql-action@v3`).

## Global Constraints

- No `--force` on `npm audit fix` — only apply fixes that don't require a semver-major bump to a direct dependency. (Verified during planning: a plain `npm audit fix` resolves all 11 current advisories with zero `package.json` changes, only `package-lock.json`.)
- The `npm audit` CI gate uses `--audit-level=high` (fails on high/critical, ignores low/moderate) — not the default (which fails on any level).
- `pip-audit` in CI has no severity filter flag equivalent to `--audit-level`; it fails on any known vulnerability. This is why Task 2 also bumps `black`/`pytest` to vulnerability-free versions — wiring up a gate that's red on day one defeats the purpose.
- Dependabot: `npm` (`/site`), `pip` (`/pipeline`), `github-actions` (`/`), all weekly.
- CodeQL: both `javascript-typescript` and `python` languages, triggered on `push`/`pull_request` to `main` plus a weekly `schedule`.
- This plan only wires up tooling. It does not fix any *new* finding the tooling surfaces beyond the specific npm/pip vulnerabilities already identified during planning (see Task 1 and Task 2) — a CodeQL alert, for example, is a follow-up, not something to fix inside this plan.

---

### Task 1: Fix current npm vulnerabilities

**Files:**
- Modify: `site/package-lock.json` (via `npm audit fix`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a clean `npm audit` baseline that Task 2's `npm audit --audit-level=high` CI step relies on to start green.

- [ ] **Step 1: Record the baseline**

Run: `cd site && npm audit`
Expected: `11 vulnerabilities (1 low, 1 moderate, 9 high)` — confirms the starting state matches what this plan assumes. If the count differs (e.g. a new advisory appeared since planning), stop and report — the fix steps below assume this specific baseline.

- [ ] **Step 2: Apply the fix**

Run: `cd site && npm audit fix`
Expected: output ending in `found 0 vulnerabilities`. Do NOT pass `--force`. If `npm audit fix` reports it cannot fix everything without `--force`, stop and report BLOCKED — that means a new advisory appeared since planning that needs a semver-major bump, which is outside this task's scope to decide alone.

- [ ] **Step 3: Confirm the fix and full local verification**

Run: `cd site && npm audit`
Expected: `found 0 vulnerabilities`

Run: `cd site && npm run lint && npx tsc --noEmit && npm run test && npm run build`
Expected: all four succeed — lint clean, no type errors, 57/57 tests passing, production build succeeds.

- [ ] **Step 4: Commit**

```bash
git add site/package-lock.json
git commit -m "fix: resolve npm audit vulnerabilities via npm audit fix"
```

(If `site/package.json` also changed — it shouldn't, per the planning-time dry run, but confirm with `git status` — add it too.)

---

### Task 2: pip-audit + CI audit gates

**Files:**
- Modify: `pipeline/requirements.txt`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 1's clean `npm audit` state (this task's `site` job step assumes 0 vulnerabilities to gate against).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update `pipeline/requirements.txt`**

Current content:

```text
requests>=2.32.0,<3.0.0
black>=24.0.0,<25.0.0
ruff>=0.9.0,<1.0.0
pytest>=8.0.0,<9.0.0
```

Replace with:

```text
requests>=2.32.0,<3.0.0
black>=26.3.1,<27.0.0
ruff>=0.9.0,<1.0.0
pytest>=9.0.3,<10.0.0
pip-audit>=2.9.0,<3.0.0
```

`black` and `pytest` are bumped past their vulnerable versions (confirmed via `pip-audit` during planning: `black 24.10.0` has advisories `PYSEC-2026-2120`/`PYSEC-2026-2121`, fixed in `26.3.0`/`26.3.1`; `pytest 8.4.2` has `PYSEC-2026-1845`, fixed in `9.0.3`). `pip-audit` itself is added as a new devDependency, consistent with how `ruff`/`pytest`/`black` are already tracked here.

- [ ] **Step 2: Install and verify locally**

Run: `python -m pip install -r pipeline/requirements.txt`
Expected: installs cleanly (this will upgrade `black` and `pytest` in your environment if you have the older pins installed).

Run: `python -m black --check pipeline`
Expected: `All done!` / `X files would be left unchanged` — confirms the newer `black` doesn't want to reformat anything (verified during planning: it doesn't).

Run: `python -m ruff check pipeline`
Expected: `All checks passed!`

Run: `python -m pytest pipeline/tests`
Expected: `1 passed`

Run: `python -m pip_audit -r pipeline/requirements.txt`
Expected: `No known vulnerabilities found` (verified during planning against this exact file content).

- [ ] **Step 3: Add audit steps to `.github/workflows/ci.yml`**

Current file:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  site:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: site
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: site/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Test
        run: npm run test

      - name: Build
        run: npm run build

  pipeline:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r pipeline/requirements.txt

      - name: Lint
        run: python -m ruff check pipeline

      - name: Test
        run: python -m pytest pipeline/tests
```

Add a new step at the end of the `site` job (after `Build`):

```yaml
      - name: Audit dependencies
        run: npm audit --audit-level=high
```

Add a new step at the end of the `pipeline` job (after `Test`):

```yaml
      - name: Audit dependencies
        run: pip-audit -r pipeline/requirements.txt
```

The full resulting `pipeline` job's `steps:` list, for reference:

```yaml
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r pipeline/requirements.txt

      - name: Lint
        run: python -m ruff check pipeline

      - name: Test
        run: python -m pytest pipeline/tests

      - name: Audit dependencies
        run: pip-audit -r pipeline/requirements.txt
```

- [ ] **Step 4: Validate the workflow YAML**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
Expected: no output, no error (a parse error would print a traceback).

- [ ] **Step 5: Commit**

```bash
git add pipeline/requirements.txt .github/workflows/ci.yml
git commit -m "ci: add npm audit / pip-audit gates; bump black and pytest past known advisories"
```

---

### Task 3: Dependabot configuration

**Files:**
- Create: `.github/dependabot.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/site"
    schedule:
      interval: "weekly"

  - package-ecosystem: "pip"
    directory: "/pipeline"
    schedule:
      interval: "weekly"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

- [ ] **Step 2: Validate the YAML**

Run: `python -c "import yaml; yaml.safe_load(open('.github/dependabot.yml'))"`
Expected: no output, no error.

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "chore: enable Dependabot for npm, pip, and github-actions"
```

- [ ] **Step 4: Note for the human**

Dependabot activates automatically once this file is merged to the default branch — no further setup needed, but it can only be confirmed working from the GitHub UI (Insights → Dependency graph → Dependabot), not from a local checkout. Mention this in your report.

---

### Task 4: CodeQL workflow

**Files:**
- Create: `.github/workflows/codeql.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `.github/workflows/codeql.yml`**

```yaml
name: "CodeQL"

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]
  schedule:
    - cron: '30 1 * * 0'

jobs:
  analyze:
    name: Analyze (${{ matrix.language }})
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      packages: read
      actions: read
      contents: read

    strategy:
      fail-fast: false
      matrix:
        include:
          - language: javascript-typescript
            build-mode: none
          - language: python
            build-mode: none

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
          build-mode: ${{ matrix.build-mode }}

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:${{ matrix.language }}"
```

The cron (`30 1 * * 0`, Sunday 01:30 UTC) is distinct from `update-data.yml`'s daily `30 4 * * *` cron — no overlap, no interference.

`build-mode: none` is correct for both languages here: CodeQL doesn't need to compile JavaScript/TypeScript or Python to analyze them (this differs from compiled languages like Java or C++, which need `build-mode: autobuild` or a manual build step).

- [ ] **Step 2: Validate the YAML**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/codeql.yml'))"`
Expected: no output, no error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/codeql.yml
git commit -m "ci: add CodeQL analysis for javascript-typescript and python"
```

- [ ] **Step 4: Note for the human**

Like Dependabot, CodeQL results only appear in the GitHub UI (Security → Code scanning alerts) after the workflow runs on the default branch — this can't be verified from a local checkout. Mention this in your report.

---

### Task 5: `SECURITY.md`

**Files:**
- Create: `SECURITY.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `SECURITY.md`**

```markdown
# Security Policy

## Supported Versions

This is a single-branch portfolio project — there are no version tags or
release branches. Only the `main` branch receives security fixes.

## Reporting a Vulnerability

Please do not open a public GitHub issue for security vulnerabilities.

Instead, use GitHub's private vulnerability reporting for this repository:

1. Go to the [Security tab](https://github.com/AlexAhmanHV/fx-monitor/security).
2. Click **Report a vulnerability** under "Advisories".

This opens a private conversation with the repository owner. You'll get an
acknowledgement as soon as possible, and a fix or mitigation plan once the
report is triaged.
```

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "docs: add SECURITY.md"
```

---

## Post-plan state

After Task 5: `npm audit` reports 0 vulnerabilities, `pip-audit` reports none against `pipeline/requirements.txt`, every PR/push to `main` is gated on both audit tools (in addition to the existing lint/typecheck/test/build gates from the frontend-tests-ci plan), Dependabot watches all three ecosystems weekly, CodeQL scans both languages on every push/PR plus weekly, and `SECURITY.md` gives reporters a private channel via GitHub's built-in vulnerability reporting.
