# Evidence on AGENTS.md

Checked 2026-10-24. The numbers below come from the primary sources linked in each section. Where a finding is narrow, the caveat is part of the finding.

## Controlled studies

### Gloaguen et al. 2026, ETH Zurich

"Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?"
https://arxiv.org/abs/2602.11988

- 138 CTXbench instances from 12 Python repositories that already had developer-committed context files, mined from 5,694 PRs. Plus SWE-bench Lite: 300 tasks from 11 popular Python repositories.
- Agents: Claude Code with Sonnet 4.5, Codex with GPT-5.2 and GPT-5.1 mini, Qwen Code with Qwen3-30B.
- LLM-generated files: success rate -0.5% on SWE-bench and -2% on CTXbench, both statistically insignificant (p=87% and p=37%). Cost +20% and +23%. Steps +2.45 and +3.92.
- Developer-written files: +2.4% success on average, p=21%, so not statistically significant. Cost up to +19%. They significantly outperformed LLM-generated files (p=3.8%).
- Instructions are well followed. That is why cost rises: the agent explores more, tests more, and reads the file repeatedly.
- Repository overviews did not help. 8 of 12 developer files had one; 4 enumerated directories. Context files did not reduce the steps needed to reach the files changed by the real PR.
- Authors' recommendation: omit LLM-generated context files. Human files should carry only instructions the agent cannot infer, such as non-standard conventions or non-functional requirements.

Caveat: Python repositories, single-task benchmark, well-documented open source. A curated file in a proprietary monorepo is outside the data. Inside it: plausible repository description costs more and gains no measured success.

### Lulla et al. 2026

"On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents"
https://arxiv.org/abs/2601.20404

- 10 repositories, 124 pull requests, agents run with and without AGENTS.md.
- Median runtime -28.64%. Output tokens -16.58%. Task completion behavior comparable.
- Interpretation: a good file reduces wandering and re-orientation. Correctness is outside the study's scope.

Caveat: efficiency metric. The task and repository mix differs from the ETH study. The two results fit together: short, specific files save time; generic files add cost.

### Santos et al. 2026, configuration smells

"Configuration Smells in AGENTS.md Files: Common Mistakes in Configuring Coding Agents"
https://arxiv.org/abs/2606.15828

- 100 popular repositories with AGENTS.md or CLAUDE.md. 91 files had at least one smell.
- Lint leakage: 62 instances, 93% precision. The file repeats what a linter or formatter already enforces.
- Context bloat: 42 instances. Threshold 200 lines. Largest file 1,477 lines.
- Skill leakage: 35 instances, 82% precision. Rare procedures and task-specific playbooks sit in the always-loaded file.
- Conflicting instructions: 28 detected, 16 confirmed, 57% precision. Two rules that cannot both be followed.
- Init fossilization: 24 instances. The file has one commit and was never updated while the repo moved.
- Blind references: 16 detected, 14 confirmed, 87% precision. A path or URL with no purpose or scope.
- Most leaked skills: testing (10), workflow (8), scaffolding (4), infrastructure (4), architecture (3).

Caveat: popular-repository dataset, January 2026. Some smells were detected by an LLM, so precision varies. Context bloat and init fossilization use fixed heuristics.

## Practitioner measurements

### AAIF 2026, five-run test

"Measuring AGENTS.md: What Five Runs Show That One Doesn't"
https://aaif.io/blog/measuring-agents-md-what-five-runs-show-that-one-doesn-t

- One repository, GitHub Copilot CLI, two tasks, five runs per condition, 12-line AGENTS.md.
- Ambiguous task: wall time -27%, credits -24%, diff size -26%.
- Multi-file task: median gain 9-10%. Two of five runs without the file wasted time re-orienting or ran an unrequested production build.
- The first single-run comparison showed the file 44% slower and 41% more expensive. Five-run medians reversed the sign.
- Concrete instructions beat aspirational ones. The winning file had a package manager, key commands, one generated-file boundary, and one line about staying scoped.

Caveat: one repository, one agent, two tasks. It shows measurement noise and where the wins come from; the effect size is local to that repo.

## Primary guidance

### agents.md

https://agents.md/

- Standard Markdown, no required fields.
- The nearest AGENTS.md in the directory tree wins.
- Nested files are the documented pattern for monorepos.
- More than 60,000 public repositories use the format.
- The site recommends project overview, build and test commands, code style, testing, and security considerations as common sections.

### OpenAI Codex

https://developers.openai.com/codex/guides/agents-md

- Discovery order: global file, then project root down to the current directory. One file per directory: `AGENTS.override.md` wins over `AGENTS.md`, and the other file in that directory is skipped.
- Global file: `$CODEX_HOME/AGENTS.override.md` or `$CODEX_HOME/AGENTS.md`, first non-empty one wins.
- The combined chain is capped at `project_doc_max_bytes`, 32 KiB by default. Past the cap, files are skipped.
- Verification: ask the agent to summarize the active instructions, or list the loaded sources.

### Claude Code

https://code.claude.com/docs/en/memory

- Target under 200 lines per file. Longer files consume more context and reduce adherence.
- Treat the file as context. Hooks, permissions, and CI enforce behavior.
- Add to the file when the agent makes the same mistake a second time, a review catches something it should have known, or a new teammate would need the same context.
- Files can import other files with `@path`, up to four hops. Imports do not reduce context cost because the imported files load together.
- Nested files load on demand when the agent works in that subtree.
- Multi-step procedures belong in a skill or path-scoped rule. Keep the always-loaded file free of them.
- HTML comments are stripped before injection, so maintainer notes can live in the file for free. This is documented for Claude Code only; treat comments as loaded text in other tools.

### GitHub, 2,500+ files

"How to write a great agents.md: Lessons from over 2,500 repositories"
https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/

- Commands early, with flags.
- Real code examples beat paragraphs describing style.
- Three-tier boundaries: Always, Ask first, Never.
- Name the stack and versions.
- Six areas: commands, testing, project structure, code style, git workflow, boundaries.
- "Never commit secrets" was the most common useful constraint.

Caveat: the worked example is a custom agent persona file under `.github/agents/`, so the post mixes repo-level instructions with agent definitions. Treat the six areas as a content checklist; the post is practitioner guidance and measures nothing.

## Real repository sizes

Line counts, byte counts, and what to steal from each file: `references/examples.md`. The range is the point: a small library can be complete in 21 lines, and a multi-language monorepo can justify 180-260.

## Source quality filter

Prefer:

- Actual AGENTS.md files in maintained repositories.
- Format specs and official agent documentation.
- Controlled studies with repository counts, task counts, success rates, and cost.
- Posts that link the repository, prompt, commands, and raw results.

Downgrade or ignore:

- SEO listicles, "ultimate guide" pages, and vendor posts that end in a product demo.
- Unsourced percentages, "10x productivity" claims, and before/after anecdotes with no setup.
- AI-written prose with em-dashes everywhere, forced contrast constructions, and no primary links.
- Summaries that cite a study but do not link it, or quote a number without the caveat.
- Anecdotes presented as universal rules.

When a claim matters, open the primary source. Record the number and the caveat together.
