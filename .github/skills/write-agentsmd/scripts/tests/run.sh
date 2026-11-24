#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nikita Chernyi <https://rakshazi.me>
# SPDX-License-Identifier: GPL-3.0-or-later
# Run every audit test suite. Usage: bash scripts/tests/run.sh
set -u

here=$(cd "$(dirname "$0")" && pwd -P)
rc=0
bash "$here/audit_test.sh" || rc=1
bash "$here/secrets_test.sh" || rc=1
exit "$rc"
