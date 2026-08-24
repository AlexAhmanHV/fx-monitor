# Pipeline observability — design

Sub-project 3 of 5 in the "make fx-monitor a stronger portfolio piece"
initiative (sub-project 1, frontend tests + CI, and sub-project 2, security +
dependency hygiene, are both complete and merged — see
[2026-08-23-frontend-tests-ci-design.md](2026-08-23-frontend-tests-ci-design.md)
and
[2026-08-23-security-dependency-hygiene-design.md](2026-08-23-security-dependency-hygiene-design.md)).
Sub-projects 4-5 (containerization/IaC, possible backend+DB) are separate,
not part of this work.

## Goal

The daily `update-data.yml` cron has two real gaps:

1. **All-or-nothing failure.** `fetch_fx.py` loops over six currency pairs
   with no per-pair error isolation — if ECB is temporarily unavailable for
   one pair, the whole run raises, nothing is written, and the site keeps
   serving whatever data it already had with zero visible signal beyond the
   GitHub Actions log.
2. **No visibility from the site itself.** There's no way to tell, from the
   deployed app, when the pipeline last ran or whether it succeeded, without
   going to GitHub and reading Actions history.

This does **not** need a new alerting channel — GitHub's built-in
"email the repo owner when a scheduled workflow fails" already works and is
confirmed to reach the human. This sub-project is about resilience (one
pair's failure shouldn't take down the other five) and visibility (a status
indicator on the live site itself), not about building Slack/email
notification plumbing.

## 1. Per-pair resilience in `fetch_fx.py`

Each pair's fetch → parse → validate → write becomes independently
try/except-wrapped inside the per-pair loop in `main()`. On failure for a
given pair:

- Log the error (existing `logging` setup already in the file).
- Do **not** overwrite that pair's JSON file — the site keeps serving the
  last successful data for that pair rather than losing it or writing
  something invalid.
- Record the failure in the new status payload (below) instead of letting
  the exception propagate and abort the whole run.

`manifest.json` is unaffected by per-pair failures — it's a static
pair → filename mapping and is always (re)written at the end of `main()`,
same as today.

## 2. `status.json`

A new file written to the same `--output-dir` as the other JSON outputs,
every run, regardless of outcome:

```json
{
  "generated_utc": "2026-08-24T04:30:12Z",
  "status": "ok",
  "pairs": [
    { "pair": "EUR/SEK", "status": "ok", "points": 2847 },
    { "pair": "EUR/JPY", "status": "error", "message": "Failed to fetch EUR/JPY after 3 attempts" }
  ]
}
```

- `status` at the top level is `"ok"` (all pairs succeeded), `"partial"`
  (some succeeded, some didn't), or `"failed"` (none succeeded).
- Each pair entry is either `{ pair, status: "ok", points }` or
  `{ pair, status: "error", message }`.
- `main()` returns exit code `0` only when top-level `status` is `"ok"`;
  otherwise `1`. This exit code is what makes the difference between
  "partial" and "failed" visible to the workflow (see below), and is what
  ultimately re-triggers GitHub's existing failure-email behavior.

## 3. `update-data.yml` changes

Today, if `fetch_fx.py` exits non-zero, the step aborts the job immediately
and the "Commit and push if data changed" step never runs — so on failure,
literally nothing is persisted, including the new `status.json`. That
defeats the purpose. The workflow changes to:

1. The "Fetch latest ECB FX data" step gets `continue-on-error: true` and an
   `id` so its outcome can be read later.
2. The "Commit and push if data changed" step gets `if: always()` so it
   still runs — and still commits/pushes — even when the fetch step failed
   or partially failed. This is what gets `status.json` (and any pairs that
   *did* succeed) onto `main` and therefore onto the live site, even during
   a partial outage.
3. A new final step checks the fetch step's recorded outcome and exits `1`
   if it was a failure, so the overall workflow run is still marked failed
   — preserving the GitHub failure-email behavior the human already relies
   on — but only *after* whatever could be salvaged has already been
   committed.

## 4. Frontend: status badge

- `site/src/lib/data.ts` gains `fetchStatus()`, following the existing
  `fetchManifest`/`fetchSeries` pattern (fetch + shape validation) but
  **non-blocking**: if `status.json` is missing, malformed, or the fetch
  fails, the app treats status as unavailable and simply doesn't render the
  badge — it never blocks or degrades the rest of the page, unlike
  manifest/series which the whole app depends on.
- `site/src/types.ts` gains a `PipelineStatus` type mirroring the JSON shape
  above.
- New component `site/src/components/StatusBadge.tsx`: a small colored dot
  (green/yellow/red for ok/partial/failed) plus short text, with a `title`
  attribute listing any failed pairs for detail on hover. Rendered in the
  footer next to the existing "Last updated (UTC)" line.
- New i18n strings (`site/src/lib/i18n.ts`) for the three status states, in
  both `sv` and `en`.

## Out of scope

- Any new external notification channel (Slack, email service, webhook) —
  GitHub's built-in scheduled-workflow failure email already covers this,
  confirmed working.
- A dedicated `/status` page — the spec chose a footer badge instead;
  revisit only if the footer badge turns out to be insufficient in
  practice.
- Structured (JSON) application logging for the pipeline — the existing
  plain-text `logging` setup is sufficient for a GitHub Actions log with no
  external log aggregator in the picture.
- Sub-projects 4-5 (not built yet).
