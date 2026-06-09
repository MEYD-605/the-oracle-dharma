#!/bin/bash
# git-tracker.sh — Track file lifecycle in a git repo
# Quiz 2: Sombo · Oracle School · 2026-06-09
# Usage: ./git-tracker.sh [repo-path] [--summary|--deleted|--created|--timeline]

set -uo pipefail

REPO="${1:-.}"
MODE="${2:---summary}"

cd "$REPO" 2>/dev/null || { echo "❌ ไม่เจอ repo: $REPO"; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "❌ ไม่ใช่ git repo"; exit 1; }

REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")

echo "📊 Git Tracker — $REPO_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

case "$MODE" in
  --created)
    echo "📁 ไฟล์ที่ถูกสร้าง (เรียงตามเวลา):"
    echo ""
    git log --all --diff-filter=A --name-only --pretty=format:"%ai | %an" -- | \
      awk 'NF && !/^\s*$/' | head -50
    ;;

  --deleted)
    echo "🗑️ ไฟล์ที่ถูกลบ:"
    echo ""
    git log --all --diff-filter=D --name-only --pretty=format:"%ai | %an | %s" -- | \
      awk 'NF && !/^\s*$/' | head -50
    ;;

  --timeline)
    echo "📅 Timeline (ล่าสุด 20 commits):"
    echo ""
    git log --oneline --stat -20 | head -80
    ;;

  --summary|*)
    TOTAL_COMMITS=$(git rev-list --all --count 2>/dev/null || echo 0)
    CURRENT_FILES=$(git ls-files | wc -l)
    CONTRIBUTORS=$(git log --all --format='%an' | sort -u | wc -l)
    FIRST_COMMIT=$(git log --all --reverse --format='%ai' | head -1)
    LAST_COMMIT=$(git log --all --format='%ai' | head -1)

    CREATED=$(git log --all --diff-filter=A --name-status --pretty=format:"" -- | { grep -c '^A' || true; })
    DELETED=$(git log --all --diff-filter=D --name-status --pretty=format:"" -- | { grep -c '^D' || true; })
    MODIFIED=$(git log --all --diff-filter=M --name-status --pretty=format:"" -- | { grep -c '^M' || true; })
    RENAMED=$(git log --all --diff-filter=R --name-status --pretty=format:"" -- | { grep -c '^R' || true; })

    echo ""
    echo "  Repo          : $REPO_NAME"
    echo "  Commits       : $TOTAL_COMMITS"
    echo "  Contributors  : $CONTRIBUTORS"
    echo "  First commit  : $FIRST_COMMIT"
    echo "  Last commit   : $LAST_COMMIT"
    echo "  Current files : $CURRENT_FILES"
    echo ""
    echo "📈 File Lifecycle:"
    echo "  ➕ Created     : $CREATED"
    echo "  ✏️  Modified    : $MODIFIED"
    echo "  🔄 Renamed     : $RENAMED"
    echo "  🗑️  Deleted     : $DELETED"
    echo "  📁 Alive now   : $CURRENT_FILES"
    echo ""

    if [ "$DELETED" -gt 0 ]; then
      echo "🗑️ ไฟล์ที่ถูกลบล่าสุด 5 อัน:"
      git log --all --diff-filter=D --name-only --pretty=format:"  %ai %s" -- | \
        awk 'NF && !/^\s*$/' | head -10
      echo ""
    fi

    echo "📁 ไฟล์ที่สร้างล่าสุด 5 อัน:"
    git log --all --diff-filter=A --name-only --pretty=format:"  %ai %s" -- | \
      awk 'NF && !/^\s*$/' | head -10
    echo ""

    echo "👥 Contributors:"
    git log --all --format='%an' | sort | uniq -c | sort -rn | head -5 | \
      while read count name; do
        echo "  $name: $count commits"
      done
    ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 git-tracker by Sombo · AI ไม่ใช่คน"
