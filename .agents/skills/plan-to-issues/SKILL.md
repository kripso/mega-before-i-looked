---
name: plan-to-issues
description: Split this repo's plan.md into GitHub issues with gh, one per unit of work, after a human has reviewed the split. Use when a plan is ready and has no issues yet.
---

# plan-to-issues

Turns `plan.md` into GitHub issues that workers can pick up cold. Easiest with `gh`, authenticated,
in a shell this agent can run.

## Steps

1. Read `plan.md`, the [issue contract](../../../AGENTS.md#issue-contract), and `docs/adr/`.
   The contract is the single source for issue fields, plan labels, ownership and completion gates.
2. Draft one issue per unit of work. Show a table with title, source section, scope/owned files,
   done when, start after and finish after. Separate work that can start against a type contract
   from work that must wait for its implementation before it can finish. Include a review-confirmation
   issue or finish gate when another person must inspect a preview; cleanup waits for that signal.
3. **Stop and show the table to the human.** Publish nothing until they approve it.
4. Reuse the contract's settled field choices. Ask only about material exceptions or unclear
   outcomes, not the same issue-format question again. Draft bodies must follow the contract too.
5. After approval, create issues in dependency order with the plan label, so dependencies can
   cite real numbers. Never turn a draft reference into an invented GitHub issue number.

   ```sh
   gh issue create --title "<title>" --body-file <tmp.md> --label "plan:<plan>"
   ```

6. Record every issue URL from gh's output (not from memory) and reply with the list.

Use `refs #n` rather than an automatic closing commit while a gate is pending.
Close only after both its checks and finish gates hold, with the closing comment from AGENTS.md:

```sh
gh issue close <n> -c "<closing comment>"
```

## No `gh`

Steps 1–4 hold either way. GitHub reachable another way (a connector, the REST API, the web UI):
the same issues, made that way. GitHub issues out of reach altogether: write them as files in
`docs/issues/`, format in ADR 0004, then commit and push.

## Don'ts

- Don't paste the whole plan into one issue, and don't keep issues only in chat.
- Don't invent sections the plan doesn't have. A derived review/wait unit cites the existing
  review section. If the outcome or review signal is unclear, ask.
- Don't close a review issue merely because the preview was uploaded or its link was sent.
