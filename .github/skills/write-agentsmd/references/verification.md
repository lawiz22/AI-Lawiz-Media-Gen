# Verification

The cheap default check is in `SKILL.md`. Load this when the user asks for evidence, or when the file guards an expensive workflow.

## Quantified comparison

1. Pick one ambiguous task and one multi-file task from the backlog.
2. Run each condition on the same starting commit: once with the full chain, once without. Remove the root and nested `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md` imports or symlinks, and Copilot instructions, or use a clean checkout without them.
3. Compare success, wall time, tokens or credits, diff size, and files touched.
4. Run each condition at least five times and compare medians. One run is noise; a single-run result has flipped sign in practice.
5. One line changed per condition. Two edits in one condition hide which one moved the result; a pair graded as a gain has carried a regression.
6. Two conditions, two tasks, and five runs is 20 agent runs. Budget for that before starting.
7. A throwaway repo with no backlog and no git baseline cannot support this comparison. Say the file is unverified and hand it off.
8. Reading a failed run: `SKILL.md`, Verify step 4.
