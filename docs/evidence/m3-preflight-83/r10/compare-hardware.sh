#!/bin/bash
set -u
repo=/Volumes/personal/www/td3
prior="$repo/docs/evidence/m3-preflight-83"
evidence="$prior/r10"
candidate="$(cat "$evidence/source-dir.txt")"
origin=http://127.0.0.1:4206
cd "$candidate" || exit 1
caffeinate -di -w "$$" &

run_case() {
  local label=$1 fixture=$2 autosave=$3 freeze=${4:-0}
  local output="$evidence/performance/$label"
  mkdir "$output" || return 1
  printf '%s %s start\n' "$(date -Iseconds)" "$label" >> "$evidence/performance/status.log"
  M3_VERIFY=1 M2_HARDWARE=1 M2_ORIGIN="$origin" M2_PEAK_FIXTURE="$fixture" M2_FREEZE_SECONDS="$freeze" \
    M3_PERF_REPLAY_START=sustained M3_PERF_INPUT=1 M3_PERF_DURATION_MS=20000 M3_PERF_AUTOSAVE="$autosave" \
    M3_PERF_EVIDENCE_DIR="$output" node checks/m2-browser.mjs > "$output/summary.log" 2>&1
  local code=$?
  printf '%s %s exit=%s\n' "$(date -Iseconds)" "$label" "$code" >> "$evidence/performance/status.log"
  return "$code"
}

mkdir -p "$evidence/performance"
pf01="$prior/r4/performance/pf01-engine.json"
case "${1:-}" in
  freeze) run_case "freeze-300-${2:?use a distinct sample number}" "$pf01" 1 300 ;;
  pf01) run_case "pf01-save${2:?supply 1 or 0}" "$pf01" "$2" ;;
  pf03) run_case "pf03-snapshotBytes-save${2:?supply 1 or 0}" "$prior/r8a/fixtures/pf03-snapshotBytes.json" "$2" ;;
  cold)
    if [ -e "$evidence/performance/cold.log" ]; then exit 1; fi
    M3_VERIFY=1 M2_HARDWARE=1 M2_ORIGIN="$origin" M3_COLD_ONLY=1 node checks/m2-browser.mjs > "$evidence/performance/cold.log" 2>&1
    code=$?
    printf '%s cold exit=%s\n' "$(date -Iseconds)" "$code" >> "$evidence/performance/status.log"
    exit "$code"
    ;;
  *) exit 2 ;;
esac
