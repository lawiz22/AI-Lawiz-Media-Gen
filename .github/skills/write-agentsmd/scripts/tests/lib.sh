#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nikita Chernyi <https://rakshazi.me>
# SPDX-License-Identifier: GPL-3.0-or-later
# Shared harness for the audit test suites.
set -u

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
audit=$root/scripts/audit.sh
tmp=$(mktemp -d) || exit 1
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home"
mkdir -p "$HOME" "$tmp/codex-default"
export CODEX_HOME="$tmp/codex-default"
export GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

pass=0
failed=0
ok() { pass=$((pass + 1)); printf 'ok   %s\n' "$1"; }
nope() { failed=$((failed + 1)); printf 'FAIL %s\n' "$1"; [[ -n ${2:-} ]] && printf '%s\n' "$2" | sed 's/^/     /'; }
check_contains() { case $2 in *"$1"*) ok "$3" ;; *) nope "$3" "$2" ;; esac; }
check_absent() { case $2 in *"$1"*) nope "$3" "$2" ;; *) ok "$3" ;; esac; }
check_rc() { if [[ $2 -eq $1 ]]; then ok "$3"; else nope "$3" "expected rc $1, got $2"; fi; }

run() {
  local d=$1
  shift
  ( cd "$d" && bash "$audit" "$@" 2>&1 )
}

gitinit() {
  git init -q "$1"
  git -C "$1" add -A
  git -C "$1" commit -qm init
}

write_agents() {
  local d=$1 body=$2
  mkdir -p "$d"
  printf '%s\n' "$body" > "$d/AGENTS.md"
}

finish() {
  printf '\n%d passed, %d failed\n' "$pass" "$failed"
  (( failed == 0 ))
}
