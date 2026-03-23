#!/usr/bin/env bash
# checkcv.sh — Query CV submissions from DB and optionally run pipeline
# Usage:
#   ./checkcv.sh lookup <email>        — Look up CV by email
#   ./checkcv.sh list [limit]          — List recent submissions (default 10)
#   ./checkcv.sh analyze <email>       — Run CV analysis pipeline for email
#   ./checkcv.sh analyze-path <path>   — Run CV analysis on a specific PDF path

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load .env from webhook-server
ENV_FILE="$SCRIPT_DIR/../.env"
if [[ -f "$ENV_FILE" ]]; then
  export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)
fi

DB_URL="${DATABASE_URL:-postgres://clawberries:clawberries@localhost:5435/clawberries}"

# Parse postgres URL → psql connection
psql_cmd() {
  psql "$DB_URL" -t -A -F $'\t' "$@"
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  lookup)
    email="${1:?Usage: checkcv.sh lookup <email>}"
    echo "🔍 Looking up CV for: $email"
    result=$(psql_cmd -c "
      SELECT id, full_name, email, original_file_name, storage_path, created_at
      FROM form_submissions
      WHERE email = '$email'
      ORDER BY created_at DESC
      LIMIT 5;
    ")
    if [[ -z "$result" ]]; then
      echo "❌ No CV found for email: $email"
      exit 1
    fi
    echo ""
    echo "📄 Found submissions:"
    echo "$result" | while IFS=$'\t' read -r id name em filename path created; do
      echo "  ID: $id"
      echo "  Name: $name"
      echo "  Email: $em"
      echo "  File: $filename"
      echo "  Path: $path"
      echo "  Date: $created"
      echo "  ---"
    done
    ;;

  list)
    limit="${1:-10}"
    echo "📋 Recent CV submissions (last $limit):"
    echo ""
    psql_cmd -c "
      SELECT full_name, email, original_file_name, created_at
      FROM form_submissions
      ORDER BY created_at DESC
      LIMIT $limit;
    " | while IFS=$'\t' read -r name em filename created; do
      echo "  👤 $name | 📧 $em | 📎 $filename | 🕐 $created"
    done
    ;;

  analyze)
    email="${1:?Usage: checkcv.sh analyze <email>}"
    echo "🔍 Looking up CV for: $email"
    path=$(psql_cmd -c "
      SELECT storage_path FROM form_submissions
      WHERE email = '$email'
      ORDER BY created_at DESC
      LIMIT 1;
    ")
    if [[ -z "$path" ]]; then
      echo "❌ No CV found for email: $email"
      exit 1
    fi
    path=$(echo "$path" | tr -d ' ')
    echo "📄 Found: $path"
    echo "⏳ Running CV analysis pipeline..."
    echo ""
    cd "$PROJECT_DIR"
    pnpm dev "$path"
    ;;

  analyze-path)
    pdf_path="${1:?Usage: checkcv.sh analyze-path <path-to-pdf>}"
    if [[ ! -f "$pdf_path" ]]; then
      echo "❌ File not found: $pdf_path"
      exit 1
    fi
    echo "⏳ Running CV analysis pipeline on: $pdf_path"
    echo ""
    cd "$PROJECT_DIR"
    pnpm dev "$pdf_path"
    ;;

  help|*)
    echo "Usage: checkcv.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  lookup <email>        Look up CV submission by email"
    echo "  list [limit]          List recent submissions (default 10)"
    echo "  analyze <email>       Run full CV analysis for an email"
    echo "  analyze-path <path>   Run CV analysis on a specific PDF file"
    ;;
esac
