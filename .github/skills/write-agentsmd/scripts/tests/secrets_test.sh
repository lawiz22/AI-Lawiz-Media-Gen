#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nikita Chernyi <https://rakshazi.me>
# SPDX-License-Identifier: GPL-3.0-or-later
# shellcheck disable=SC2016,SC1091,SC2154
# Credential and path-containment regression suite. Run: bash scripts/tests/run.sh
set -u
# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

# Real token formats beyond keyword=value.
d=$tmp/prefix-secrets
write_agents "$d" '# Demo

## Commands

- Test: `true`

## Tokens

- GitHub: `ghp_ABCDEFGHIJKLMNOPQRSTUVWX`
- AWS: `AKIA1234567890ABCDEF`
- Slack: `xoxb-1234567890-abcdefghij`'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "prefix secrets: exits 1"
check_contains "credential-shaped value" "$out" "prefix secrets: failure reported"
check_contains "ghp_ABCDEFGHIJKLMNOPQRSTUVWX" "$out" "prefix secrets: GitHub token shown"
check_contains "AKIA1234567890ABCDEF" "$out" "prefix secrets: AWS key shown"
check_contains "xoxb-1234567890-abcdefghij" "$out" "prefix secrets: Slack token shown"

# Trailing prose must not downgrade a secret to a warning.
d=$tmp/prose-secret
write_agents "$d" '# Demo

## Commands

- Test: `true`

- API_TOKEN=abc123def456 for staging'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "trailing prose: exits 1"
check_contains "API_TOKEN=abc123def456" "$out" "trailing prose: secret is a failure"

# A placeholder value stays clean.
d=$tmp/placeholder-secret
write_agents "$d" '# Demo

## Commands

- Test: `true`

- API_TOKEN=your_token_here'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 0 "$rc" "placeholder secret: exits 0"
check_absent "credential-shaped value" "$out" "placeholder secret: no failure"

# A suppression word in surrounding prose must not hide a token.
d=$tmp/prose-bypass
write_agents "$d" '# Demo

## Commands

- Test: `true`

- GH_TOKEN=ghp_AAAAAAAAAAAAAAAAAAAAAAAA (example)
- DB_PASSWORD=Example2024Prod!'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "prose bypass: exits 1"
check_contains "ghp_AAAAAAAAAAAAAAAAAAAAAAAA" "$out" "prose bypass: token still reported"
check_contains "DB_PASSWORD=Example2024Prod!" "$out" "prose bypass: password still reported"

# A mixed-case token-shaped guard must not hide a keyword secret.
d=$tmp/case-bypass
write_agents "$d" '# Demo

## Commands

- Test: `true`

- API_TOKEN=abc123def456 # GHP_AAAAAAAAAAAAAAAAAAAAAAAA'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "case bypass: exits 1"
check_contains "API_TOKEN=abc123def456" "$out" "case bypass: keyword secret reported"

# Quoted JSON and TOML keys are scanned.
d=$tmp/quoted-key
write_agents "$d" '# Demo

## Commands

- Test: `true`

- {"api_key": "abc123def456ghi789"}'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "quoted key: exits 1"
check_contains "abc123def456ghi789" "$out" "quoted key: value reported"

# Private key headers fail; public keys do not.
d=$tmp/key-headers
write_agents "$d" '# Demo

## Commands

- Test: `true`

-----BEGIN PGP PRIVATE KEY BLOCK-----
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQ== user@host'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "private key header: exits 1"
check_contains "PGP PRIVATE KEY" "$out" "private key header: reported"

d=$tmp/public-key
write_agents "$d" '# Demo

## Commands

- Test: `true`

- ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQ== user@host'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 0 "$rc" "public key: exits 0"

# Numeric passwords and header keys are still secrets.
d=$tmp/digit-secret
write_agents "$d" '# Demo

## Commands

- Test: `true`

- PASSWORD=123456789012345
- API_KEY_HEADER=abc123def456ghi789'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "digit secret: exits 1"
check_contains "PASSWORD=123456789012345" "$out" "digit secret: reported"
check_contains "API_KEY_HEADER=abc123def456ghi789" "$out" "header key: reported"

# Credentials inside URLs are still hard failures.
d=$tmp/url-cred
write_agents "$d" '# Demo

## Commands

- Test: `true`

- Registry: `https://user:pass@example.com/repo`'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "url credential: exits 1"
check_contains "credential inside a URL" "$out" "url credential: reported"

# A symlinked target is refused before its content is read.
d=$tmp/symlink
mkdir -p "$d"
printf 'API_TOKEN=abc123def456\n' > "$tmp/outside.env"
ln -s "$tmp/outside.env" "$d/AGENTS.md"
out=$(run "$d" AGENTS.md); rc=$?
check_rc 2 "$rc" "symlink target: exits 2"
check_contains "symlink target refused" "$out" "symlink target: reported"

# A symlinked parent directory cannot escape the repository.
d=$tmp/symlink-parent
mkdir -p "$d/repo/packages"
git init -q "$d/repo"
write_agents "$tmp/outside-dir" '# Outside

## Commands

- Test: `true`

- API_TOKEN=abc123def456'
git init -q "$tmp/outside-dir"
ln -s "$tmp/outside-dir" "$d/repo/packages/api"
out=$(cd "$d/repo" && bash "$audit" packages/api/AGENTS.md 2>&1); rc=$?
check_rc 2 "$rc" "symlink parent: exits 2"
check_contains "outside the repository" "$out" "symlink parent: reported"

# A token prefix inside an ordinary word is prose, and a secret still fails past the size cap.
d=$tmp/prefix-boundary
write_agents "$d" '# Demo

## Commands

- Test: `true`

See docs/task-runner-configuration-guide and the disk-usage-monitoring-report.'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 0 "$rc" "prefix boundary: exits 0"
check_absent "credential-shaped value" "$out" "prefix boundary: sk- inside a word ignored"

d=$tmp/size-and-secret
mkdir -p "$d"
{ printf '# Demo\n\n## Commands\n\n- Test: `true`\n- Token: `ghp_ABCDEFGHIJKLMNOPQRSTUVWX`\n\n'; yes 'filler line for the size cap' | head -n 1500; } > "$d/AGENTS.md"
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "size and secret: exits 1"
check_contains "over 32 KiB" "$out" "size and secret: size reported"
check_contains "credential-shaped value" "$out" "size and secret: secret still reported"

# Bearer values and test-mode keys fail; a long lowercase identifier only warns.
d=$tmp/bearer-and-identifier
write_agents "$d" '# Demo

## Commands

- Test: `true`

- Authorization: Bearer abcdef1234567890abcdef1234567890
- Stripe: `sk_test_ABCDEFGHIJKLMNOP1234`
- API_KEY=my_env_variable_name_here_ok'
out=$(run "$d" AGENTS.md); rc=$?
check_rc 1 "$rc" "bearer: exits 1"
check_contains "Authorization: Bearer" "$out" "bearer: header reported"
check_contains "sk_test_ABCDEFGHIJKLMNOP1234" "$out" "bearer: sk_test key reported"
check_contains "confirm it names a variable" "$out" "identifier: long lowercase value only warns"

# A credential key with an empty value fails strict until reviewed.
d=$tmp/empty-value
write_agents "$d" '# Demo

## Commands

- Test: `true`

## Config

"db_password":
  "Tr0ub4dor&3"'
out=$(run "$d" --strict AGENTS.md); rc=$?
check_rc 1 "$rc" "empty value: strict exits 1"
check_contains "empty value" "$out" "empty value: reported"

finish
