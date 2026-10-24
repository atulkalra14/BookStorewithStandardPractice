#!/usr/bin/env bash
# PreToolUse hook for Bash: blocks commands that delete, truncate or overwrite
# sensitive files and protected directories. Exit 2 = block, message goes to Claude.
# Requires: jq, grep -E (GNU or BSD).
#
# This is defense in depth, not a sandbox. Keep work committed in git, keep
# the permissions.deny rules in settings.json, and do not give Claude production credentials.

set -u

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && exit 0

# Files that must never be deleted, moved or truncated by Claude.
protected_files='(\.env(\.[[:alnum:]_.-]+)?|default-env\.json|default-services\.json|xs-security\.json|mta\.yaml|mtaext\.[[:alnum:]_.-]+|\.mtaext|package(-lock)?\.json|CLAUDE\.md|\.cdsrc(-private)?\.json|[[:alnum:]_.*-]*\.(key|pem|p12|pfx|jks)|\.gitignore)'

# Directories that must not be removed as a whole.
protected_dirs='(\.git|\.claude|db|srv|app|mtx|test|docs|_i18n)'

# Commands and code patterns that delete or destroy data.
delete_verbs='(^|[;&|`(]|[[:space:]])(rm|rmdir|unlink|shred|trash|trash-put)([[:space:]]|$)|git[[:space:]]+(rm|clean)|find[[:space:]].*(-delete|-exec[[:space:]]+rm)|rimraf|shutil\.rmtree|os\.(remove|unlink|rmdir)|fs\.(rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync)|unlinkSync|rmSync|rmdirSync|[.[:space:]]unlink\(|\.rm\(|Remove-Item|del[[:space:]]|truncate[[:space:]]'

block() {
  echo "Blocked by hook: $1" >&2
  echo "Do not delete, move, truncate or overwrite sensitive files or protected folders. If this is really needed, ask the user to do it manually." >&2
  exit 2
}

# 1. Broad destructive deletes: rm -rf *, rm -rf ., rm -rf /, rm -rf ~, rm -rf $HOME
if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])rm[[:space:]]+(-[[:alpha:]-]+[[:space:]]+)*(\*|\./?\*?|/|~|\$HOME|\$\{HOME\})([[:space:]]|$)'; then
  block "broad recursive delete"
fi

# 1b. git clean deletes untracked files (including ignored ones such as .env with -x). Allow dry runs only.
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+clean'; then
  if ! printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+clean[[:space:]]+(.*[[:space:]])?(-[[:alpha:]]*n[[:alpha:]]*|--dry-run)([[:space:]]|$)'; then
    block "git clean removes untracked files (use git clean -n for a dry run)"
  fi
fi

# 2. Delete verb together with a protected file name.
if printf '%s' "$cmd" | grep -Eq "$delete_verbs"; then
  if printf '%s' "$cmd" | grep -Eq "(^|[/[:space:]\"'=])${protected_files}([/[:space:]\"';&|)\\\\]|\$)"; then
    block "delete command touches a sensitive file"
  fi
  # 3. Delete verb together with a protected directory.
  if printf '%s' "$cmd" | grep -Eq "(^|[[:space:]\"'=])(\./)?${protected_dirs}/?([[:space:]\"';&|)\\\\]|\$)"; then
    block "delete command targets a protected directory"
  fi
fi

# 4. Moving or renaming a sensitive file (mv can act as a delete).
if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])mv[[:space:]]'; then
  if printf '%s' "$cmd" | grep -Eq "(^|[/[:space:]\"'=])${protected_files}([/[:space:]\"';&|)\\\\]|\$)"; then
    block "mv on a sensitive file"
  fi
fi

# 5. Truncating or overwriting a sensitive file with a redirect (> file, >| file, : > file).
if printf '%s' "$cmd" | grep -Eq ">\|?[[:space:]]*[^[:space:]]*${protected_files}([[:space:]\"';&|)\\\\]|\$)"; then
  block "redirect would overwrite a sensitive file"
fi

# 6. In-place edits and copies over sensitive files.
if printf '%s' "$cmd" | grep -Eq "(sed[[:space:]]+(-[[:alpha:]]*i|--in-place)|tee[[:space:]]|cp[[:space:]]|install[[:space:]]|dd[[:space:]]).*${protected_files}"; then
  block "in-place write to a sensitive file"
fi

exit 0
