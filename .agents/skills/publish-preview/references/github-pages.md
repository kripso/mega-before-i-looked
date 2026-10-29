# GitHub Pages commands

These commands run from the repository root (`../../../..` from this reference directory).
Read the current workflow and exporter first; they own the implementation. This reference
does not authorize any upload. Keep variables in the same shell, or explicitly resolve/pass
these values again for each tool invocation. Stop on a failed command; do not continue to dispatch.

## Resolve inputs

```sh
set -eu
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
WORKFLOW=review-preview.yml
REF=main
PREVIEW_URL=$(gh api "repos/$REPO/pages" --jq .html_url)
SOURCE_SHA=$(gh api "repos/$REPO/commits/$REF" --jq .sha)
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$SOURCE_SHA"
```

The current workflow is manual-only and runs on main. Its one optional string input is
`lane_marker`, defaulting to empty. It unsets an empty marker before rendering. If this
contract changes, reconcile the inputs before dispatch rather than copying stale commands.

Check the active account with `gh auth status`. A missing Pages site needs a separate
configuration decision; do not enable it as a side effect of this skill. A dirty checkout
or a mismatch with the approved published commit is a stop condition, not permission to
commit, push or discard unrelated changes. Ignored local configuration stays untracked.

Resolve these values before continuing:

- `MODE`: explicitly `publish` or `cleanup`, with the corresponding human approval.
- `PNPM`: the already approved pnpm executable name or path. Resolve existing project-local
  tooling if it is not on PATH; do not install another or a global copy without approval.
- `PREVIEW_HOST`: a reachable hostname or IPv4 bind address. For a service on this Mac,
  use its authorized Tailscale hostname or IPv4 address, never a loopback fallback.
- `OUT_DIR`: an absolute private output directory outside the Git worktree.
- `PREVIEW_URL`: the actual public HTTPS hostname from Pages, with no user info or credentials.

## Generate the exact local candidate

Initial publication uses the approved marker source. Confirm it is the intended marker,
not a value inherited from another project; never echo it.

```sh
set -eu
mkdir -p "$OUT_DIR"
node --env-file-if-exists=.env -e '
  const marker = process.env.LANE_MARKER?.trim();
  if (!marker) throw new Error("Initial publication requires a nonempty approved marker");
  process.stdout.write(JSON.stringify({ lane_marker: marker }));
' > "$OUT_DIR/inputs.json"
PREVIEW_HOST="$PREVIEW_HOST" "$PNPM" exec tsx --env-file-if-exists=.env \
  scripts/export-preview.ts "$OUT_DIR/index.html"
```

Only after review confirmation and separate replacement approval, cleanup uses:

```sh
set -eu
mkdir -p "$OUT_DIR"
env -u LANE_MARKER PREVIEW_HOST="$PREVIEW_HOST" "$PNPM" exec tsx \
  scripts/export-preview.ts "$OUT_DIR/index.html"
printf '%s\n' '{"lane_marker":""}' > "$OUT_DIR/inputs.json"
```

Do not add an env-file flag to the cleanup renderer. Inspect the local banner before
dispatch. For cleanup, check the original marker is absent using its private record or
ignored config without loading that config into the renderer.

## Dispatch and wait

```sh
set -eu
RUN_URL=$(gh workflow run "$WORKFLOW" --repo "$REPO" --ref "$REF" --json < "$OUT_DIR/inputs.json")
RUN_ID=${RUN_URL##*/}
case "$RUN_ID" in
  ''|*[!0-9]*) printf '%s\n' 'No run ID returned; inspect the dispatch without repeating it.' >&2; exit 1 ;;
esac
test "$(gh run view "$RUN_ID" --repo "$REPO" --json headSha --jq .headSha)" = "$SOURCE_SHA"
gh run watch "$RUN_ID" --repo "$REPO" --exit-status
```

A successful run must include the deploy job. If watch times out, retain RUN_ID and
inspect that same run; do not dispatch a duplicate just to regain its status.

## Verify the public copy

```sh
set -eu
HTTP_META=$(curl -q --fail --silent --show-error --location --max-time 30 \
  --dump-header "$OUT_DIR/public-headers.txt" \
  --output "$OUT_DIR/public.html" \
  --write-out '%{http_code}|%{content_type}' "$PREVIEW_URL")
HTTP_STATUS=${HTTP_META%%|*}
CONTENT_TYPE=$(printf '%s' "${HTTP_META#*|}" | tr '[:upper:]' '[:lower:]')
test "$HTTP_STATUS" = 200
case "$CONTENT_TYPE" in
  text/html|'text/html;'*) ;;
  *) printf '%s\n' 'The public response is not HTML.' >&2; exit 1 ;;
esac
cmp "$OUT_DIR/index.html" "$OUT_DIR/public.html"
```

Require all status, content-type and byte-comparison checks to pass. The leading `-q` disables curl's config; do not add auth,
cookies or credential-bearing URLs. Check the unchanged stable URL, not only a cache-busted
alternative. Investigate deployment, cache or URL mismatches instead of declaring success.

Keep both the initial and marker-free local artifacts private if needed for verification
or an approved rollback. Never commit them or paste them into issues.
