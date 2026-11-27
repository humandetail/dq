#!/bin/bash
set -u

repo=/Volumes/personal/www/td3
evidence="$repo/docs/evidence/m3-preflight-83/r6"
source_root="$(cat "$evidence/source-dir.txt")"
origin=http://127.0.0.1:4200
cd "$source_root" || exit 1
caffeinate -di -w "$$" &
pmset -g ps > "$evidence/hardware-power.txt"
sw_vers > "$evidence/hardware-os.txt"

run_case() {
  label=$1
  fixture=$2
  duration=$3
  autosave=$4
  start=$5
  freeze=$6
  collection="$evidence/performance/$label"
  mkdir -p "$collection"
  printf '%s %s start\n' "$(date -Iseconds)" "$label" >> "$evidence/performance/status.log"
  M3_VERIFY=1 M2_HARDWARE=1 M2_ORIGIN="$origin" M2_PEAK_FIXTURE="$fixture" M2_FREEZE_SECONDS="$freeze" \
    M3_PERF_REPLAY_START="$start" M3_PERF_INPUT=1 M3_PERF_DURATION_MS="$duration" M3_PERF_AUTOSAVE="$autosave" \
    M3_PERF_EVIDENCE_DIR="$collection" node checks/m2-browser.mjs > "$collection/summary.log" 2>&1
  result=$?
  printf '%s %s exit=%s\n' "$(date -Iseconds)" "$label" "$result" >> "$evidence/performance/status.log"
}

prior="$repo/docs/evidence/m3-preflight-83"
pf01="$prior/r4/performance/pf01-engine.json"
pf02="$prior/r4/performance/pf02-engine.json"
normal="$repo/docs/evidence/m3-foundation/endgame-full/a10/pf-normal-starts-14.json"
boss="$evidence/pf-normal-starts-20261124.json"

case "${1:-}" in
  freeze)
    run_case freeze-300 "$pf01" 20000 1 sustained 300
    ;;
  peaks)
    for autosave in 1 0; do
      run_case "pf01-save$autosave" "$pf01" 20000 "$autosave" sustained 0
      run_case "pf02-save$autosave" "$pf02" 20000 "$autosave" sustained 0
      for kind in snapshotBytes queuedEvents entities; do
        run_case "pf03-$kind-save$autosave" "$prior/r3/performance/pf03-$kind-fixture.json" 20000 "$autosave" sustained 0
      done
      run_case "population-save$autosave" "$normal" 22000 "$autosave" population 0
      if test -s "$boss"; then run_case "boss-save$autosave" "$boss" 22000 "$autosave" boss 0; fi
    done
    ;;
  sustained)
    if test -f "$evidence/defer-sustained-for-revision"; then
      printf '%s sustained deferred after measured R6 failures\n' "$(date -Iseconds)" >> "$evidence/performance/status.log"
      exit 0
    fi
    for autosave in 1 0; do
      run_case "sustained-save$autosave" "$normal" 600000 "$autosave" sustained 0
    done
    ;;
  *)
    exit 2
    ;;
esac
