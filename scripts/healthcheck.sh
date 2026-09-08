#!/usr/bin/env bash
# ============================================================
# Health check ringan untuk monitoring/uptime.
# Keluar non-zero bila endpoint tidak 200 setelah retry.
# Retry menoleransi jeda singkat saat PM2 me-restart worker
# (reload deploy / max_memory_restart) yang bisa 502 selama 1-3 detik.
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
attempts="${HEALTHCHECK_ATTEMPTS:-3}"
sleep_between="${HEALTHCHECK_SLEEP:-5}"

check() {
	local ep="$1" code
	code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$ep" 2>/dev/null)"
	[ "$code" = "200" ]
}

fail=0
for ep in "${endpoints[@]}"; do
	ok=0
	for ((i = 1; i <= attempts; i++)); do
		if check "$ep"; then
			ok=1
			break
		fi
		if [ "$i" -lt "$attempts" ]; then
			sleep "$sleep_between"
		fi
	done
	if [ "$ok" -eq 0 ]; then
		code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$ep" 2>/dev/null)"
		echo "FAIL $BASE$ep -> ${code:-timeout} (setelah $attempts percobaan)"
		fail=1
	else
		echo "OK $BASE$ep"
	fi
done

if [ "$fail" -eq 0 ]; then
	echo "OK $BASE"
fi
exit "$fail"