#!/usr/bin/env bash
# ============================================================
# Health check ringan untuk monitoring/uptime.
# Keluar non-zero bila salah satu endpoint tidak 200.
#
# Penggunaan:
#   bash scripts/healthcheck.sh [BASE_URL]
#   # cron contoh (di VPS):
#   */5 * * * * /var/www/posspace/scripts/healthcheck.sh https://posspace.id \
#       || echo "DOWN $(date -Is)" >> /var/log/posspace/healthcheck.log
# ============================================================
set -uo pipefail

BASE="${1:-https://posspace.id}"
endpoints=(/health /login)

fail=0
for ep in "${endpoints[@]}"; do
	code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$ep" 2>/dev/null)"
	if [ "$code" != "200" ]; then
		echo "FAIL $BASE$ep -> ${code:-timeout}"
		fail=1
	fi
done

if [ "$fail" -eq 0 ]; then
	echo "OK $BASE"
fi
exit "$fail"
