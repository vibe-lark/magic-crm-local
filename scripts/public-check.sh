#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  printf 'Public release check failed: %s\n' "$*" >&2
  exit 1
}

tracked_problem=""
while IFS= read -r -d '' file; do
  [ -e "$file" ] || continue
  case "$file" in
    .env.example) ;;
    .env|.env.*|.cert/*|*.pem|*.key|*.p12|*.pfx|*.sqlite|*.sqlite-*|*.ndjson|*.log|*.tsbuildinfo)
      tracked_problem="$file"
      break
      ;;
  esac
done < <(git ls-files -z)
[ -z "$tracked_problem" ] || fail "sensitive or generated file is tracked: $tracked_problem"

if git grep -n -I -E \
  '(bnpm\.byted\.org|skills\.byted\.org|\.bytedance\.net|\.bytedance\.com|/Users/[^/[:space:]]+|/home/[^/[:space:]]+)' \
  -- . ':(exclude)scripts/public-check.sh'; then
  fail "tracked source contains an internal domain or an absolute home path"
fi

if git grep -n -I -E \
  '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|Bearer[[:space:]]+[A-Za-z0-9._~+/-]{20,})' \
  -- . ':(exclude)scripts/public-check.sh'; then
  fail "tracked source contains private-key or bearer-token material"
fi

while IFS= read -r match; do
  value="${match#*=}"
  case "$value" in
    ''|xxx|cli_xxx|test_secret) ;;
    *) fail "tracked source contains a non-placeholder secret assignment: ${match%%=*}=<redacted>" ;;
  esac
done < <(git grep -h -I -E '(LARK_APP_SECRET|CLIENT_SECRET|API_KEY)=' -- . ':(exclude)scripts/public-check.sh' || true)

if command -v gitleaks >/dev/null 2>&1; then
  audit_dir="$(mktemp -d "${TMPDIR:-/tmp}/magic-crm-public.XXXXXX")"
  trap 'case "$audit_dir" in *magic-crm-public.*) rm -rf -- "$audit_dir" ;; esac' EXIT
  while IFS= read -r -d '' file; do
    [ -e "$file" ] || continue
    mkdir -p "$audit_dir/$(dirname "$file")"
    cp "$file" "$audit_dir/$file"
  done < <(git ls-files -z)
  gitleaks dir "$audit_dir" --no-banner --redact=100 >/dev/null
  gitleaks git . --no-banner --redact=100 >/dev/null
  printf 'Gitleaks: tracked files and Git history passed.\n'
else
  printf 'Warning: gitleaks is not installed; built-in checks passed, history scan skipped.\n' >&2
fi

printf 'Public release check passed.\n'
