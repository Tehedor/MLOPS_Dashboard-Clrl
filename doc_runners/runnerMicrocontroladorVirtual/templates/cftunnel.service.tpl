[Unit]
Description=Cloudflare Tunnel
After=network.target ttyd.service

[Service]
Type=simple
User=__RUN_USER__
WorkingDirectory=__PROJECT_DIR__
ExecStart=__CLOUDFLARED__ tunnel --config __PROJECT_DIR__/config.yaml run __TUNNEL_NAME__
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
