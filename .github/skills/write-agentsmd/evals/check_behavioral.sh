#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nikita Chernyi <https://rakshazi.me>
# SPDX-License-Identifier: GPL-3.0-or-later
# Assertions for evals/behavioral.json. Usage: check_behavioral.sh WORKDIR SCENARIO
set -u

if [[ $# -ne 2 ]]; then
  printf 'usage: %s WORKDIR SCENARIO\n' "$0" >&2
  exit 2
fi
d=$1
scenario=$2
f=$d/AGENTS.md
base=$(git -C "$d" rev-list --max-parents=0 HEAD 2>/dev/null | tail -1)
[[ -n $base ]] || base=HEAD
pass=0
failed=0
ok() { pass=$((pass + 1)); printf 'ok   %s\n' "$1"; }
nope() { failed=$((failed + 1)); printf 'FAIL %s\n' "$1"; }
has() { if grep -q "$1" "$f" 2>/dev/null; then ok "$2"; else nope "$2"; fi; }
has_in() { if grep -qi "$1" "$2" 2>/dev/null; then ok "$3"; else nope "$3"; fi; }
lacks() { if grep -q "$1" "$f" 2>/dev/null; then nope "$2"; else ok "$2"; fi; }
lacks_ci() { if grep -qi "$1" "$f" 2>/dev/null; then nope "$2"; else ok "$2"; fi; }

if [[ ! -f $f ]]; then
  printf 'FAIL missing %s\n' "$f"
  exit 1
fi

case $scenario in
  audit-existing)
    if grep -qE 'ghp_[A-Za-z0-9]{20,}|API_TOKEN=' "$f"; then
      nope "secret removed from AGENTS.md"
    else
      ok "secret removed from AGENTS.md"
    fi
    lacks "scripts/lint.sh" "dead lint command removed"
    lacks_ci "known bug" "known-bug caveat removed"
    lacks "ZeroDivisionError" "bug not parked in AGENTS.md"
    if [[ -f $d/TODO_BEFORE_SHIPPING.md ]]; then
      ok "TODO_BEFORE_SHIPPING.md created"
      has_in "average" "$d/TODO_BEFORE_SHIPPING.md" "TODO names the function"
      has_in "empty" "$d/TODO_BEFORE_SHIPPING.md" "TODO names the trigger"
      has_in "ZeroDivisionError" "$d/TODO_BEFORE_SHIPPING.md" "TODO names the failure"
    else
      nope "TODO_BEFORE_SHIPPING.md created"
    fi
    if git -C "$d" diff --quiet "$base" -- src/calc.py 2>/dev/null; then
      ok "planted bug left unfixed"
    else
      nope "planted bug left unfixed"
    fi
    if git -C "$d" diff --quiet "$base" -- src/zz_generated_ids.py 2>/dev/null; then
      ok "generated file untouched"
    else
      nope "generated file untouched"
    fi
    has "zz_generated_ids" "generated file named"
    if grep -qiE 'generated|do not edit' "$f"; then
      ok "generated file marked"
    else
      nope "generated file marked"
    fi
    has "scripts/gen.sh" "regeneration command named"
    has "unittest discover" "working test command kept"
    lines=$(wc -l < "$f")
    if (( lines <= 80 )); then ok "file is $lines lines (80 max)"; else nope "file is $lines lines (80 max)"; fi
    if ( cd "$d" && python3 -m unittest discover -s src >/dev/null 2>&1 ); then
      ok "documented test command still passes"
    else
      nope "documented test command still passes"
    fi
    ;;
  small-edit)
    if [[ -e $d/TODO_BEFORE_SHIPPING.md ]]; then
      nope "small edit did not start a TODO list"
    else
      ok "small edit did not start a TODO list"
    fi
    if git -C "$d" diff --quiet "$base" -- src/calc.py 2>/dev/null; then
      ok "small edit left the planted bug alone"
    else
      nope "small edit left the planted bug alone"
    fi
    num=$(git -C "$d" diff "$base" --numstat -- AGENTS.md 2>/dev/null)
    if [[ $num == $'1\t0\tAGENTS.md' ]]; then
      ok "exactly one line added to AGENTS.md"
    else
      nope "exactly one line added to AGENTS.md"
    fi
    changed=$(git -C "$d" status --porcelain --untracked-files=all 2>/dev/null)
    count=$(printf '%s\n' "$changed" | grep -c . || true)
    if (( count == 1 )) && [[ $changed == *AGENTS.md ]]; then
      ok "no other file changed"
    else
      nope "no other file changed"
    fi
    has "API_TOKEN=" "small edit left unrelated lines alone"
    ;;
  *)
    printf 'unknown scenario: %s\n' "$scenario" >&2
    exit 2
    ;;
esac

printf '\n%d passed, %d failed\n' "$pass" "$failed"
(( failed == 0 ))
