#!/usr/bin/env bash
# ============================================================
# Diagnostik 502 — jalankan DI VPS (ssh deploy@<vps>):
#   bash /var/www/posspace/scripts/diagnose-502.sh
# Output lengkap: status PM2, memori, disk, swap, log error,
# dan jejak 502 dari Nginx. Tempel hasilnya ke tim/agent.
# ============================================================
set +e

echo "===== $(date -Is) ====="

echo "--- uptime / load ---"
uptime

echo "--- memori ---"
free -h

echo "--- swap ---"
swapon --show || echo "(swap tidak aktif)"

echo "--- disk ---"
df -h / /var/log /var/www 2>/dev/null

echo "--- PM2 status ---"
pm2 status 2>/dev/null || echo "(pm2 tidak ditemukan untuk user ini)"

echo "--- PM2 restart history (10 hari terakhir) ---"
pm2 jlist 2>/dev/null | node -e '
let d="";try{d=JSON.parse(require("fs").readFileSync(0,"utf8"))}catch(e){}
for(const p of d){
  const r=(p.pm2_env.restart_time||0), u=(p.pm2_env.unstable_restarts||0);
  console.log(`${p.name}: restart_time=${r} unstable=${u} uptime=${p.pm2_env.pm_uptime?Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)+"s":"?"} mem=${(p.monit?.memory||0)/1048576|0}MB cpu=${(p.monit?.cpu||0)}%`);
}' 2>/dev/null || echo "(tidak bisa parse pm2 jlist)"

echo "--- log error terakhir (web & api) ---"
pm2 logs posspace-web --err --lines 25 --nostream 2>/dev/null
pm2 logs posspace-api --err --lines 25 --nostream 2>/dev/null

echo "--- out log web (25 baris terakhir) ---"
pm2 logs posspace-web --out --lines 25 --nostream 2>/dev/null

echo "--- Nginx error log (25 baris terakhir) ---"
sudo -n tail -n 25 /var/log/nginx/error.log 2>/dev/null || tail -n 25 /var/log/nginx/error.log 2>/dev/null || echo "(tidak bisa baca /var/log/nginx/error.log)"

echo "--- 502/504/upstream di error log (100 kejadian terakhir) ---"
sudo -n grep -E "502|504|upstream|no live upstreams|connect\(\) failed|worker_connections" /var/log/nginx/error.log 2>/dev/null | tail -n 100 || grep -E "502|504|upstream|no live upstreams|connect\(\) failed|worker_connections" /var/log/nginx/error.log 2>/dev/null | tail -n 100 || echo "(tidak ada / tidak terbaca)"

echo "--- akses log Nginx (100 baris terakhir) ---"
sudo -n tail -n 100 /var/log/nginx/access.log 2>/dev/null || tail -n 100 /var/log/nginx/access.log 2>/dev/null || echo "(tidak terbaca)"

echo "--- health lokal (dari VPS) ---"
curl -s -o /dev/null -w "web /health  -> %{http_code} (%{time_total}s)\n" -m 5 http://127.0.0.1:3000/health
curl -s -o /dev/null -w "api /ready   -> %{http_code} (%{time_total}s)\n" -m 5 http://127.0.0.1:3001/ready
curl -s -o /dev/null -w "nginx /login -> %{http_code} (%{time_total}s)\n" -m 5 https://localhost/login -k -H "Host: posspace.id" 2>/dev/null || echo "curl lokal https dilewati"

echo "--- OOM-kill terakhir (kernel) ---"
sudo -n dmesg -T 2>/dev/null | grep -iE "oom|killed process" | tail -n 10 || grep -iE "oom|killed process" /var/log/kern.log 2>/dev/null | tail -n 10 || echo "(tidak terbaca — jalankan: sudo dmesg -T | grep -i oom)"

echo "--- logrotate status ---"
sudo -n cat /etc/logrotate.d/posspace 2>/dev/null || echo "(logrotate posspace belum terpasang)"
sudo -n logrotate -d /etc/logrotate.d/posspace 2>&1 | grep -cE "^considering|^rotating" 2>/dev/null || true

echo "===== selesai — tempel output ini ke pengembang ====="