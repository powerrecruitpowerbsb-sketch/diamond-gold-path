#!/usr/bin/env bash
# Keeps the full crawl running to completion, unattended.
#
# Why this exists: each crawl pass exits when its time budget expires. Without a
# supervisor, nothing starts the next pass and the run looks "stalled".
#
# Also self-heals: if the heartbeat file has not moved for STALE_S seconds the
# pass is killed and restarted from the checkpoint.
set -u
cd /dev-server

LOG=/tmp/crawl/run.log
SUP=/tmp/crawl/supervisor.log
HB=/tmp/crawl/heartbeat.json
STALE_S=600
BUDGET=540
WORKERS=6
mkdir -p /tmp/crawl

log() { echo "[$(date -u +%FT%TZ)] $*" >>"$SUP"; }

remaining() {
  python3 - <<'PY'
import json,os
try:
    d=json.load(open('/tmp/full-crawl-state.json'))
    print(len(d.get('done',{})))
except Exception:
    print(0)
PY
}

for pass_n in $(seq 1 60); do
  # already finished?
  if [ -f /tmp/crawl/DONE ]; then log "DONE marker present, exiting"; break; fi

  log "starting pass $pass_n (done so far: $(remaining))"
  bun tmpscripts/full-crawl.ts --budget "$BUDGET" --workers "$WORKERS" >>"$LOG" 2>&1 &
  child=$!

  # watch the heartbeat while the pass runs
  while kill -0 "$child" 2>/dev/null; do
    sleep 30
    now=$(date +%s)
    hb=$(python3 -c "import json;print(int(json.load(open('$HB'))['epoch']/1000))" 2>/dev/null || echo "$now")
    age=$((now - hb))
    if [ "$age" -gt "$STALE_S" ]; then
      log "heartbeat stale ${age}s — killing pass $pass_n and restarting from checkpoint"
      kill -9 "$child" 2>/dev/null
      break
    fi
  done
  wait "$child" 2>/dev/null

  # finished when the pass reports nothing remaining
  if tail -30 "$LOG" | grep -q '"remaining": 0'; then
    log "main crawl complete — running quarantine phase"
    bun tmpscripts/full-crawl.ts --quarantine --budget 900 --workers "$WORKERS" >>/tmp/crawl/quarantine.log 2>&1
    touch /tmp/crawl/DONE
    log "all phases complete"
    break
  fi
done
