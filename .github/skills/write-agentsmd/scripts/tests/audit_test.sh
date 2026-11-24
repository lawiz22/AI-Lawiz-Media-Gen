#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nikita Chernyi <https://rakshazi.me>
# SPDX-License-Identifier: GPL-3.0-or-later
# shellcheck disable=SC2016,SC1091,SC2154
# Core regression suite for scripts/audit.sh. Run: bash scripts/tests/run.sh
set -u
# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

# Root-level init fossilization used to pass an empty relative path to git log.
d=$tmp/root-fossil
write_agents "$d" '# Demo

## Commands

- Test: `true`'
gitinit "$d"
out=$(run "$d" AGENTS.md); rc=$?
check_rc 0 "$rc" "root fossilization: exits 0"
check_contains "only one commit touches AGENTS.md" "$out" "root fossilization: root pathspec is a bare filename"
check_contains "init fossilization risk" "$out" "root fossilization: warning fires"

# Nested files keep working.
d=$tmp/nested-fossil
write_agents "$d/pkg" '# pkg

## Verify

`true`'
gitinit "$d"
out=$(run "$d/pkg" AGENTS.md); rc=$?
check_rc 0 "$rc" "nested fossilization: exits 0"
check_contains "only one commit touches pkg/AGENTS.md" "$out" "nested fossilization: warning fires"

# Missing parent directory must be reported with and without a trailing slash.
d=$tmp/missing-dir
write_agents "$d" '# Demo

## Commands

- Test: `true`

## Layout

- `src/nothere/` - deleted subtree.
- `src/nothere` - same path without a trailing slash.'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 0 "$rc" "missing top-level dir: warning only"
check_contains "missing relative path: src/nothere/" "$out" "missing top-level dir: trailing slash reported"
check_contains "missing relative path: src/nothere" "$out" "missing top-level dir: bare path reported"
out=$(run "$d" --strict AGENTS.md); rc=$?
check_rc 1 "$rc" "missing top-level dir: strict fails"
check_contains "strict: 2 warning(s)" "$out" "missing top-level dir: strict summary"

# Override files join the chain and shadow the plain file.
d=$tmp/override-chain
write_agents "$d" '# Demo

## Commands

- Test: `true`'
head -c 33000 /dev/zero | tr '\0' 'x' > "$d/AGENTS.override.md"
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "override chain: exits 1"
check_contains "AGENTS.override.md shadows this file" "$out" "override chain: shadow warning"
check_contains "combined chain is" "$out" "override chain: chain includes override"
check_contains "AGENTS.override.md" "$out" "override chain: override named"

# The Codex global file counts toward the chain.
d=$tmp/global-chain
write_agents "$d" '# Demo

## Commands

- Test: `true`'
mkdir -p "$tmp/codex"
head -c 33000 /dev/zero | tr '\0' 'x' > "$tmp/codex/AGENTS.md"
out=$(cd "$d" && CODEX_HOME="$tmp/codex" bash "$audit" AGENTS.md 2>&1); rc=$?
check_rc 1 "$rc" "global chain: exits 1"
check_contains "codex/AGENTS.md" "$out" "global chain: global file named"

# An empty global override falls back to the non-empty global AGENTS.md.
d=$tmp/global-empty
write_agents "$d" '# Demo

## Commands

- Test: `true`'
mkdir -p "$tmp/codex-empty"
: > "$tmp/codex-empty/AGENTS.override.md"
head -c 33000 /dev/zero | tr '\0' 'x' > "$tmp/codex-empty/AGENTS.md"
out=$(cd "$d" && CODEX_HOME="$tmp/codex-empty" bash "$audit" AGENTS.md 2>&1); rc=$?
check_rc 1 "$rc" "empty global override: exits 1"
check_contains "codex-empty/AGENTS.md" "$out" "empty global override: falls back to AGENTS.md"
check_absent "codex-empty/AGENTS.override.md" "$out" "empty global override: override not counted"

# The raw template fails strict and passes default.
d=$tmp/template
mkdir -p "$d"
cp "$root/assets/template.md" "$d/AGENTS.md"
out=$(run "$d" AGENTS.md); rc=$?
check_rc 0 "$rc" "raw template: default exits 0"
out=$(run "$d" --strict AGENTS.md); rc=$?
check_rc 1 "$rc" "raw template: strict exits 1"
check_contains "template placeholder" "$out" "raw template: placeholders reported"

# Style checks are opt-in.
d=$tmp/style
mkdir -p "$d"
printf '# Demo\n\n## Commands\n\n- Test: `true`\n\nCaf\xc3\xa9 and a \xe2\x80\x94 b.\n' > "$d/AGENTS.md"
out=$(run "$d" AGENTS.md); rc=$?
check_rc 0 "$rc" "style: default exits 0"
check_absent "em or en dash" "$out" "style: dash check off by default"
check_absent "non-ASCII" "$out" "style: ASCII check off by default"
out=$(run "$d" --style AGENTS.md); rc=$?
check_rc 0 "$rc" "style: opt-in exits 0"
check_contains "em or en dash" "$out" "style: dash check opt-in"
check_contains "non-ASCII" "$out" "style: ASCII check opt-in"

# Command extraction prints commands and skips plain paths.
d=$tmp/extract
mkdir -p "$d"
cat > "$d/AGENTS.md" <<'EOF'
# Demo

## Commands

```bash
go test ./...
# this is a comment
```

Run `just lint` or read `src/app.py`.
EOF
out=$(run "$d" --extract-commands AGENTS.md); rc=$?
check_rc 0 "$rc" "extract: exits 0"
check_contains "candidate commands in AGENTS.md" "$out" "extract: header printed"
check_contains "go test ./..." "$out" "extract: fenced command printed"
check_contains "just lint" "$out" "extract: inline command printed"
check_absent "src/app.py" "$out" "extract: plain path skipped"
check_absent "this is a comment" "$out" "extract: fenced comment skipped"

# Bad invocations.
d=$tmp/invoke
write_agents "$d" '# Demo

## Commands

- Test: `true`'
out=$(run "$d" --nope AGENTS.md); rc=$?
check_rc 2 "$rc" "bad flag: exits 2"
out=$(run "$d" missing.md 2>&1); rc=$?
check_rc 2 "$rc" "missing file: exits 2"
check_contains "write it first" "$out" "missing file: says what to do"
check_absent "Exit codes:" "$out" "missing file: no usage dump"
out=$(run "$d" --strict --extract-commands AGENTS.md); rc=$?
check_rc 2 "$rc" "conflicting flags: exits 2"

# Words inside a command, ~/ paths, .git paths, and ../ paths outside the repo are not stale paths.
d=$tmp/path-shapes
write_agents "$d" '# Demo

## Commands

- Build: `go build -o build/app ./cmd/app`
- Reset: `kubectl delete pvc/data-pg-0`
- Config: `~/.config/tool/config.toml`

## Landmines

- Builds ignore `.git/index.lock`.
- Sibling checkout: `../sibling-repo`.
- Gone: `src/nothere.go`.'
gitinit "$d"
out=$(run "$d" AGENTS.md); rc=$?
check_rc 0 "$rc" "path shapes: exits 0"
check_absent "missing relative path: build/app" "$out" "path shapes: command word skipped"
check_absent "missing relative path: pvc/data-pg-0" "$out" "path shapes: kubectl resource skipped"
check_absent "missing relative path: ~/.config" "$out" "path shapes: home path skipped"
check_absent "missing relative path: .git/index.lock" "$out" "path shapes: .git path skipped"
check_absent "missing relative path: ../sibling-repo" "$out" "path shapes: sibling checkout skipped"
check_contains "missing relative path: src/nothere.go" "$out" "path shapes: stale path still reported"

# A ../ path that stays inside the repo is still checked from a nested file.
d=$tmp/nested-dotdot
write_agents "$d/pkg" '# pkg

## Verify

`true`

See `../docs/nothere.md`.'
gitinit "$d"
out=$(run "$d/pkg" AGENTS.md); rc=$?
check_contains "missing relative path: ../docs/nothere.md" "$out" "nested dotdot: in-repo ../ path reported"

# A git-ignored path is build output or per-engineer config, absent from a clean checkout on purpose.
d=$tmp/ignored-path
write_agents "$d" '# app

## Commands

- Test: `go test ./...`

## Layout

| Path | What lives there |
|---|---|
| `build/ht` | compiled by `make ht build` |
| `local/overrides.toml` | per-engineer config |
| `src/nothere.go` | stale |'
printf '/build/\nlocal/\n' > "$d/.gitignore"
gitinit "$d"
out=$(run "$d" AGENTS.md); rc=$?
check_absent "missing relative path: build/ht" "$out" "gitignored: build output skipped"
check_absent "missing relative path: local/overrides.toml" "$out" "gitignored: per-engineer config skipped"
check_contains "missing relative path: src/nothere.go" "$out" "gitignored: tracked stale path still reported"

# Every contrast-negation shape fires under --style; an em dash counts once.
# The fixture spells the keyword through a variable so the suite itself passes a prose scan.
d=$tmp/style-shapes
nw=not
emdash=$(printf '\xe2\x80\x94')
write_agents "$d" "# Demo

## Commands

- Test: \`true\`

## Notes

- Use pnpm, $nw npm.
- This is $nw just a cache but a database.
- This isn't a bug. It's a feature.
- It's $nw the cache, it's the DB.
- Do $nw use npm; use pnpm.
- Plain line with a dash $emdash here."
out=$(run "$d" --style AGENTS.md); rc=$?
check_contains "- Use pnpm," "$out" "style shapes: comma-$nw reported"
check_contains "just a cache but" "$out" "style shapes: $nw-just-but reported"
check_contains "a bug. It's" "$out" "style shapes: period split reported"
check_contains "the cache, it's" "$out" "style shapes: $nw-A-its-B reported"
check_contains "use npm; use pnpm" "$out" "style shapes: do-$nw-use reported"
count=$(printf '%s\n' "$out" | grep -c 'with a dash')
check_rc 1 "$count" "style shapes: em dash reported once"

# Task-runner targets must exist in the runner's file; a fitting name that does not exist is a fabrication.
d=$tmp/runner-targets
mkdir -p "$d"
printf 'build:\n\t@true\n\ntest lint: build\n\t@true\n\nFOO := bar\n' > "$d/Makefile"
printf '{\n  "name": "x",\n  "scripts": {\n    "check": "true"\n  },\n  "dependencies": {\n    "deploy": "1.0.0"\n  }\n}\n' > "$d/package.json"
write_agents "$d" '# Demo

## Commands

- Build: `make build`
- Test: `make test && make lint`
- Deploy: `make deploy`
- Check: `npm run check`
- Ship: `pnpm run deploy`

```bash
make -C sub build
make release
```'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 0 "$rc" "runner targets: warning only"
check_contains "unknown make target: deploy" "$out" "runner targets: missing make target reported"
check_contains "unknown make target: release" "$out" "runner targets: fenced block scanned"
check_absent "unknown make target: build" "$out" "runner targets: existing target passes"
check_absent "unknown make target: lint" "$out" "runner targets: multi-target rule parsed"
check_absent "unknown make target: sub" "$out" "runner targets: flag argument skipped"
check_absent "unknown make target: FOO" "$out" "runner targets: variable assignment is no target"
check_contains "unknown npm script: deploy" "$out" "runner targets: dependency name is no script"
check_absent "unknown npm script: check" "$out" "runner targets: existing script passes"

# A catch-all rule is named in the warning; an included makefile contributes targets.
d=$tmp/runner-catchall
mkdir -p "$d"
printf 'include extra.mk\n\nhelp:\n\t@true\n\n%%:\n\t@:\n' > "$d/Makefile"
printf 'extra:\n\t@true\n' > "$d/extra.mk"
write_agents "$d" '# Demo

## Commands

- Help: `make help`, `make extra`, `make tset`'
out=$(run "$d" AGENTS.md); rc=$?
check_contains "make target tset has no rule; the %: catch-all takes it" "$out" "runner targets: catch-all named"
check_absent "make target extra" "$out" "runner targets: included makefile parsed"
check_absent "make target help" "$out" "runner targets: catch-all keeps real targets quiet"

# A runner referenced with no runner file anywhere.
d=$tmp/runner-none
write_agents "$d" '# Demo

## Commands

- Build: `make build`'
out=$(run "$d" AGENTS.md); rc=$?
check_contains "make referenced and no Makefile found" "$out" "runner targets: missing Makefile reported"

# A template example left in the file.
d=$tmp/example-leak
write_agents "$d" '# Demo

Go service; tests need the mainframe emulator on :3270.

## Commands

- Test: `true`'
out=$(run "$d" AGENTS.md); rc=$?
check_contains "template example copied" "$out" "example leak: reported"

# The shipped example passes its own checker: every path and target it names exists in a fixture tree.
d=$tmp/example-self
mkdir -p "$d/src/tables" "$d/src/solve" "$d/harness/tests/soak" "$d/harness/tests/regress" "$d/harness/vendor/pyemu" "$d/harbour" "$d/docs" "$d/bin"
touch "$d/harbour/index.txt" "$d/harbour/falmouth.dat" "$d/docs/solver.md" "$d/bin/solver"
printf 'test:\nlint:\ntables-check:\nsolver:\ntables:\nemu:\npublish:\n' > "$d/Makefile"
cp "$root/assets/example.md" "$d/AGENTS.md"
out=$(run "$d" AGENTS.md); rc=$?
check_rc 0 "$rc" "example self-check: default exits 0"
check_absent "missing relative path" "$out" "example self-check: every path exists"
check_absent "unknown make target" "$out" "example self-check: every make target exists"
check_absent "template placeholder" "$out" "example self-check: no placeholder slot"
check_absent "vague advice" "$out" "example self-check: no vague advice"
check_contains "template example copied" "$out" "example self-check: the leak check knows the example"

# The last line is the handoff contract.
d=$tmp/lastline
write_agents "$d" '# Demo

## Commands

- Test: `true`'
out=$(run "$d" AGENTS.md); rc=$?
last=$(printf '%s\n' "$out" | tail -n 1)
check_contains "audit: exit 0 (0 warnings)" "$last" "last line: audit summary on a clean file"
out=$(run "$d" --strict AGENTS.md)
last=$(printf '%s\n' "$out" | tail -n 1)
check_contains ", strict)" "$last" "last line: strict is named"

# A body copied from another context file in the repository is a hard failure.
d=$tmp/copied
mkdir -p "$d/pkg"
printf '# Canon for every service\n\n' > "$d/pkg/AGENTS.md"
for i in 1 2 3 4 5 6 7 8; do printf -- '- Rule number %s: a long enough line to count as content, kept verbatim across files.\n' "$i" >> "$d/pkg/AGENTS.md"; done
cp "$d/pkg/AGENTS.md" "$d/AGENTS.md"
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "copied body: exits 1"
check_contains "copied from pkg/AGENTS.md" "$out" "copied body: source named"
d=$tmp/not-copied
mkdir -p "$d/pkg"
cp "$tmp/copied/pkg/AGENTS.md" "$d/pkg/AGENTS.md"
write_agents "$d" '# Demo

## Commands

- Test: `true`
- Rule number 1: a long enough line to count as content, kept verbatim across files.
- One of these lines is shared with the package file; the rest are this file alone, line a.
- One of these lines is shared with the package file; the rest are this file alone, line b.
- One of these lines is shared with the package file; the rest are this file alone, line c.
- One of these lines is shared with the package file; the rest are this file alone, line d.'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 0 "$rc" "one shared line: exits 0"
check_absent "copied from" "$out" "one shared line: no copy report"

# The ledger: missing, malformed, uncovered command, covered command.
d=$tmp/ledger
write_agents "$d" '# Demo

## Commands

- Test: `go test ./...`
- Full check: `go vet ./... && go test ./...`
- Deploy: `make deploy`'
printf 'deploy:\n' > "$d/Makefile"
out=$(run "$d" --ledger AGENTS.ledger.md AGENTS.md); rc=$?
check_rc 1 "$rc" "ledger missing: exits 1"
check_contains "ledger missing or empty" "$out" "ledger missing: reported"
printf 'kind fact\n' > "$d/AGENTS.ledger.md"
out=$(run "$d" --ledger AGENTS.ledger.md AGENTS.md); rc=$?
check_contains "ledger has no | kind | fact | source | ran | header" "$out" "ledger malformed: reported"
printf '| kind | fact | source | ran |\n|---|---|---|---|\n| command | `go test ./...` | Makefile:3 | 0 |\n| landmine | `make deploy` | README.md:9 | - |\n' > "$d/AGENTS.ledger.md"
out=$(run "$d" --ledger AGENTS.ledger.md AGENTS.md); rc=$?
check_rc 1 "$rc" "ledger uncovered: exits 1"
check_contains "ledger row that ran or was deferred (ran = exit code or ask): go vet ./..." "$out" "ledger uncovered: chain segment named"
check_contains "ran or was deferred (ran = exit code or ask): make deploy" "$out" "ledger uncovered: landmine row does not cover a command"
printf '| kind | fact | source | ran |\n|---|---|---|---|\n| command | `timeout 120 go test ./...` | Makefile:3 | 0 |\n| command | `go vet ./...` | Makefile:4 | 0 |\n| boundary | `make deploy` | Makefile:9 | ask |\n' > "$d/AGENTS.ledger.md"
out=$(run "$d" --ledger AGENTS.ledger.md AGENTS.md); rc=$?
check_rc 0 "$rc" "ledger covered: exits 0"
check_absent "ledger row" "$out" "ledger covered: nothing reported"
check_contains "ledger: 3 rows, 2 commands ran, 0 failed, 1 deferred to the user; removed" "$out" "ledger clean: counts printed"
[[ ! -e $d/AGENTS.ledger.md ]] && ok "ledger clean: ledger removed" || nope "ledger clean: ledger removed"
case $(printf '%s\n' "$out" | tail -n 1) in "audit: exit 0"*) ok "ledger clean: audit line stays last" ;; *) nope "ledger clean: audit line stays last" "$out" ;; esac
# A strict warning with no hard failure still removes the ledger.
printf '| kind | fact | source | ran |\n|---|---|---|---|\n| command | `timeout 120 go test ./...` | Makefile:3 | 0 |\n| command | `go vet ./...` | Makefile:4 | 0 |\n| boundary | `make deploy` | Makefile:9 | ask |\n' > "$d/AGENTS.ledger.md"
printf -- '- Config: `_env/dev.toml`\n' >> "$d/AGENTS.md"
out=$(run "$d" --strict --ledger AGENTS.ledger.md AGENTS.md); rc=$?
check_rc 1 "$rc" "ledger warn-only: strict still exits 1"
[[ ! -e $d/AGENTS.ledger.md ]] && ok "ledger warn-only: ledger removed" || nope "ledger warn-only: ledger removed" "$out"
check_contains "warnings left are notes for the user" "$out" "ledger warn-only: told to stop"
# In a git repo a rerun after removal passes; a failing audit keeps the ledger.
d=$tmp/ledger-done
write_agents "$d" '# Demo

## Commands

- Test: `go test ./...`
- Vet: `go vet ./...`'
printf '| kind | fact | source | ran |\n|---|---|---|---|\n| command | `go test ./...` | Makefile:3 | 0 |\n' > "$d/AGENTS.ledger.md"
gitinit "$d"
out=$(run "$d" --ledger AGENTS.ledger.md AGENTS.md); rc=$?
check_rc 1 "$rc" "ledger uncovered command: exits 1"
[[ -e $d/AGENTS.ledger.md ]] && ok "ledger failing audit: ledger kept" || nope "ledger failing audit: ledger kept"
printf '| command | `go vet ./...` | Makefile:4 | 0 |\n' >> "$d/AGENTS.ledger.md"
run "$d" --ledger AGENTS.ledger.md AGENTS.md >/dev/null
out=$(run "$d" --ledger AGENTS.ledger.md AGENTS.md); rc=$?
check_rc 0 "$rc" "ledger rerun after removal: exits 0"
check_contains "removed after an earlier clean audit" "$out" "ledger rerun after removal: noted"
out=$(run "$d" --ledger 2>&1); rc=$?
check_rc 2 "$rc" "ledger flag without a path: exits 2"
# Auditing the ledger as the file once printed "removed, the work is done" with no AGENTS.md written.
printf '| kind | fact | source | ran |\n|---|---|---|---|\n' > "$d/AGENTS.ledger.md"
out=$(run "$d" --ledger AGENTS.ledger.md AGENTS.ledger.md 2>&1); rc=$?
check_rc 2 "$rc" "ledger as the file: exits 2"
[[ -e $d/AGENTS.ledger.md ]] && ok "ledger as the file: ledger kept" || nope "ledger as the file: ledger kept" "$out"

# Editing a tracked repo file fails.
d=$tmp/ledger-gates
write_agents "$d" '# Demo

## Commands

- Test: `go test ./...`'
printf 'x\n' > "$d/README.md"
printf '| kind | fact | source | ran |\n|---|---|---|---|\n| command | `go test ./...` | Makefile:3 | 0 |\n' > "$d/AGENTS.ledger.md"
gitinit "$d"
printf 'y\n' > "$d/README.md"
out=$(run "$d" --ledger AGENTS.ledger.md AGENTS.md); rc=$?
check_rc 1 "$rc" "repo edit: exits 1"
check_contains "repository file modified: README.md" "$out" "repo edit: reported"
check_absent "repository file modified: AGENTS" "$out" "repo edit: own files allowed"

# Static guard against bash 4-only idioms.
if grep -qE 'declare -A|declare -n|mapfile|readarray|local -n|&>>|coproc|wait -n|\$\{[A-Za-z_][A-Za-z0-9_]*(\^\^?|,,?|@[QEPAa])' "$audit"; then
  nope "bash 3.2 compatibility: bash 4-only idiom found"
else
  ok "bash 3.2 compatibility: no bash 4-only idiom"
fi

finish
