# rig

The lane's resident service: keeps a heartbeat, serves the status board, reads the night's run
log. Hono + JSX, rendered on the server, Node 22+.

Read first: `docs/vision.md`, `docs/styleguide.md`. Decisions: `docs/adr/`.

## Commands

- `pnpm dev` / `pnpm start`: serves on `PORT` (8787). Needs `.env` (copy `.env.example`).
- `pnpm test`: vitest. `pnpm typecheck`: tsc.

## How work moves here

1. A feature starts as a plan: `plan.md` at the root (one at a time). Finished plans live in
   `docs/plans/done/`.
2. The plan is split into GitHub issues: skill `plan-to-issues` (`.agents/skills/`). A human
   reviews the split before anything is published. GitHub issues out of reach: files in
   `docs/issues/` (ADR 0004).
3. Issues are worked by workers, one issue per worker, each on its own branch or worktree.
   Pick the model per issue: the strongest for logic, a cheaper one for views and tests.
4. A worker closes its issue with a closing comment, exactly this shape:

   ```
   done: <what changed, one line>
   worker: <harness> · <model> · <effort>
   commit: <sha or "none">
   ```

5. An issue is closed only when its "Done when" holds. If it can't hold yet, leave it open and
   say what it waits on.

## Issue contract

This is the human-approved default for plan issues. Reuse it without asking for the same
field choices again; ask only about a material exception or an unclear outcome. The human
still reviews each plan's proposed split before any issues are published.

- The first body line is `Source: plan.md § <section>`, using a section that actually exists.
- Apply `plan:<plan>`, taking `<plan>` from the plan's frontmatter, for example
  `plan:morning-digest`. Labels belong in GitHub metadata (or ADR 0004 frontmatter).
- Use these body headings:
  - `## Scope`: the bounded change and relevant exclusions.
  - `## Owned files`: editable paths and the coordinator-owned integration seam. For work
    without tracked edits, name its output and authorized actions instead.
  - `## Blocked by`, with separate `Start after:` and `Finish after:` entries. Use
    `none` explicitly when there is no dependency.
  - `## Done when`: observable completion checks for this unit of work.
  - `## Verification`: the commands or external evidence needed to prove those checks.
- Start dependencies permit work to begin; finish dependencies must hold before closure.
  A committed type contract can let views and tests start while the reader is unfinished.
  Use actual issue numbers and commit links when known; mark draft references as drafts.
- Keep file ownership disjoint for parallel work. The coordinator integrates shared routes.
  Parallel workers need host-prepared isolated checkouts rooted in this repository; if the
  host cannot provide that isolation, run issue branches serially and report the limitation.
- A review request and a review confirmation are different events. Model the confirmation
  as its own issue, or an explicit finish gate with the confirming person and signal.
  Mark an unknown confirmer unresolved in the draft, and settle that material choice during
  human split review before publishing; never invent a reviewer or re-ask the settled field format.
  A successful deployment or a sent link is not that signal. Keep the issue open while waiting.
- Public cleanup starts only after review confirmation and separate approval for the exact
  replacement. Never infer cleanup permission from an earlier publication approval.
- Do not make an implementation issue depend on overall acceptance that itself requires
  that issue to be closed. Represent a real external acceptance step as a separate gate.
- Use `refs #n` while any finish gate is pending. Use `closes #n` only after its checks and
  gates hold, because landing that commit can close the issue automatically.
- Close with the existing three-line `done` / `worker` / `commit` comment above, using actual
  evidence and model settings. An unexecuted check is planned; a branch-only result does not
  satisfy an integration gate.

## Skills

Shared skills live in `.agents/skills/`, one folder each, `SKILL.md` inside. That folder is the
one source for every harness on the team. If yours loads skills from somewhere else, point it
here (a link or a config entry). Don't copy: copies drift.

Use `plan-to-issues` for approved issue decomposition and `publish-preview` for publication
or post-review cleanup through the existing Pages workflow.

## Rules

- Never commit `.env`, tokens or previews.
- Don't touch `runs/`: those are real nights, read-only fixtures.
- No client JS (ADR 0001).
