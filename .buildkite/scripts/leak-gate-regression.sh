#!/usr/bin/env bash
# Local + CI runner for leak-gate regression tests (scanner-dir hide, allowlist).
set -euo pipefail
cd "$(dirname "$0")/../.."
bash scripts/public-repo-guard/content-policy-self-exclude.test.sh
bash .buildkite/scripts/foundation-secret-scan.test.sh
