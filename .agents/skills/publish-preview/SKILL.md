---
name: publish-preview
description: Publish rig's static digest review copy, or replace it after review, through the existing GitHub Pages workflow. Use for a public preview link or approved marker-removal cleanup.
---

# Publish preview

Use the existing [workflow](../../../.github/workflows/review-preview.yml) and
[exporter](../../../scripts/export-preview.ts), not a new host, uploader or public app server.
The repository root is `../../..` from this skill directory. Read the
[issue contract](../../../AGENTS.md#issue-contract) and the
[command reference](references/github-pages.md) before acting.

## Choose the operation

- Choose `publish` or `cleanup` explicitly. An empty marker is not permission to clean up.
- Initial publication needs approval for the exact content, public URL and host. State who
  can see it and how it can be undone. Reuse an approval only within its stated scope.
- Cleanup needs explicit reviewer confirmation AND separate approval to replace the same
  public URL without its marker. A previous publication approval does not cover replacement.
- A request to inspect, draft, verify or explain is not a request to deploy. With a missing
  gate, report the missing evidence or decision and do not dispatch the workflow.

## Workflow

1. Resolve the actual repository, installed GitHub CLI/account, approved pnpm executable,
   workflow/ref and Pages URL. Read the workflow's current inputs; do not guess an API body.
   Require a clean local checkout at the approved published commit, so the local candidate
   and workflow render the same source. Do not commit, push or switch unrelated work to get past
   this check. If hosting or tooling is missing, stop before installing or configuring anything new.
2. Confirm the page contains only approved sample data. Keep HTML, workflow input JSON,
   private logs and credentials outside git; put generated copies outside the worktree.
   Do not print the marker or copy the HTML into an issue or chat attachment.
3. Generate the local candidate with the existing exporter and inspect its banner and data.
   For a service on this Mac, use its configured Tailscale hostname or IPv4 address.
   Never substitute a loopback address; the hosted Ubuntu runner's private bind is not a
   setting to reuse on this Mac.
4. In `publish` mode, require the intended nonempty marker from the approved source.
   In `cleanup` mode, unset LANE_MARKER and do not load the marker-bearing env file into
   the renderer. Confirm "no marker set" and absence of the original marker before upload.
5. Dispatch only the existing manual workflow, with input matching the chosen mode.
   Capture the actual run URL/ID and verify its source commit matches the approved revision.
   Watch that run and require successful build AND deployment; a timeout, revision mismatch or
   partial result remains pending, not success.
6. Fetch the exact public URL without authentication or cookies. Require HTTP 200,
   an HTML content type and byte equality with the local candidate. For cleanup, verify
   the original marker is absent and the banner reads "no marker set" at the same URL.
   A local/Tailscale fetch or a successful upload alone does not prove public reachability.
7. Record the run, source commit, stable public URL and check results privately, without
   secrets. Keep any review-confirmation issue or finish gate open until the reviewer
   explicitly confirms. Deployment success and sending a link are not review confirmation.

## Failure and recovery

Do not claim publication or close a dependent issue after a failed deployment, mismatched
public copy or missing review. Inspect the exact run and public response before retrying;
keep the existing approval boundary and retain the last verified copy outside git.
If work outlasts this turn, retain the run ID and report what remains pending; do not claim
a background watcher exists unless one was actually arranged within authorization.

A rollback is another public change. Explain which copy it restores and get the required
approval first, especially if it would put a removed marker back online. Do not rerun an
old marked deployment as an automatic cleanup recovery.
