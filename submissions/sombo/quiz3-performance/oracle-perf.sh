#!/bin/bash
# oracle-perf.sh — วัด Performance ของ Oracle วันต่อวัน
# maw engine command: maw perf [repo] [--baseline|--today|--compare|--week]
# Quiz 3: Sombo · Oracle School · 2026-06-09

REPO="${1:-.}"
MODE="${2:---today}"

cd "$REPO" 2>/dev/null || { echo "❌ ไม่เจอ repo: $REPO"; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "❌ ไม่ใช่ git repo"; exit 1; }

REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")
TODAY=$(date +%Y-%m-%d)
PERF_DIR=".oracle-perf"
mkdir -p "$PERF_DIR"

get_day_stats() {
  local day="$1"
  local next_day=$(date -d "$day + 1 day" +%Y-%m-%d 2>/dev/null || date -v+1d -jf "%Y-%m-%d" "$day" +%Y-%m-%d)

  local commits=$(git log --all --after="$day 00:00" --before="$next_day 00:00" --oneline 2>/dev/null | wc -l)
  local files_changed=$(git log --all --after="$day 00:00" --before="$next_day 00:00" --stat --pretty=format:"" 2>/dev/null | grep '|' | wc -l)
  local insertions=$(git log --all --after="$day 00:00" --before="$next_day 00:00" --numstat --pretty=format:"" 2>/dev/null | awk '{s+=$1} END {print s+0}')
  local deletions=$(git log --all --after="$day 00:00" --before="$next_day 00:00" --numstat --pretty=format:"" 2>/dev/null | awk '{s+=$2} END {print s+0}')
  local contributors=$(git log --all --after="$day 00:00" --before="$next_day 00:00" --format='%an' 2>/dev/null | sort -u | wc -l)

  echo "$commits|$files_changed|$insertions|$deletions|$contributors"
}

print_day_report() {
  local day="$1"
  local stats="$2"
  local commits=$(echo "$stats" | cut -d'|' -f1)
  local files=$(echo "$stats" | cut -d'|' -f2)
  local ins=$(echo "$stats" | cut -d'|' -f3)
  local del=$(echo "$stats" | cut -d'|' -f4)
  local contribs=$(echo "$stats" | cut -d'|' -f5)
  local net=$((ins - del))

  echo "  📅 $day"
  echo "    Commits      : $commits"
  echo "    Files touched : $files"
  echo "    Lines +/-    : +$ins / -$del (net: $net)"
  echo "    Contributors : $contribs"
}

echo "📊 Oracle Performance — $REPO_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

case "$MODE" in
  --baseline)
    echo "📏 Setting baseline for today ($TODAY)..."
    STATS=$(get_day_stats "$TODAY")
    echo "$TODAY|$STATS" > "$PERF_DIR/baseline.txt"
    echo ""
    print_day_report "$TODAY" "$STATS"
    echo ""
    echo "✅ Baseline saved to $PERF_DIR/baseline.txt"
    ;;

  --today)
    echo "📅 Today's Performance ($TODAY):"
    echo ""
    STATS=$(get_day_stats "$TODAY")
    print_day_report "$TODAY" "$STATS"
    echo "$TODAY|$STATS" >> "$PERF_DIR/history.txt"
    ;;

  --compare)
    echo "📈 Compare: Today vs Baseline"
    echo ""

    if [ ! -f "$PERF_DIR/baseline.txt" ]; then
      echo "❌ ยังไม่มี baseline — รัน --baseline ก่อน"
      exit 1
    fi

    BASELINE=$(cat "$PERF_DIR/baseline.txt")
    BL_DAY=$(echo "$BASELINE" | cut -d'|' -f1)
    BL_COMMITS=$(echo "$BASELINE" | cut -d'|' -f2)
    BL_FILES=$(echo "$BASELINE" | cut -d'|' -f3)
    BL_INS=$(echo "$BASELINE" | cut -d'|' -f4)
    BL_DEL=$(echo "$BASELINE" | cut -d'|' -f5)

    TODAY_STATS=$(get_day_stats "$TODAY")
    TD_COMMITS=$(echo "$TODAY_STATS" | cut -d'|' -f1)
    TD_FILES=$(echo "$TODAY_STATS" | cut -d'|' -f2)
    TD_INS=$(echo "$TODAY_STATS" | cut -d'|' -f3)
    TD_DEL=$(echo "$TODAY_STATS" | cut -d'|' -f4)

    DIFF_COMMITS=$((TD_COMMITS - BL_COMMITS))
    DIFF_FILES=$((TD_FILES - BL_FILES))
    DIFF_INS=$((TD_INS - BL_INS))

    echo "  Metric         Baseline($BL_DAY)  Today($TODAY)  Δ"
    echo "  ─────────────  ─────────────────  ────────────  ────"
    printf "  Commits        %-17s %-13s %+d\n" "$BL_COMMITS" "$TD_COMMITS" "$DIFF_COMMITS"
    printf "  Files touched  %-17s %-13s %+d\n" "$BL_FILES" "$TD_FILES" "$DIFF_FILES"
    printf "  Lines added    %-17s %-13s %+d\n" "$BL_INS" "$TD_INS" "$DIFF_INS"
    echo ""

    if [ "$DIFF_COMMITS" -gt 0 ]; then
      echo "  📈 Performance UP — commits เพิ่มขึ้น $DIFF_COMMITS"
    elif [ "$DIFF_COMMITS" -lt 0 ]; then
      echo "  📉 Performance DOWN — commits ลดลง $((DIFF_COMMITS * -1))"
    else
      echo "  ➡️  Performance SAME"
    fi
    ;;

  --week)
    echo "📅 Performance สัปดาห์นี้:"
    echo ""
    for i in 6 5 4 3 2 1 0; do
      DAY=$(date -d "$TODAY - $i days" +%Y-%m-%d 2>/dev/null || date -v-${i}d +%Y-%m-%d)
      STATS=$(get_day_stats "$DAY")
      COMMITS=$(echo "$STATS" | cut -d'|' -f1)
      INS=$(echo "$STATS" | cut -d'|' -f3)
      BAR=""
      for ((j=0; j<COMMITS && j<20; j++)); do BAR="${BAR}█"; done
      [ -z "$BAR" ] && BAR="·"
      printf "  %s  %2d commits  +%-5s  %s\n" "$DAY" "$COMMITS" "$INS" "$BAR"
    done
    echo ""

    WEEK_TOTAL=0
    for i in 6 5 4 3 2 1 0; do
      DAY=$(date -d "$TODAY - $i days" +%Y-%m-%d 2>/dev/null || date -v-${i}d +%Y-%m-%d)
      C=$(get_day_stats "$DAY" | cut -d'|' -f1)
      WEEK_TOTAL=$((WEEK_TOTAL + C))
    done
    echo "  Total week: $WEEK_TOTAL commits"
    ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Timeline: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "Chain: git log → stats → baseline → compare"
echo "🤖 oracle-perf by Sombo · AI ไม่ใช่คน"
