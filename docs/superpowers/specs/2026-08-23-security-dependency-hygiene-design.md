# Security & dependency hygiene — design

Sub-project 2 of 5 in the "make fx-monitor a stronger portfolio piece"
initiative (sub-project 1, frontend tests + CI, is complete — see
[2026-08-23-frontend-tests-ci-design.md](2026-08-23-frontend-tests-ci-design.md)).
Sub-projects 3-5 (pipeline observability, containerization/IaC, possible
backend+DB) are separate, not part of this work.

## Goal

`.github/workflows/ci.yml` (from sub-project 1) gates lint/typecheck/test/build
but has no security signal at all: no dependency-vulnerability scanning, no
static analysis, no automated dependency updates, and `npm audit` currently
reports 11 vulnerabilities (1 low, 1 moderate, 9 high) in the frontend's
transitive devDependencies. This closes that gap with the standard,
zero-cost-on-GitHub tools: `npm audit` / `pip-audit` in CI, Dependabot, and
CodeQL, plus a `SECURITY.md` for how to report a vulnerability.

## 1. Clean up current vulnerabilities

`npm audit fix` (no `--force`) in `site/`. A dry run
(`npm audit fix --dry-run`) confirms all 11 current advisories — spanning
`js-yaml`, `minimatch`, `nanoid`, `picomatch`, `postcss`, `rollup`, and
`vite` — are fixable without a semver-major bump to any direct dependency.
All eleven are in build-tooling's transitive dependencies (Vite's own
dependency tree), not in code shipped to end users, but they're free to fix
and there's no reason to carry them.

After running the fix, re-run the full local verification
(`npm run lint && npx tsc --noEmit && npm run test && npm run build`) to
confirm nothing broke, and commit the updated `package-lock.json`.

## 2. Audit gates in `ci.yml`

Add one step to each existing job in `.github/workflows/ci.yml`:

- **`site` job:** `npm audit --audit-level=high` — fails the build on any
  high or critical advisory, ignores low/moderate so those don't block
  merges over noise-level findings.
- **`pipeline` job:** `pip-audit` — added as a new step. `pip-audit` itself
  becomes a `pipeline/requirements.txt` devDependency (alongside the
  existing `ruff`/`pytest`/`black` entries), so it's runnable locally the
  same way those are, not just inside CI.

Both steps run after the existing lint/typecheck/test/build steps in their
respective jobs (fail fast on functional breakage before spending time on
an audit).

## 3. Dependabot

New file `.github/dependabot.yml`, three ecosystems, weekly:

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

(Exact key ordering/formatting may differ slightly in the implementation —
the above is the intent, not necessarily byte-for-byte final YAML.)

## 4. CodeQL

New file `.github/workflows/codeql.yml`, using `github/codeql-action`,
covering both `javascript-typescript` and `python` languages. Triggers:
`push`/`pull_request` to `main`, plus a weekly `schedule` (cron) so
newly-published CodeQL query updates catch issues in code that hasn't
changed recently. This is a separate workflow file from `ci.yml` because
CodeQL's action has its own init/analyze step structure that doesn't fit
naturally into the existing `site`/`pipeline` job shape.

## 5. `SECURITY.md`

New file at the repo root. Short: how to report a vulnerability (GitHub
issue or the email already public on the author's portfolio site), and a
one-line supported-versions note (only `main` — there are no release
branches or version tags in this repo).

## Out of scope

- Fixing any *findings* CodeQL or the audit tools surface beyond the 11
  already-identified `npm audit` items above — if CodeQL or `pip-audit`
  surfaces something real once wired up, that's a follow-up, not part of
  wiring up the tooling itself.
- SAST/dependency scanning for sub-projects 3-5 (not built yet).
- Secret scanning / push protection — GitHub enables basic secret scanning
  automatically on public repos already; no repo-specific config needed.
- Branch protection / required status checks — this is a GitHub repository
  *setting*, not a code change, and was already flagged to the human as a
  follow-up during sub-project 1's final review.
