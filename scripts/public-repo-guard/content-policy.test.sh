#!/usr/bin/env bash
# Prove the content-policy gate still BLOCKS when a PR adds ripgrep ignore files.
# Synthetic Stripe account-id *shapes* only — never a live credential.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/public-repo-guard/content-policy.sh"
[[ -x "$SCRIPT" || -f "$SCRIPT" ]] || { echo "FAIL: missing $SCRIPT"; exit 1; }
command -v rg >/dev/null 2>&1 || { echo "FAIL: rg required"; exit 1; }

fail() { echo "FAIL: $*"; exit 1; }

# acct_ + 16 alnum — matches the stripe-account BLOCK rule without appearing
# as a literal in this file (so scanning the repo tree stays clean).
synth_acct() { printf 'acct_%s' "$(printf 'A%.0s' {1..16})"; }

run_policy() {
  local tree="$1"
  bash "$SCRIPT" "$tree"
}

assert_blocks() {
  local tree="$1" why="$2"
  local rc=0
  out="$(run_policy "$tree" 2>&1)" || rc=$?
  [[ "$rc" -eq 1 ]] || fail "$why — content-policy exited $rc (want 1). output: $out"
  printf '%s' "$out" | grep -q 'stripe-account' || fail "$why — expected stripe-account BLOCK in output"
}

assert_ok() {
  local tree="$1" why="$2"
  local rc=0
  out="$(run_policy "$tree" 2>&1)" || rc=$?
  [[ "$rc" -eq 0 ]] || fail "$why — content-policy exited $rc (want 0). output: $out"
  printf '%s' "$out" | grep -q 'content policy OK' || fail "$why — expected content policy OK"
}

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
TREE="$WORKDIR/tree"
mkdir -p "$TREE/scripts/public-repo-guard"
cp "$SCRIPT" "$TREE/scripts/public-repo-guard/content-policy.sh"

LEAK="$TREE/leak.txt"
printf 'billing %s\n' "$(synth_acct)" >"$LEAK"

unset GUARD_PRIVATE_REPOS || true

assert_blocks "$TREE" "baseline must BLOCK a stripe-account shape"

printf '*\n' >"$TREE/.rgignore"
assert_blocks "$TREE" ".rgignore must not hide BLOCK hits"
rm -f "$TREE/.rgignore"

printf '*\n' >"$TREE/.ignore"
assert_blocks "$TREE" ".ignore must not hide BLOCK hits"
rm -f "$TREE/.ignore"

printf '*\n' >"$TREE/.fdignore"
assert_blocks "$TREE" ".fdignore must not hide BLOCK hits"
rm -f "$TREE/.fdignore"

# Documented .guardignore still carves out a named path.
printf 'billing %s\n' "$(synth_acct)" >"$TREE/carve.txt"
rm -f "$LEAK"
printf 'carve.txt\n' >"$TREE/.guardignore"
assert_ok "$TREE" "named .guardignore path must still be excluded"

# Live published tree must still pass (no synthetic files in the repo).
assert_ok "$ROOT" "live tree must still print content policy OK"

echo "content-policy.test.sh: OK"
