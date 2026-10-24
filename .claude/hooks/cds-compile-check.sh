#!/usr/bin/env bash
# PostToolUse hook for Edit|Write|MultiEdit: compiles the CDS model after any .cds change.
# On failure it exits 2, so the compiler output is fed back to Claude to fix immediately.
# Requires: jq and @sap/cds-dk available via npx (npm ci first).

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

case "$file" in
  *.cds) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

run() {
  if command -v timeout >/dev/null 2>&1; then
    timeout 90 "$@"
  else
    "$@"
  fi
}

# Find the cds CLI without touching the network: project-local first, then PATH.
if [ -x "./node_modules/.bin/cds" ]; then
  CDS="./node_modules/.bin/cds"
elif command -v cds >/dev/null 2>&1; then
  CDS="cds"
else
  echo "cds-compile-check: @sap/cds-dk not found (run 'npm ci' first). Skipping compile check." >&2
  exit 0
fi

# stdout (compiled JSON) is discarded; stderr (errors and warnings) is captured.
out=$(run "$CDS" compile srv --to json 2>&1 >/dev/null)
status=$?

if [ $status -ne 0 ]; then
  {
    echo "cds compile FAILED after editing: $file"
    echo "$out" | head -n 40
    echo "Fix the CDS error before continuing."
  } >&2
  exit 2
fi

exit 0
