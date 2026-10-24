# Five AI Development Prompts for Auto LM

These prompts are designed to be used in order with a coding agent. They move from project discovery to a working foundation, core workflows, and one carefully scoped feature. Each prompt asks the agent to inspect the existing repository first, preserve its conventions, make a focused change, and report verifiable results.

## Should the first prompt be broad?

Start broad about the product goal and constraints, but make the first coding task discovery and planning rather than asking the agent to build the whole product at once. A broad product brief gives the agent room to understand the system; smaller implementation steps make changes easier to review and validate. OpenAI's coding guidance emphasizes clear responsibilities, codebase exploration, and delivering working changes. Google's engineering guidance recommends focused changes, appropriate tests, and consistency with the surrounding code.

## Prompt 1 — Understand the product and repository

```text
You are the senior product engineer helping build Auto LM, a Persian-language vehicle inspection application. First inspect this repository and its documentation. Do not change files yet.

Product context:
- The product includes a right-to-left Persian inspector app, an admin panel, a Node.js backend with SQLite persistence, and a ChatGPT/MCP plugin in `auto-lm-plugin/`.
- The inspection workflow records vehicle details and 16 inspection items. Findings must distinguish explicitly reported facts from items that were not checked; never infer that an unmentioned item is healthy.
- The local app and plugin have different deployment and data flows. Follow the relevant README for the area under discussion.

Review the entry points, data model, API boundaries, authentication/authorization, UI structure, and existing tests. Then give me:
1. A concise map of the main components and how data flows between them.
2. The existing conventions and constraints a contributor must preserve.
3. The most important risks or missing information you found, with file references.
4. A short, ordered implementation plan for a small first release. Separate confirmed facts from assumptions.

Do not invent requirements or propose a rewrite. Ask a question only if a missing decision blocks a safe plan; otherwise state a reasonable assumption.
```

## Prompt 2 — Define and build the smallest useful foundation

```text
Using the repository findings and product context, implement the smallest useful foundation for Auto LM. Before coding, state the user problem, the included scope, and explicit non-goals in a few bullets. Keep the change focused and compatible with the existing stack and project conventions.

The foundation must let an inspector sign in, enter vehicle details, save an inspection draft, and return to that draft. Keep the existing 16-item inspection structure and Persian RTL experience. Use the existing Node.js and SQLite approach for the local app; do not introduce a framework or external dependency unless the repository provides a clear reason.

Requirements:
- Inspect the current code before editing and extend existing modules rather than duplicating them.
- Preserve server-side ownership checks and validate input at the API boundary.
- Keep unreported inspection items unknown; do not convert missing data into a healthy result.
- Include focused tests for new behavior and update user documentation if setup or usage changes.
- Run the relevant existing checks and report exact commands and outcomes. Do not claim a check passed if it was not run.

Implement the foundation, then summarize changed files, key decisions, checks, and known limitations.
```

## Prompt 3 — Complete the inspection workflow

```text
Continue from the current Auto LM repository. Improve the inspector's end-to-end workflow for completing a vehicle inspection, using the existing UI and backend patterns.

The workflow should make it clear which of the 16 items are complete, allow an inspector to save a draft and resume it, preserve confirmed notes, and prevent a final report from presenting incomplete findings as complete. Maintain the current Persian right-to-left interface and mobile behavior. Keep the inspection scoring rules and report wording consistent with the existing product documentation.

First trace the current workflow across UI, API, persistence, and report generation. Then implement only the changes needed to meet the workflow goal. Include appropriate validation and focused tests for completion, incomplete submissions, and draft recovery. Update documentation for any user-visible behavior change.

Do not redesign unrelated screens or change scoring semantics. At the end, describe the user-visible behavior, files changed, checks run, and any remaining edge cases.
```

## Prompt 4 — Review privacy, access control, and reliability

```text
Perform a focused security and reliability review of the Auto LM change made so far, including the local app, admin area, API, SQLite persistence, and `auto-lm-plugin/` only where relevant. Read the applicable README and inspect the actual code; do not assume that documentation proves an implementation detail.

Check especially:
- Authentication and role/ownership checks on every read and write path.
- Input validation, safe error responses, session handling, and protection against cross-origin writes.
- Whether plugin reports preserve evidence provenance and leave unmentioned items unchecked.
- Persistence behavior during restart, concurrent updates, and malformed or stale input.
- Whether tests cover the important security and failure cases.

Fix concrete issues that are in scope and can be safely corrected in a focused change. Avoid broad rewrites. Add or update tests for each fixed behavior, run the relevant checks, and document any issue that needs a separate decision. Report findings by severity and cite file paths; distinguish verified issues from potential risks.
```

## Prompt 5 — Add a scoped feature: compare two inspections

```text
Add a feature to Auto LM that lets an authorized inspector compare two saved inspections for the same vehicle. This is a read-only comparison to help users see what changed between visits; it must not diagnose the vehicle or claim that a change was caused by a particular event.

Feature behavior:
- Let the user choose two inspections for the same vehicle from their accessible history.
- Show the date and recorded value/status for each inspection side by side for vehicle details and all 16 inspection items.
- Mark each item as unchanged, changed, newly recorded, or still unknown based only on stored data. Keep notes and report provenance visible where relevant.
- Do not compare records belonging to another inspector unless the current authorization model explicitly grants access.
- If either inspection is incomplete, label it as incomplete and do not imply that missing items are healthy.
- Support the existing Persian RTL and mobile layouts. Provide a useful empty state when there are not two eligible inspections.

Before implementation, inspect how vehicle identity, history, authorization, and inspection statuses are represented. Propose the smallest UI/API change that fits the current architecture, then implement it. Add focused tests for permission boundaries, incomplete records, changed and unchanged values, and unknown values. Update documentation and report the checks you actually ran.

Do not add a new scoring model, infer mechanical causes, or modify stored inspection results as part of comparison.
```

## References

- OpenAI, [Codex Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide): codebase exploration, clear task framing, autonomy, and working changes.
- OpenAI, [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering): role clarity, structured instructions, and validation expectations.
- Google Engineering Practices, [Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html): focused changes and related test coverage.
- Google Engineering Practices, [What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html): design, functionality, tests, consistency, and documentation.

These are practical adaptations of engineering guidance, not a claim that any company has published or certified this exact five-prompt sequence.
