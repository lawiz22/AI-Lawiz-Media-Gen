#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nikita Chernyi <https://rakshazi.me>
# SPDX-License-Identifier: GPL-3.0-or-later
# Mechanical audit for an AGENTS.md. Warnings invite human review; --strict turns them into failures.
set -u

usage() {
  cat <<'EOF'
Usage: scripts/audit.sh [--root|--nested] [--strict] [--style] [--ledger PATH] [--extract-commands] [--] [FILE]

Check an agent context file for size limits, credential-shaped values, lint
leakage, stale relative paths, template placeholders, copied template examples,
task-runner targets that do not exist, a body copied from another file in the
repository, and bugs described as caveats. The last line printed is always
"audit: exit N (W warnings)" for a handoff to quote.

  FILE                target file, default AGENTS.md
  --root              treat FILE as a repo-root file
  --nested            treat FILE as a package file
  --strict            exit 1 when any warning fires; use in CI
  --style             add prose checks: ASCII only, no em or en dash, no contrast negation
  --ledger PATH       require the recon ledger at PATH (a | kind | fact | source | ran | table)
                      and fail every documented command that has no row with an exit code
                      or ask; a clean run prints the ledger counts and deletes the ledger
  --extract-commands  print candidate commands and exit; inspect each before running
  --                  end of options

Backticked paths are checked unless they contain whitespace (a command or a
sentence) or look like a URL, glob, branch name, package scope, ~/ path, .git
path, or ../ path outside the repository. A git-ignored path is skipped too:
build output and per-engineer config are absent from a clean checkout on
purpose. A missing path warns; a trailing slash marks a directory.

The chain is the Codex AGENTS.md ancestry plus $CODEX_HOME. CLAUDE.md and its
@imports are outside it. FILE must sit under the working directory or its git
repository; a path elsewhere exits 2.

Exit codes:
  0  no hard failures, and no warnings under --strict
  1  hard failure: over 32 KiB (file or chain), a credential-shaped value,
     a body copied from another file, a missing ledger or a command without
     a ledger row, or --strict with at least one warning
  2  bad invocation: missing or unreadable file, unknown flag, extra argument

Examples:
  scripts/audit.sh
  scripts/audit.sh --strict AGENTS.md
  scripts/audit.sh --style --extract-commands AGENTS.md
  scripts/audit.sh packages/api/AGENTS.md
EOF
}

mode=auto
strict=0
style=0
extract=0
ledger=""
expect_ledger=0
file=""
endopts=0
for arg in "$@"; do
  if (( expect_ledger )); then
    ledger=$arg
    expect_ledger=0
    continue
  fi
  if (( endopts )); then
    if [[ -n $file ]]; then
      printf 'error: one file per run, got a second: %s\n\n' "$arg" >&2
      usage >&2
      exit 2
    fi
    file=$arg
    continue
  fi
  case $arg in
    -h|--help) usage; exit 0 ;;
    --root) mode=root ;;
    --nested) mode=nested ;;
    --strict) strict=1 ;;
    --style) style=1 ;;
    --ledger) expect_ledger=1 ;;
    --ledger=*) ledger=${arg#--ledger=} ;;
    --extract-commands) extract=1 ;;
    --) endopts=1 ;;
    -*) printf 'unknown flag: %s\n\n' "$arg" >&2; usage >&2; exit 2 ;;
    *)
      if [[ -n $file ]]; then
        printf 'error: one file per run, got a second: %s\n\n' "$arg" >&2
        usage >&2
        exit 2
      fi
      file=$arg
      ;;
  esac
done

file=${file:-AGENTS.md}
case $file in
  -*) file=./$file ;;
esac
if (( expect_ledger )); then
  printf 'error: --ledger needs a path\n\n' >&2
  usage >&2
  exit 2
fi
# A 4B handed the full usage here read it as a puzzle and audited the ledger instead; one line says what to do.
if [[ ! -f $file ]]; then
  printf 'error: %s does not exist yet: write it first, then run the audit on it\n' "$file" >&2
  exit 2
fi
if [[ -n $ledger && $file -ef $ledger ]]; then
  printf 'error: %s is the ledger; audit the AGENTS.md you wrote: --ledger %s AGENTS.md\n' "$file" "$ledger" >&2
  exit 2
fi
if [[ -L $file ]]; then
  printf 'error: symlink target refused: %s\n' "$file" >&2
  exit 2
fi
if [[ ! -r $file ]]; then
  printf 'error: not readable: %s\n' "$file" >&2
  exit 2
fi
if (( extract && strict )); then
  printf 'error: --strict and --extract-commands cannot be combined\n' >&2
  exit 2
fi

status=0
warnings=0
# shellcheck disable=SC2016
tick='`[^`]+`'
warn() { printf 'warn  %s\n' "$*"; warnings=$((warnings + 1)); }
soft() { printf '\n%s\n%s\n' "$1" "$2"; warnings=$((warnings + 1)); }
fail() { printf 'fail  %s\n' "$*"; status=1; }

is_command() {
  local first=$1 word
  case $first in
    ./*|/*) return 0 ;;
  esac
  for word in go gofmt golangci-lint staticcheck govulncheck gosec npm npx pnpm yarn bun \
    node deno tsc eslint prettier jest vitest playwright python python3 pytest uv poetry pip \
    ruff mypy black isort tox nox cargo rustc rustup make just task docker podman kubectl \
    helm kustomize terraform tofu ansible mvn gradle gradlew dotnet msbuild swift xcodebuild \
    flutter dart bundle rake rails composer php phpunit mix elixir lua luacheck bazel bazelisk \
    cmake meson ninja gcc g++ clang clang-format clang-tidy ctest shellcheck actionlint \
    hadolint trivy grype semgrep gitleaks sqlc buf protoc swag mockery air dlv bash sh zsh \
    git gh glab aws gcloud az curl wget jq yq openssl ssh rsync tar unzip zip psql mysql \
    sqlite3 codegen; do
    [[ $first == "$word" ]] && return 0
  done
  return 1
}

extract_commands() {
  local f=$1 line first
  {
    awk '/^[[:space:]]*```/ { fence = !fence; next } fence { print }' "$f"
    grep -oE "$tick" "$f" | sed -e 's/^`//' -e 's/`$//'
  } | while IFS= read -r line; do
      line=${line#"${line%%[![:space:]]*}"}
      line=${line%"${line##*[![:space:]]}"}
      [[ -z $line ]] && continue
      case $line in \#*|'}'|'{'|EOF|'```') continue ;; esac
      case $line in *'<'*'>'*) continue ;; esac
      first=${line%% *}
      is_command "$first" || continue
      printf '%s\n' "$line"
    done | sort -u
}

lines=$(wc -l < "$file")
bytes=$(wc -c < "$file")
base=${file##*/}
case $file in
  */*) dir=${file%/*}; [[ -z $dir ]] && dir=/ ;;
  *) dir=. ;;
esac
here=$(cd "$dir" && pwd -P) || { printf 'error: cannot enter %s\n' "$dir" >&2; exit 2; }

repo=""
probe=$(pwd -L)
while :; do
  if [[ -e $probe/.git ]]; then
    repo=$(cd "$probe" && pwd -P)
    break
  fi
  parent=$(dirname "$probe")
  [[ $parent == "$probe" ]] && break
  probe=$parent
done

cwd_real=$(pwd -P)
if [[ -n $repo ]]; then
  case $here in
    "$repo"|"$repo"/*) : ;;
    *)
      printf 'error: target resolves outside the repository: %s\n' "$here/$base" >&2
      exit 2
      ;;
  esac
elif [[ $here != "$cwd_real" && $here != "$cwd_real"/* ]]; then
  printf 'error: target resolves outside the working directory: %s\n' "$here/$base" >&2
  exit 2
fi

is_root=0
case $mode in
  root) is_root=1 ;;
  nested) is_root=0 ;;
  *)
    if [[ -n $repo ]]; then
      [[ $here == "$(cd "$repo" && pwd -P)" ]] && is_root=1
    elif [[ $here == "$(pwd -P)" ]]; then
      is_root=1
    fi
    ;;
esac

root_refs=$here
[[ -n $repo ]] && root_refs=$(cd "$repo" && pwd -P)

if (( extract )); then
  printf '# candidate commands in %s; inspect each before running\n' "$file"
  extract_commands "$file"
  exit 0
fi

chain=$bytes
chain_count=1
chain_files=$file
add_chain() {
  local p=$1 show
  [[ -f $p && ! -L $p ]] || return 0
  [[ $p == "$here/$base" ]] && return 0
  chain=$((chain + $(wc -c < "$p")))
  chain_count=$((chain_count + 1))
  show=$p
  [[ -n $repo ]] && show=${p#"$repo"/}
  chain_files="$chain_files $show"
}
if [[ -n $repo ]]; then
  d=$here
  while :; do
    if [[ -f $d/AGENTS.override.md ]]; then
      add_chain "$d/AGENTS.override.md"
    elif [[ -f $d/AGENTS.md ]]; then
      add_chain "$d/AGENTS.md"
    fi
    [[ $d == "$repo" ]] && break
    parent=$(dirname "$d")
    [[ $parent == "$d" ]] && break
    d=$parent
  done
else
  if [[ -f $here/AGENTS.override.md ]]; then
    add_chain "$here/AGENTS.override.md"
  elif [[ -f $here/AGENTS.md ]]; then
    add_chain "$here/AGENTS.md"
  fi
fi
codex_home=""
if [[ -n ${CODEX_HOME:-} ]]; then
  codex_home=$CODEX_HOME
elif [[ -n ${HOME:-} ]]; then
  codex_home=$HOME/.codex
fi
if [[ -n $codex_home ]]; then
  if [[ -s $codex_home/AGENTS.override.md ]]; then
    add_chain "$codex_home/AGENTS.override.md"
  elif [[ -s $codex_home/AGENTS.md ]]; then
    add_chain "$codex_home/AGENTS.md"
  fi
fi

printf 'file  %s (%s lines, %s bytes)\n' "$file" "$lines" "$bytes"
printf 'chain %s bytes across %s files: %s\n' "$chain" "$chain_count" "$chain_files"
if [[ -f $here/AGENTS.override.md && $base == AGENTS.md ]]; then
  warn "AGENTS.override.md shadows this file; Codex loads only the override in that directory"
fi

if (( ! is_root && lines > 80 )); then
  warn "nested file over 80 lines: move procedures to a skill or docs"
fi
if (( lines >= 200 )); then
  warn "at 200+ lines: warning sign; split subtree rules into nested files"
fi
if (( bytes > 32768 )); then
  fail "over 32 KiB: Codex skips files past the combined chain cap"
fi
if (( chain > 32768 )); then
  fail "combined chain is $chain bytes: Codex skips files past 32 KiB"
fi

url_creds=$(grep -nE '://[^/[:space:]]+:[^/[:space:]]+@' "$file" || true)
if [[ -n $url_creds ]]; then
  fail "credential inside a URL; keep secrets out of AGENTS.md"
  printf '%s\n' "$url_creds"
fi

token_re='(^|[^A-Za-z0-9_])(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(AKIA|ASIA)[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-(proj-)?[A-Za-z0-9_-]{20,}|sk_(live|test)_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|gl(pat|ptt|dt|rt)-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36}|pypi-[A-Za-z0-9_-]{30,}|AIza[0-9A-Za-z_-]{35}|ya29\.[0-9A-Za-z_-]{20,}|dckr_pat_[A-Za-z0-9_-]{20,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|shpat_[0-9a-fA-F]{32}|sq0atp-[0-9A-Za-z_-]{22}|sq0csp-[0-9A-Za-z_-]{22}|shpss_[0-9a-fA-F]{32}|whsec_[A-Za-z0-9]{20,}|GOCSPX-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z0-9 ]*PRIVATE KEY( BLOCK)?-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|hooks\.slack\.com/services/[A-Za-z0-9]+/[A-Za-z0-9]+/[A-Za-z0-9]+)'
prefix_hits=$(grep -nE -- "$token_re" "$file" || true)
prefix_fails=""
if [[ -n $prefix_hits ]]; then
  prefix_fails=$prefix_hits$'\n'
  fail "credential-shaped value; keep secrets out of AGENTS.md"
  printf '%s' "$prefix_fails"
fi

key_re='(^|[^A-Za-z0-9])([A-Za-z0-9_-]*(password|passwd|token|secret|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret|bearer|authorization)([_-][A-Za-z0-9]+)*)'"[\"']"'?[[:space:]]*[:=][[:space:]]*(.*)$'
secret_fails=""
secret_warns=""
secret_empty=""
while IFS= read -r raw; do
  [[ -z $raw ]] && continue
  case $prefix_fails in
    *"$raw"$'\n'*) continue ;;
  esac
  body=${raw#*:}
  body_low=$(printf '%s' "$body" | tr '[:upper:]' '[:lower:]')
  if [[ $body_low =~ $key_re ]]; then
    key=${BASH_REMATCH[2]}
    value=${BASH_REMATCH[5]}
  else
    continue
  fi
  key=$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]')
  value=${value#"${value%%[![:space:]]*}"}
  case $value in
    [Bb]earer\ *) value=${value#* } ;;
  esac
  case $value in
    [\"\'\`]*)
      quote=${value:0:1}
      value=${value:1}
      value=${value%%"$quote"*}
      ;;
    *) value=${value%%[[:space:]]*} ;;
  esac
  value=${value%,}
  value=${value%;}
  if [[ -z $value ]]; then
    secret_empty+="$raw"$'\n'
    continue
  fi
  vlow=$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')
  case $vlow in
    ""|*getenv*|*os.environ*|*process.env*) continue ;;
    your_token_here|your-token-here|changeme|change_me|replace_me|placeholder|example|dummy|redacted|required|optional) continue ;;
    xxxx|xxxxxxxx|none|true|false|null|yes|no|unset|empty) continue ;;
  esac
  case $value in
    '$'*|'<'*|*'>'*) continue ;;
    /*|./*|../*|~*) continue ;;
    *'://'*) continue ;;
  esac
  case $key in
    *_path|*_file|*_dir|*_folder|*_name|*_url|*_uri|*_endpoint|*_host|*_param) continue ;;
    *_type|*_mode|*_enabled|*_disabled|*_ttl|*_limit|*_count|*_policy|*_field|*_label) continue ;;
    *_prefix|*_format|*_length|*_expiry|*_expires|*_timeout|*_algorithm|*_location) continue ;;
    *_store|*_backend|*_provider|*_issuer|*_audience|*_scope|*_flow) continue ;;
  esac
  vlen=${#value}
  has_digit=0
  [[ $value == *[0-9]* ]] && has_digit=1
  identifier=0
  [[ $value =~ ^[a-z][a-z_]*$ ]] && identifier=1
  if (( vlen >= 10 && has_digit )) || (( vlen >= 24 && ! identifier )); then
    secret_fails+="$raw"$'\n'
  else
    secret_warns+="$raw"$'\n'
  fi
done < <(grep -nEi '(password|passwd|token|secret|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret|bearer|authorization)' "$file" || true)

if [[ -n $secret_fails ]]; then
  fail "credential-shaped value; keep secrets out of AGENTS.md"
  printf '%s' "$secret_fails"
fi
if [[ -n $secret_warns ]]; then
  soft "credential keyword with a non-secret value; confirm it names a variable" "$secret_warns"
fi
if [[ -n $secret_empty ]]; then
  soft "credential keyword with an empty value; confirm the value is not on the next line" "$secret_empty"
fi

check() {
  local label=$1 pattern=$2 hits
  hits=$(grep -nEi -- "$pattern" "$file" || true)
  [[ -n $hits ]] && soft "$label" "$hits"
}

check "vague advice (replace with a concrete rule)" '(^|[^[:alnum:]_])(best practices?|clean code|high quality|be careful|as needed|various)([^[:alnum:]_]|$)|etc\.'
check "possible lint leakage (keep only if the rule is non-standard)" '(^|[^[:alnum:]_])(indentation|line length|max(imum)? line|import order|naming conventions?|single quotes|double quotes|semicolons|tabs? versus spaces|format(ting)? (the |your )?code)([^[:alnum:]_]|$)'
check "destructive git (only under a Never boundary)" '(git push[^#]*--force|--no-verify|git reset --hard)'
check "unfinished placeholder" '(^|[^[:alnum:]_])(TODO|TBD|FIXME)([^[:alnum:]_]|$)'
check "possible bug documented as a caveat (surface it; use the temporary TODO_BEFORE_SHIPPING.md)" '(^|[^[:alnum:]_])(known bug|known issue|pre-existing (bug|issue))([^[:alnum:]_]|$)'

full_suite=$(grep -nEi 'always run (the )?(full|entire|whole) (test )?suite' "$file" | grep -vi 'before handoff' || true)
[[ -n $full_suite ]] && soft "full-suite default (prefer a scoped command)" "$full_suite"

placeholders=$(grep -nE '<(cmd|path|file|pattern|format|prefix|short-desc|mode|package|Project|inputs|client|service|[^<>]* [^<>]*)>' "$file" \
  | grep -v '<!--' \
  | grep -vE '<[A-Z][A-Za-z0-9]*:' \
  | grep -vE '<[A-Za-z][A-Za-z0-9]*[[:space:]]+[A-Za-z-]+=' || true)
[[ -n $placeholders ]] && soft "template placeholder (fill it in or confirm it is intentional)" "$placeholders"

check "template example copied (replace it with this repository's fact)" 'tidewatch|mainframe emulator|tide heights|tide-table cache|harbour|moon-phase table|moon\.cache|pyemu|falmouth|tables-check|EMU_HOST|shore station'
check "skill prose copied (a section holds facts, never its own description)" 'one fact that changes how work is done|stack sentence|one command a shell pastes|what a linter or compiler cannot enforce|ordering constraint, global state|why and when to load it|never edit by hand; owned by|what it holds\. Read when|every line is paid'

# A body copied from another context file in the repository: half or more of its long lines appear verbatim elsewhere.
long_lines() { awk 'length($0) >= 30' "$1" | sort -u; }
mine_long=$(long_lines "$file" | wc -l)
if (( mine_long >= 5 )); then
  while IFS= read -r other; do
    [[ -z $other ]] && continue
    other_real=$(cd "$(dirname "$other")" && pwd -P)/${other##*/}
    [[ $other_real == "$here/$base" ]] && continue
    shared=$(comm -12 <(long_lines "$file") <(long_lines "$other") | wc -l)
    if (( shared * 2 >= mine_long )); then
      show=${other_real#"$root_refs"/}
      fail "copied from $show: $shared of $mine_long long lines are identical; a context file is written from this repository's facts"
    fi
  done < <(find "$root_refs" -type f \( -name AGENTS.md -o -name AGENTS.override.md -o -name CLAUDE.md -o -name README.md -o -name CONTRIBUTING.md \) \
    -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/vendor/*' 2>/dev/null)
fi

# The recon ledger: every documented command needs a row that ran (an exit code) or was deferred to the user (ask).
ledger_done=""
[[ -n $repo ]] && ledger_done=$(git -C "$repo" rev-parse --absolute-git-dir 2>/dev/null)/agentsmd-ledger-done
if [[ -n $ledger && ! -e $ledger && -n $ledger_done && -e $ledger_done ]]; then
  printf 'ledger: removed after an earlier clean audit; ledger checks skipped\n'
  ledger=""
fi
if [[ -n $ledger ]]; then
  if [[ ! -s $ledger ]]; then
    fail "ledger missing or empty: $ledger; Recon writes it before the file"
  elif ! grep -qE '^\|[[:space:]]*kind[[:space:]]*\|[[:space:]]*fact[[:space:]]*\|[[:space:]]*source[[:space:]]*\|[[:space:]]*ran[[:space:]]*\|' "$ledger"; then
    fail "ledger has no | kind | fact | source | ran | header: $ledger"
  else
    ran_facts=$(awk -F'|' 'NF >= 6 { k=$2; f=$3; r=$5; gsub(/^[ \t]+|[ \t]+$/, "", k); gsub(/^[ \t]+|[ \t]+$/, "", f); gsub(/^[ \t]+|[ \t]+$/, "", r); gsub(/`/, "", f); sub(/^timeout [0-9]+ /, "", f); if ((k == "command" || k == "prereq" || k == "boundary") && (r ~ /^[0-9]+$/ || r == "ask")) print f }' "$ledger")
    # The repository is data: a tracked file edited during the run fails until it is restored.
    if [[ -n $repo ]]; then
      while IFS= read -r f; do
        [[ -z $f ]] && continue
        case ${f##*/} in AGENTS.md|AGENTS.override.md|AGENTS.ledger.md|CLAUDE.md|TODO_BEFORE_SHIPPING.md) continue ;; esac
        fail "repository file modified: $f; the repo is data, restore it from git"
      done < <(git -C "$repo" diff --name-only HEAD 2>/dev/null)
    fi
    while IFS= read -r cmd; do
      [[ -z $cmd ]] && continue
      rest=$cmd
      while :; do
        seg=${rest%% && *}
        seg=${seg#"${seg%%[![:space:]]*}"}
        seg=${seg%"${seg##*[![:space:]]}"}
        covered=0
        while IFS= read -r f; do
          [[ -z $f ]] && continue
          case $f in *"$seg"*) covered=1 ;; esac
          case $seg in *"$f"*) covered=1 ;; esac
        done <<< "$ran_facts"
        (( covered )) || fail "command without a ledger row that ran or was deferred (ran = exit code or ask): $seg"
        [[ $rest == *" && "* ]] || break
        rest=${rest#* && }
      done
    done < <(extract_commands "$file")
  fi
fi

# Task-runner targets: a name that fits the pattern and does not exist is the cheapest fabrication to catch.
runner_file() {
  local d name
  for d in "$here" "$root_refs"; do
    for name in "$@"; do
      [[ -f $d/$name ]] && { printf '%s\n' "$d/$name"; return 0; }
    done
  done
  return 1
}

rule_names() {
  awk -F':' '/^[A-Za-z0-9_.\/!%@-][^:=#]*:([^=]|$)/ { n = split($1, a, /[ \t]+/); for (i = 1; i <= n; i++) if (a[i] != "") print a[i] }' "$1" | sed 's/^@//'
}

make_targets() {
  local mk=$1 dir inc f
  dir=${mk%/*}
  rule_names "$mk"
  grep -hE '^-?include[[:space:]]' "$mk" | sed 's/^-\{0,1\}include[[:space:]]*//' | while IFS= read -r inc; do
    for f in $inc; do
      [[ -f $dir/$f ]] && rule_names "$dir/$f"
    done
  done
}

runner_refs() {
  {
    awk '/^[[:space:]]*```/ { fence = !fence; next } fence { print }' "$file"
    grep -oE "$tick" "$file"
  } | grep -oE "(^|[^A-Za-z0-9_./-])$1[[:space:]]+[A-Za-z0-9_./!][A-Za-z0-9_./!:-]*" \
    | sed -E "s/^.*$1[[:space:]]+//" | sort -u
}

for runner in make just; do
  refs=$(runner_refs "$runner")
  [[ -z $refs ]] && continue
  case $runner in
    make) rf=$(runner_file Makefile makefile GNUmakefile) || { warn "$runner referenced and no Makefile found"; continue; } ;;
    just) rf=$(runner_file justfile Justfile .justfile) || { warn "$runner referenced and no justfile found"; continue; } ;;
  esac
  targets=$(if [[ $runner == make ]]; then make_targets "$rf"; else rule_names "$rf"; fi)
  catchall=0
  [[ $runner == make ]] && grep -qE '^%[[:space:]]*:' "$rf" && catchall=1
  while IFS= read -r t; do
    [[ -z $t ]] && continue
    case $t in *=*|*'$'*) continue ;; esac
    if printf '%s\n' "$targets" | grep -qxF -- "$t"; then continue; fi
    if (( catchall )); then
      warn "$runner target $t has no rule; the %: catch-all takes it"
    else
      warn "unknown $runner target: $t"
    fi
  done <<< "$refs"
done

npm_refs=$({ awk '/^[[:space:]]*```/ { fence = !fence; next } fence { print }' "$file"; grep -oE "$tick" "$file"; } \
  | grep -oE '(^|[^A-Za-z0-9_./-])(npm|pnpm|yarn|bun)[[:space:]]+run[[:space:]]+[A-Za-z0-9_.:-]+' \
  | sed -E 's/^.*run[[:space:]]+//' | sort -u)
if [[ -n $npm_refs ]]; then
  if pj=$(runner_file package.json); then
    scripts=$(awk '/"scripts"[[:space:]]*:/ { f = 1; next } f && /^[[:space:]]*}/ { f = 0 } f' "$pj" | grep -oE '^[[:space:]]*"[^"]+"' | tr -d ' \t"')
    while IFS= read -r s; do
      [[ -z $s ]] && continue
      printf '%s\n' "$scripts" | grep -qxF -- "$s" || warn "unknown npm script: $s"
    done <<< "$npm_refs"
  else
    warn "npm run referenced and no package.json found"
  fi
fi

if (( style )); then
  contrast=$(grep -nE ', not( |$)|(^|[^A-Za-z])not (just|only) [^.]*[^A-Za-z]but[^A-Za-z]|n'\''t [^.]*\. (It|That|This)'\''s |(^|[^A-Za-z])not [^,.]*, (it|that|this)'\''s |^[-* ]*Do not [^.;]*[.;] [Uu]se ' "$file" || true)
  [[ -n $contrast ]] && soft "style: contrast negation (state the positive rule)" "$contrast"
  nonprint=$(LC_ALL=C sed $'s/\xe2\x80[\x93\x94]//g' "$file" | LC_ALL=C grep -n '[^[:print:][:space:]]' || true)
  [[ -n $nonprint ]] && soft "style: non-ASCII or control character (prefer ASCII when the repo writes English)" "$nonprint"
  dashes=$(LC_ALL=C grep -nE $'\xe2\x80\x93|\xe2\x80\x94' "$file" || true)
  [[ -n $dashes ]] && soft "style: em or en dash (prefer a hyphen or a full stop)" "$dashes"
fi

ref_tokens() {
  grep -oE "$tick|\]\([^)]+\)" "$file" \
    | sed -e 's/^`//' -e 's/`$//' -e 's/^](//' -e 's/)$//' \
    | grep -v '[[:space:]]'
}

while IFS= read -r ref; do
  [[ -z $ref ]] && continue
  case $ref in
    *'://'*|*'<'*|*'>'*|*'*'*|*'...'*|*'$'*|*'{'*|*'}'*|*'('*|*')'*|*'|'*|*'='*|*','*|*'@'*|*'%'*) continue ;;
    /*|-*|'~'*) continue ;;
  esac
  ref=${ref%%#*}
  ref=${ref%%:*}
  [[ $ref == */* ]] || continue
  [[ -e $here/$ref || -e $root_refs/$ref ]] && continue
  if [[ $ref == ../* ]] && abs=$(cd "$here/$(dirname "$ref")" 2>/dev/null && pwd -P); then
    case $abs in "$root_refs"|"$root_refs"/*) : ;; *) continue ;; esac
  fi
  first=${ref%%/*}
  case $first in
    .git|origin|upstream|HEAD|feature|feat|fix|hotfix|bugfix|release|chore|refactor) continue ;;
  esac
  # A git-ignored path is build output or per-engineer config: absent from a clean checkout on purpose.
  git -C "$here" check-ignore -q -- "$ref" 2>/dev/null && continue
  warn "missing relative path: $ref"
done < <(ref_tokens | sort -u)

if (( ! is_root )); then
  while IFS= read -r readme; do
    [[ -z $readme ]] && continue
    [[ -e $here/$readme || -e $root_refs/$readme ]] && continue
    warn "nested file points at a missing README: $readme"
  done < <(ref_tokens | grep 'README\.md$' | sort -u)
fi

dups=$(grep -E '^#{1,6} ' "$file" | sort | uniq -d || true)
[[ -n $dups ]] && soft "duplicate headings" "$dups"

if ! grep -qiE '^#+ .*(command|build|test|verif|usage|setup)' "$file"; then
  warn "no commands section; add one when the repo has non-default commands"
fi
if ! grep -qE "$tick" "$file"; then
  warn "no inline code; commands and paths should be literal"
fi

if [[ -n $repo && $(git -C "$repo" rev-parse --is-shallow-repository 2>/dev/null) != true ]]; then
  rel=${here#"$repo"}
  rel=${rel#/}
  pathspec=$base
  [[ -n $rel ]] && pathspec=$rel/$base
  commits=$(git -C "$repo" log --oneline -- "$pathspec" 2>/dev/null | wc -l)
  if (( commits == 1 )); then
    warn "only one commit touches $pathspec; init fossilization risk"
  fi
fi

hard=$status
if (( strict && warnings > 0 )); then
  printf '\nstrict: %s warning(s) treated as failures\n' "$warnings"
  status=1
fi

printf '\nmanual checks: run the commands; confirm every path; no contradictions; no stale references; no unconfirmed bug documented as a caveat.\n'
# The ledger is scaffolding: an audit with no hard failure prints its counts for the handoff and deletes it.
if [[ -n $ledger && $hard -eq 0 && -s $ledger ]]; then
  read -r rows ran failed asked < <(awk -F'|' 'NF >= 6 { k=$2; r=$5; gsub(/[ \t]/, "", k); gsub(/[ \t]/, "", r); if (k == "kind" || k ~ /^-+$/) next; n++; if (r ~ /^[0-9]+$/) { x++; if (r != "0") f++ } else if (r == "ask") a++ } END { print n+0, x+0, f+0, a+0 }' "$ledger")
  rm -f "$ledger"
  [[ -n $ledger_done ]] && : > "$ledger_done"
  printf 'ledger: %s rows, %s commands ran, %s failed, %s deferred to the user; removed, the work is done\n' "$rows" "$ran" "$failed" "$asked"
  (( warnings > 0 )) && printf 'warnings left are notes for the user: list them under warnings kept and stop\n'
fi
strict_note=""
(( strict )) && strict_note=", strict"
printf 'audit: exit %s (%s warnings%s)\n' "$status" "$warnings" "$strict_note"
exit "$status"
