#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y git nginx ca-certificates
install -d -m 0755 /usr/local/lib/myprayer

printf "%s" "$MYPRAYER_SYNC_BASE64" | base64 -d > /usr/local/lib/myprayer/sync-site
chmod 0755 /usr/local/lib/myprayer/sync-site
cat > /etc/nginx/sites-available/default <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    root /var/lib/myprayer/current;
    index index.html;
    location / { try_files $uri $uri/ =404; }
    location = /revision.txt { add_header Cache-Control "no-store" always; }
    location ~ /\. { deny all; }
}
NGINX
nginx -t

cat > /etc/systemd/system/myprayer-sync.service <<'UNIT'
[Unit]
Description=Deploy MyPrayer from GitHub main
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/lib/myprayer/sync-site
TimeoutStartSec=90
UNIT

cat > /etc/systemd/system/myprayer-sync.timer <<'UNIT'
[Unit]
Description=Check for a new MyPrayer release

[Timer]
OnBootSec=20s
OnUnitInactiveSec=60s
AccuracySec=10s

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now nginx myprayer-sync.timer
systemctl reload nginx
systemctl start myprayer-sync.service
