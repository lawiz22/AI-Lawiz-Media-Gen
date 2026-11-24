# What real repositories do

Sizes measured 2026-10-24 from the default branch. Read these for judgment; the templates live in `assets/`.

## Root files

| Repository | Lines | Bytes | What it does well | What to steal |
|---|---:|---:|---|---|
| mark3labs/mcp-go | 21 | 1,739 | Commands, git policy, code style. Complete for a small Go library. | A short file is a finished file. |
| temporalio/sdk-java | 59 | 2,391 | Layout, Java 8 constraint, build and test commands, PR questions, review checklist. | Version constraints and the one command that saves a slow build. |
| grafana/alloy | 188 | 8,995 | Essential references with a purpose, MUST/MUST NOT/MAY process rules, docs playbooks, environment gotchas. | Process rules that are explicit about required, forbidden, and optional work. |
| kubernetes-sigs/agent-sandbox | 188 | 23,424 | Layout table, build/test matrix, generated code and regeneration, docs mounts, coding conventions, writing rules, PR/CI rules, things to avoid, pointers. | The "things to avoid" section and the generated-code regeneration flow. |
| grafana/grafana | 180 | 10,582 | Directory-scoped file list, principles, code review rules, human review gate, commands, architecture tables, environment gotchas. | A human review gate before push, and nested files for specialized areas. |
| apache/airflow | 251 | 22,567 | Generated command block, repository structure, architecture boundaries, security model, coding standards, testing standards, boundaries. | A security model section that tells reviewers which findings are known limitations. |
| rust-lang/rust | 258 | 13,435 | LLM usage policy, gates, external ownership, reviewer requirement, testing and soundness classification, mechanical rewrites, routing. | Stop conditions and policy gates when the project has real legal or process constraints. |
| n8n-io/n8n | 456 | 24,071 | Strong guidance on package boundaries, error types, persistence rules, and agent skills. | A warning about size: the root file has become project documentation. |

### What the sizes mean

- A 21-line library file is complete. The limits are in `SKILL.md`: root up to 150, split at 200. The content past that can be good and still cost too much on every task.

## Nested files

| Repository | File | Lines | What belongs there |
|---|---|---:|---|
| grafana/grafana | `pkg/storage/unified/AGENTS.md` | 30 | Client/server split, compatibility rules for mixed versions, code review rules for RPC errors. |
| apache/airflow | `airflow-core/src/airflow/ui/AGENTS.md` | 27 | Local commands, TypeScript rules, i18n rules. |
| openai/codex | `codex-rs/tui/src/bottom_pane/AGENTS.md` | 12 | Keep module docs in sync with the state machine; check that docs mention only existing APIs. |
| openai/codex | `codex-rs/exec-server/src/sandbox_integrity/AGENTS.md` | 48 | Scope, responsibilities, deliberate approximations, accepted limitations, eligibility. |

The pattern: the root file covers repo-wide commands and boundaries; the nested file covers a contract that only matters inside that subtree.

## Recurring patterns worth copying

1. **Commands first.** Exact strings with flags, a scoped test command, and a single-test command.
2. **Path to responsibility.** A table for the non-obvious directories. Mark generated paths.
3. **Generated code and regeneration.** The command that rebuilds the artifact, and the list of files nobody edits by hand.
4. **Architecture boundaries.** What must not cross a service, package, or deployment boundary.
5. **Security model.** Accepted risks, each confirmed by the user, and what reviewers should not report as a new vulnerability.
6. **Three-tier boundaries.** Always, Ask first, Never, with concrete commands and paths.
7. **Human review gates.** Stop before push or before destructive operations when the project requires it.
8. **Pointers with purpose.** Every link says what it contains and when to read it.
9. **Things to avoid.** The specific traps this repository has already hit.
10. **Review checklist.** What a PR reviewer must verify, written for the agent doing reviews.

## Links

- https://github.com/mark3labs/mcp-go/blob/main/AGENTS.md
- https://github.com/temporalio/sdk-java/blob/master/AGENTS.md
- https://github.com/grafana/alloy/blob/main/AGENTS.md
- https://github.com/kubernetes-sigs/agent-sandbox/blob/main/AGENTS.md
- https://github.com/grafana/grafana/blob/main/AGENTS.md
- https://github.com/grafana/grafana/blob/main/pkg/storage/unified/AGENTS.md
- https://github.com/apache/airflow/blob/main/AGENTS.md
- https://github.com/apache/airflow/blob/main/airflow-core/src/airflow/ui/AGENTS.md
- https://github.com/rust-lang/rust/blob/main/AGENTS.md
- https://github.com/n8n-io/n8n/blob/master/AGENTS.md
- https://github.com/openai/codex/blob/main/codex-rs/tui/src/bottom_pane/AGENTS.md
- https://github.com/openai/codex/blob/main/codex-rs/exec-server/src/sandbox_integrity/AGENTS.md
