#!/usr/bin/env node
/**
 * List react/react issues that need triage using GitHub GraphQL.
 *
 * REST list/search can omit very new issues; GraphQL repository.issues is reliable.
 *
 * Includes any issue with createdAt > watermark.started_at that does not yet have
 * classifications/react-<n>.json (so index misses are backfilled).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WATERMARK_PATH = join(REPO_ROOT, "state", "watermark.json");
const CLASSIFICATIONS_DIR = join(REPO_ROOT, "classifications");

const ISSUES_QUERY = `
query($cursor: String) {
  repository(owner: "react", name: "react") {
    issues(
      first: 50
      after: $cursor
      orderBy: { field: CREATED_AT, direction: DESC }
      states: [OPEN, CLOSED]
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        number
        title
        body
        createdAt
        url
      }
    }
  }
}
`;

function ghGraphql(query, variables = {}) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined && value !== null) {
      args.push("-f", `${key}=${value}`);
    }
  }
  const out = execFileSync("gh", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const parsed = JSON.parse(out);
  if (parsed.errors?.length) {
    throw new Error(parsed.errors.map((e) => e.message).join("; "));
  }
  return parsed.data;
}

function loadWatermark() {
  const raw = readFileSync(WATERMARK_PATH, "utf8");
  const wm = JSON.parse(raw);
  if (!wm.started_at) {
    throw new Error("state/watermark.json must include started_at");
  }
  return wm;
}

function classificationPath(issueNumber) {
  return join(CLASSIFICATIONS_DIR, `react-${issueNumber}.json`);
}

function isClassified(issueNumber) {
  return existsSync(classificationPath(issueNumber));
}

function discoverPending({ startedAt }) {
  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) {
    throw new Error(`Invalid started_at: ${startedAt}`);
  }

  const pending = [];
  let cursor = null;

  for (;;) {
    const data = ghGraphql(ISSUES_QUERY, { cursor });
    const { issues } = data.repository;
    const { nodes, pageInfo } = issues;

    let reachedOlderThanWatermark = false;
    for (const node of nodes) {
      const createdMs = Date.parse(node.createdAt);
      if (createdMs <= startedMs) {
        reachedOlderThanWatermark = true;
        break;
      }
      if (!isClassified(node.number)) {
        pending.push({
          number: node.number,
          title: node.title,
          body: node.body ?? "",
          created_at: node.createdAt,
          html_url: node.url,
        });
      }
    }

    if (reachedOlderThanWatermark || !pageInfo.hasNextPage) {
      break;
    }
    cursor = pageInfo.endCursor;
  }

  pending.sort((a, b) => a.number - b.number);
  return pending;
}

function main() {
  const watermark = loadWatermark();
  const pending = discoverPending({ startedAt: watermark.started_at });
  process.stdout.write(JSON.stringify(pending, null, 2) + "\n");
}

main();
