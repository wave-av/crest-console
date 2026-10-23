#!/usr/bin/env bash
# Fixture tests for body-policy.sh.
#
# Deliberately fixture-only: the gate is NEVER proved by writing a real leak into a
# live public PR body, because doing so would publish the exact thing it guards.
#
# The negatives here are the load-bearing half. A leak gate that blocks everything
# is trivially "correct" and useless — it gets disabled within a week. The bare
# cross-reference case below is the one that keeps this gate deployable.
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/body-policy.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# The names the real gate is configured with come from an org variable; the tests
# pin their own so they are hermetic and do not depend on CI configuration. The
# pinned names are INVENTED — this file is public and invisible to the tree gate
# (content-policy.sh and .gitleaks.toml both exempt this directory), so a real
# private-repo name here would be published by the very fixtures of the gate
# that exists to block it. Never use real repo or credential names below.
export GUARD_PRIVATE_REPOS="fixture-repo-alpha, fixture-repo-bravo, fixture-repo-charlie"

PASS=0; FAIL=0

# expect <exit-code> <name> <body-text>
expect() {
  local want="$1" name="$2" body="$3" out rc
  printf '%s\n' "$body" > "$TMP/body.txt"
  out="$(bash "$SCRIPT" "$TMP/body.txt" 2>&1)"; rc=$?
  if [[ "$rc" == "$want" ]]; then
    PASS=$((PASS+1)); printf '  ok   %s\n' "$name"
  else
    FAIL=$((FAIL+1)); printf '  FAIL %s — want exit %s, got %s\n%s\n' "$name" "$want" "$rc" "$out"
  fi
  # The annotation is world-readable; a hit must never echo the matched text.
  if [[ "$rc" == 1 ]] && printf '%s' "$out" | grep -qF "$body"; then
    FAIL=$((FAIL+1)); printf '  FAIL %s — LEAKED the matched text into the annotation\n' "$name"
  fi
}

echo "body-policy fixtures"

# --- must BLOCK ---------------------------------------------------------------
expect 1 'private repo + credential name' \
  'Flip is live: FIXTURE_LEASE_SECRET is bound on fixture-repo-alpha now.'
expect 1 'private repo + credential name, reverse order' \
  'The FIXTURE_JOIN_SECRET was added; fixture-repo-bravo picks it up on deploy.'
# Regression: a \b once anchored the credential-name pattern, and underscore is a
# word character — so a MULTI-underscore name AFTER the repo name never matched
# (the only \b sits before a prefix that cannot reach the _TOKEN suffix).
expect 1 'repo first, multi-underscore credential name after' \
  'fixture-repo-alpha stores the FIXTURE_API_TOKEN for settlement calls.'
expect 1 'private repo + secret count' \
  'fixture-repo-alpha went from 74 secrets to 75 after this change.'
expect 1 'private repo + service binding' \
  'This adds a service binding from the worker to fixture-repo-charlie for settlement.'
expect 1 'operator home path' \
  'Repro: run it from /Users/someoperator/Documents/notes and it fails.'  # enforce-ignore (fixture)
expect 1 'internal-only marker' \
  'Attaching the internal-only rollout plan for context.'
# Regression: the marker rule matches prose, and prose gets capitalized. The rule
# was once case-sensitive, so "Internal-only" and a sentence-initial "Do not
# share …" — the COMMON phrasing — sailed through while lowercase blocked.
expect 1 'internal-only marker, capitalized' \
  'Attaching the Internal-only rollout plan for context.'
expect 1 'do-not-share marker at sentence start' \
  'Do not share this outside the team.'
expect 1 'internal-only marker, all caps' \
  'INTERNAL-ONLY: rollout plan attached.'
# Assembled at run time rather than written as a literal: a fixture that LOOKS like
# a live AWS key trips this repo's own pre-commit secret scanners (it did, on the
# first draft). Splitting the prefix keeps the fixture exercising the real regex
# without parking a credential-shaped string in source.
AKID_FIXTURE="AKI""A1234567890ABCDEF"
expect 1 'AWS access key id' \
  "The failing job had ${AKID_FIXTURE} configured."
# Regression: the about-the-control allowlist must never exempt a credential rule.
# A key rotated "per SECURITY.md" is exactly as leaked as one pasted anywhere else.
expect 1 'AWS key on a line that mentions the control still blocks' \
  "Per SECURITY.md we rotated ${AKID_FIXTURE} this morning."
expect 1 'internal tailscale IP' \
  'It resolves to 100.71.4.19 from inside the fleet.'
# Regression: case-insensitivity is scoped to the repo NAMES, so a differently
# cased name must still pair with SCREAMING_CASE detail and block.
expect 1 'private repo name matches case-insensitively' \
  'Fixture-Repo-Alpha went from 74 secrets to 75 after this change.'

# --- must PASS (precision — these keep the gate deployable) -------------------
expect 0 'bare private-repo cross-reference' \
  'This is the companion change to fixture-repo-bravo#260; merge that one first.'
expect 0 'two private repos, no operational detail' \
  'Both fixture-repo-alpha and fixture-repo-bravo will need a follow-up for this.'
expect 0 'credential NAME with no private repo nearby' \
  'The handler now reads SOME_API_TOKEN from the environment instead of a literal.'
# Regression: a leading (?i) once lowercased the whole proximity pattern, so
# ordinary prose like "api_key" near a repo name blocked. OPS_DETAIL requires
# SCREAMING_CASE; lowercase words are conversation, not wiring topology.
expect 0 'lowercase api_key near a private repo is prose, not topology' \
  'fixture-repo-alpha needs the api_key rotated before Friday.'
expect 0 'public runner path is not an operator path' \
  'CI checks out to /home/runner/work/repo/repo before the scan runs.'  # enforce-ignore (fixture)
# This body WOULD trip private-repo-ops (configured repo name next to
# SECRET_TOKEN) — only the about-the-control allowlist lets it pass, so this
# fixture fails if that allowlist is ever deleted or its rule scoping breaks.
expect 0 'talking about the control' \
  'body-policy blocks fixture-repo-alpha named next to a SECRET_TOKEN; that is intended.'
expect 0 'explicit guard:allow with a reason' \
  'Example for the docs: fixture-repo-alpha holds EXAMPLE_SECRET — guard:allow documented-example'
expect 0 'ordinary clean body' \
  'Bumps the draft revision and regenerates the fixtures. No behaviour change.'
# Regression: the first CI run of this job failed on its own PR, because a review
# bot edited the body to summarize the change and quoted the marker verbatim.
expect 0 'marker MENTIONED in straight quotes is a description' \
  'Blocks infra identifiers and markers (account_id, home paths, "internal-only" text).'
expect 0 'marker MENTIONED in a code span' \
  'The rule matches `internal-only` and `for internal use` in body text.'
expect 0 'marker MENTIONED in smart quotes' \
  'Blocks operator home paths and “internal-only” text.'
expect 1 'marker USED unquoted still blocks' \
  'Attaching the internal-only rollout plan; do not share outside the team.'

# --- fail closed --------------------------------------------------------------
# Invoked directly, not through expect(): expect() always materializes a file, so
# it cannot reach these paths. A gate that returns "OK" when it was handed nothing
# to scan is the failure mode this whole file exists to prevent.
for case in "no argument at all::" "nonexistent path::$TMP/does-not-exist.txt"; do
  name="${case%%::*}"; arg="${case##*::}"
  if [[ -n "$arg" ]]; then bash "$SCRIPT" "$arg" >/dev/null 2>&1; else bash "$SCRIPT" >/dev/null 2>&1; fi
  rc=$?
  if [[ "$rc" == 2 ]]; then
    PASS=$((PASS+1)); printf '  ok   %s → exit 2 (fails closed)\n' "$name"
  else
    FAIL=$((FAIL+1)); printf '  FAIL %s — want exit 2, got %s\n' "$name" "$rc"
  fi
done

echo "  ---"
if (( FAIL > 0 )); then
  echo "  $PASS passed, $FAIL FAILED"; exit 1
fi
echo "  $PASS passed, 0 failed"
