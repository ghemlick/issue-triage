# Automation scripts

## `discover-react-issues.mjs`

Finds **react/react** issues that still need triage.

**Why GraphQL:** `GET /repos/react/react/issues` and GitHub Search can lag behind or omit brand-new issues (e.g. [#37830](https://github.com/react/react/issues/37830)). `repository.issues` via GraphQL returns them immediately.

**Selection rules:**

1. `createdAt` is after `state/watermark.json` → `started_at`
2. No local file `classifications/react-<number>.json` yet (includes backfill for index misses)

Does not use `last_checked_at` for filtering; that field is only updated after a successful run.

```bash
node scripts/discover-react-issues.mjs
```

Output: JSON array of `{ number, title, body, created_at, html_url }`.
